import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless phone-verification tokens: HMAC(phone.code.expiry). The code itself
 * is only ever texted to the visitor; the browser holds just this token, and the
 * lead intake recomputes it to verify — no codes table, nothing to clean up.
 *
 * WHY THIS HAS ITS OWN SECRET NOW.
 *
 * It used to be `process.env.TWILIO_AUTH_TOKEN || ''`, and the `|| ''` was the
 * whole problem. Rename that variable — the first move of any provider
 * migration — and the HMAC key silently becomes the empty string. Nothing
 * throws and nothing logs. Minting and verifying stay consistent with each
 * other, so the wizard works end to end, every manual click-through passes, and
 * the suite stays green. But the key is now a value anyone can guess, and this
 * function is the only thing standing between a scripted POST and a lead
 * flagged `phone_verified` for a number the sender does not control. The
 * control degrades from "this visitor received a text at that number" to "a
 * boolean anybody can set", and it does it silently.
 *
 * The failure mode of a missing secret must be a refusal, not a working system
 * with a public key. So: no `|| ''`, ever.
 *
 * THE FALLBACK IS DELIBERATE AND IS NOT THE SAME MISTAKE. TWILIO_AUTH_TOKEN is
 * a real secret, so falling back to it keeps every token minted before this
 * change verifiable — the rename costs no downtime and no lost leads. What it
 * cannot become is a default. When both are unset there is no key, and the
 * answer is "we cannot check", which callers must render differently from
 * "we checked". Set LGQ_LEAD_VERIFICATION_SECRET before removing TWILIO_*.
 */
function verificationSecret(): string | null {
  return process.env.LGQ_LEAD_VERIFICATION_SECRET || process.env.TWILIO_AUTH_TOKEN || null;
}

/** True when tokens can be minted and checked at all. */
export function isLeadVerificationConfigured(): boolean {
  return verificationSecret() !== null;
}

/**
 * Throws when no secret is configured.
 *
 * Minting is the one side that must never degrade quietly: a token signed with
 * a guessable key is worse than no token, because it looks like proof. The
 * caller checks isLeadVerificationConfigured() first and skips the whole step.
 */
export function leadVerificationToken(phone: string, code: string, expiresAt: number): string {
  const secret = verificationSecret();
  if (!secret) throw new Error('Lead verification secret is not configured.');
  return createHmac('sha256', secret).update(`${phone}.${code}.${expiresAt}`).digest('hex');
}

export function isLeadVerificationValid(phone: string, code: string, expiresAt: number, token: string): boolean {
  if (!phone || !code || !token || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  // Fail closed. A missing secret means we cannot verify, and "cannot verify"
  // is not "verified".
  const secret = verificationSecret();
  if (!secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${phone}.${code}.${expiresAt}`).digest('hex'));
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
