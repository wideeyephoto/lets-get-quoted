import { createHmac, timingSafeEqual } from 'node:crypto';

// The CSRF state for the QuickBooks OAuth round trip.
//
// In its own module because a Next Route Handler file may export ONLY the HTTP
// verbs and a short list of config values. Exporting a helper from route.ts
// typechecks fine and then fails the production build with a type error about
// OmitWithTag — which is a confusing way to find out.
//
// Two parts: a random nonce echoed through Intuit and kept in an httpOnly
// cookie, and an HMAC binding that nonce to the account that started the flow.
//
// The nonce alone would only prove the callback belongs to this BROWSER. The
// signature is what proves it belongs to this ACCOUNT — which is the part that
// matters, because the callback is what decides whose books we attach the
// tokens to. Without it, a code obtained under one account could be redeemed
// against another.

export const STATE_COOKIE = 'qbo_oauth_state';

function sign(accountId: string, nonce: string): string {
  // An empty key still produces a stable HMAC, so an unset service role key
  // would leave this signing every state with a key an attacker also has —
  // which is the one input this whole module exists to keep out of their hands.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set to sign the QuickBooks OAuth state.');
  }
  return createHmac('sha256', secret).update(`${accountId}.${nonce}`).digest('hex').slice(0, 32);
}

/**
 * Compares two equal-length ASCII strings without leaking how far they matched.
 *
 * `===` on a signature returns as soon as two bytes differ, and the rest of
 * this file is careful about a value an attacker supplies. Nineteen other
 * modules here already reach for timingSafeEqual; this one did not.
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be the
  // signal it is meant to withhold.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function buildState(accountId: string, nonce: string): string {
  return `${nonce}.${sign(accountId, nonce)}`;
}

export function verifyState(state: string, accountId: string, cookieNonce: string): boolean {
  const [nonce, signature] = String(state ?? '').split('.');
  if (!nonce || !signature || !cookieNonce) return false;
  if (!safeEqual(nonce, cookieNonce)) return false;
  try {
    return safeEqual(signature, sign(accountId, nonce));
  } catch {
    // sign() throws when the signing key is unset. A predicate guarding a
    // security boundary answers that with "no" rather than a 500: the callback
    // route calls this outside a try, and an unverifiable state is exactly the
    // one that must not be honoured. buildState still throws, so a deployment
    // missing the key cannot start a flow it could never finish.
    return false;
  }
}
