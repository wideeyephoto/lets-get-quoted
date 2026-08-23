import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePortalIdentifier, PORTAL_REQUEST_ACK } from '@/lib/client-portal';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
/** Comments explain why type="email" is WRONG here, so they have to come out
 *  before asserting the markup does not use it. */
const stripComments = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const ACTION = read('src', 'app', 'portal', '[subdomain]', 'actions.ts');
const FORM = stripComments(read('src', 'app', 'portal', '[subdomain]', 'PortalRequestForm.tsx'));
const DATA = read('src', 'lib', 'client-portal-data.ts');

describe('the portal takes an email or a mobile number', () => {
  it('reads an email as an email, however it was typed', () => {
    expect(parsePortalIdentifier('customer@email.com')).toEqual({ kind: 'email', value: 'customer@email.com' });
    // Normalized, so the rate limiter cannot be given six attempts by
    // capitalizing a letter.
    expect(parsePortalIdentifier('  Bob@Example.COM ')).toEqual({ kind: 'email', value: 'bob@example.com' });
  });

  it('reads a number as a number, however it was typed', () => {
    for (const raw of ['2485550117', '248-555-0117', '(248) 555 0117', '248.555.0117', '+1 248 555 0117', '1-248-555-0117']) {
      expect(parsePortalIdentifier(raw), raw).toEqual({ kind: 'sms', value: '+12485550117' });
    }
  });

  it('refuses what is neither, rather than guessing', () => {
    for (const raw of [null, undefined, '', '   ', 'bob', 'bob@', '@x.com', 'not an email', '555-0117', '12345']) {
      expect(parsePortalIdentifier(raw), String(raw)).toBeNull();
    }
  });

  it('asks in one field, because a homeowner should not classify their own details first', () => {
    expect(FORM).toContain('name="contact"');
    // type="email" would make the browser block a phone number with its own
    // popup, over a value the page is meant to accept.
    expect(FORM).not.toContain('type="email"');
    expect(FORM).toContain('email address or mobile number');
    expect(FORM).not.toContain('name="email"');
  });
});

describe('it still refuses to say whether anybody matched', () => {
  /**
   * The acknowledgement is the whole security property. A page that answers
   * differently for a real customer tells a stranger which of their neighbours
   * used this contractor.
   */
  it('answers with one constant, in every branch, including the new ones', () => {
    const returns = ACTION.match(/return \{ message: [^}]+\}/g) ?? [];
    expect(returns.length).toBeGreaterThan(4);
    for (const line of returns) expect(line).toContain('PORTAL_REQUEST_ACK');
  });

  it('does not name the kind of contact it holds', () => {
    // "If we have a record of that EMAIL" would confirm, for a number, that we
    // hold an email for that person — a smaller leak, but the same one.
    expect(PORTAL_REQUEST_ACK).not.toMatch(/email|phone|number|text/i);
    expect(PORTAL_REQUEST_ACK).toContain('those details');
  });

  it('rate limits on the normalized identifier, not the raw string', () => {
    expect(ACTION).toContain('portal:id:${identifier.value}');
    expect(ACTION).toContain('portal:ip:${ip}');
  });

  it('honours an SMS opt-out, and says nothing different when it does', () => {
    const sms = read('src', 'lib', 'sms.ts');
    const fn = sms.slice(sms.indexOf('export async function sendClientPortalLinkSms'));
    expect(fn.slice(0, 900)).toContain('isPhoneOptedOut');
    // Never throws: an exception escaping would leak the match through a 500.
    expect(fn.slice(0, 900)).toContain('catch');
  });
});

describe('finding the customer by number', () => {
  /**
   * New rows are E.164 via normalizeUsPhone, but CSV-imported rows kept
   * whatever the contractor's spreadsheet had — "(248) 555-0117" and friends.
   * An exact match alone would find the first kind only.
   */
  it('matches loosely enough to find an imported row, scoped to one account', () => {
    const fn = DATA.slice(DATA.indexOf('async function findClientByPhone'), DATA.indexOf('async function findClientByPhone') + 1200);
    expect(fn).toContain(".eq('account_id', accountId)");
    expect(fn).toContain('slice(-10)');
  });

  /**
   * maybeSingle() THROWS on a second row. A contractor whose list holds the
   * same address twice would have turned their own customer away.
   */
  it('survives a duplicate in the contractor’s own customer list', () => {
    for (const fn of ['findClientByEmail', 'findClientByPhone']) {
      const body = DATA.slice(DATA.indexOf(`async function ${fn}`), DATA.indexOf(`async function ${fn}`) + 900);
      expect(body, fn).toContain('.limit(1)');
    }
  });
});
