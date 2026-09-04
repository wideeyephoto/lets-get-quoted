import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { verifyVoiceReceiptAuthorization, verifyVoiceToolToken } from '@/lib/voice/auth';
import { sendCallerVoiceBookingLinkSms, sendCallerVoiceBookingConfirmationSms } from '@/lib/sms';
import { getAvailableBookingDays, claimBookingHold, createBooking } from '@/lib/booking';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';
import { calculateCleanEnergyRebates, type CleanEnergyWorkCategory } from '@/lib/rebates/clean-energy-rebate-engine';
import { createLead } from '@/lib/leads';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';
import { normalizeUsPhone } from '@/lib/phone';
import { resolveVoiceCallerIdentity } from '@/lib/voice/caller-identity';
import {
  CONTRACTOR_VOICE_FUNCTIONS,
  handleContractorVoiceAction,
  resolveVoiceJob,
} from '@/lib/voice/contractor-actions';
import {
  getVoiceStaffStepUpStatus,
  requestVoiceStaffStepUp,
  verifyVoiceStaffStepUp,
} from '@/lib/voice/staff-step-up';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyVoiceReceiptAuthorization(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing signed tool token' }, { status: 403 });
  }

  const tokenCheck = verifyVoiceToolToken(token);
  if (!tokenCheck.ok) {
    return NextResponse.json({ error: `Invalid tool token: ${tokenCheck.reason}` }, { status: 403 });
  }

  const accountId = tokenCheck.payload.accountId;
  const verifiedCallerPhone = tokenCheck.payload.callerPhone;
  const verifiedProviderCallId = tokenCheck.payload.providerCallId;

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
  const identity = await resolveVoiceCallerIdentity(admin, accountId, verifiedCallerPhone);

  if (fnName === 'send_booking_link') {
    if (identity.status === 'staff') {
      return NextResponse.json({
        response: 'Booking-link texts are a customer-call tool and are not available in contractor mode.',
      });
    }
    if (identity.status === 'ambiguous' || identity.status === 'unavailable') {
      return NextResponse.json({
        response: 'I could not safely verify this caller, so I did not send a booking text.',
      });
    }
    const callerPhone = verifiedCallerPhone || String(args.caller_phone || '').trim();
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

    const sendResult = await sendCallerVoiceBookingLinkSms({
      accountId,
      callerPhone,
      bookingUrl,
      idempotencyKey: `swaig-booking:${accountId}:${verifiedProviderCallId}`,
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
    if (identity.status === 'staff') {
      return NextResponse.json({
        response: 'That customer booking tool is disabled on staff calls. Use the verified contractor scheduling action instead; nothing was changed.',
      });
    }
    if (identity.status === 'ambiguous' || identity.status === 'unavailable') {
      return NextResponse.json({
        response: 'I could not safely verify this caller, so I did not create a booking.',
      });
    }
    const callerName = String(args.caller_name || '').trim();
    const suppliedPhone = verifiedCallerPhone || String(args.caller_phone || '').trim();
    const callerPhone = suppliedPhone ? normalizeUsPhone(suppliedPhone) : null;
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

    if (!callerPhone) {
      return NextResponse.json({
        response: 'What mobile number should I use for the appointment and confirmation text?',
      });
    }

    if (!requestedDateRaw) {
      return NextResponse.json({
        response: 'Which date would you like to schedule the appointment for?',
      });
    }

    if (!requestedTimeRaw) {
      return NextResponse.json({
        response: 'Which available time window would you like on that date?',
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
      return NextResponse.json({
        response: `That date is not currently available. I can offer ${bookingDays.slice(0, 3).map((day) => day.dayLabel).join(', ')}. Which date would you like?`,
      });
    }

    // Match slot on that day
    const matchingSlots = matchedDay.slots.filter((s) =>
      s.time.startsWith(requestedTimeRaw)
      || s.label.toLowerCase().includes(requestedTimeRaw)
      || (requestedTimeRaw.includes('morning') && s.time < '12:00')
      || (requestedTimeRaw.includes('afternoon') && s.time >= '12:00'),
    );

    const matchedSlot = matchingSlots.length === 1 ? matchingSlots[0] : null;

    if (!matchedSlot) {
      return NextResponse.json({
        response: matchingSlots.length > 1
          ? `There is more than one ${requestedTimeRaw} window on ${matchedDay.dayLabel}: ${matchingSlots.map((slot) => slot.label).join(' or ')}. Which exact window would you like?`
          : `That time is not open on ${matchedDay.dayLabel}. The available windows are ${matchedDay.slots.map((slot) => slot.label).join(' or ') || 'currently full'}.`,
      });
    }

    const { data: existingVoiceLead, error: existingVoiceLeadError } = await admin
      .from('leads')
      .select('id')
      .eq('account_id', accountId)
      .eq('source_voice_provider_call_id', verifiedProviderCallId)
      .maybeSingle();
    if (existingVoiceLeadError) {
      return NextResponse.json({
        response: 'I could not safely verify whether this call already booked, so I did not create another request. Please try again.',
      });
    }

    // A retry resumes its provider-bound booking. A first attempt must win an
    // exclusive slot hold; a conflict is never silently treated as success.
    if (!existingVoiceLead) {
      const held = await claimBookingHold(admin, accountId, matchedDay.dateKey, matchedSlot.time);
      if (!held) {
        return NextResponse.json({
          response: `That ${matchedSlot.label} window was just taken. Please choose another available time.`,
        });
      }
    }

    // Create the booking lead and pending job in database
    try {
      await createBooking(admin, accountId, {
        name: callerName,
        phone: callerPhone,
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
        sourceVoiceProviderCallId: verifiedProviderCallId,
      });

      const confirmation = await sendCallerVoiceBookingConfirmationSms({
        accountId,
        callerPhone,
        whenLabel: `${matchedDay.dayLabel} (${matchedSlot.label})`,
        serviceAddress,
        idempotencyKey: `voice-booking-sms:${accountId}:${verifiedProviderCallId}`,
      });

      return NextResponse.json({
        response: `I submitted your request for ${matchedDay.dayLabel}, ${matchedSlot.label}, for ${callerName}${serviceAddress ? ` at ${serviceAddress}` : ''}.${confirmation.ok ? ' I also texted a confirmation to your mobile phone.' : ' The request is saved, but the confirmation text could not be delivered.'} Our team will review and confirm the appointment.`,
      });
    } catch (err) {
      console.error('Error creating in-call booking:', err);
      return NextResponse.json({
        response: 'I could not safely save that appointment request, so I am not going to claim it is booked. Please try another time or ask me to connect you with the office.',
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

    const estimatedCost = typeof args.estimated_cost === 'number'
      ? args.estimated_cost
      : typeof args.estimated_cost === 'string' && Number.isFinite(Number(args.estimated_cost))
      ? Number(args.estimated_cost)
      : undefined;

    const roofSquares = typeof args.roof_squares === 'number'
      ? args.roof_squares
      : typeof args.roof_squares === 'string' && Number.isFinite(Number(args.roof_squares))
      ? Number(args.roof_squares)
      : undefined;

    const stateParam = typeof args.state === 'string' && args.state.trim().length === 2
      ? args.state.trim().toUpperCase()
      : undefined;

    const jurisdiction = resolveJurisdiction(
      {
        raw: cityOrAddress,
        city: cityOrAddress,
        state: stateParam || 'MI',
        formattedAddress: cityOrAddress,
        isValid: true,
      },
      discipline,
    );

    const requirement = evaluatePermitRequirement(jurisdiction.authorityId, {
      trade: tradeKey,
      scope: 'replacement',
      freeTextDescription: projectDesc,
      ...(estimatedCost !== undefined ? { estimatedCost } : {}),
      ...(roofSquares !== undefined ? { roofSquares } : {}),
    });

    const isReq = requirement.decision === 'required';
    const feeText = (estimatedCost !== undefined && requirement.estimatedGovernmentFee)
      ? ` The estimated municipal permit fee is approximately $${requirement.estimatedGovernmentFee.estimatedTotal.toFixed(0)} based on your project scope.`
      : ' Municipal permit fees depend on final contract valuation and inspection schedule, which our team coordinates for you.';

    const spokenResponse = isReq
      ? `In ${jurisdiction.authorityName}, a building and trade permit is required for ${projectDesc}.${feeText} Our team manages the full permit and municipal inspection process directly with ${jurisdiction.agencyName}.`
      : requirement.decision === 'not_required'
      ? `In ${jurisdiction.authorityName}, a permit is typically not required for minor repairs or maintenance under ${projectDesc}. Our office ensures all work complies strictly with local building safety codes.`
      : `In ${jurisdiction.authorityName}, requirements depend on your exact project scope. Our office manages the municipal permit and inspection process with ${jurisdiction.agencyName}.`;

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
      if (identity.status === 'unavailable' || identity.status === 'ambiguous') {
        return NextResponse.json({
          response: 'I could not safely verify who is asking for that project status, so I did not disclose it. Please contact the office.',
        });
      }
      if (identity.status === 'staff') {
        const stepUp = await getVoiceStaffStepUpStatus({
          admin,
          accountId,
          providerCallId: verifiedProviderCallId,
          signedCallerPhone: verifiedCallerPhone,
          identity,
        });
        if (!stepUp.verified) {
          return NextResponse.json({ response: stepUp.response });
        }
      }
      const allowedCallerPhone = identity.status === 'customer'
        ? normalizeUsPhone(verifiedCallerPhone || '')
        : null;
      if (identity.status === 'customer' && !allowedCallerPhone) {
        return NextResponse.json({
          response: 'I need a verified callback number on this call before I can disclose project status. Please contact the office.',
        });
      }

      const resolution = await resolveVoiceJob(admin, accountId, query, { allowedCallerPhone });
      if (resolution.status === 'ambiguous') {
        return NextResponse.json({
          response: 'I found more than one matching project. Please give me the exact job reference; I will not guess.',
        });
      }
      if (resolution.status !== 'resolved') {
        return NextResponse.json({
          response: resolution.status === 'unavailable'
            ? 'I could not safely check project records right now. Please contact the office.'
            : 'I could not find a project tied to this verified caller and that exact reference.',
        });
      }

      const { data: job, error: jobError } = await admin
        .from('jobs')
        .select('id, ref, client_name, property_street, property_city, address')
        .eq('account_id', accountId)
        .eq('id', resolution.job.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (jobError || !job) {
        return NextResponse.json({
          response: 'I could not safely load that active project record. Please contact the office.',
        });
      }

      const [permitResult, inspectionResult] = await Promise.all([
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
      if (permitResult.error || inspectionResult.error) {
        return NextResponse.json({
          response: 'I could not safely load the current permit and inspection records. Please contact the office.',
        });
      }
      const permitCase = permitResult.data;
      const inspections = inspectionResult.data;

      const propertyRef = job.property_street || job.address || job.client_name;

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
        response: 'I could not safely check that permit status. Please contact the office.',
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
      const callerCost = typeof args.project_cost === 'number'
        ? args.project_cost
        : typeof args.project_cost === 'string' && Number.isFinite(Number(args.project_cost))
        ? Number(args.project_cost)
        : null;

      if (callerCost && callerCost > 0) {
        const report = calculateCleanEnergyRebates({
          category: cat,
          state,
          projectCost: callerCost,
        });
        const fedCredit = report.incentives.federalTaxCredit.calculatedAmount;
        const utilityRebate = report.incentives.utilityRebate?.cashRebateAmount || 0;
        const totalIncentives = fedCredit + utilityRebate;

        let benefitText = `For a project estimate of $${callerCost.toLocaleString()}, qualifying installations are eligible for up to $${fedCredit.toLocaleString()} in federal tax credits`;
        if (utilityRebate > 0) {
          benefitText += `, plus an estimated $${utilityRebate.toLocaleString()} in local utility rebates, for up to $${totalIncentives.toLocaleString()} in total incentives`;
        }
        benefitText += '. Would you like our specialist to assess your home and prepare a formal estimate?';
        return NextResponse.json({ response: benefitText });
      }

      let summaryText = '';
      if (cat === 'heat_pump_hvac') {
        summaryText = 'Under the Federal Inflation Reduction Act 25C, qualifying high-efficiency heat pump HVAC systems are eligible for a 30% federal tax credit up to $2,000, plus local utility rebates. Would you like to schedule a consultation with our technician to assess your home?';
      } else if (cat === 'heat_pump_water_heater') {
        summaryText = 'Under the Federal Inflation Reduction Act 25C, qualifying heat pump water heaters are eligible for a 30% federal tax credit up to $2,000, plus local electric utility rebates. Would you like our specialist to give you a full estimate?';
      } else if (cat === 'solar_rooftop_pv') {
        summaryText = 'Under Federal IRA Section 25D, qualifying rooftop solar installations are eligible for an uncapped 30% federal tax credit. Would you like our specialist to review your roof and energy usage?';
      } else if (cat === 'electrical_panel_200a') {
        summaryText = 'Under Federal IRA Section 25C, electrical panel upgrades installed in conjunction with heat pumps or clean energy qualify for a 30% tax credit up to $600. Would you like our team to schedule an on-site evaluation?';
      } else {
        summaryText = 'Federal Inflation Reduction Act tax credits and local utility rebates cover up to 30% of qualifying clean energy home improvements. Would you like our specialist to provide a personalized estimate?';
      }

      return NextResponse.json({ response: summaryText });
    } catch (err) {
      console.error('Error in check_rebates_and_incentives SWAIG tool:', err);
      return NextResponse.json({
        response: 'Federal tax credits and local utility rebates are available for qualifying high-efficiency upgrades. Would you like our specialist to give you a full estimate?',
      });
    }
  }

  if (fnName === 'cancel_or_reschedule_appointment') {
    const customerPhone = String(args.customer_phone || verifiedCallerPhone || '').trim();
    const action = String(args.action || 'reschedule').toLowerCase();
    const newDate = String(args.new_date || '').trim();
    const newTime = String(args.new_time || '').trim();
    const reason = String(args.reason || '').trim();

    try {
      const normalizedPhone = customerPhone ? normalizeUsPhone(customerPhone) : null;
      let leadRow: Record<string, unknown> | null = null;
      if (normalizedPhone) {
        const { data } = await admin
          .from('leads')
          .select('id, name, scheduled_date, scheduled_time, address')
          .eq('account_id', accountId)
          .eq('phone', normalizedPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        leadRow = data as Record<string, unknown> | null;
      }

      if (action === 'cancel') {
        if (leadRow?.id) {
          await admin
            .from('leads')
            .update({
              status: 'canceled',
              notes: reason ? `Canceled via AI voice: ${reason}` : 'Canceled via AI voice phone request',
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadRow.id);
        }
        return NextResponse.json({
          response: 'I have noted the cancellation on your appointment. Our office dispatch team will confirm and follow up if you need to rebook in the future.',
        });
      }

      if (newDate) {
        if (leadRow?.id) {
          await admin
            .from('leads')
            .update({
              scheduled_date: newDate,
              scheduled_time: newTime || (leadRow.scheduled_time as string | null) || 'Morning',
              notes: reason ? `Rescheduled via AI voice: ${reason}` : 'Rescheduled via AI voice phone request',
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadRow.id);
        }
        const timeClause = newTime ? ` at ${newTime}` : '';
        return NextResponse.json({
          response: `I have updated your appointment request to ${newDate}${timeClause}. Our team will review the calendar and text you a confirmation shortly.`,
        });
      }

      return NextResponse.json({
        response: 'What date and time would you prefer to reschedule your appointment to?',
      });
    } catch (err) {
      console.error('Error in cancel_or_reschedule_appointment SWAIG tool:', err);
      return NextResponse.json({
        response: 'I have noted your schedule change request. Our office staff will follow up directly with you to confirm the timing.',
      });
    }
  }

  if (fnName === 'get_service_quote_range') {
    const serviceType = String(args.service_type || '').toLowerCase();

    let estimateGuidance = '';
    if (serviceType.includes('water heater') || serviceType.includes('tankless')) {
      estimateGuidance = 'Standard tank water heater replacements typically range from $1,500 to $2,800 installed, while high-efficiency tankless units generally range from $3,000 to $5,000 including venting and gas lines.';
    } else if (serviceType.includes('drain') || serviceType.includes('clog') || serviceType.includes('sewer')) {
      estimateGuidance = 'Standard drain clearing typically ranges from $175 to $450 depending on access and severity, while main sewer line hydro-jetting or repairs range higher based on depth.';
    } else if (serviceType.includes('panel') || serviceType.includes('200 amp') || serviceType.includes('breaker')) {
      estimateGuidance = 'Standard 200-amp electrical service panel upgrades typically range from $2,200 to $3,800 depending on utility coordination and grounding requirements.';
    } else if (serviceType.includes('roof') || serviceType.includes('leak') || serviceType.includes('shingle')) {
      estimateGuidance = 'Minor roof leak repairs typically range from $350 to $1,200, while complete architectural shingle roof replacements generally range from $6,500 to $15,000+ depending on square footage and pitch.';
    } else if (serviceType.includes('hvac') || serviceType.includes('furnace') || serviceType.includes('ac') || serviceType.includes('heat pump')) {
      estimateGuidance = 'Complete heating and cooling system replacements typically range from $6,500 to $14,000 depending on equipment efficiency and sizing, while seasonal tune-ups range from $99 to $189.';
    } else {
      estimateGuidance = 'Pricing varies depending on project scope, accessibility, and material requirements.';
    }

    const spokenResponse = `${estimateGuidance} Every home is unique, so our technician provides an exact, written quote on-site before any work begins. Would you like me to reserve an estimate appointment for you?`;
    return NextResponse.json({ response: spokenResponse });
  }

  if (fnName === 'request_staff_step_up') {
    const result = await requestVoiceStaffStepUp({
      admin,
      accountId,
      providerCallId: verifiedProviderCallId,
      signedCallerPhone: verifiedCallerPhone,
      identity,
    });
    return NextResponse.json({ response: result.response });
  }

  if (fnName === 'verify_staff_step_up') {
    const result = await verifyVoiceStaffStepUp({
      admin,
      accountId,
      providerCallId: verifiedProviderCallId,
      signedCallerPhone: verifiedCallerPhone,
      identity,
      code: args.code,
    });
    return NextResponse.json({ response: result.response });
  }

  if (fnName === 'capture_lead' || (fnName === 'create_or_update_lead' && identity.status !== 'staff')) {
    const callerName = String(args.name || args.caller_name || args.customer_name || '').trim();
    let phoneRaw = String(args.phone || args.caller_phone || args.customer_phone || '').trim();
    if (phoneRaw && /^(?:none|no|n\/a|na|null|unknown|not provided|no phone|doesn'?t have one|unspecified)$/i.test(phoneRaw)) {
      phoneRaw = '';
    }
    const phone = phoneRaw ? (normalizeUsPhone(phoneRaw) || null) : (verifiedCallerPhone ? normalizeUsPhone(verifiedCallerPhone) : null);
    const email = String(args.email || '').trim().toLowerCase() || null;
    const address = String(args.address || args.service_address || '').trim() || null;
    const projectType = String(args.project_type || args.work_requested || args.service_description || '').trim() || 'AI Voice inquiry';
    let message = String(args.notes || args.message || args.issue || '').trim() || null;

    if (phoneRaw && !normalizeUsPhone(phoneRaw)) {
      const noteTag = `[Caller phone note: ${phoneRaw}]`;
      message = message ? `${message}\n${noteTag}` : noteTag;
    }

    const finalName = callerName || (phone ? `AI call — ${phone}` : 'AI Phone Caller');

    try {
      await createLead(admin, accountId, {
        source: 'ai_voice',
        name: finalName,
        phone,
        email,
        address,
        projectType,
        message: message || 'Inquiry taken by AI receptionist',
        sourcePage: '/call',
        sourceVoiceProviderCallId: verifiedProviderCallId,
      });

      return NextResponse.json({
        response: `I've saved your request for ${finalName}${address ? ` at ${address}` : ''}. Our team will review the details and follow up with you.`,
      });
    } catch (err) {
      console.error('Error in capture_lead SWAIG handler:', err);
      return NextResponse.json({
        response: 'I have recorded your information for our team to follow up on shortly.',
      });
    }
  }

  const rawOp = String(args.operation || args.intent || '').trim().toLowerCase();
  const isLeadCreate = fnName === 'create_or_update_lead' && (rawOp === 'create' || rawOp === '');

  if (identity.status === 'staff') {
    const stepUp = CONTRACTOR_VOICE_FUNCTIONS.has(fnName) && !isLeadCreate
      ? await getVoiceStaffStepUpStatus({
        admin,
        accountId,
        providerCallId: verifiedProviderCallId,
        signedCallerPhone: verifiedCallerPhone,
        identity,
      })
      : null;
    if (stepUp && !stepUp.verified) {
      return NextResponse.json({ response: stepUp.response });
    }
    const effectiveArgs = { ...args };
    if (isLeadCreate && !effectiveArgs.operation && !effectiveArgs.intent) {
      effectiveArgs.operation = 'create';
    }
    const action = await handleContractorVoiceAction({
      admin,
      accountId,
      providerCallId: verifiedProviderCallId,
      caller: identity.caller,
      stepUpVerified: stepUp?.verified === true || isLeadCreate,
      functionName: fnName,
      args: effectiveArgs,
    });
    if (action.handled) return NextResponse.json({ response: action.response });
  } else if (CONTRACTOR_VOICE_FUNCTIONS.has(fnName)) {
    return NextResponse.json({
      response: identity.status === 'customer'
        ? 'Job updates and internal commands are restricted to verified team members.'
        : 'I could not safely verify this staff caller, so I did not save anything.',
    });
  }

  return NextResponse.json({
    response: 'That function is not supported, so I did not change anything.',
  }, { status: 400 });
}
