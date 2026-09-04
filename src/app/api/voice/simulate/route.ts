import { NextRequest, NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { loadVoiceGroundingContext, buildVoiceSystemPrompt } from '@/lib/voice/grounding';
import { detectCallEmergency } from '@/lib/voice/triage';
import { getAvailableBookingDays } from '@/lib/booking';
import { calculateCleanEnergyRebates } from '@/lib/rebates/clean-energy-rebate-engine';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.read');
    const body = await req.json().catch(() => ({}));

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const callerPhone = typeof body.callerPhone === 'string' ? body.callerPhone.trim() : null;
    const scenario = typeof body.scenario === 'string' ? body.scenario : 'custom';

    if (!message && !scenario) {
      return NextResponse.json({ error: 'Message or scenario required.' }, { status: 400 });
    }

    const testMessage = message || (
      scenario === 'emergency'
        ? 'Emergency! A water pipe just burst in our basement and water is spraying all over the electrical panel!'
        : scenario === 'rebates'
        ? 'Hi, do you offer heat pumps that qualify for IRA 25C tax credits or local utility rebates?'
        : scenario === 'returning'
        ? 'Hello, I am calling to check on the status of our HVAC project with your team.'
        : 'Hi there, our AC is blowing warm air. Do you have any open slots to send a technician tomorrow?'
    );

    // 1. Load active grounding context
    const grounding = await loadVoiceGroundingContext(supabase, accountId, callerPhone);
    const _systemPrompt = buildVoiceSystemPrompt(grounding);

    // 2. Emergency Triage Analysis
    const emergency = detectCallEmergency(testMessage);

    // 3. Tool Invocations Simulation
    const toolsExecuted: Array<{
      tool: string;
      parameters: Record<string, unknown>;
      result: Record<string, unknown>;
    }> = [];

    const lower = testMessage.toLowerCase();

    // Scheduling / Available Slots Tool Trigger
    if (lower.includes('slot') || lower.includes('appointment') || lower.includes('open') || lower.includes('tomorrow') || lower.includes('available') || lower.includes('schedule') || lower.includes('come out') || lower.includes('book')) {
      let dates = grounding.availableSlots;
      if (!dates || dates.length === 0) {
        try {
          const bookingDays = await getAvailableBookingDays(supabase, accountId);
          if (bookingDays && bookingDays.length > 0) {
            dates = bookingDays.slice(0, 3).map((d) => {
              const slotLabels = d.slots.map((s) => s.label);
              return slotLabels.length > 0 ? `${d.dayLabel} (${slotLabels.join(' or ')})` : d.dayLabel;
            });
          }
        } catch {
          // Fallback to standard windows
        }
      }
      toolsExecuted.push({
        tool: 'check_available_slots',
        parameters: { preferred_window: 'next available' },
        result: {
          status: 'success',
          available_dates: dates && dates.length > 0
            ? dates
            : ['Tomorrow Morning (8:00 AM - 12:00 PM)', 'Thursday Afternoon (12:00 PM - 4:00 PM)'],
          booking_rule: 'Appointments can be locked in during this call with instant SMS confirmation.',
        },
      });
    }

    // Rebates Tool Trigger
    if (lower.includes('rebate') || lower.includes('tax credit') || lower.includes('ira') || lower.includes('incentive') || lower.includes('heat pump') || lower.includes('25c')) {
      let rebateReport: ReturnType<typeof calculateCleanEnergyRebates> | null = null;
      try {
        rebateReport = calculateCleanEnergyRebates({
          category: 'heat_pump_hvac',
          state: 'MI',
          projectCost: 8000,
        });
      } catch (err) {
        console.warn('Rebate engine calculation notice:', err);
      }
      const cap = rebateReport?.incentives.federalTaxCredit.maxCap ?? 2000;
      const prog = rebateReport?.incentives.utilityRebate?.programTitle
        ? `Federal Inflation Reduction Act (IRA) + ${rebateReport.incentives.utilityRebate.programTitle}`
        : 'Federal Inflation Reduction Act (IRA) + Local Utility Clean Heat Program';

      toolsExecuted.push({
        tool: 'check_rebates_and_incentives',
        parameters: { inquiry: 'clean energy incentives & tax credits' },
        result: {
          status: 'success',
          federal_credit: `Up to 30% (capped at $${cap.toLocaleString()} for qualifying heat pumps under Section 25C)`,
          program: prog,
        },
      });
    }

    // Permit Tool Trigger
    if (lower.includes('permit') || lower.includes('inspection') || lower.includes('building code')) {
      try {
        const jurisdiction = resolveJurisdiction(
          { raw: 'Detroit, MI', city: 'Detroit', state: 'MI', formattedAddress: 'Detroit, MI', isValid: true },
          'mechanical',
        );
        const reqResult = evaluatePermitRequirement(jurisdiction.authorityId, {
          trade: 'mechanical',
          scope: 'replacement',
          freeTextDescription: testMessage,
        });
        toolsExecuted.push({
          tool: 'check_permit_requirement',
          parameters: { city: 'Detroit, MI', trade: 'mechanical' },
          result: {
            status: 'success',
            decision: reqResult.decision,
            authority: jurisdiction.authorityName,
            agency: jurisdiction.agencyName,
          },
        });
      } catch (err) {
        console.warn('Permit engine notice:', err);
      }
    }

    // Emergency Hazard Tool Trigger
    if (emergency.isEmergency) {
      toolsExecuted.push({
        tool: 'automated_hazard_detection',
        parameters: {
          hazard_type: emergency.hazardType,
          severity: 'HIGH_PRIORITY_URGENT',
        },
        result: {
          status: 'alert_dispatched',
          owner_sms_alert_queued: true,
          safety_guidance: emergency.hazardType === 'gas_leak'
            ? 'Advise caller to evacuate immediately and contact utility from outside.'
            : 'Advise caller on main water shutoff if safe to access.',
        },
      });
    }

    // 4. Synthesize Spoken Receptionist Response
    let spokenResponse = '';
    const tonePrefix = grounding.voiceTone === 'friendly'
      ? `Thanks for reaching out to ${grounding.companyName}! `
      : grounding.voiceTone === 'urgent_dispatcher'
      ? `This is ${grounding.companyName} Dispatch. `
      : `Thank you for calling ${grounding.companyName}. `;

    if (emergency.isEmergency) {
      spokenResponse = `${tonePrefix}I understand this is an urgent ${emergency.hazardType?.replace(/_/g, ' ') || 'emergency'}. ${
        emergency.hazardType === 'gas_leak'
          ? 'Please ensure everyone leaves the area safely. '
          : emergency.hazardType === 'burst_pipe' || emergency.hazardType === 'flooding'
          ? 'If you can safely reach your main shutoff valve, turn it off. '
          : ''
      }I am notifying our emergency response team right away. What is your exact service address?`;
    } else if (toolsExecuted.some((t) => t.tool === 'check_available_slots')) {
      const slotStr = grounding.availableSlots[0] || 'tomorrow morning between 8 AM and 12 PM';
      spokenResponse = `${tonePrefix}We can help you with that. Our next available appointment window is on ${slotStr}. Would that time work for our technician to come out, or would you prefer a different day?`;
    } else if (toolsExecuted.some((t) => t.tool === 'check_rebates_and_incentives')) {
      spokenResponse = `${tonePrefix}Yes! Qualifying clean energy upgrades can receive up to 30% in federal tax credits through the IRA 25C program, plus local utility incentives. We can evaluate your exact savings during a site assessment. What is your address?`;
    } else if (grounding.recognizedCaller?.clientName) {
      spokenResponse = `${tonePrefix}Great to hear from you again, ${grounding.recognizedCaller.clientName}. How can our team help you with your project today?`;
    } else {
      spokenResponse = `${tonePrefix}We would be glad to help you with our ${grounding.serviceNames[0] || grounding.trade} services in ${grounding.serviceAreas}. Could I get your name and the service address for the visit?`;
    }

    // 5. Build Structured Post-Call Extraction Preview
    const extractedIntake = {
      callerName: grounding.recognizedCaller?.clientName || (lower.includes('rivera') ? 'Rivera' : 'Simulated Caller'),
      callerPhone: callerPhone || '(555) 019-2834',
      serviceAddress: grounding.recognizedCaller?.serviceAddress || '1420 Maple Ave',
      workRequested: testMessage,
      urgency: emergency.isEmergency ? 'critical' : 'normal',
      isEmergency: emergency.isEmergency,
      hazardType: emergency.hazardType || null,
      suggestedFollowUp: emergency.isEmergency ? 'Immediate emergency dispatch & phone callback' : 'Confirm appointment window and dispatch technician',
    };

    return NextResponse.json({
      success: true,
      testMessage,
      spokenResponse,
      tone: grounding.voiceTone || 'professional',
      grounding: {
        companyName: grounding.companyName,
        trade: grounding.trade,
        serviceAreas: grounding.serviceAreas,
        availableSlots: grounding.availableSlots,
        recognizedCaller: grounding.recognizedCaller,
        isLicensed: grounding.isLicensed,
      },
      toolsExecuted,
      extractedIntake,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Simulation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
