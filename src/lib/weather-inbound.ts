import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { createJobFeedEvent } from '@/lib/job-feed';
import { recordAccountEvent } from '@/lib/account-events';
import { recordTenantAuditEvent } from '@/lib/tenant-audit';
import { sendWeatherRescheduleSms } from '@/lib/sms';

const AFFIRMATIVE_KEYWORDS = new Set([
  'yes',
  'y',
  'yes please',
  'confirm',
  'confirmed',
  'sure',
  'that works',
  'sounds good',
  'ok',
  'okay',
  'perfect',
  'good',
  'fine',
  'works for me',
  'sure thing',
  'yep',
  'yeah',
]);

const AFFIRMATIVE_PREFIXES = [
  'yes ',
  'confirm ',
  'ok ',
  'okay ',
  'sounds good',
  'sure ',
  'that works',
  'works for me',
  'perfect ',
];

/**
 * Evaluates whether an incoming SMS reply expresses affirmation/confirmation.
 */
export function isAffirmativeReply(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase().replace(/[.,!?;:'"()]/g, '').replace(/\s+/g, ' ').trim();
  if (AFFIRMATIVE_KEYWORDS.has(normalized)) return true;
  return AFFIRMATIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export type WeatherInboundReplyResult = {
  handled: boolean;
  jobId?: string;
  clientName?: string;
  oldDate?: string;
  newDate?: string;
  confirmationSmsId?: string;
  reason?: string;
};

/**
 * Handles an inbound text message to determine if it is an affirmative reply
 * to a recent weather reschedule offer. If so, updates the appointment date,
 * records the timeline confirmation, audits the shift, and texts confirmation back.
 */
export async function handleWeatherRescheduleInboundReply(
  admin: SupabaseClient,
  input: {
    accountId: string;
    fromPhone: string;
    body: string;
  }
): Promise<WeatherInboundReplyResult> {
  const normalizedFrom = normalizeUsPhone(input.fromPhone);
  if (!normalizedFrom) return { handled: false, reason: 'Invalid phone format' };
  if (!isAffirmativeReply(input.body)) return { handled: false, reason: 'Not an affirmative reply' };

  // Look for offers sent within the last 48 hours
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: feedEvents } = await admin
    .from('job_feed')
    .select('id, job_id, created_at, meta')
    .eq('account_id', input.accountId)
    .eq('kind', 'weather_reschedule_sent')
    .gte('created_at', cutoff48h)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!feedEvents || feedEvents.length === 0) {
    return { handled: false, reason: 'No recent weather reschedule offers found' };
  }

  let targetEvent: (typeof feedEvents)[0] | null = null;
  let targetJob: {
    id: string;
    ref: string | null;
    client_name: string | null;
    client_phone: string | null;
    scheduled_for: string | null;
    status: string;
  } | null = null;

  for (const event of feedEvents) {
    const meta = event.meta as Record<string, unknown> | null;
    const recipientPhone = meta?.recipientPhone ? normalizeUsPhone(String(meta.recipientPhone)) : null;

    const { data: job } = await admin
      .from('jobs')
      .select('id, ref, client_name, client_phone, scheduled_for, status')
      .eq('account_id', input.accountId)
      .eq('id', event.job_id)
      .maybeSingle();

    if (job) {
      const jobPhone = job.client_phone ? normalizeUsPhone(String(job.client_phone)) : null;
      if (jobPhone === normalizedFrom || recipientPhone === normalizedFrom) {
        const proposedDate = meta?.proposedDate as string | undefined;
        // Verify proposed date is a valid future date and job isn't already there
        if (
          proposedDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(proposedDate) &&
          job.scheduled_for !== proposedDate &&
          job.status !== 'archived' &&
          job.status !== 'complete'
        ) {
          targetEvent = event;
          targetJob = job;
          break;
        }
      }
    }
  }

  if (!targetEvent || !targetJob) {
    return { handled: false, reason: 'No matching pending reschedule job found for phone' };
  }

  const meta = targetEvent.meta as Record<string, unknown>;
  const proposedDate = meta.proposedDate as string;
  const oldDate = targetJob.scheduled_for || 'unscheduled';

  // Shift scheduled_for and mark appointment_confirmed_at in a single update
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from('jobs')
    .update({
      scheduled_for: proposedDate,
      appointment_confirmed_at: nowIso,
    })
    .eq('account_id', input.accountId)
    .eq('id', targetJob.id);

  if (updateErr) {
    console.error('Failed to update job scheduled_for on weather confirmation:', updateErr);
    return { handled: false, reason: updateErr.message };
  }

  const formattedNewDate = new Date(`${proposedDate}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // 1. Log confirmation to job_feed
  try {
    await createJobFeedEvent(admin, input.accountId, targetJob.id, {
      kind: 'job_rescheduled',
      title: 'Reschedule Confirmed by Homeowner (SMS)',
      body: `${targetJob.client_name || 'Homeowner'} replied "${input.body.trim()}" confirming new appointment on ${formattedNewDate}.`,
      visibility: 'client',
      meta: {
        from: oldDate,
        to: proposedDate,
        confirmedVia: 'sms_reply',
        replyBody: input.body.trim(),
        confirmedAt: nowIso,
      },
    });
  } catch (feedErr) {
    console.error('Failed to log confirmation to job_feed:', feedErr);
  }

  // 2. Audit in account_events
  try {
    await recordAccountEvent({
      accountId: input.accountId,
      kind: 'weather_job_rescheduled',
      summary: `${targetJob.client_name || 'Customer'} confirmed weather reschedule to ${proposedDate} via SMS`,
      actorEmail: 'homeowner (SMS reply)',
      meta: {
        jobId: targetJob.id,
        from: oldDate,
        to: proposedDate,
        replyBody: input.body,
      },
    });
  } catch (auditErr) {
    console.error('Failed to record account event for weather confirm:', auditErr);
  }

  // 3. Tenant audit ledger
  try {
    await recordTenantAuditEvent({
      accountId: input.accountId,
      entityType: 'job',
      entityId: targetJob.id,
      action: 'weather_job_rescheduled',
      actor: { role: 'customer', details: { phone: normalizedFrom } },
      source: 'api',
      reason: `Customer confirmed weather reschedule via SMS reply: "${input.body.trim()}"`,
      changedFields: ['scheduled_for', 'appointment_confirmed_at'],
      beforeState: { scheduled_for: oldDate },
      afterState: { scheduled_for: proposedDate, appointment_confirmed_at: nowIso },
    });
  } catch (tenantErr) {
    console.warn('Failed to record tenant audit for weather confirm:', tenantErr);
  }

  // 4. Send instant confirmation SMS back to homeowner
  const { data: account } = await admin
    .from('accounts')
    .select('business_name')
    .eq('id', input.accountId)
    .maybeSingle();
  const businessName = account?.business_name || 'your contractor';

  let confirmSmsId: string | undefined;
  try {
    confirmSmsId = await sendWeatherRescheduleSms({
      accountId: input.accountId,
      toPhone: normalizedFrom,
      message: `Thank you! Your visit with ${businessName} has been confirmed for ${formattedNewDate}. See you then!`,
      idempotencyKey: `weather-confirm-ack:${targetJob.id}:${proposedDate}`,
    });
  } catch (smsErr) {
    console.error('Failed to send confirmation SMS to customer:', smsErr);
  }

  return {
    handled: true,
    jobId: targetJob.id,
    clientName: targetJob.client_name || undefined,
    oldDate,
    newDate: proposedDate,
    confirmationSmsId: confirmSmsId,
  };
}
