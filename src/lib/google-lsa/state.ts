import { createHmac, timingSafeEqual } from 'node:crypto';

export const GOOGLE_LSA_STATE_COOKIE = 'google_lsa_oauth_state';
export const DEFAULT_GOOGLE_LSA_RETURN_TO = '/dashboard/marketing';

export type GoogleLsaStatePayload = {
  accountId: string;
  userId: string;
  nonce: string;
  returnTo: string;
};

/** Keep OAuth callbacks on this origin even when returnTo came from a query parameter. */
export function safeGoogleLsaReturnTo(value?: string | null): string {
  const candidate = String(value ?? '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return DEFAULT_GOOGLE_LSA_RETURN_TO;
  if (candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) return DEFAULT_GOOGLE_LSA_RETURN_TO;

  try {
    const base = new URL('https://lsa-state.invalid');
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return DEFAULT_GOOGLE_LSA_RETURN_TO;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_GOOGLE_LSA_RETURN_TO;
  }
}

function signingSecret(): string {
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GOOGLE_ADS_CLIENT_SECRET || '').trim();
  if (!secret) throw new Error('Google LSA OAuth state signing is not configured.');
  return secret;
}

function signature(encodedPayload: string): string {
  return createHmac('sha256', signingSecret()).update(encodedPayload).digest('base64url');
}

export function buildGoogleLsaState(
  accountId: string,
  userId: string,
  nonce: string,
  returnTo?: string | null,
): string {
  const payload: GoogleLsaStatePayload = {
    accountId,
    userId,
    nonce,
    returnTo: safeGoogleLsaReturnTo(returnTo),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded)}`;
}

/**
 * Verify both browser possession (nonce cookie) and tenant/user ownership.
 * A valid payload is returned so the callback can use its already-sanitized path.
 */
export function verifyGoogleLsaState(
  state: string,
  accountId: string,
  userId: string,
  cookieNonce: string,
): GoogleLsaStatePayload | null {
  const [encoded, suppliedSignature, extra] = String(state ?? '').split('.');
  if (!encoded || !suppliedSignature || extra || !cookieNonce || !accountId || !userId) return null;

  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<GoogleLsaStatePayload>;
    if (parsed.accountId !== accountId || parsed.userId !== userId || parsed.nonce !== cookieNonce) return null;
    if (typeof parsed.returnTo !== 'string' || safeGoogleLsaReturnTo(parsed.returnTo) !== parsed.returnTo) return null;
    return parsed as GoogleLsaStatePayload;
  } catch {
    return null;
  }
}
