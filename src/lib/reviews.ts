import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail, sendReviewRequestEmail } from '@/lib/email';
import { isEmailSuppressed, resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { summariseReviewInvites, type ReviewInviteRow, type ReviewsSummary } from '@/lib/review-routing';
import { loadBusinessName, pickBusinessName } from '@/lib/business-name';
import { isPhoneOptedOut, recordSmsConsent, sendReviewRequestSms } from '@/lib/sms';
import { resolveClientChannel } from '@/lib/client-channel';
import { normalizeUsPhone } from '@/lib/phone';
import {
  MAX_REMINDERS,
  reminderBlock,
  reminderBlockMessage,
  requestStatus,
  type ActivityRow,
  type ReviewChannel,
} from '@/lib/review-activity';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

const INVITE_FIELDS =
  'id, account_id, job_id, token, client_name, google_url, rating, feedback, routed_to, google_clicked_at, feedback_at, created_at, responded_at';

export type ReviewInvite = {
  id: string;
  account_id: string;
  job_id: string | null;
  token: string;
  client_name: string | null;
  google_url: string | null;
  rating: number | null;
  feedback: string | null;
  routed_to: 'google' | 'private' | null;
  google_clicked_at: string | null;
  feedback_at: string | null;
  created_at: string;
  responded_at: string | null;
};

export type { ReviewFeedbackItem, ReviewsSummary } from '@/lib/review-routing';

// Owner-facing rollup. Defensive: an un-migrated DB (no review_invites table)
// degrades to an empty summary rather than throwing.
export async function getReviewsSummary(supabase: SupabaseClient, accountId: string): Promise<ReviewsSummary> {
  const { data, error } = await supabase
    .from('review_invites')
    .select('id, job_id, client_name, rating, feedback, routed_to, google_clicked_at, feedback_at, responded_at, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  return summariseReviewInvites(error ? [] : ((data ?? []) as ReviewInviteRow[]));
}

/* ==========================================================================
   The Command Center's activity list.
   ========================================================================== */

/** Every column the activity list reads, including the four this page added. */
const ACTIVITY_FIELDS =
  'id, job_id, client_name, rating, feedback, routed_to, google_clicked_at, feedback_at, responded_at, created_at, ' +
  'resolved_at, reminders_sent, last_reminded_at, reminders_stopped_at';

type ActivityInviteRow = ReviewInviteRow & {
  created_at: string;
  resolved_at: string | null;
  reminders_sent: number | null;
  last_reminded_at: string | null;
  reminders_stopped_at: string | null;
};

/**
 * The activity list: every review request for the account, with the job and
 * customer it belongs to and the channel it went out on.
 *
 * THREE QUERIES, NOT AN N+1. The invites, then the jobs they name, then the
 * `review_requested` feed events for those jobs. An account with three hundred
 * review asks loads in the same three round trips as one with three.
 *
 * WHY THE CHANNEL COMES FROM job_feed. `review_invites` has no channel column —
 * whether the ask went by text or email is recorded once, in the meta of the
 * `review_requested` feed event written by deliverJobReviewRequest. Reading it
 * back through job_id means an invite with no job (there is no UI that makes
 * one today, but the column is nullable) reports 'unknown' rather than guessing
 * — and 'unknown' renders as "Not recorded", which is true, instead of
 * defaulting to "Text" and being wrong for every emailed customer.
 *
 * Degrades to [] on any error, the same way getReviewsSummary does: an
 * un-migrated database should show an empty page, not a stack trace.
 */
export async function loadReviewActivity(supabase: SupabaseClient, accountId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('review_invites')
    .select(ACTIVITY_FIELDS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const invites = data as unknown as ActivityInviteRow[];
  const jobIds = [...new Set(invites.map((row) => row.job_id).filter((id): id is string => Boolean(id)))];

  type JobBits = { ref: string | null; clientId: string | null; name: string | null; phone: string | null; email: string | null };
  const jobs = new Map<string, JobBits>();
  const channels = new Map<string, ReviewChannel>();

  if (jobIds.length > 0) {
    const [{ data: jobRows }, { data: feedRows }] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, ref, client_id, client_name, client_phone, client_email')
        .eq('account_id', accountId)
        .in('id', jobIds),
      supabase
        .from('job_feed')
        .select('job_id, meta, created_at')
        .eq('account_id', accountId)
        .eq('kind', 'review_requested')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false }),
    ]);

    for (const row of (jobRows ?? []) as Record<string, unknown>[]) {
      jobs.set(row.id as string, {
        ref: (row.ref as string | null) ?? null,
        clientId: (row.client_id as string | null) ?? null,
        name: (row.client_name as string | null) ?? null,
        phone: (row.client_phone as string | null) ?? null,
        email: (row.client_email as string | null) ?? null,
      });
    }

    // Newest first, and the first write wins — a job asked twice reports the
    // channel of the most recent ask, which is the one an owner is looking at.
    for (const row of (feedRows ?? []) as Record<string, unknown>[]) {
      const jobId = row.job_id as string;
      if (channels.has(jobId)) continue;
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      const channel = meta.channel;
      if (channel === 'sms' || channel === 'email') channels.set(jobId, channel);
    }
  }

  return invites.map((row) => {
    const job = row.job_id ? jobs.get(row.job_id) : undefined;
    return {
      id: row.id,
      jobId: row.job_id,
      jobRef: job?.ref ?? null,
      clientId: job?.clientId ?? null,
      // The invite's own snapshot of the name wins: it is what the customer was
      // called at the moment they were asked, and the job may have been edited
      // since. Falls back to the job for pre-snapshot rows.
      clientName: row.client_name ?? job?.name ?? null,
      clientPhone: job?.phone ?? null,
      clientEmail: job?.email ?? null,
      rating: row.rating !== null && row.rating >= 1 && row.rating <= 5 ? (row.rating as ActivityRow['rating']) : null,
      feedback: row.feedback,
      status: requestStatus(row),
      channel: (row.job_id ? channels.get(row.job_id) : undefined) ?? 'unknown',
      sentAt: row.created_at,
      respondedAt: row.responded_at,
      googleClickedAt: row.google_clicked_at,
      feedbackAt: row.feedback_at,
      remindersSent: row.reminders_sent ?? 0,
      lastRemindedAt: row.last_reminded_at,
      remindersStoppedAt: row.reminders_stopped_at,
      resolvedAt: row.resolved_at,
    };
  });
}

