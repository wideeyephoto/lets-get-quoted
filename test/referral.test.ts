import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isReferralConfigured, mintReferralCode, referralLink, referrerFromCode } from '@/lib/referral';
import { getLeadTriage, type LeadTriage } from '@/lib/leads';

/**
 * The referral code is the load-bearing correctness of the whole engine, and
 * the one part that cannot be fixed after the fact: these codes go out inside
 * customers' text messages and sit there for months.
 *
 * Two properties matter more than the round trip. It is bound to the ACCOUNT as
 * well as the client, so a code minted by one contractor cannot attribute a
 * lead to a client of another. And it fails CLOSED — a missing secret, a
 * tampered tag or a hand-typed query parameter all mean "not referred", never a
 * thrown error on somebody's public booking page.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const OTHER_ACCOUNT = '99999999-8888-7777-6666-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_CLIENT = '12345678-1234-1234-1234-123456789abc';

afterEach(() => {
  vi.unstubAllEnvs();
});

function withSecret(secret: string, previous = '') {
  vi.stubEnv('LGQ_REFERRAL_SECRET', secret);
  vi.stubEnv('LGQ_REFERRAL_SECRET_PREVIOUS', previous);
}

function withNoSecret() {
  vi.stubEnv('LGQ_REFERRAL_SECRET', '');
  vi.stubEnv('LGQ_REFERRAL_SECRET_PREVIOUS', '');
}

describe('round trip', () => {
  it('reads back the client it was minted for', () => {
    withSecret('a-real-secret');
    expect(referrerFromCode(ACCOUNT, mintReferralCode(ACCOUNT, CLIENT))).toBe(CLIENT);
  });

  it('is stable — the same pair always mints the same code', () => {
    withSecret('a-real-secret');
    expect(mintReferralCode(ACCOUNT, CLIENT)).toBe(mintReferralCode(ACCOUNT, CLIENT));
  });

  it('stays short enough to sit in a text message next to a URL', () => {
    withSecret('a-real-secret');
    const code = mintReferralCode(ACCOUNT, CLIENT);
    expect(code.length).toBeLessThanOrEqual(64);
    // URL-safe: it is about to be a query parameter.
    expect(code).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('the code is bound to the account, not just the client', () => {
  it('refuses a code minted by another account for the same client', () => {
    withSecret('a-real-secret');
    // The same client id, signed by a different tenant. Without account binding
    // this verifies arithmetically and a query filter is the only thing left.
    const foreign = mintReferralCode(OTHER_ACCOUNT, CLIENT);
    expect(referrerFromCode(ACCOUNT, foreign)).toBeNull();
    expect(referrerFromCode(OTHER_ACCOUNT, foreign)).toBe(CLIENT);
  });

  it('refuses a tampered tag', () => {
    withSecret('a-real-secret');
    const [payload, tag] = mintReferralCode(ACCOUNT, CLIENT).split('.');
    const flipped = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
    expect(referrerFromCode(ACCOUNT, `${payload}.${flipped}`)).toBeNull();
  });

  it('refuses a payload swapped onto another client tag', () => {
    withSecret('a-real-secret');
    const mine = mintReferralCode(ACCOUNT, CLIENT);
    const theirs = mintReferralCode(ACCOUNT, OTHER_CLIENT);
    expect(referrerFromCode(ACCOUNT, `${mine.split('.')[0]}.${theirs.split('.')[1]}`)).toBeNull();
  });
});

describe('it fails closed and never throws at the visitor', () => {
  it('returns null for every malformed shape', () => {
    withSecret('a-real-secret');
    const malformed = ['', '   ', 'nope', 'a.b', '../../etc/passwd', 'x'.repeat(500), 'AAAA.BBBB', `${'A'.repeat(22)}.${'B'.repeat(21)}`];
    for (const raw of malformed) {
      expect(referrerFromCode(ACCOUNT, raw)).toBeNull();
    }
    expect(referrerFromCode(ACCOUNT, null)).toBeNull();
    expect(referrerFromCode(ACCOUNT, undefined)).toBeNull();
  });

  it('refuses to verify anything when no secret is configured', () => {
    withSecret('a-real-secret');
    const code = mintReferralCode(ACCOUNT, CLIENT);
    withNoSecret();
    // "Cannot check" is not "checked". A guessable key would silently turn this
    // into a boolean anybody can set.
    expect(isReferralConfigured()).toBe(false);
    expect(referrerFromCode(ACCOUNT, code)).toBeNull();
  });

  it('refuses to MINT without a secret rather than signing with an empty key', () => {
    withNoSecret();
    expect(() => mintReferralCode(ACCOUNT, CLIENT)).toThrow();
  });

  it('refuses to mint for something that is not a uuid', () => {
    withSecret('a-real-secret');
    expect(() => mintReferralCode(ACCOUNT, 'not-a-uuid')).toThrow();
  });

  /*
   * THE ONE THAT GOT THROUGH.
   *
   * CODE_SHAPE was built with a cooked template literal, where `\.` collapses
   * to the any-char metacharacter. So 22 chars + ANY char + 22 chars passed the
   * shape; with no literal dot the split yielded one element and the tag was
   * undefined, while base64url read the '=' as padding and decoded the first 22
   * chars to exactly 16 bytes — so the uuid guard passed and Buffer.from(
   * undefined) threw. Straight off a query parameter on a public booking page,
   * before the required-field checks, destroying a completed submission.
   *
   * Every malformed case above is the wrong LENGTH, which is exactly why none
   * of them caught it.
   */
  it('does not throw on a 45-character code whose separator is not a dot', () => {
    withSecret('a-real-secret');
    // Not just '=': every character whose low byte is 0x3D hit the same path.
    for (const separator of ['=', '\u013D', '\u043D', '\u203D', '\u263D', 'X', ' ', '\u0000']) {
      const hostile = `${'A'.repeat(22)}${separator}${'B'.repeat(22)}`;
      expect(() => referrerFromCode(ACCOUNT, hostile)).not.toThrow();
      expect(referrerFromCode(ACCOUNT, hostile)).toBeNull();
    }
  });

  it('never throws on anything a stranger can put in a query string', () => {
    withSecret('a-real-secret');
    const nasty = [
      '.'.repeat(45),
      `.${'A'.repeat(44)}`,
      `${'A'.repeat(44)}.`,
      `${'A'.repeat(22)}.${'B'.repeat(11)}.${'C'.repeat(10)}`,
      '\u0000'.repeat(45),
      '\uD83D\uDCA9'.repeat(30),
      'A'.repeat(100000),
      `${'='.repeat(22)}=${'='.repeat(22)}`,
    ];
    for (const raw of nasty) {
      expect(() => referrerFromCode(ACCOUNT, raw)).not.toThrow();
      expect(referrerFromCode(ACCOUNT, raw)).toBeNull();
    }
  });
});

