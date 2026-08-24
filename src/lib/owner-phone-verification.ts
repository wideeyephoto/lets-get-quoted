import { createHmac, timingSafeEqual, randomInt } from 'crypto';

/**
 * Stateless phone-verification tokens for contractor mobile alert setup:
 * HMAC(accountId.phone.code.expiry).
 *
 * The code itself is texted to the contractor's phone; the browser holds just the
 * token, and saveOwnerAlertsAction recomputes and verifies it securely without
 * temporary database tables.
 */
function verificationSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.TWILIO_AUTH_TOKEN ||
    'lgq-owner-phone-verification-fallback-key'
  );
}

/**
 * Generates a random 6-digit numeric OTP code.
 */
export function generateOwnerVerificationCode(): string {
  return randomInt(100000, 999999).toString();
}

/**
 * Mints an HMAC token binding the account, phone number, OTP code, and expiration timestamp.
 */
export function ownerPhoneVerificationToken(
  accountId: string,
  phone: string,
  code: string,
  expiresAt: number,
): string {
  const secret = verificationSecret();
  return createHmac('sha256', secret)
    .update(`${accountId}.${phone}.${code}.${expiresAt}`)
    .digest('hex');
}

/**
 * Validates the provided OTP code and HMAC token.
 */
export function isOwnerPhoneVerificationValid(
  accountId: string,
  phone: string,
  code: string,
  expiresAt: number,
  token: string,
): boolean {
  if (!accountId || !phone || !code || !token || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }
  const secret = verificationSecret();
  const expected = Buffer.from(
    createHmac('sha256', secret)
      .update(`${accountId}.${phone}.${code}.${expiresAt}`)
      .digest('hex'),
  );
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
