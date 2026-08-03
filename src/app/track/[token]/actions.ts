'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { applyHomeownerReply } from '@/lib/arrival-send';
import { homeownerReply } from '@/lib/arrival';
import { getTrackingByToken } from '@/lib/job-tracking';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

// The homeowner's side of the arrival page.
//
// A server action answers ANYONE who can construct the request, so the link
// token is the only credential here and everything below treats it as one:
// resolve it server-side, never accept an account or job id from the caller,
// and rate-limit before doing any work.

export async function homeownerReplyAction(token: string, formData: FormData) {
  const replyId = String(formData.get('reply') ?? '');
  // Validate the choice against the fixed list before touching the database —
  // this is the field that decides what gets written into a contractor's job
  // timeline, so it can only ever be one of ours.
  if (!homeownerReply(replyId)) redirect(`/track/${token}`);

  const admin = createAdminClient();
  const ip = clientIpFrom(headers());

  // Two buckets: one stops a single link being hammered, the other stops one
  // source walking through many. Fails open — a limiter outage must not stop a
  // homeowner saying the gate is locked.
  const [perLink, perIp] = await Promise.all([
    checkRateLimit(admin, `arrival-reply:${token.slice(0, 32)}`, 12, 3600),
    checkRateLimit(admin, `arrival-reply-ip:${ip}`, 60, 3600),
  ]);
  if (!perLink || !perIp) redirect(`/track/${token}?said=busy`);

  const tracking = await getTrackingByToken(admin, token);
  if (!tracking || tracking.expired) redirect(`/track/${token}`);

  const result = await applyHomeownerReply(admin, {
    accountId: tracking.accountId,
    jobId: tracking.jobId,
    trackingId: tracking.trackingId,
    replyId,
    customerName: tracking.clientFirst ?? 'Customer',
  });

  revalidatePath(`/track/${token}`);
  redirect(`/track/${token}?said=${result.ok ? replyId : 'error'}`);
}
