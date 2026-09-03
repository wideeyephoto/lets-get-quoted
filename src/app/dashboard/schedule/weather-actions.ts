'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { draftCustomerMessage, RISK_LABEL, type Assessment } from '@/lib/weather';
import { jobsAtRisk, weatherSettings } from '@/lib/weather-data';
import { formatUsPhone, normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendWeatherRescheduleSms } from '@/lib/sms';
import { createJobFeedEvent } from '@/lib/job-feed';
import { recordAccountEvent } from '@/lib/account-events';
import { recordTenantAuditEvent } from '@/lib/tenant-audit';
import { getTcpaCompliantSendTime, resolveRecipientTimeZone } from '@/lib/phone-timezone';
import { getJurisdictionTcpaRules } from '@/lib/ad-speed-to-lead';

export type WeatherRiskView = {
  jobId: string;
  ref: string | null;
  clientName: string;
  clientPhone: string | null;
  formattedPhone: string | null;
  canSendSms: boolean;
  optedOut: boolean;
  alreadySentToday: boolean;
  lastSentAt: string | null;
  day: string;
  level: string;
  levelLabel: string;
  reasons: string[];
  summary: string;
  businessName: string;
  sensitivityLabel: string;
  reasonNote: string;
  alternatives: { day: string; summary: string }[];
  /** Drafted for the contractor to read, edit and send. Never sent without contractor action. */
  draftMessage: string;
};

/**
 * Which of this account's scheduled jobs the forecast is against.
 *
 * Returns a DRAFT message per job and sends nothing. The contractor reads it,
 * changes it, and decides — the whole point of this feature is that a forecast
 * never moves anybody's appointment on its own.
 */
export async function weatherRisksAction(): Promise<{ enabled: boolean; profile: string; businessName: string; risks: WeatherRiskView[] }> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  const { enabled, sensitivity } = await weatherSettings(supabase, accountId);
  if (!enabled) return { enabled: false, profile: sensitivity.label, businessName: '', risks: [] };

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const { data: site } = await supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle();
  const businessName = site?.company_name || account?.business_name || 'your contractor';

  const risks = await jobsAtRisk(supabase, accountId);

  // Check which jobs had a reschedule offer sent in the last 24 hours
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentSentFeed } = await supabase
    .from('job_feed')
    .select('job_id, created_at')
    .eq('account_id', accountId)
    .eq('kind', 'weather_reschedule_sent')
    .gte('created_at', cutoff24h);

  const sentByJob = new Map<string, { created_at: string }>();
  for (const item of recentSentFeed ?? []) {
    if (item.job_id) {
      sentByJob.set(item.job_id as string, { created_at: item.created_at as string });
    }
  }

  const mappedRisks: WeatherRiskView[] = await Promise.all(
    risks.map(async ({ job, assessment, alternatives }) => {
      const rawPhone = job.clientPhone ?? null;
      const normalized = rawPhone ? normalizeUsPhone(rawPhone) : null;
      let optedOut = false;
      if (normalized) {
        try {
          optedOut = await isPhoneOptedOut(accountId, normalized);
        } catch {
          optedOut = false;
        }
      }
      const canSendSms = Boolean(normalized && !optedOut);
      const sentRecord = sentByJob.get(job.id);
      const alreadySentToday = Boolean(sentRecord);
      const lastSentAt = sentRecord
        ? new Date(sentRecord.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : null;

      return {
        jobId: job.id,
        ref: job.ref,
        clientName: job.clientName,
        clientPhone: rawPhone,
        formattedPhone: formatUsPhone(rawPhone),
        canSendSms,
        optedOut,
        alreadySentToday,
        lastSentAt,
        day: job.scheduledFor,
        level: assessment.level,
        levelLabel: RISK_LABEL[assessment.level],
        reasons: assessment.reasons,
        summary: assessment.summary,
        businessName,
        sensitivityLabel: sensitivity.label,
        reasonNote: sensitivity.reasonNote,
        alternatives: alternatives.map((a: Assessment) => ({ day: a.day, summary: a.summary })),
        draftMessage: draftCustomerMessage({
          businessName,
          customerName: job.clientName,
          day: job.scheduledFor,
          assessment,
          sensitivity,
          alternatives,
        }),
      };
    })
  );

  return {
    enabled: true,
    profile: sensitivity.label,
    businessName,
    risks: mappedRisks,
  };
}