/** One row, scoped to the account. Used by the drawer and by every write below. */
export async function getReviewActivityRow(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
): Promise<ActivityRow | null> {
  const rows = await loadReviewActivity(supabase, accountId);
  return rows.find((row) => row.id === id) ?? null;
}

/**
 * "Mark resolved" / "Reopen" on a piece of private feedback.
 *
 * Scoped by account_id as well as id — the id comes from a form the browser
 * posted, so it is not evidence of anything on its own.
 */
export async function setReviewResolved(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
  resolved: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('review_invites')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('account_id', accountId);
  if (error) throw error;
}

/**
 * The owner's decision to stop chasing this one.
 *
 * Distinct from the customer replying STOP: that lives in sms_consent, covers
 * every message to that number, and is not the owner's to clear. This only ever
 * makes us send less.
 */
export async function setReviewRemindersStopped(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
  stopped: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('review_invites')
    .update({ reminders_stopped_at: stopped ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('account_id', accountId);
  if (error) throw error;
}

export type ReminderResult = { ok: boolean; message: string };

/**
 * Send the SAME review link again.
 *
 * The critical difference from the one-tap ask on the job page: that mints a
 * fresh invite, so asking twice used to leave two rows, two tokens and a
 * response rate quietly divided by a bigger number than the count of people
 * actually asked. A reminder reuses this invite's token — one customer, one
 * row, one link that still works.
 *
 * Every guard the first send honours is honoured again, in the same order, by
 * the same helpers: the client's own automatic-message preference, an SMS STOP,
 * a marketing unsubscribe, and CAN-SPAM's postal-address requirement. A
 * reminder is the most unsolicited message this product sends; it gets the
 * strictest reading, not a shortcut because we already have a token.
 */
export async function sendReviewReminder(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
  nowIso = new Date().toISOString(),
): Promise<ReminderResult> {
  const row = await getReviewActivityRow(supabase, accountId, id);
  if (!row) return { ok: false, message: 'That review request no longer exists.' };

  const block = reminderBlock(row, nowIso);
  if (block) return { ok: false, message: reminderBlockMessage(block, row) };

  const { data: invite } = await supabase
    .from('review_invites')
    .select('token, google_url')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!invite?.token) return { ok: false, message: 'That review request no longer exists.' };

  const origin = APP_ORIGIN;
  const { data: pref } = await supabase
    .from('accounts')
    .select('review_feedback_page_enabled')
    .eq('id', accountId)
    .maybeSingle();
  // Same rule as the first send: the feedback page when it is on, the raw
  // Google link when it is off. Never a dead end — if neither exists there is
  // nowhere to send them and we say so rather than texting a broken link.
  const linkUrl = pref?.review_feedback_page_enabled
    ? `${origin}/review/${invite.token as string}`
    : ((invite.google_url as string | null) ?? null);
  if (!linkUrl) {
    return { ok: false, message: 'Link your Google Business Profile in the website builder first — the reminder has nowhere to go.' };
  }

  const businessName = await loadBusinessName(supabase, accountId);
  const clientFirstName = (row.clientName || 'there').trim().split(/\s+/)[0] || 'there';
  const normalizedPhone = row.clientPhone ? normalizeUsPhone(row.clientPhone) : null;

  const route = resolveClientChannel({
    phone: normalizedPhone,
    email: row.clientEmail,
    optedOut: normalizedPhone ? await isPhoneOptedOut(accountId, normalizedPhone) : false,
    kind: 'automatic',
  });
  if (route.reason === 'preference_off') {
    return { ok: false, message: `Automatic messages are switched off for ${row.clientName ?? 'this customer'}.` };
  }

  let channel: 'sms' | 'email';
  try {
    if (route.channel === 'sms' && normalizedPhone) {
      await recordSmsConsent(accountId, normalizedPhone, 'review_request');
      await sendReviewRequestSms({ phone: normalizedPhone, businessName, clientName: clientFirstName, reviewUrl: linkUrl, accountId });
      channel = 'sms';
    } else if (route.channel === 'email' && row.clientEmail) {
      const { data: addressRow } = await supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle();
      const mailingAddress = resolveMarketingMailingAddress(addressRow?.mailing_address as string | null);
      if (!mailingAddress) {
        return { ok: false, message: 'Add your business mailing address in Settings to email review reminders — it’s required by anti-spam law.' };
      }
      if (await isEmailSuppressed(supabase, accountId, row.clientEmail)) {
        return { ok: false, message: `${row.clientName ?? 'This customer'} unsubscribed from emails and has no textable mobile on file.` };
      }
      await sendReviewRequestEmail({ recipientEmail: row.clientEmail, businessName, clientName: clientFirstName, reviewUrl: linkUrl, accountId, mailingAddress });
      channel = 'email';
    } else if (route.reason === 'opted_out') {
      return { ok: false, message: 'They replied STOP, so no reminder can go to that number — and emailing instead would be routing around it.' };
    } else {
      return { ok: false, message: 'No textable mobile or email on file for this customer.' };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The reminder could not be sent.';
    console.error(`Review reminder failed for invite ${id}:`, reason);
    return { ok: false, message: reason };
  }

  // Counted only after the send actually succeeded. Incrementing first would
  // burn one of three reminders on a Twilio outage.
  const sent = row.remindersSent + 1;
  await supabase
    .from('review_invites')
    .update({ reminders_sent: sent, last_reminded_at: nowIso })
    .eq('id', id)
    .eq('account_id', accountId);

  if (row.jobId) {
    try {
      await createJobFeedEvent(supabase, accountId, row.jobId, {
        kind: 'review_requested',
        title: channel === 'sms' ? 'Review reminder texted' : 'Review reminder emailed',
        body: `Reminder ${sent} of ${MAX_REMINDERS} for the same review link.`,
        visibility: 'internal',
        meta: { review_request: true, reminder: true, channel },
      });
    } catch (error) {
      console.error('Review reminder feed event failed:', error instanceof Error ? error.message : error);
    }
  }

  return {
    ok: true,
    message:
      channel === 'sms'
        ? `Reminder ${sent} of ${MAX_REMINDERS} texted to ${row.clientName ?? 'the customer'}.`
        : `Reminder ${sent} of ${MAX_REMINDERS} emailed to ${row.clientName ?? 'the customer'}.`,
  };
}

// Count of private feedback in the window — for a dashboard "needs attention"
// nudge. Reads the new timestamp with the legacy routed_to as a fallback so
// pre-migration rows still count.
export async function countRecentPrivateFeedback(supabase: SupabaseClient, accountId: string, days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('review_invites')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .not('feedback', 'is', null)
    .or(`feedback_at.gte.${cutoff},and(feedback_at.is.null,responded_at.gte.${cutoff})`);
  return error ? 0 : count ?? 0;
}

// Mint a review invite and return its token. The public destination is
// snapshotted so the review page never has to re-resolve site content.
export async function createReviewInvite(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string | null,
  clientName: string | null,
  googleUrl: string | null,
): Promise<string> {
  const token = randomBytes(18).toString('hex');
  const { error } = await supabase
    .from('review_invites')
    .insert({ account_id: accountId, job_id: jobId, token, client_name: clientName, google_url: googleUrl });
  if (error) throw error;
  return token;
}

export async function getReviewInviteByToken(
  admin: SupabaseClient,
  token: string,
): Promise<(ReviewInvite & { business_name: string }) | null> {
  const { data } = await admin.from('review_invites').select(INVITE_FIELDS).eq('token', token).maybeSingle();
  if (!data) return null;
  const invite = data as ReviewInvite;
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', invite.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', invite.account_id).maybeSingle(),
  ]);
  // pickBusinessName rather than `site || account || fallback`: sites.company_name
  // is itself seeded to the "My Business" placeholder (src/lib/sites.ts), so
  // preferring the site is not enough on its own — the placeholder has to be
  // treated as absent wherever it appears.
  return { ...invite, business_name: pickBusinessName(site, account, 'your contractor') };
}

