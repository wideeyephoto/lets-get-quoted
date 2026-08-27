import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { verifyVoiceToolToken, voiceReceiptAuthorization } from '@/lib/voice/auth';
import { sendCallerVoiceBookingLinkSms, sendCallerVoiceBookingConfirmationSms } from '@/lib/sms';
import { getAvailableBookingDays, claimBookingHold, createBooking } from '@/lib/booking';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';
import { calculateCleanEnergyRebates, type CleanEnergyWorkCategory } from '@/lib/rebates/clean-energy-rebate-engine';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';
import { createJobFeedEvent } from '@/lib/job-feed';
import { parseQuoteItems, saveQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createLead, scheduleLeadQuoteVisit } from '@/lib/leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySwaigAuth(request: Request): boolean {
  const expected = voiceReceiptAuthorization();
  if (!expected) return false;

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Basic ')) return false;

  const b64 = authHeader.slice(6).trim();
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return false;

  const user = decoded.slice(0, colonIndex);
  const pass = decoded.slice(colonIndex + 1);

  return user === expected.username && pass === expected.password;
}

export async function POST(request: Request) {
  if (!verifySwaigAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  let accountId = url.searchParams.get('account_id');
  let verifiedCallerPhone: string | null = null;
  let verifiedProviderCallId: string | null = null;

  if (token) {
    const tokenCheck = verifyVoiceToolToken(token);
    if (!tokenCheck.ok) {
      return NextResponse.json({ error: `Invalid tool token: ${tokenCheck.reason}` }, { status: 403 });
    }
    accountId = tokenCheck.payload.accountId;
    verifiedCallerPhone = tokenCheck.payload.callerPhone;
    verifiedProviderCallId = tokenCheck.payload.providerCallId;
  }

  if (!accountId) {
    return NextResponse.json({ error: 'Missing account_id or token' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ response: 'Invalid request payload format.' });
  }

  const fnName = String(body.function || body.action || '').trim();

  // Extract arguments from SWAIG format (which can be inside argument.parsed[0] or direct object)
  const rawArg = body.argument as Record<string, unknown> | undefined;
  const parsedArgList = rawArg?.parsed as unknown[] | undefined;
  const args: Record<string, unknown> = (Array.isArray(parsedArgList) && parsedArgList[0] && typeof parsedArgList[0] === 'object')
    ? (parsedArgList[0] as Record<string, unknown>)
    : (typeof rawArg === 'object' && rawArg !== null)
    ? rawArg
    : {};

  const admin = createAdminClient();

  if (fnName === 'send_booking_link') {
    const callerPhone = verifiedCallerPhone || String(args.caller_phone || body.caller_id_number || '').trim();
    if (!callerPhone) {
      return NextResponse.json({
        response: 'I could not detect a mobile phone number to text. Could you please tell me your cell phone number?',
      });
    }

    // Resolve booking URL from site settings or default booking portal
    const { data: site } = await admin
      .from('sites')
      .select('subdomain, custom_domain')
      .eq('account_id', accountId)
      .maybeSingle();

    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.letsgetquoted.com').replace(/\/$/, '');
    let bookingUrl = `${origin}/request-quote`;

    if (site?.custom_domain) {
      bookingUrl = `https://${site.custom_domain}/quote`;
    } else if (site?.subdomain) {
      bookingUrl = `https://${site.subdomain}.letsgetquoted.com/quote`;
    }

    const callId = verifiedProviderCallId || (typeof body.call_id === 'string' ? body.call_id : undefined);
    const sendResult = await sendCallerVoiceBookingLinkSms({
      accountId,
      callerPhone,
      bookingUrl,
      idempotencyKey: callId ? `swaig-booking:${accountId}:${callId}` : undefined,
    });

    if (!sendResult.ok) {
      return NextResponse.json({
        response: "I attempted to send the text message, but we couldn't deliver to that number. We can continue taking down your information over the phone right now.",
      });
    }

    return NextResponse.json({
      response: "I've just texted a direct booking link to your mobile phone. You can use it anytime to choose an appointment slot, or we can continue our conversation right now.",
    });
  }

  if (fnName === 'check_available_slots' || fnName === 'check_contractor_availability') {
    const [{ data: voiceSettings }, bookingDays] = await Promise.all([
      admin
        .from('voice_settings')
        .select('business_hours, emergency_enabled')
        .eq('account_id', accountId)
        .maybeSingle(),
      getAvailableBookingDays(admin, accountId).catch(() => []),
    ]);

    const emergency = Boolean(voiceSettings?.emergency_enabled);
    const preferredDateRaw = String(args.preferred_date || args.timeframe || '').trim().toLowerCase();

    if (!bookingDays || bookingDays.length === 0) {
      let resp = 'Our service calendar is currently accepting requests, and our team will follow up to confirm the earliest open dispatch window.';
      if (emergency) {
        resp += ' We also provide 24/7 priority emergency service for active hazards and leaks.';
      }
      return NextResponse.json({ response: resp });
    }

    // Check if user requested a specific day
    let matchedDay = bookingDays.find((d) =>
      (preferredDateRaw && d.dateKey.toLowerCase() === preferredDateRaw)
      || (preferredDateRaw && d.dayLabel.toLowerCase().includes(preferredDateRaw)),
    );

    if (!matchedDay && preferredDateRaw.includes('tomorrow') && bookingDays.length > 1) {
      matchedDay = bookingDays[1];
    } else if (!matchedDay && preferredDateRaw.includes('today') && bookingDays.length > 0) {
      matchedDay = bookingDays[0];
    }

    if (matchedDay) {
      const slotLabels = matchedDay.slots.map((s) => s.label);
      if (slotLabels.length > 0) {
        return NextResponse.json({
          response: `On ${matchedDay.dayLabel}, we currently have ${slotLabels.join(' and ')} open. Would one of those times work for you?`,
        });
      }
      return NextResponse.json({
        response: `We are currently fully booked on ${matchedDay.dayLabel}, but we have openings on ${bookingDays.slice(0, 3).map((d) => d.dayLabel).join(', ')}.`,
      });
    }

    // General availability list
    const topDays = bookingDays.slice(0, 3);
    const summaries = topDays.map((d) => {
      const slotLabels = d.slots.map((s) => s.label);
      return slotLabels.length > 0 ? `${d.dayLabel} (${slotLabels.join(' or ')})` : d.dayLabel;
    });

    let resp = `We currently have available appointment slots on ${summaries.join('; ')}.`;
    if (emergency) {
      resp += ' We also have 24/7 emergency dispatch available for urgent hazards.';
    }
    return NextResponse.json({ response: resp });
  }

  if (fnName === 'book_appointment_slot') {
    const callerName = String(args.caller_name || '').trim();
    const callerPhone = verifiedCallerPhone || String(args.caller_phone || body.caller_id_number || '').trim();
    const serviceAddress = String(args.service_address || '').trim() || null;
    const requestedDateRaw = String(args.requested_date || '').trim();
    const requestedTimeRaw = String(args.requested_time || '').trim().toLowerCase();
    const serviceDesc = String(args.service_description || '').trim() || null;
    const notes = String(args.notes || '').trim() || null;

    if (!callerName) {
      return NextResponse.json({
        response: 'May I please have your full name to put on the appointment reservation?',
      });
    }

    if (!requestedDateRaw) {
      return NextResponse.json({
        response: 'Which date would you like to schedule the appointment for?',
      });
    }

    const bookingDays = await getAvailableBookingDays(admin, accountId).catch(() => []);
    if (!bookingDays || bookingDays.length === 0) {
      return NextResponse.json({
        response: 'I have recorded your appointment request for our team to review and confirm the earliest dispatch time.',
      });
    }

    // Match day
    let matchedDay = bookingDays.find((d) =>
      d.dateKey === requestedDateRaw
      || d.dayLabel.toLowerCase().includes(requestedDateRaw.toLowerCase()),
    );

    if (!matchedDay && requestedDateRaw.toLowerCase().includes('tomorrow') && bookingDays.length > 1) {
      matchedDay = bookingDays[1];
    } else if (!matchedDay && requestedDateRaw.toLowerCase().includes('today') && bookingDays.length > 0) {
      matchedDay = bookingDays[0];
    }

    if (!matchedDay) {
      matchedDay = bookingDays[0]; // fallback to first available
    }

    // Match slot on that day
    let matchedSlot = matchedDay.slots.find((s) =>
      s.time.startsWith(requestedTimeRaw)
      || s.label.toLowerCase().includes(requestedTimeRaw)
      || (requestedTimeRaw.includes('morning') && s.time < '12:00')
      || (requestedTimeRaw.includes('afternoon') && s.time >= '12:00'),
    );

    if (!matchedSlot && matchedDay.slots.length > 0) {
      matchedSlot = matchedDay.slots[0];
    }

    if (!matchedSlot) {
      return NextResponse.json({
        response: `I see that ${matchedDay.dayLabel} is currently fully booked. Would you like to check our next available date instead?`,
      });
    }

    // Claim provisional hold to prevent race conditions
    await claimBookingHold(admin, accountId, matchedDay.dateKey, matchedSlot.time);

    // Create the booking lead and pending job in database
    try {
      await createBooking(admin, accountId, {
        name: callerName,
        phone: callerPhone || null,
        email: null,
        address: serviceAddress,
        description: serviceDesc || 'Booked via AI Voice receptionist',
        serviceName: serviceDesc || null,
        dateKey: matchedDay.dateKey,
        dateLabel: matchedDay.dayLabel,
        time: matchedSlot.time,
        endTime: matchedSlot.endTime,
        timeLabel: matchedSlot.label,
        note: notes ? `Voice call note: ${notes}` : 'Scheduled by AI phone receptionist',
      });

      // Send SMS confirmation to mobile phone if phone is present
      const callId = verifiedProviderCallId || (typeof body.call_id === 'string' ? body.call_id : undefined);
      if (callerPhone) {
        await sendCallerVoiceBookingConfirmationSms({
          accountId,
          callerPhone,
          whenLabel: `${matchedDay.dayLabel} (${matchedSlot.label})`,
          serviceAddress,
          idempotencyKey: callId ? `voice-booking-sms:${accountId}:${callId}` : undefined,
        });
      }

      return NextResponse.json({
        response: `I have reserved ${matchedDay.dayLabel} for ${matchedSlot.label} for ${callerName}${serviceAddress ? ` at ${serviceAddress}` : ''}. I also texted a confirmation to your mobile phone. Our team will review the request and see you then!`,
      });
    } catch (err) {
      console.error('Error creating in-call booking:', err);
      return NextResponse.json({
        response: `I have recorded your request for ${matchedDay.dayLabel} for ${matchedSlot.label}. Our dispatch team will confirm all details with you directly.`,
      });
    }
  }

  if (fnName === 'check_permit_requirement') {
    const cityOrAddress = String(args.city_or_address || '').trim();
    if (!cityOrAddress) {
      return NextResponse.json({
        response: 'Which city or street address is the work being planned for?',
      });
    }

    const tradeRaw = String(args.trade || '').toLowerCase();
    const tradeKey: 'roofing' | 'electrical' | 'mechanical' | 'plumbing' | 'gutters' =
      tradeRaw.includes('elec') || tradeRaw.includes('ev') || tradeRaw.includes('panel') || tradeRaw.includes('generator')
        ? 'electrical'
        : tradeRaw.includes('mech') || tradeRaw.includes('hvac') || tradeRaw.includes('furnace') || tradeRaw.includes('ac') || tradeRaw.includes('heat')
        ? 'mechanical'
        : tradeRaw.includes('plumb') || tradeRaw.includes('water') || tradeRaw.includes('drain') || tradeRaw.includes('pipe')
        ? 'plumbing'
        : tradeRaw.includes('gutter')
        ? 'gutters'
        : 'roofing';

    const discipline: JurisdictionDiscipline =
      tradeKey === 'electrical' || tradeKey === 'mechanical' || tradeKey === 'plumbing'
        ? tradeKey
        : 'building';

    const projectDesc = String(args.project_description || '').trim() || `${tradeKey} project`;

    const jurisdiction = resolveJurisdiction(
      {
        raw: cityOrAddress,
        city: cityOrAddress,
        state: 'MI',
        formattedAddress: cityOrAddress,
        isValid: true,
      },
      discipline,
    );

    const requirement = evaluatePermitRequirement(jurisdiction.authorityId, {
      trade: tradeKey,
      scope: 'replacement',
      freeTextDescription: projectDesc,
      estimatedCost: 8500,
      roofSquares: 22,
    });

    const isReq = requirement.decision === 'required';
    const feeText = requirement.estimatedGovernmentFee
      ? ` The estimated municipal permit fee is approximately $${requirement.estimatedGovernmentFee.estimatedTotal.toFixed(0)}.`
      : '';

    const spokenResponse = isReq
      ? `In ${jurisdiction.authorityName}, a building and trade permit is required for ${projectDesc}.${feeText} Our licensed contractor team pulls the permit and coordinates all required city inspections with ${jurisdiction.agencyName}.`
      : requirement.decision === 'not_required'
      ? `In ${jurisdiction.authorityName}, a permit is typically not required for minor repairs under ${projectDesc}. Our team ensures all work strictly complies with Michigan building codes.`
      : `In ${jurisdiction.authorityName}, we recommend verifying with ${jurisdiction.agencyName} based on your exact project scope. Our office manages the full municipal permit and inspection process for you.`;

    return NextResponse.json({
      response: spokenResponse,
    });
  }

  if (fnName === 'check_inspection_status') {
    const query = String(args.customer_name_or_address || '').trim();
    if (!query) {
      return NextResponse.json({
        response: 'Could you please tell me your street address or name so I can look up your permit status?',
      });
    }

    try {
      const { data: job } = await admin
        .from('jobs')
        .select('id, ref, client_name, property_street, property_city')
        .eq('account_id', accountId)
        .or(`client_name.ilike.%${query}%,property_street.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!job) {
        return NextResponse.json({
          response: `I wasn't able to locate an active record matching '${query}' right now, but I have noted your inquiry for our office staff to follow up with you promptly.`,
        });
      }

      const [{ data: permitCase }, { data: inspections }] = await Promise.all([
        admin
          .from('job_permit_cases')
          .select('application_status, external_permit_number, notes')
          .eq('account_id', accountId)
          .eq('job_id', job.id)
          .maybeSingle(),
        admin
          .from('job_permit_inspections')
          .select('type, status, scheduled_date')
          .eq('account_id', accountId)
          .eq('job_id', job.id)
          .order('scheduled_date', { ascending: true }),
      ]);

      const propertyRef = job.property_street || job.client_name;

      if (!permitCase) {
        return NextResponse.json({
          response: `For ${propertyRef}, your project is active in our system and our office team is preparing the documentation.`,
        });
      }

      const statusMap: Record<string, string> = {
        draft: 'in preparation by our office',
        ready: 'ready for municipal submission',
        submitted: 'currently under review by the municipal building department',
        under_review: 'under plan review with city inspectors',
        issued: 'approved and issued',
        inspections_scheduled: 'issued and undergoing inspection milestones',
        final_passed: 'fully approved with all final inspections passed',
        closed: 'completed and closed out with the city',
      };

      const friendlyStatus = statusMap[permitCase.application_status] || permitCase.application_status;
      const permitRefText = permitCase.external_permit_number
        ? ` under permit number ${permitCase.external_permit_number}`
        : '';

      const nextInspection = (inspections ?? []).find(
        (i) => i.status === 'scheduled' || i.status === 'requested',
      );

      const inspectionText = nextInspection
        ? ` Your ${nextInspection.type} is scheduled for ${nextInspection.scheduled_date || 'an upcoming window'}.`
        : '';

      return NextResponse.json({
        response: `For ${propertyRef}, your permit is ${friendlyStatus}${permitRefText}.${inspectionText} Is there anything specific about the inspection you'd like me to note?`,
      });
    } catch (err) {
      console.error('Error in check_inspection_status SWAIG tool:', err);
      return NextResponse.json({
        response: "I've flagged your permit status question for our project manager to follow up with you.",
      });
    }
  }

  if (fnName === 'check_rebates_and_incentives') {
    const rawCategory = String(args.category || '').toLowerCase();
    const state = String(args.state || 'MI').toUpperCase();

    let cat: CleanEnergyWorkCategory = 'heat_pump_hvac';
    if (rawCategory.includes('water')) cat = 'heat_pump_water_heater';
    else if (rawCategory.includes('solar')) cat = 'solar_rooftop_pv';
    else if (rawCategory.includes('ev') || rawCategory.includes('charger')) cat = 'ev_charger_level2';
    else if (rawCategory.includes('panel')) cat = 'electrical_panel_200a';
    else if (rawCategory.includes('insulation')) cat = 'roof_insulation_air_sealing';

    try {
      const report = calculateCleanEnergyRebates({
        category: cat,
        state,
        projectCost: 9500,
      });

      const fedCredit = report.incentives.federalTaxCredit.calculatedAmount;
      const utilityRebate = report.incentives.utilityRebate?.cashRebateAmount || 0;
      const totalIncentives = fedCredit + utilityRebate;

      let benefitText = `Under the Federal Inflation Reduction Act, qualifying installations are eligible for a 30% federal tax credit up to $${fedCredit.toLocaleString()}`;
      if (utilityRebate > 0) {
        benefitText += `, plus an estimated $${utilityRebate.toLocaleString()} in local utility rebates, bringing total estimated savings to $${totalIncentives.toLocaleString()}`;
      }
      benefitText += '. Would you like me to schedule a consultation with our technician to assess your home?';

      return NextResponse.json({ response: benefitText });
    } catch (err) {
      console.error('Error in check_rebates_and_incentives SWAIG tool:', err);
      return NextResponse.json({
        response: 'Federal tax credits and local utility rebates are available for qualifying high-efficiency upgrades. Would you like our specialist to give you a full estimate?',
      });
    }
  }

  // --- CONTRACTOR AI VOICE ASSISTANT TOOLS ---

  if (fnName === 'update_job_details' || fnName === 'update_job_scope') {
    const jobRefOrClient = String(args.job_ref_or_client || args.client_name || args.job_id || '').trim();
    const newScope = String(args.scope || args.scope_addition || '').trim();
    const status = String(args.status || '').trim();
    const scheduledDate = String(args.scheduled_date || args.scheduled_for || '').trim();
    const scheduledTime = String(args.scheduled_time || '').trim();
    const lineItemLabel = String(args.line_item_label || args.item_name || '').trim();
    const lineItemPrice = Number(args.line_item_price || args.price || 0);

    if (!jobRefOrClient) {
      return NextResponse.json({ response: 'Which customer or job reference number would you like me to update?' });
    }

    try {
      // Find matching job
      const { data: jobs } = await admin
        .from('jobs')
        .select('id, ref, client_name, scope, quote_items, scheduled_for, scheduled_time')
        .eq('account_id', accountId)
        .or(`ref.ilike.%${jobRefOrClient}%,client_name.ilike.%${jobRefOrClient}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      const targetJob = jobs?.[0];
      if (!targetJob) {
        return NextResponse.json({
          response: `I couldn't find an active job matching "${jobRefOrClient}". Could you clarify the customer name or job ID?`,
        });
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (newScope) {
        updates.scope = targetJob.scope ? `${targetJob.scope}\n• ${newScope}` : newScope;
      }
      if (scheduledDate) {
        updates.scheduled_for = scheduledDate;
        if (scheduledTime) updates.scheduled_time = scheduledTime;
      }
      if (status && ['new_lead', 'in_progress', 'complete'].includes(status)) {
        updates.status = status;
      }

      await admin.from('jobs').update(updates).eq('id', targetJob.id);

      // If a quote item was provided
      if (lineItemLabel && lineItemPrice > 0) {
        const existingItems = parseQuoteItems(targetJob.quote_items);
        const updatedItems: QuoteItem[] = [
          ...existingItems,
          {
            id: `voice-${Date.now()}`,
            label: lineItemLabel,
            amount: lineItemPrice,
            kind: 'base',
            selected: true,
            recommended: false,
          },
        ];
        await saveQuoteItems(admin, accountId, targetJob.id, updatedItems);
      }

      // Add feed event
      await createJobFeedEvent(admin, accountId, targetJob.id, {
        kind: 'job_update',
        title: 'Voice Call Update',
        body: `Updated over phone: ${[newScope, scheduledDate ? `Scheduled for ${scheduledDate}` : '', lineItemLabel ? `Added "${lineItemLabel}" ($${lineItemPrice})` : ''].filter(Boolean).join(' · ')}`,
        visibility: 'internal',
      });

      return NextResponse.json({
        response: `Got it! I've updated the ${targetJob.ref} job for ${targetJob.client_name}.${scheduledDate ? ` Scheduled for ${scheduledDate}.` : ''} Is there anything else on this job?`,
      });
    } catch (err) {
      console.error('Error in update_job_details SWAIG tool:', err);
      return NextResponse.json({ response: 'I encountered an issue saving that job update. Could you repeat the changes?' });
    }
  }

  if (fnName === 'create_or_update_lead') {
    const name = String(args.name || args.caller_name || '').trim();
    const phone = String(args.phone || args.caller_phone || '').trim();
    const address = String(args.address || args.service_address || '').trim() || null;
    const projectType = String(args.project_type || args.scope || '').trim() || 'Phone Lead';
    const notes = String(args.notes || args.message || '').trim() || null;
    const requestedDate = String(args.requested_date || '').trim();

    if (!name) {
      return NextResponse.json({ response: 'What is the customer\'s name for the new lead?' });
    }

    try {
      const lead = await createLead(admin, accountId, {
        source: 'ai_voice',
        name,
        phone: phone || null,
        address,
        projectType,
        message: notes,
        triage: {
          score: 'hot',
          flags: ['contractor_voice_phone'],
          contactPreference: 'any',
        },
      });

      if (requestedDate) {
        await scheduleLeadQuoteVisit(admin, accountId, lead.id, {
          scheduledFor: requestedDate,
          scheduledTime: '09:00',
          durationMinutes: 60,
          notes: null,
          confirmationTextSentAt: null,
        });
      }

      return NextResponse.json({
        response: `I've created a new lead for ${name}${address ? ` at ${address}` : ''}.${requestedDate ? ` Quote visit set for ${requestedDate}.` : ''}`,
      });
    } catch (err) {
      console.error('Error in create_or_update_lead SWAIG tool:', err);
      return NextResponse.json({ response: 'Could not create that lead right now. Please try again.' });
    }
  }

  if (fnName === 'log_crew_time_and_materials') {
    const jobRefOrClient = String(args.job_ref_or_client || args.client_name || '').trim();
    const hours = Number(args.hours || 0);
    const materialDesc = String(args.materials || args.material_description || '').trim();
    const materialAmount = Number(args.material_cost || args.amount || 0);

    if (!jobRefOrClient) {
      return NextResponse.json({ response: 'Which job are you logging time or materials for?' });
    }

    try {
      const { data: jobs } = await admin
        .from('jobs')
        .select('id, ref, client_name')
        .eq('account_id', accountId)
        .or(`ref.ilike.%${jobRefOrClient}%,client_name.ilike.%${jobRefOrClient}%`)
        .limit(1);

      const targetJob = jobs?.[0];
      if (!targetJob) {
        return NextResponse.json({ response: `Could not find a job matching "${jobRefOrClient}".` });
      }

      if (hours > 0) {
        await admin.from('costs').insert({
          account_id: accountId,
          job_id: targetJob.id,
          type: 'labor',
          description: 'Voice logged labor',
          hours,
        });
      }

      if (materialAmount > 0 || materialDesc) {
        await admin.from('costs').insert({
          account_id: accountId,
          job_id: targetJob.id,
          type: 'material',
          description: materialDesc || 'Voice logged materials',
          amount: materialAmount || null,
        });
      }

      await createJobFeedEvent(admin, accountId, targetJob.id, {
        kind: 'job_update',
        title: 'Logged Time & Materials',
        body: `Logged by phone: ${hours > 0 ? `${hours} hrs` : ''} ${materialAmount > 0 ? `$${materialAmount} materials (${materialDesc})` : ''}`,
        visibility: 'internal',
      });

      return NextResponse.json({
        response: `Logged ${hours > 0 ? `${hours} hours` : ''} ${materialAmount > 0 ? `and $${materialAmount} in materials` : ''} on the ${targetJob.client_name} job.`,
      });
    } catch (err) {
      console.error('Error in log_crew_time_and_materials SWAIG tool:', err);
      return NextResponse.json({ response: 'Failed to log those costs. Please try again.' });
    }
  }

  if (fnName === 'create_job_change_order') {
    const jobRefOrClient = String(args.job_ref_or_client || args.client_name || '').trim();
    const title = String(args.title || 'Extra Work Found').trim();
    const description = String(args.description || args.note || '').trim();

    try {
      const { data: jobs } = await admin
        .from('jobs')
        .select('id, ref, client_name')
        .eq('account_id', accountId)
        .or(`ref.ilike.%${jobRefOrClient}%,client_name.ilike.%${jobRefOrClient}%`)
        .limit(1);

      const targetJob = jobs?.[0];
      if (!targetJob) {
        return NextResponse.json({ response: `Could not find a job matching "${jobRefOrClient}".` });
      }

      await admin.from('change_orders').insert({
        account_id: accountId,
        job_id: targetJob.id,
        title,
        description: description || null,
        status: 'draft',
      });

      await createJobFeedEvent(admin, accountId, targetJob.id, {
        kind: 'job_update',
        title: `Change Order Raised: ${title}`,
        body: description || 'Extra work recorded via voice call.',
        visibility: 'internal',
      });

      return NextResponse.json({
        response: `I've created a draft change order "${title}" on ${targetJob.client_name}'s job for office review.`,
      });
    } catch (err) {
      console.error('Error in create_job_change_order SWAIG tool:', err);
      return NextResponse.json({ response: 'Failed to create the change order. Please try again.' });
    }
  }

  return NextResponse.json({
    response: "I've noted that for our team.",
  });
}