export type SendWeatherSmsResult =
  | {
      ok: true;
      messageId: string;
      sentTo: string;
      sentAt: string;
      isDelayed?: boolean;
      scheduledSendAt?: string;
      quietHoursReason?: string;
    }
  | { ok: false; error: string };

/**
 * Dispatches an SMS to the customer offering reschedule alternatives due to weather.
 * Logs the outbound communication to the immutable job_feed timeline and account audit.
 */
export async function sendWeatherRescheduleSmsAction(input: {
  jobId: string;
  message: string;
  proposedDate?: string | null;
  originalDate?: string | null;
  reasons?: string[];
}): Promise<SendWeatherSmsResult> {
  const { supabase, accountId, userEmail } = await requireOfficeContext('schedule.write');

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, ref, client_name, client_phone, scheduled_for, status, address')
    .eq('account_id', accountId)
    .eq('id', input.jobId)
    .maybeSingle();

  if (error || !job) {
    return { ok: false, error: 'Could not find that job.' };
  }

  const rawPhone = job.client_phone ? String(job.client_phone) : null;
  const phone = rawPhone ? normalizeUsPhone(rawPhone) : null;
  if (!phone) {
    return { ok: false, error: 'There is no valid mobile number on file for this customer.' };
  }

  if (await isPhoneOptedOut(accountId, phone)) {
    return { ok: false, error: 'This homeowner has opted out of SMS notifications (STOP received).' };
  }

  const messageText = input.message.trim();
  if (!messageText) {
    return { ok: false, error: 'Message text cannot be empty.' };
  }

  try {
    await recordSmsConsent(accountId, phone, 'weather_reschedule');
  } catch (consentErr) {
    console.warn('Weather SMS consent recording warning:', consentErr);
  }

  const origDay = input.originalDate || (job.scheduled_for as string);
  const targetDay = input.proposedDate || 'another day';

  // Deterministic idempotency key: protects against re-clicks for the same job and day
  const idempotencyKey = `weather-resched:${job.id}:${origDay}:${targetDay}`;

  // Evaluate recipient timezone and statutory TCPA / State Mini-TCPA quiet hours
  const recipientTz = resolveRecipientTimeZone({
    phone,
    address: (job.address as string) || null,
  });
  const tcpaRule = getJurisdictionTcpaRules((job.address as string) || null);
  const quietCheck = getTcpaCompliantSendTime(
    new Date(),
    recipientTz,
    tcpaRule.quietStartHour,
    tcpaRule.quietEndHour,
  );

  let smsEventId: string;
  try {
    smsEventId = await sendWeatherRescheduleSms({
      accountId,
      toPhone: phone,
      message: messageText,
      idempotencyKey,
      availableAt: quietCheck.isDelayed ? quietCheck.sendAt : null,
    });
  } catch (err) {
    console.error('Weather reschedule SMS delivery failed:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to queue SMS with delivery provider.',
    };
  }

  // 1. Immutable record in job_feed timeline
  try {
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'weather_reschedule_sent',
      title: 'Weather Reschedule Offer Sent',
      body: messageText,
      visibility: 'client',
      meta: {
        originalDate: origDay,
        proposedDate: targetDay,
        reasons: input.reasons ?? [],
        smsEventId,
        recipientPhone: formatUsPhone(phone),
        isDelayed: quietCheck.isDelayed,
        scheduledSendAt: quietCheck.isDelayed ? quietCheck.sendAt.toISOString() : null,
        recipientTimeZone: recipientTz,
      },
    });
  } catch (feedErr) {
    console.error('Failed to write to job_feed:', feedErr);
  }

  // 2. Audit in account_events
  try {
    await recordAccountEvent({
      accountId,
      kind: 'weather_reschedule_notified',
      summary: `Sent weather reschedule SMS to ${job.client_name || 'customer'} for ${origDay} (offered ${targetDay})${quietCheck.isDelayed ? ' [delayed for TCPA quiet hours]' : ''}`,
      actorEmail: userEmail,
      meta: {
        jobId: job.id,
        jobRef: job.ref,
        originalDate: origDay,
        proposedDate: targetDay,
        smsEventId,
        isDelayed: quietCheck.isDelayed,
        scheduledSendAt: quietCheck.isDelayed ? quietCheck.sendAt.toISOString() : null,
      },
    });
  } catch (evtErr) {
    console.error('Failed to record account event:', evtErr);
  }

  // 3. Immutable tenant audit ledger
  try {
    await recordTenantAuditEvent({
      accountId,
      entityType: 'job',
      entityId: job.id,
      action: 'weather_reschedule_notified',
      actor: { email: userEmail, role: 'office' },
      source: 'web',
      reason: `Weather reschedule SMS sent for ${origDay} (suggested ${targetDay})${quietCheck.isDelayed ? ' [quiet hours scheduled]' : ''}`,
      changedFields: ['weather_reschedule'],
      afterState: {
        originalDate: origDay,
        proposedDate: targetDay,
        smsEventId,
        isDelayed: quietCheck.isDelayed,
      },
    });
  } catch (auditErr) {
    console.warn('Failed to record tenant audit event for weather SMS:', auditErr);
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath(`/dashboard/jobs/${job.id}`);

  const sentAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return {
    ok: true,
    messageId: smsEventId,
    sentTo: formatUsPhone(phone),
    sentAt,
    isDelayed: quietCheck.isDelayed,
    scheduledSendAt: quietCheck.isDelayed
      ? quietCheck.sendAt.toLocaleTimeString('en-US', {
          timeZone: recipientTz,
          hour: 'numeric',
          minute: '2-digit',
        }) + ` (${recipientTz.split('/').pop()?.replace(/_/g, ' ')})`
      : undefined,
    quietHoursReason: quietCheck.reason,
  };
}

