import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedNoticeText } from '../src/lib/sms-webhook-ingress';

/**
 * The shared number answers replies with a courtesy notice.
 *
 * Two properties are asserted here, and each has already been got wrong once.
 */

/**
 * Conservative GSM-7: plain printable ASCII minus the seven characters
 * (^ { } [ ] ~ | \) that GSM-7 encodes as a two-character escape. Anything
 * outside this promotes the ENTIRE message to UCS-2.
 */
function isGsm7(text: string): boolean {
  return /^[A-Za-z0-9 @£$¥.,:;!?'"()+\-*/=<>%&#\r\n]*$/.test(text);
}

function segments(text: string): number {
  return isGsm7(text)
    ? (text.length <= 160 ? 1 : Math.ceil(text.length / 153))
    : (text.length <= 70 ? 1 : Math.ceil(text.length / 67));
}

describe('shared-number notice copy', () => {
  it('fits ONE billed segment for realistic brand names', () => {
    // The first draft used an em dash. One non-GSM-7 character moved the whole
    // message to UCS-2 (70 chars per segment) and it cost THREE segments per
    // reply instead of one -- on a message sent to anyone who texts the number.
    for (const brand of ["Let's Get Quoted", 'BrokePipes', 'Evergreen Lawn & Landscape']) {
      const text = sharedNoticeText(brand);
      expect(isGsm7(text), `${brand}: not GSM-7 -> ${text}`).toBe(true);
      expect(segments(text), `${brand}: ${text.length} chars`).toBe(1);
    }
  });

  it('carries the client portal link and the opt-out instruction', () => {
    const text = sharedNoticeText("Let's Get Quoted");
    expect(text).toContain('/portal');
    expect(text).toMatch(/reply stop/i);
  });

  it('does NOT advertise the paid dedicated number', () => {
    // The registered campaign is LOW_VOLUME_MIXED / CUSTOMER_CARE +
    // ACCOUNT_NOTIFICATION and its TCR description states that no MARKETING is
    // carried. Promoting an upgrade here would contradict a carrier-audited
    // field. The dashboard sells; the text states a limit and points at it.
    const text = sharedNoticeText("Let's Get Quoted").toLowerCase();
    for (const forbidden of ['upgrade', 'buy', 'purchase', 'dedicated number', 'plan', 'subscribe']) {
      expect(text, `notice copy must not market: "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

describe('shared-number notice wiring', () => {
  const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'sms', 'inbound', 'route.ts'),
    'utf8',
  );

  it('answers to the same suppression gates as the durable worker', () => {
    // A carrier Message verb IS an outbound text. Without this a "dark"
    // deployment with the kill switch on would still be texting people.
    const fn = route.slice(route.indexOf('async function sharedNoticeTwiml'));
    expect(fn).toContain('outboundSmsLaneSuppression');
  });

  it('claims atomically before returning a Message verb', () => {
    // Otherwise a provider retry of the same receipt texts the sender twice.
    const fn = route.slice(route.indexOf('async function sharedNoticeTwiml'));
    expect(fn).toContain('record_sms_shared_notice_reply');
    expect(fn).toMatch(/if \(!claimed \|\| suppressed\) return emptyTwiml\(\);/);
  });

  it('never answers a contractor-dedicated number', () => {
    // Auto-replying on a contractor's own number would put words in their mouth
    // in a real conversation with their customer.
    expect(route).toContain("SHARED_NOTICE_LANES = new Set(['lgq_shared', 'lgq_dispatch'])");
    const fn = route.slice(route.indexOf('async function sharedNoticeTwiml'));
    expect(fn).toContain('SHARED_NOTICE_LANES.has');
  });

  it('still lets the 503 redelivery path answer with empty TwiML', () => {
    // A redelivery must find no notice claim, or the retry would be answered
    // while its action is still unfinished.
    expect(route).toMatch(/return emptyTwiml\(503\);/);
  });
});
