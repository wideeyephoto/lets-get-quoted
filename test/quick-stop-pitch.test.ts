import { describe, it, expect } from 'vitest';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';

const pitch = (over = {}) =>
  buildQuickStopPitch({
    businessName: 'BrokePipes',
    bookingUrl: 'https://thisisit.letsgetquoted.com/book/thisisit',
    minFeeCents: 10000,
    daysAhead: 1,
    ...over,
  });

describe('buildQuickStopPitch', () => {
  it('never says "Quick Stop" — the customer has never heard the phrase', () => {
    const { subject, body, sms } = pitch();
    for (const text of [subject, body, sms]) {
      expect(text.toLowerCase()).not.toContain('quick stop');
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

  /**
   * The window used to cap at "within a couple of days" — so an owner set to
   * "up to a week out" mailed their whole list a promise two days long. It
   * reads from lib/quick-stop-window now, which the page, the booking form and
   * the marketing copy all read too.
   *
   * The SUBJECT drops to "sooner" past tomorrow, because "Need something fixed
   * within 3 days?" is not a question anybody asks themselves. The body still
   * carries the real window.
   */
  it('describes the window the owner actually offers', () => {
    expect(pitch({ daysAhead: 0 }).subject).toContain('fixed today?');
    expect(pitch({ daysAhead: 1 }).subject).toContain('fixed today or tomorrow?');
    expect(pitch({ daysAhead: 3 }).subject).toContain('fixed sooner?');
    expect(pitch({ daysAhead: 7 }).subject).toContain('fixed sooner?');

    expect(pitch({ daysAhead: 3 }).body).toContain('within 3 days');
    expect(pitch({ daysAhead: 7 }).body).toContain('within a week');
    expect(pitch({ daysAhead: 7 }).body).not.toContain('couple of days');
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