export type MoveJobResult =
  | { ok: true; newDate: string }
  | { ok: false; error: string };

/**
 * Directly moves a job's scheduled date to a clear alternative day.
 * Triggered only by explicit contractor action and logged to job_feed.
 */
export async function moveJobToWeatherDateAction(input: {
  jobId: string;
  newDate: string;
  reason?: string;
}): Promise<MoveJobResult> {
  const { supabase, accountId, userEmail } = await requireOfficeContext('schedule.write');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDate)) {
    return { ok: false, error: 'Invalid destination date.' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, ref, client_name, scheduled_for, status')
    .eq('account_id', accountId)
    .eq('id', input.jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, error: 'Could not find that job.' };
  }

  const oldDate = (job.scheduled_for as string) || 'unscheduled';
  if (oldDate === input.newDate) {
    return { ok: false, error: 'The job is already scheduled for that day.' };
  }

  const { error: updateErr } = await supabase
    .from('jobs')
    .update({ scheduled_for: input.newDate })
    .eq('account_id', accountId)
    .eq('id', input.jobId);

  if (updateErr) {
    return { ok: false, error: updateErr.message || 'Failed to update schedule.' };
  }

  // 1. Post to job_feed
  try {
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_rescheduled',
      title: 'Rescheduled for Weather',
      body: `Appointment moved from ${oldDate} to ${input.newDate} due to weather: ${input.reason || 'unfavorable forecast'}.`,
      visibility: 'client',
      meta: {
        from: oldDate,
        to: input.newDate,
        reason: input.reason || 'weather_delay',
      },
    });
  } catch (feedErr) {
    console.error('Failed to post reschedule to job_feed:', feedErr);
  }

  // 2. Audit in account_events
  try {
    await recordAccountEvent({
      accountId,
      kind: 'weather_job_rescheduled',
      summary: `Moved ${job.client_name || 'job'} (${job.ref ?? job.id}) from ${oldDate} to ${input.newDate} due to weather`,
      actorEmail: userEmail,
      meta: {
        jobId: job.id,
        from: oldDate,
        to: input.newDate,
        reason: input.reason,
      },
    });
  } catch (evtErr) {
    console.error('Failed to record account event:', evtErr);
  }

  // 3. Immutable tenant audit ledger
  try {
    await recordTenantAuditEvent({
      accountId,
      entityType: 'job',
      entityId: job.id,
      action: 'weather_job_rescheduled',
      actor: { email: userEmail, role: 'office' },
      source: 'web',
      reason: `Moved job from ${oldDate} to ${input.newDate} due to weather: ${input.reason || 'unfavorable forecast'}`,
      changedFields: ['scheduled_for'],
      beforeState: { scheduled_for: oldDate },
      afterState: { scheduled_for: input.newDate },
    });
  } catch (auditErr) {
    console.warn('Failed to record tenant audit event for job move:', auditErr);
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/settings');
  revalidatePath(`/dashboard/jobs/${job.id}`);

  return { ok: true, newDate: input.newDate };
}

