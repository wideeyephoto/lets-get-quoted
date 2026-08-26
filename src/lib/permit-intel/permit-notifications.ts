import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { normalizeUsPhone } from '../phone';
import { enqueueSmsDelivery } from '../sms-delivery';

export type PermitMilestoneEvent =
  | 'submitted'
  | 'issued'
  | 'inspection_scheduled'
  | 'inspection_passed'
  | 'closed';

export type FormatPermitMessageInput = {
  eventType: PermitMilestoneEvent;
  clientName?: string | null;
  businessName: string;
  authorityName: string;
  permitNumber?: string | null;
  inspectionType?: string | null;
  scheduledDate?: string | null;
  address?: string | null;
};

export type SendPermitNotificationInput = {
  eventType: PermitMilestoneEvent;
  customBody?: string;
  authorityName?: string;
  permitNumber?: string | null;
  inspectionType?: string | null;
  scheduledDate?: string | null;
};

/**
 * Formats standard, customer-friendly SMS copy for permit milestones.
 */
export function formatPermitMilestoneMessage(input: FormatPermitMessageInput): string {
  const firstName = input.clientName ? input.clientName.trim().split(/\s+/)[0] : 'there';
  const biz = input.businessName || 'Your contractor';
  const auth = input.authorityName || 'the city';

  switch (input.eventType) {
    case 'submitted':
      return `Hi ${firstName}, ${biz} has submitted the municipal permit application for your project to ${auth}. We will update you once approved!`;

    case 'issued':
      return `Great news ${firstName}! ${auth} has officially issued permit #${input.permitNumber || 'Active'} for your project with ${biz}. Work is cleared to proceed!`;

    case 'inspection_scheduled':
      return `Update from ${biz}: A municipal ${input.inspectionType || 'building'} inspection with ${auth} has been scheduled for ${input.scheduledDate || 'upcoming date'}.`;

    case 'inspection_passed':
      return `Update from ${biz}: Your project officially passed the ${auth} ${input.inspectionType || 'building'} inspection! ✅`;

    case 'closed':
      return `Congratulations ${firstName}! All municipal permit inspections with ${auth} have passed and your project with ${biz} is 100% certified & closed.`;

    default:
      return `Update from ${biz}: Your municipal permit status with ${auth} has been updated.`;
  }
}

/**
 * Dispatches an automated or manual SMS milestone notification to the homeowner
 * and records a timeline audit event in job_feed.
 */
export async function sendPermitMilestoneNotification(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: SendPermitNotificationInput,
): Promise<{
  success: boolean;
  message: string;
  phone?: string | null;
  eventId?: string;
  error?: string;
}> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    return { success: false, message: 'Job not found.', error: 'Job not found.' };
  }

  // Load contractor brand / site name
  const [accountRes, siteRes] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = siteRes.data?.company_name || accountRes.data?.business_name || 'Your Contractor';
  const authorityName = input.authorityName || 'the city';

  const body =
    input.customBody ||
    formatPermitMilestoneMessage({
      eventType: input.eventType,
      clientName: job.client_name,
      businessName,
      authorityName,
      permitNumber: input.permitNumber,
      inspectionType: input.inspectionType,
      scheduledDate: input.scheduledDate,
      address: job.address,
    });

  const rawPhone = job.client_phone;
  if (!rawPhone) {
    // Log timeline event even if phone is absent so team has record
    await supabase.from('job_feed').insert({
      account_id: accountId,
      job_id: jobId,
      kind: 'permit_notification_skipped',
      title: 'Permit update notification skipped (no phone on file)',
      body,
      visibility: 'internal',
    });

    return {
      success: false,
      message: 'No client phone number on file for this job.',
      error: 'missing_phone',
    };
  }

  const normalizedPhone = normalizeUsPhone(rawPhone) || rawPhone.trim();

  try {
    const queued = await enqueueSmsDelivery({
      accountId,
      phoneNumber: normalizedPhone,
      body,
      messageKind: 'permit_milestone_update',
      billingCategory: 'customer_message',
      context: 'customer',
      eventType: `permit_${input.eventType}`,
    });

    // Record audit event in job_feed
    await supabase.from('job_feed').insert({
      account_id: accountId,
      job_id: jobId,
      kind: 'permit_notification_sent',
      title: `Permit SMS sent to ${job.client_name || 'homeowner'}`,
      body,
      visibility: 'client',
      meta: {
        eventType: input.eventType,
        permitNumber: input.permitNumber,
        authorityName,
        smsEventId: queued.eventId,
      },
    });

    return {
      success: true,
      message: 'Homeowner notification dispatched successfully.',
      phone: normalizedPhone,
      eventId: queued.eventId,
    };
  } catch (err) {
    console.error('Error dispatching permit SMS notification:', err);
    const errMessage = err instanceof Error ? err.message : 'SMS dispatch failed.';
    return {
      success: false,
      message: 'Failed to dispatch SMS notification.',
      error: errMessage,
    };
  }
}
