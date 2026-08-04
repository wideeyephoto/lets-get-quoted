import { createHmac } from 'node:crypto';

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
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createHmac('sha256', secret).update(`${accountId}.${nonce}`).digest('hex').slice(0, 32);
}

export function buildState(accountId: string, nonce: string): string {
  return `${nonce}.${sign(accountId, nonce)}`;
}

export function verifyState(state: string, accountId: string, cookieNonce: string): boolean {
  const [nonce, signature] = String(state ?? '').split('.');
  if (!nonce || !signature || !cookieNonce) return false;
  if (nonce !== cookieNonce) return false;
  return signature === sign(accountId, nonce);
}