/**
 * Logs an adverse weather risk note directly to the job's timeline/feed.
 * Visible to field technicians and office staff on the job feed.
 */
export async function logWeatherRiskToTimelineAction(input: {
  jobId: string;
  day: string;
  summary: string;
  reasons: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, accountId, userEmail } = await requireOfficeContext('schedule.write');

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, ref, client_name, scheduled_for')
    .eq('account_id', accountId)
    .eq('id', input.jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, error: 'Could not find that job.' };
  }

  try {
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'weather_risk_flagged',
      title: 'Adverse Weather Forecast Flagged',
      body: `Weather forecast for ${input.day}: ${input.summary}${input.reasons.length > 0 ? ` (${input.reasons.join(', ')})` : ''}. Review scheduling or exterior conditions.`,
      visibility: 'internal',
      meta: {
        day: input.day,
        summary: input.summary,
        reasons: input.reasons,
        flaggedBy: userEmail,
      },
    });

    revalidatePath(`/dashboard/jobs/${job.id}`);
    revalidatePath('/dashboard/schedule');
    return { ok: true };
  } catch (err) {
    console.error('Failed to log weather risk to timeline:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to record timeline event.' };
  }
}

export type BatchSendResult = {
  total: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<{ jobId: string; ok: boolean; error?: string }>;
};

/**
 * Batch-dispatches weather reschedule SMS messages across multiple at-risk jobs.
 */
export async function batchSendWeatherRescheduleSmsAction(items: Array<{
  jobId: string;
  message: string;
  proposedDate?: string | null;
  originalDate?: string | null;
  reasons?: string[];
}>): Promise<BatchSendResult> {
  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const res = await sendWeatherRescheduleSmsAction(item);
    if (res.ok) {
      sentCount++;
      results.push({ jobId: item.jobId, ok: true });
    } else {
      if (res.error.includes('no valid mobile') || res.error.includes('opted out')) {
        skippedCount++;
      } else {
        failedCount++;
      }
      results.push({ jobId: item.jobId, ok: false, error: res.error });
    }
  }

  return {
    total: items.length,
    sentCount,
    skippedCount,
    failedCount,
    results,
  };
}

/**
 * Turning it on.
 *
 * THE WRITE WAS LANDING AND THE PAGE WAS NOT MOVING. This action had no
 * revalidatePath — the only one in this directory without one — so pressing
 * "Turn it on" saved `weather_alerts_enabled = true` and then re-rendered the
 * route from cache, which still said false.
 */
export async function updateWeatherSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const profile = String(formData.get('weatherProfile') ?? '').trim();
  await supabase
    .from('accounts')
    .update({
      weather_alerts_enabled: true,
      weather_profile: profile || null,
    })
    .eq('id', accountId);

  revalidatePath('/dashboard/schedule/settings');
  revalidatePath('/dashboard/schedule');
  redirect('/dashboard/schedule/settings?weather=on#weather-panel');
}