/**
 * Record the star rating — and nothing else. It used to decide whether the
 * customer was allowed to see the Google link; now it's the owner's own service
 * signal and every rating leads to the same place. See src/lib/review-routing.ts.
 */
export async function recordReviewRating(admin: SupabaseClient, token: string, rating: number): Promise<void> {
  const now = new Date().toISOString();
  const { data: invite } = await admin
    .from('review_invites')
    .select('id, responded_at')
    .eq('token', token)
    .maybeSingle();
  if (!invite) throw new Error('Review link not found.');

  await admin
    .from('review_invites')
    .update({ rating, ...(invite.responded_at ? {} : { responded_at: now }) })
    .eq('token', token);
}

/**
 * Stamp that the customer took the public route, and hand back where to send
 * them. Best-effort by design: the caller redirects to Google whether or not the
 * write lands, because a failed analytics write must never become a closed door.
 */
export async function recordGoogleClick(admin: SupabaseClient, token: string): Promise<string | null> {
  const { data: invite } = await admin
    .from('review_invites')
    .select('google_url, responded_at, google_clicked_at')
    .eq('token', token)
    .maybeSingle();
  if (!invite) return null;

  const googleUrl = (invite.google_url as string | null) ?? null;
  const now = new Date().toISOString();
  try {
    await admin
      .from('review_invites')
      .update({
        google_clicked_at: (invite.google_clicked_at as string | null) ?? now,
        ...(invite.responded_at ? {} : { responded_at: now }),
      })
      .eq('token', token);
  } catch (error) {
    console.error('Review Google click stamp failed:', error instanceof Error ? error.message : error);
  }
  return googleUrl;
}