describe('mint and verify sign the same thing', () => {
  /*
   * Verify can only ever recover the CANONICAL uuid — it rebuilds it from 16
   * raw bytes. Mint used to sign the caller's raw string, so an uppercase or
   * unhyphenated id minted a code that could never verify: a link that goes out
   * in a text message, loads fine, and attributes to nobody forever.
   */
  it('round-trips a uuid in any spelling, to the canonical form', () => {
    withSecret('a-real-secret');
    for (const spelling of [CLIENT, CLIENT.toUpperCase(), CLIENT.replace(/-/g, ''), CLIENT.toUpperCase().replace(/-/g, '')]) {
      expect(referrerFromCode(ACCOUNT, mintReferralCode(ACCOUNT, spelling))).toBe(CLIENT);
    }
  });

  it('mints one identical code for every spelling of the same id', () => {
    withSecret('a-real-secret');
    const codes = new Set([CLIENT, CLIENT.toUpperCase(), CLIENT.replace(/-/g, '')].map((s) => mintReferralCode(ACCOUNT, s)));
    expect(codes.size).toBe(1);
  });
});

describe('rotation does not invalidate links already in the wild', () => {
  it('accepts a code minted under the previous key', () => {
    withSecret('the-old-secret');
    const inTheWild = mintReferralCode(ACCOUNT, CLIENT);

    withSecret('the-new-secret', 'the-old-secret');
    expect(referrerFromCode(ACCOUNT, inTheWild)).toBe(CLIENT);
    // And the new key mints normally alongside it.
    expect(referrerFromCode(ACCOUNT, mintReferralCode(ACCOUNT, CLIENT))).toBe(CLIENT);
  });

  it('mints only under the CURRENT key, so retiring the old one really retires it', () => {
    withSecret('the-old-secret');
    const old = mintReferralCode(ACCOUNT, CLIENT);
    withSecret('the-new-secret', 'the-old-secret');
    const fresh = mintReferralCode(ACCOUNT, CLIENT);
    expect(fresh).not.toBe(old);

    withSecret('the-new-secret');
    expect(referrerFromCode(ACCOUNT, old)).toBeNull();
    expect(referrerFromCode(ACCOUNT, fresh)).toBe(CLIENT);
  });
});

