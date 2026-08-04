import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { normalizeUsPhone } from '@/lib/phone';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { sendQuoteFollowupSms } from '@/lib/sms';
import { sendQuoteFollowupEmail } from '@/lib/email';
import {
  FOLLOWUP_FIRST_DELAY_DAYS as FIRST_DELAY_DAYS,
  FOLLOWUP_INTERVAL_DAYS as INTERVAL_DAYS,
  FOLLOWUP_MAX_AGE_DAYS as MAX_AGE_DAYS,
  MAX_FOLLOWUPS,
} from '@/lib/quote-followups';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

const DAY = 24 * 60 * 60 * 1000;
// The cadence lives in lib/quote-followups, which is pure, so the settings card
// can state it rather than describe it. Imported under the old local names to
// keep the sweep below reading the way it did.
// Bound the work one cron invocation will do.
const MAX_SENDS_PER_RUN = 100;

export type FollowupRunSummary = {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
};

// Sweep for quotes that were shared with a client but never approved, and nudge
// the client to review them. Idempotent per cadence: each job is nudged at most
// MAX_FOLLOWUPS times, spaced out, and never after approval. Best-effort per job
// so one failure never sinks the run. Opt-in per account.
export async function runStalledQuoteFollowups(): Promise<FollowupRunSummary & { reason?: string }> {
  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sharedBefore = new Date(now - FIRST_DELAY_DAYS * DAY).toISOString();
  const sharedAfter = new Date(now - MAX_AGE_DAYS * DAY).toISOString();

  // Accounts that opted in. Defensive: if the column doesn't exist yet, bail
  // cleanly rather than throwing.
  const { data: accounts, error: accountsError } = await admin
    .from('accounts')
    .select('id')
    .eq('quote_followups_enabled', true);
  if (accountsError) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'followups not enabled/available' };
  }
  const enabledIds = new Set((accounts ?? []).map((account) => account.id as string));
  if (enabledIds.size === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no accounts enabled' };
  }

  // Active client links shared inside the follow-up window.
  const { data: links } = await admin
    .from('client_job_access')
    .select('account_id, job_id, client_phone, client_email, created_at')
    .is('revoked_at', null)
    .lte('created_at', sharedBefore)
    .gte('created_at', sharedAfter)
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1000);

  // One entry per job (earliest share = when the quote first went out).
  const byJob = new Map<string, { account_id: string; job_id: string; client_phone: string | null; client_email: string | null; created_at: string }>();
  for (const link of links ?? []) {
    if (!enabledIds.has(link.account_id)) continue;
    if (!byJob.has(link.job_id)) byJob.set(link.job_id, link);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const [jobId, link] of byJob) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    try {
      const job = await getJob(admin, link.account_id, jobId);
      // Only quotes still in the quote stage — approval promotes to in_progress.
      if (!job || job.status !== 'new_lead') {
        skipped++;
        continue;
      }

      // Belt-and-suspenders: never nudge an already-approved quote.
      const { data: approved } = await admin
        .from('job_feed')
        .select('id')
        .eq('account_id', link.account_id)
        .eq('job_id', jobId)
        .eq('kind', 'quote_approved')
        .limit(1)
        .maybeSingle();
      if (approved) {
        skipped++;
        continue;
      }

      // Prior follow-ups drive both the cap and the spacing.
      const { data: prior } = await admin
        .from('job_feed')
        .select('created_at')
        .eq('account_id', link.account_id)
        .eq('job_id', jobId)
        .eq('kind', 'quote_followup')
        .order('created_at', { ascending: false });
      const followupCount = (prior ?? []).length;
      if (followupCount >= MAX_FOLLOWUPS) {
        skipped++;
        continue;
      }

      const lastTouch = followupCount > 0 ? new Date(prior![0].created_at).getTime() : new Date(link.created_at).getTime();
      const requiredGapDays = followupCount === 0 ? FIRST_DELAY_DAYS : INTERVAL_DAYS;
      if (now - lastTouch < requiredGapDays * DAY) {
        skipped++;
        continue;
      }

      // Resolve a channel before minting a link, so we don't leave stray tokens.
      const phone = job.client_phone || link.client_phone;
      const normalizedPhone = phone ? normalizeUsPhone(phone) : null;
      let canText = false;
      if (normalizedPhone) {
        const { data: consent } = await admin
          .from('sms_consent')
          .select('status')
          .eq('account_id', link.account_id)
          .eq('phone_number', normalizedPhone)
          .maybeSingle();
        canText = consent?.status === 'opted_in';
      }
      const email = job.client_email || link.client_email;
      if (!(canText && normalizedPhone) && !email) {
        skipped++;
        continue;
      }

      const [{ data: account }, { data: site }] = await Promise.all([
        admin.from('accounts').select('business_name').eq('id', link.account_id).maybeSingle(),
        admin.from('sites').select('company_name').eq('account_id', link.account_id).maybeSingle(),
      ]);
      const businessName = site?.company_name || account?.business_name || "Let's Get Quoted contractor";
      const firstName = (job.client_name || 'there').trim().split(/\s+/)[0] || 'there';

      // Tokens are stored hashed and can't be recovered, so a follow-up mints a
      // fresh link (older ones keep working).
      const token = await createClientJobAccessToken(admin, link.account_id, jobId, { clientPhone: normalizedPhone, clientEmail: email });
      const url = `${APP_ORIGIN}/client/jobs/${token}`;

      let channel: 'sms' | 'email';
      if (canText && normalizedPhone) {
        await sendQuoteFollowupSms({ phone: normalizedPhone, businessName, clientName: firstName, url, accountId: link.account_id });
        channel = 'sms';
      } else {
        await sendQuoteFollowupEmail({ recipientEmail: email as string, businessName, clientName: firstName, url, accountId: link.account_id });
        channel = 'email';
      }

      await createJobFeedEvent(admin, link.account_id, jobId, {
        kind: 'quote_followup',
        title: channel === 'sms' ? 'Quote follow-up texted' : 'Quote follow-up emailed',
        body: `Nudged ${job.client_name} to review their quote (follow-up ${followupCount + 1} of ${MAX_FOLLOWUPS}).`,
        visibility: 'internal',
        meta: { channel, followup_number: followupCount + 1 },
      });
      sent++;
    } catch (error) {
      console.error(`Quote follow-up failed for job ${jobId}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  return { candidates: byJob.size, sent, skipped, failed };
}