/**
 * Completed jobs nobody has been asked to review yet.
 *
 * A set-diff, not a loop: every completed job id, minus every job id that
 * already has a `review_requested` job_feed row (the same marker
 * `reviewAlreadyRequested` checks one job at a time in
 * src/app/dashboard/jobs/actions.ts). Two queries regardless of job count,
 * so a recommendation card can show this number without an N+1 per job.
 */
export async function countCompletedJobsAwaitingReview(supabase: SupabaseClient, accountId: string): Promise<number> {
  const { data: completed, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('account_id', accountId)
    .eq('status', 'complete');
  if (error || !completed || completed.length === 0) return 0;

  const completedIds = completed.map((job) => job.id as string);
  const { data: requested } = await supabase
    .from('job_feed')
    .select('job_id')
    .eq('account_id', accountId)
    .eq('kind', 'review_requested')
    .in('job_id', completedIds);

  const alreadyAsked = new Set((requested ?? []).map((row) => row.job_id as string));
  return completedIds.filter((id) => !alreadyAsked.has(id)).length;
}

/**
 * Store the customer's private note and alert the owner — job feed + email.
 * This is an additional channel, never a substitute: the public route stays
 * open before, during and after leaving one.
 */
export async function submitPrivateFeedback(admin: SupabaseClient, token: string, feedback: string): Promise<void> {
  const { data: invite } = await admin
    .from('review_invites')
    .select('account_id, job_id, client_name, rating, responded_at')
    .eq('token', token)
    .maybeSingle();
  if (!invite) throw new Error('Review link not found.');

  const now = new Date().toISOString();
  await admin
    .from('review_invites')
    .update({ feedback, feedback_at: now, routed_to: 'private', ...(invite.responded_at ? {} : { responded_at: now }) })
    .eq('token', token);

  const rating = invite.rating as number | null;
  const clientName = (invite.client_name as string | null) || 'A client';

  if (invite.job_id) {
    try {
      await createJobFeedEvent(admin, invite.account_id as string, invite.job_id as string, {
        kind: 'review_feedback',
        title: `Private feedback${rating ? ` (${rating}★)` : ''}`,
        body: feedback,
        visibility: 'internal',
      });
    } catch (error) {
      console.error('Review feedback feed event failed:', error instanceof Error ? error.message : error);
    }
  }

  try {
    const [ownerEmail, businessName] = await Promise.all([
      getAccountOwnerEmail(admin, invite.account_id as string),
      loadBusinessName(admin, invite.account_id as string),
    ]);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName,
        subject: `New private feedback${rating ? ` (${rating}★)` : ''}`,
        heading: `${clientName} left you private feedback`,
        bodyLines: [
          `Rating: ${rating ?? '—'} of 5`,
          feedback,
          'They were also offered the public review link, so reach out quickly — this is your chance to put it right.',
        ],
        ctaLabel: invite.job_id ? 'Open the job' : 'Open dashboard',
        ctaUrl: invite.job_id ? `${APP_ORIGIN}/dashboard/jobs/${invite.job_id}` : `${APP_ORIGIN}/dashboard`,
        tone: 'warning',
      });
    }
  } catch (error) {
    console.error('Review feedback owner alert failed:', error instanceof Error ? error.message : error);
  }
}
