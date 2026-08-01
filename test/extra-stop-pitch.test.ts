import { describe, it, expect } from 'vitest';
import { buildExtraStopPitch } from '@/lib/extra-stop-pitch';

const pitch = (over = {}) =>
  buildExtraStopPitch({
    businessName: 'BrokePipes',
    bookingUrl: 'https://thisisit.letsgetquoted.com/book/thisisit',
    minFeeCents: 10000,
    daysAhead: 1,
    ...over,
  });

describe('buildExtraStopPitch', () => {
  it('never says "Extra Stop" — the customer has never heard the phrase', () => {
    const { subject, body, sms } = pitch();
    for (const text of [subject, body, sms]) {
      expect(text.toLowerCase()).not.toContain('extra stop');
    }
  });

  it('names the business and puts the booking link in', () => {
    const { body, sms } = pitch();
    expect(body).toContain('BrokePipes');
    expect(body).toContain('https://thisisit.letsgetquoted.com/book/thisisit');
    expect(sms).toContain('https://thisisit.letsgetquoted.com/book/thisisit');
  });

  it('states the price rather than burying it', () => {
    // Burying it gets more clicks and fewer bookings, and the booking page
    // quotes a fee on the next screen anyway.
    expect(pitch({ minFeeCents: 10000 }).body).toContain('starts at $100');
  });

  it('does not invent a price when none is set', () => {
    const body = pitch({ minFeeCents: 0 }).body;
    expect(body).not.toContain('$0');
    expect(body).toContain('call-out fee');
  });

  it('describes the window the owner actually offers', () => {
    expect(pitch({ daysAhead: 0 }).subject).toContain('the same day');
    expect(pitch({ daysAhead: 1 }).subject).toContain('the same day or the next');
    expect(pitch({ daysAhead: 3 }).subject).toContain('within a couple of days');
  });

  it('says what it is NOT for, so the wrong requests do not arrive', () => {
    expect(pitch().body).toContain('not big installs');
  });

  it('keeps the text it CONTROLS short — SMS is billed per segment per recipient', () => {
    // The link is whatever length the owner's domain is; the prose around it is
    // ours. A first draft ran to 188 characters, which is two segments and
    // double the bill for every customer on the list.
    const url = 'https://thisisit.letsgetquoted.com/book/thisisit';
    const prose = pitch().sms.replace(url, '');
    // 100, not 159: a custom domain is longer than a subdomain, and headroom
    // is the difference between one segment and two for somebody else's list.
    expect(prose.length).toBeLessThanOrEqual(100);
    // …and with a normal-length link the whole thing still fits one segment.
    expect(pitch().sms.length).toBeLessThanOrEqual(160);
  });

  it('promises no charge when it cannot be fitted in', () => {
    expect(pitch().body).toContain('not charged');
  });
});
