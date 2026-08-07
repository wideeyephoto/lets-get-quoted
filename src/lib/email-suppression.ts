import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// CAN-SPAM email opt-out (unsubscribe) support for MARKETING email only —
// campaign blasts, "book again" invites, and review-request emails. Transactional
// mail (receipts, quotes, invoices, reminders, card-setup) never consults this.
//
// The unsubscribe link is a stateless, signed token over (account_id, email): no
// per-recipient row exists to hang it on, so we HMAC the pair and verify it back
// on the public unsubscribe route. Opt-outs are stored in `email_suppression`.

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// A stable server-only secret to sign unsubscribe tokens. The service-role key is
// always present server-side and never shipped to the browser; domain-separated
// so the HMAC can't collide with any other use of the key.
function unsubscribeSecret(): string {
  return `lgq-email-unsub:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return b64url(crypto.createHmac('sha256', unsubscribeSecret()).update(payload).digest());
}

// token = base64url(`${accountId}:${emailLower}`) + '.' + base64url(hmac)
export function makeUnsubscribeToken(accountId: string, email: string): string {
  const payload = `${accountId}:${email.trim().toLowerCase()}`;
  const payloadB64 = b64url(payload);
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Verify + decode. Returns null on any tampering, malformed input, or bad signature
// (constant-time compared) so callers can treat "invalid" as a no-op.
export function parseUnsubscribeToken(token: string | null | undefined): { accountId: string; email: string } | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64);
  const sigBuf = fromB64url(sig);
  const expBuf = fromB64url(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const payload = fromB64url(payloadB64).toString('utf8');
  const sep = payload.indexOf(':');
  if (sep <= 0) return null;
  const accountId = payload.slice(0, sep);
  const email = payload.slice(sep + 1);
  if (!accountId || !email) return null;
  return { accountId, email };
}

export function buildUnsubscribePageUrl(accountId: string, email: string): string {
  return `${APP_ORIGIN}/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(accountId, email))}`;
}

// One-click (RFC 8058) POST target used in the List-Unsubscribe header — mailbox
// providers POST here directly; humans use the page URL above.
export function buildUnsubscribeOneClickUrl(accountId: string, email: string): string {
  return `${APP_ORIGIN}/api/email/unsubscribe?token=${encodeURIComponent(makeUnsubscribeToken(accountId, email))}`;
}

// The set of opted-out addresses (lowercased) for an account, for gating a batch
// send. Defensive: an un-migrated DB (no email_suppression table) degrades to an
// empty set so marketing sends still work instead of 500-ing.
export async function loadSuppressedEmails(supabase: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('email_suppression')
    .select('email')
    .eq('account_id', accountId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => String(row.email).trim().toLowerCase()));
}

// Single-address opt-out check for the one-off send paths (rebook, review). Same
// defensive contract: on error, returns false (not suppressed) so a missing table
// never blocks a legitimate send.
export async function isEmailSuppressed(supabase: SupabaseClient, accountId: string, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  // Exact match on the lowercased address (how suppressEmail stores it, and what
  // the (account_id, lower(email)) unique index keys on). NOT ilike — the address
  // would be treated as a LIKE pattern, so an '_' or '%' in a local-part would act
  // as a wildcard and wrongly suppress look-alike addresses.
  const { data, error } = await supabase
    .from('email_suppression')
    .select('id')
    .eq('account_id', accountId)
    .eq('email', email.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// Record an opt-out. Idempotent on (account_id, lower(email)) — a repeat click is
// a no-op. Uses whatever client is passed; the public routes pass the admin
// (service-role) client since there's no session. Returns whether it succeeded.
/**
 * Whether a delivery event means "never send here again", and why.
 *
 * Pure, because getting this wrong is expensive in both directions and neither
 * direction announces itself. Suppress too eagerly and a real customer silently
 * stops receiving their quotes and invoices; too reluctantly and a dead address
 * is re-sent to forever, which is what costs the sending domain its reputation
 * for every contractor sharing it.
 *
 *   complained  → always. An explicit "never again" from the recipient.
 *   bounced     → only when the provider says Permanent. Transient is a full or
 *                 briefly unreachable mailbox. Undetermined means the far end
 *                 did not say, and treating a maybe as a no is the costly guess.
 */
export function suppressionReasonFor(input: {
  status: string;
  bounceType?: string | null;
}): 'complaint' | 'hard_bounce' | null {
  if (input.status === 'complained') return 'complaint';
  if (input.status !== 'bounced') return null;
  return (input.bounceType ?? '').trim().toLowerCase() === 'permanent' ? 'hard_bounce' : null;
}

export async function suppressEmail(
  supabase: SupabaseClient,
  accountId: string,
  email: string,
  reason = 'unsubscribe_link',
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  // Not an upsert: the unique index is on the expression lower(email), which
  // on_conflict can't target. A pre-check keeps it idempotent; the unique index is
  // the backstop against a race (duplicate insert simply errors and is ignored).
  const already = await isEmailSuppressed(supabase, accountId, normalized);
  if (already) return true;
  const { error } = await supabase
    .from('email_suppression')
    .insert({ account_id: accountId, email: normalized, reason });
  if (error) {
    // A concurrent insert that hit the unique index still leaves them suppressed.
    if (await isEmailSuppressed(supabase, accountId, normalized)) return true;
    console.error('suppressEmail insert failed:', error.message);
    return false;
  }
  return true;
}

// The physical postal address to print in a marketing footer: the contractor's
// own address if they've set one, else a platform fallback (COMPANY_MAILING_ADDRESS),
// else null (footer omits the address line but still carries the unsubscribe link).
export function resolveMarketingMailingAddress(contractorAddress: string | null | undefined): string | null {
  const own = (contractorAddress || '').trim();
  if (own) return own;
  const platform = (process.env.COMPANY_MAILING_ADDRESS || '').trim();
  return platform || null;
}