describe('the share link', () => {
  it('adds the code to a bare booking URL', () => {
    expect(referralLink('https://app.example.com/book/acme', 'CODE')).toBe('https://app.example.com/book/acme?ref=CODE');
  });

  it('appends when the URL already carries a query', () => {
    expect(referralLink('https://app.example.com/book/acme?s=1', 'CODE')).toBe('https://app.example.com/book/acme?s=1&ref=CODE');
  });
});

/**
 * THE SILENT ERASER.
 *
 * getLeadTriage does not read the triage blob, it REBUILDS it field by known
 * field, and every triage write in the app is `{ ...getLeadTriage(lead),
 * ...change }`. A key it does not parse survives exactly until the next snooze,
 * archive, decline or logged call, and then vanishes with no error. That bug
 * has already shipped once here (see test/lead-quote-draft.test.ts). This is
 * the only thing standing between referredBy and the same fate.
 */
describe('referredBy survives the triage rebuild', () => {
  const parseBody = () => {
    const source = read('src', 'lib', 'leads.ts');
    return source.slice(source.indexOf('export function getLeadTriage('), source.indexOf('function parseQuoteDraft('));
  };

  it('is parsed by getLeadTriage, not just written by callers', () => {
    expect(parseBody()).toContain('referredBy:');
  });

  it('validates rather than trusts — a non-string degrades to null', () => {
    expect(parseBody()).toContain("typeof triage.referredBy === 'string' ? triage.referredBy : null");
  });

  // Reading the source proves the LINE exists. These prove the VALUE lives,
  // through the exact write every triage action in the app performs.
  const withTriage = (triage: unknown) => ({ triage: triage as LeadTriage });

  it('round-trips through the spread that snooze, archive, decline and log-a-call all use', () => {
    const stored = withTriage({ score: 'warm', flags: [], referredBy: CLIENT });

    const afterSnooze = { ...getLeadTriage(stored), snoozedUntil: '2026-09-01T00:00:00.000Z' };
    expect(afterSnooze.referredBy).toBe(CLIENT);

    // Twice, because a field that survives one rebuild and not the next is the
    // shape this bug took last time.
    const afterArchive = { ...getLeadTriage(withTriage(afterSnooze)), archived: true };
    expect(afterArchive.referredBy).toBe(CLIENT);
    expect(afterArchive.snoozedUntil).toBe('2026-09-01T00:00:00.000Z');
  });

  it('reads a lead that predates the feature as simply not referred', () => {
    expect(getLeadTriage(withTriage({ score: 'warm', flags: [] })).referredBy).toBeNull();
    expect(getLeadTriage(withTriage(null)).referredBy).toBeUndefined();
  });

  it('refuses a non-string referrer rather than carrying junk into the queue', () => {
    for (const junk of [42, true, {}, [], { id: CLIENT }]) {
      expect(getLeadTriage(withTriage({ score: 'warm', flags: [], referredBy: junk })).referredBy).toBeNull();
    }
  });
});
