import { describe, expect, it, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isLeadVerificationConfigured,
  isLeadVerificationValid,
  leadVerificationToken,
} from '@/lib/lead-verification';

/**
 * This module had no test at all, which is most of why the bug below survived.
 *
 * It mints the token that turns into `phone_verified` on a lead — the only
 * evidence that the person who filled in the intake form can receive texts at
 * the number they typed. Everything here is about the difference between "we
 * checked" and "we could not check", because for most of this file's life
 * those two rendered identically.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const PHONE = '+15551234567';
const CODE = '482913';
const future = () => Date.now() + 10 * 60_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSecret(secret: string) {
  vi.stubEnv('LGQ_LEAD_VERIFICATION_SECRET', secret);
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
}

function withNoSecret() {
  vi.stubEnv('LGQ_LEAD_VERIFICATION_SECRET', '');
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
}

describe('round trip', () => {
  it('accepts a token it just minted', () => {
    withSecret('a-real-secret');
    const expiresAt = future();
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, leadVerificationToken(PHONE, CODE, expiresAt))).toBe(true);
  });

  it('binds the phone, the code and the expiry together', () => {
    withSecret('a-real-secret');
    const expiresAt = future();
    const token = leadVerificationToken(PHONE, CODE, expiresAt);
    expect(isLeadVerificationValid('+15559999999', CODE, expiresAt, token)).toBe(false);
    expect(isLeadVerificationValid(PHONE, '000000', expiresAt, token)).toBe(false);
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt + 1000, token)).toBe(false);
  });

  it('refuses an expired token even when everything else matches', () => {
    withSecret('a-real-secret');
    const expiresAt = Date.now() - 1;
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, leadVerificationToken(PHONE, CODE, expiresAt))).toBe(false);
  });

  it('refuses empty inputs rather than validating a blank triple', () => {
    withSecret('a-real-secret');
    const expiresAt = future();
    const token = leadVerificationToken(PHONE, CODE, expiresAt);
    expect(isLeadVerificationValid('', CODE, expiresAt, token)).toBe(false);
    expect(isLeadVerificationValid(PHONE, '', expiresAt, token)).toBe(false);
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, '')).toBe(false);
    expect(isLeadVerificationValid(PHONE, CODE, Number.NaN, token)).toBe(false);
  });
});

describe('the empty-string secret', () => {
  /**
   * THE REGRESSION GUARD FOR THE ACTUAL BUG.
   *
   * This module read `process.env.TWILIO_AUTH_TOKEN || ''`. Rename that
   * variable — the first move of any provider migration — and the HMAC key
   * became the empty string. Nothing threw. Minting and verifying stayed
   * consistent with each other, so the wizard worked, every click-through
   * passed and the suite stayed green; but the key was now a value anybody
   * could guess, and this function is the only thing between a scripted POST
   * and a lead marked `phone_verified` for a number the sender does not own.
   *
   * This is that forgery, written out. It must not verify.
   */
  it('rejects a token forged under the empty string', () => {
    withNoSecret();
    const expiresAt = future();
    const forged = createHmac('sha256', '').update(`${PHONE}.${CODE}.${expiresAt}`).digest('hex');
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, forged)).toBe(false);
  });

  it('rejects the empty-string forgery even when a real secret IS configured', () => {
    withSecret('a-real-secret');
    const expiresAt = future();
    const forged = createHmac('sha256', '').update(`${PHONE}.${CODE}.${expiresAt}`).digest('hex');
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, forged)).toBe(false);
  });

  it('never falls back to a default: no secret means not configured', () => {
    withNoSecret();
    expect(isLeadVerificationConfigured()).toBe(false);
  });

  /**
   * Minting throws rather than producing a guessable token. A token signed
   * with a public key is worse than no token, because it looks like proof —
   * so the caller checks isLeadVerificationConfigured() and skips the step
   * instead.
   */
  it('refuses to mint without a secret', () => {
    withNoSecret();
    expect(() => leadVerificationToken(PHONE, CODE, future())).toThrow(/not configured/i);
  });

  it('fails closed on verification without a secret', () => {
    withSecret('a-real-secret');
    const expiresAt = future();
    const genuine = leadVerificationToken(PHONE, CODE, expiresAt);
    withNoSecret();
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, genuine)).toBe(false);
  });
});

describe('the provider rename costs no downtime', () => {
  /**
   * The fallback is deliberate and is NOT the mistake above. TWILIO_AUTH_TOKEN
   * is a real secret, so honoring it keeps every token minted before this
   * change verifiable — the rename loses no in-flight lead. What it must never
   * become is a default: with both unset there is no key at all.
   */
  it('still verifies a token minted under TWILIO_AUTH_TOKEN', () => {
    vi.stubEnv('LGQ_LEAD_VERIFICATION_SECRET', '');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'the-old-token');
    const expiresAt = future();
    const minted = leadVerificationToken(PHONE, CODE, expiresAt);
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, minted)).toBe(true);
    expect(isLeadVerificationConfigured()).toBe(true);
  });

  it('prefers the dedicated secret once it is set', () => {
    vi.stubEnv('LGQ_LEAD_VERIFICATION_SECRET', 'the-new-secret');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'the-old-token');
    const expiresAt = future();
    const underOld = createHmac('sha256', 'the-old-token').update(`${PHONE}.${CODE}.${expiresAt}`).digest('hex');
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, underOld)).toBe(false);
    expect(isLeadVerificationValid(PHONE, CODE, expiresAt, leadVerificationToken(PHONE, CODE, expiresAt))).toBe(true);
  });
});

describe('an unrunnable check is visible on the lead', () => {
  const LEADS = read('src', 'app', 'api', 'public', 'leads', 'route.ts');
  const VERIFY = read('src', 'app', 'api', 'public', 'leads', 'verify-phone', 'route.ts');

  /**
   * The owner turned verification on. If it could not run, the lead must not
   * arrive looking like one that was never asked to be verified — that is the
   * whole failure: "we could not check" rendering identically to "we checked".
   */
  it('flags a submission whose verification could not run', () => {
    expect(LEADS).toContain('phone_verification_unavailable');
    expect(LEADS).toContain('isLeadVerificationConfigured()');
  });

  it('gives that flag a label, so it renders as words rather than a slug', () => {
    expect(read('src', 'lib', 'leads.ts')).toContain('phone_verification_unavailable:');
  });

  /**
   * The order matters and nothing else enforces it: the code is texted first
   * and the token minted after. Without this check, a missing secret would
   * charge the visitor a message segment and then 500 on a token that was
   * never made.
   */
  it('checks the secret before sending anybody a code', () => {
    const gate = VERIFY.indexOf('isLeadVerificationConfigured()');
    // The CALL, not the import at the top of the file — which is of course
    // where a naive indexOf finds the name first, and would have this passing
    // no matter where the gate went.
    const send = VERIFY.indexOf('await sendVerificationCodeSms(');
    expect(gate).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(send);
  });

  it('leaves no `|| \'\'` secret fallback in the module', () => {
    // Comments stripped first, and that is load-bearing rather than tidy: the
    // WHY comment on verificationSecret() quotes the exact expression it
    // replaced, so this would match the explanation of the fix.
    const source = read('src', 'lib', 'lead-verification.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/process\.env\.[A-Z_]+ \|\| ''/);
  });
});
