import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { normalizeUsPhone } from '../phone';
import { enqueueSmsDelivery } from '../sms-delivery';

export type InspectionCalendarEvent = {
  id: string;
  permitNumber: string;
  inspectionType: string;
  authorityName: string;
  scheduledDate: string; // YYYY-MM-DD
  timeWindow?: string; // e.g. "09:00 AM - 01:00 PM"
  jobAddress: string;
  clientName?: string | null;
  clientPhone?: string | null;
  contractorName: string;
  notes?: string | null;
  status: 'scheduled' | 'passed' | 'failed' | 'cancelled';
};

/**
 * Formats a tailored 24-hour homeowner inspection preparation SMS with clear access instructions.
 */
export function formatHomeownerInspectionPrepSms(input: {
  clientName?: string | null;
  businessName: string;
  authorityName: string;
  inspectionType: string;
  scheduledDate: string;
  timeWindow?: string;
}): string {
  const firstName = input.clientName ? input.clientName.trim().split(/\s+/)[0] : 'there';
  const typeLower = input.inspectionType.toLowerCase();
  const timeStr = input.timeWindow ? ` (${input.timeWindow})` : '';

  let accessGuidance = 'Please ensure property gates are unlocked and pets are secured indoors.';

  if (typeLower.includes('roof') || typeLower.includes('underlayment') || typeLower.includes('sheathing') || typeLower.includes('barrier')) {
    accessGuidance = 'Please unlock backyard gates, keep pets indoors, and ensure ladders/driveway areas remain clear for the inspector.';
  } else if (typeLower.includes('electr') || typeLower.includes('service') || typeLower.includes('panel')) {
    accessGuidance = 'Please ensure clear 3-foot clearance around the electrical breaker panel, unlock side gates, and secure pets indoors.';
  } else if (typeLower.includes('plumb') || typeLower.includes('water heater') || typeLower.includes('drain') || typeLower.includes('sewer')) {
    accessGuidance = 'Please ensure clear access to the water heater / plumbing shutoffs and secure pets indoors.';
  } else if (typeLower.includes('mech') || typeLower.includes('hvac') || typeLower.includes('furnace') || typeLower.includes('heat pump')) {
    accessGuidance = 'Please ensure clear access to the furnace, thermostat, and outdoor condenser unit, and secure pets indoors.';
  }

  return `Hi ${firstName}, reminder from ${input.businessName}: Your municipal ${input.inspectionType} inspection with ${input.authorityName} is scheduled for tomorrow, ${input.scheduledDate}${timeStr}. 📋 Checklist: ${accessGuidance} Thank you!`;
}

/**
 * Dispatches an automated 24-hour pre-inspection SMS reminder to the homeowner.
 */
export async function sendHomeownerInspectionPrepReminder(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: {
    authorityName: string;
    inspectionType: string;
    scheduledDate: string;
    timeWindow?: string;
  },
): Promise<{ success: boolean; message: string; phone?: string | null; error?: string }> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    return { success: false, message: 'Job not found.', error: 'Job not found.' };
  }

  if (!job.client_phone) {
    return { success: false, message: 'No client phone number on file for this job.', error: 'Missing phone' };
  }

  const phone = normalizeUsPhone(job.client_phone);
  if (!phone) {
    return { success: false, message: 'Invalid client phone number.', error: 'Invalid phone' };
  }

  const [accountRes, siteRes] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = siteRes.data?.company_name || accountRes.data?.business_name || 'Your Contractor';

  const body = formatHomeownerInspectionPrepSms({
    clientName: job.client_name,
    businessName,
    authorityName: input.authorityName,
    inspectionType: input.inspectionType,
    scheduledDate: input.scheduledDate,
    timeWindow: input.timeWindow,
  });

  try {
    await enqueueSmsDelivery({
      accountId,
      phoneNumber: phone,
      body,
      messageKind: 'permit_inspection_prep_reminder',
      billingCategory: 'customer_message',
      context: 'customer',
      eventType: 'permit_inspection_reminder',
    });

    return {
      success: true,
      message: 'Homeowner inspection prep reminder sent.',
      phone,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMS delivery failed.';
    return {
      success: false,
      message,
      error: message,
    };
  }
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string for Google Calendar, Apple Calendar, and Outlook.
 */
export function generateInspectionIcsFeed(
  calendarName: string,
  events: InspectionCalendarEvent[],
): string {
  const formatDateToIcs = (dateStr: string, timeWindow?: string): { start: string; end: string } => {
    const cleanDate = dateStr.replace(/-/g, '');
    let startHour = '090000';
    let endHour = '130000';

    if (timeWindow) {
      if (timeWindow.includes('AM') || timeWindow.includes('am')) {
        startHour = '080000';
        endHour = '120000';
      } else if (timeWindow.includes('PM') || timeWindow.includes('pm')) {
        startHour = '120000';
        endHour = '170000';
      }
    }

    return {
      start: `${cleanDate}T${startHour}`,
      end: `${cleanDate}T${endHour}`,
    };
  };

  const escapeIcs = (str: string) => str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Let\'s Get Quoted//Permit Inspections Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    'X-WR-TIMEZONE:America/New_York',
  ];

  for (const event of events) {
    const { start, end } = formatDateToIcs(event.scheduledDate, event.timeWindow);
    const summary = `🔍 ${event.authorityName} Inspection: ${event.inspectionType} (#${event.permitNumber})`;
    const description = [
      `Inspection Type: ${event.inspectionType}`,
      `Permit Number: ${event.permitNumber}`,
      `Jurisdiction: ${event.authorityName}`,
      `Time Window: ${event.timeWindow || 'Standard Day Window'}`,
      `Client: ${event.clientName || 'N/A'} (${event.clientPhone || 'N/A'})`,
      `Contractor: ${event.contractorName}`,
      event.notes ? `Notes: ${event.notes}` : '',
    ].filter(Boolean).join('\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:permit-insp-${event.id}@letsgetquoted.com`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeIcs(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcs(description)}`);
    lines.push(`LOCATION:${escapeIcs(event.jobAddress)}`);
    lines.push(`STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT1440M'); // 24 hours before
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcs(`Upcoming Permit Inspection tomorrow: ${event.inspectionType}`)}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
