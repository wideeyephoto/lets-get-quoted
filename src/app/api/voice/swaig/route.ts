import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { voiceReceiptAuthorization } from '@/lib/voice/auth';
import { sendCallerVoiceBookingLinkSms } from '@/lib/sms';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';
import { calculateCleanEnergyRebates, type CleanEnergyWorkCategory } from '@/lib/rebates/clean-energy-rebate-engine';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';

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
  const accountId = url.searchParams.get('account_id');

  if (!accountId) {
    return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
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
    const callerPhone = String(args.caller_phone || body.caller_id_number || '').trim();
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

    const callId = typeof body.call_id === 'string' ? body.call_id : undefined;
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

  if (fnName === 'check_contractor_availability') {
    const { data: voiceSettings } = await admin
      .from('voice_settings')
      .select('business_hours, emergency_enabled')
      .eq('account_id', accountId)
      .maybeSingle();

    const emergency = Boolean(voiceSettings?.emergency_enabled);

    return NextResponse.json({
      response: `Our standard service hours are Monday through Friday, 8:00 AM to 5:00 PM. ${
        emergency
          ? 'We also provide 24/7 priority emergency dispatch for urgent situations like leaks or hazards.'
          : 'For any after-hours requests, our team responds first thing the next business morning.'
      }`,
    });
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

  return NextResponse.json({
    response: "I've noted that for our team.",
  });
}
