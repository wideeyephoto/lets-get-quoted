import { createHmac, timingSafeEqual } from 'crypto';

// Stateless phone-verification tokens: HMAC(phone.code.expiry) with the
// Twilio auth token as the secret. The code itself is only ever texted to the
// visitor; the browser holds just this token, and the lead intake recomputes
// it to verify — no codes table, nothing to clean up.
export function leadVerificationToken(phone: string, code: string, expiresAt: number): string {
  const secret = process.env.TWILIO_AUTH_TOKEN || '';
  return createHmac('sha256', secret).update(`${phone}.${code}.${expiresAt}`).digest('hex');
}

export function isLeadVerificationValid(phone: string, code: string, expiresAt: number, token: string): boolean {
  if (!phone || !code || !token || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = Buffer.from(leadVerificationToken(phone, code, expiresAt));
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
