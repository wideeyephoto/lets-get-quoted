'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { safeNextPath } from '@/lib/app-origin';
import { sendMagicLinkEmail as sendMagicLink } from '@/lib/magic-link';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

// Sending a sign-in link is unauthenticated by definition, which makes this one
// of the few places a stranger can make us send email to an address they choose.
// Two limits, because they stop different things:
//
//   per email — somebody else's inbox is the target. Without this, an attacker
//   picks a victim's address and buries them, and the victim marks us spam,
//   which costs the deliverability every quote and invoice email depends on.
//
//   per IP — our Resend quota is the target, one address each, so the per-email
//   limit never fires.
//
// Strict (fails CLOSED): if the limiter is unavailable we would rather a real
// contractor retries their sign-in in a minute than leave the sending domain
// wide open. Nothing here is on a revenue path mid-flight.
const PER_EMAIL_LIMIT = 5;
const PER_EMAIL_WINDOW_SECONDS = 15 * 60;
const PER_IP_LIMIT = 15;
const PER_IP_WINDOW_SECONDS = 60 * 60;

export async function sendMagicLinkAction(email: string, next = '/dashboard'): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('Enter a valid email address.');

  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());

  const withinEmailLimit = await checkRateLimitStrict(admin, `magiclink:email:${clean}`, PER_EMAIL_LIMIT, PER_EMAIL_WINDOW_SECONDS);
  const withinIpLimit = await checkRateLimitStrict(admin, `magiclink:ip:${ip}`, PER_IP_LIMIT, PER_IP_WINDOW_SECONDS);
  if (!withinEmailLimit || !withinIpLimit) {
    throw new Error('Too many sign-in links requested. Wait a few minutes and try again.');
  }

  // `next` is a path only — the host is this app's own, from config. See
  // lib/app-origin for what accepting a caller-supplied host used to allow.
  return sendMagicLink(clean, safeNextPath(next));
}
