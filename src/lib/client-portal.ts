// The homeowner's own way back in: one link, every job they've had done.
//
// NOT a password. A homeowner doesn't want another password for a contractor
// they use twice a decade, and a password is a credential we'd then be
// responsible for storing and losing. A magic link, hashed exactly like the
// per-job tokens, with the same expiry and revocation.
//
// EMAIL OR MOBILE, because a contractor's customer list is not an email list.
// Plenty of homeowners are in it by phone alone — they were added from a call,
// a text, or an import with no address — and asking those people for the email
// we never had is a locked door with no key. Whichever one they type is the one
// the link is sent to.
//
// The security properties that matter here are unusual enough to state:
//
//   1. Requesting a link NEVER reveals whether the email matched anybody. A page
//      that says "no account found" is a page that tells a stranger which of
//      their neighbours used this contractor.
//   2. Only the hash is stored, so a database read cannot reconstruct a live
//      link into somebody's home-improvement history.
//   3. The link is scoped to ONE client of ONE account. A contractor's customer
//      list is not a directory.

import { createHash, randomBytes } from 'crypto';
import { normalizeUsPhone } from '@/lib/phone';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Long enough that guessing is not a strategy. */
export const PORTAL_TOKEN_BYTES = 32;
/** How long a link lives. Long enough to be useful, short enough that a
 *  forwarded email stops working before the year is out. */
export const PORTAL_LINK_DAYS = 90;

export function createPortalToken(): string {
  return randomBytes(PORTAL_TOKEN_BYTES).toString('hex');
}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function portalExpiry(now: Date = new Date(), days = PORTAL_LINK_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export type PortalAccess = { accountId: string; clientId: string; sentTo: string };

export type PortalJob = {
  id: string;
  ref: string | null;
  scope: string | null;
  status: string;
  scheduledFor: string | null;
  completedAt: string | null;
  address: string | null;
  quotedAmount: number;
};

/**
 * What a homeowner sees about their own history.
 *
 * Money is limited to what they were quoted — never cost, never margin, never
 * anything about the contractor's business. This page exists so a customer can
 * answer "who did my roof and is it still under warranty", not so they can audit
 * the person who did it.
 */
export type PortalView = {
  businessName: string;
  clientName: string;
  jobs: PortalJob[];
  totalJobs: number;
  firstJobAt: string | null;
};

export function summarisePortal(input: {
  businessName: string;
  clientName: string;
  jobs: PortalJob[];
}): PortalView {
  // Oldest job first for "customer since", newest first for the list — people
  // look for the most recent thing and remember by the oldest.
  const dated = input.jobs
    .map((job) => job.completedAt ?? job.scheduledFor)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    businessName: input.businessName,
    clientName: input.clientName,
    jobs: input.jobs,
    totalJobs: input.jobs.length,
    firstJobAt: dated[0] ?? null,
  };
}

/**
 * The always-identical answer to a link request. See rule 1 above.
 *
 * "those details" rather than "that email" or "that number": the words must not
 * change with what was typed, or the acknowledgement starts confirming which
 * kind of contact we hold for somebody — a smaller leak than the original, but
 * the same leak.
 */
export const PORTAL_REQUEST_ACK =
  'If we have a record of those details, a link to your jobs is on its way. It works for 90 days.';

/** Email or US mobile — the two ways a homeowner is in a contractor's list. */
export type PortalIdentifier = { kind: 'email'; value: string } | { kind: 'sms'; value: string };

/**
 * What did they type?
 *
 * Decided on the SHAPE of the input, never on which field it came from: the
 * form is one box, because asking somebody to first classify their own contact
 * details is asking them to do the computer's job. An "@" means email; anything
 * that normalizes to a US number means text; anything else is neither, and the
 * caller answers with the same acknowledgement it gives everyone.
 *
 * The email is lower-cased and the number is E.164, so both arrive at the
 * lookup and the rate limiter in exactly one form — otherwise "Bob@x.com" and
 * "bob@x.com" are two buckets, and three attempts becomes six.
 */
export function parsePortalIdentifier(raw: string | null | undefined): PortalIdentifier | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  if (value.includes('@')) {
    const email = value.toLowerCase();
    // Deliberately loose. This decides which SENDER to try, not whether an
    // address is deliverable, and a homeowner with an unusual-but-valid address
    // must not be turned away by our regex.
    return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email) ? { kind: 'email', value: email } : null;
  }

  const phone = normalizeUsPhone(value);
  return phone ? { kind: 'sms', value: phone } : null;
}

/**
 * Resolve a portal link. Expiry and revocation both apply, and using it stamps
 * last_used_at so an owner can see a link is live before revoking it.
 */
export async function resolvePortalAccess(admin: SupabaseClient, token: string): Promise<PortalAccess | null> {
  const { data } = await admin
    .from('client_portal_access')
    .select('id, account_id, client_id, sent_to, expires_at, revoked_at')
    .eq('token_hash', hashPortalToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if ((data.expires_at as string) < new Date().toISOString()) return null;

  // Best effort. Failing to record a visit must never close the door on one.
  try {
    await admin.from('client_portal_access').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  } catch {
    /* ignore */
  }

  return { accountId: data.account_id as string, clientId: data.client_id as string, sentTo: data.sent_to as string };
}
