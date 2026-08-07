import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { summariseReviewInvites, type ReviewInviteRow, type ReviewsSummary } from '@/lib/review-routing';
import { loadBusinessName } from '@/lib/business-name';

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
  return { ...invite, business_name: site?.company_name || account?.business_name || 'your contractor' };
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
