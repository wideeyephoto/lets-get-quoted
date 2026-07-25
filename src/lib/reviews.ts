import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

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
  created_at: string;
  responded_at: string | null;
};

// Mint a gated review invite and return its token. The Google destination is
// snapshotted so the public gate page never has to re-resolve site content.
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

export async function getReviewInviteByToken(admin: SupabaseClient, token: string): Promise<(ReviewInvite & { business_name: string }) | null> {
  const { data } = await admin.from('review_invites').select('*').eq('token', token).maybeSingle();
  if (!data) return null;
  const invite = data as ReviewInvite;
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', invite.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', invite.account_id).maybeSingle(),
  ]);
  return { ...invite, business_name: site?.company_name || account?.business_name || 'your contractor' };
}

// Record the star rating. 4-5★ routes to Google (marks responded); 1-3★ records
// the rating but stays open until the client submits their private feedback.
export async function recordReviewRating(admin: SupabaseClient, token: string, rating: number): Promise<{ routeToGoogle: boolean; googleUrl: string | null }> {
  const { data: invite } = await admin.from('review_invites').select('google_url').eq('token', token).maybeSingle();
  if (!invite) throw new Error('Review link not found.');
  const routeToGoogle = rating >= 4;
  await admin
    .from('review_invites')
    .update({ rating, ...(routeToGoogle ? { routed_to: 'google', responded_at: new Date().toISOString() } : {}) })
    .eq('token', token);
  return { routeToGoogle, googleUrl: (invite.google_url as string | null) ?? null };
}

// Store the client's private (1-3★) feedback and alert the owner — job feed +
// email. Never posted publicly; this is the whole point of gating.
export async function submitPrivateFeedback(admin: SupabaseClient, token: string, feedback: string): Promise<void> {
  const { data: invite } = await admin.from('review_invites').select('account_id, job_id, client_name, rating').eq('token', token).maybeSingle();
  if (!invite) throw new Error('Review link not found.');

  await admin
    .from('review_invites')
    .update({ feedback, routed_to: 'private', responded_at: new Date().toISOString() })
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
    const [ownerEmail, { data: account }] = await Promise.all([
      getAccountOwnerEmail(admin, invite.account_id as string),
      admin.from('accounts').select('business_name').eq('id', invite.account_id).maybeSingle(),
    ]);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName: account?.business_name || "Let's Get Quoted",
        subject: `New private feedback${rating ? ` (${rating}★)` : ''}`,
        heading: `${clientName} left you private feedback`,
        bodyLines: [`Rating: ${rating ?? '—'} of 5`, feedback, 'This was kept private — not posted to Google. Reach out to make it right.'],
        ctaLabel: invite.job_id ? 'Open the job' : 'Open dashboard',
        ctaUrl: invite.job_id ? `${APP_ORIGIN}/dashboard/jobs/${invite.job_id}` : `${APP_ORIGIN}/dashboard`,
        tone: 'warning',
      });
    }
  } catch (error) {
    console.error('Review feedback owner alert failed:', error instanceof Error ? error.message : error);
  }
}
