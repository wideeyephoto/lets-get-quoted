import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  buildFillScheduleCopy,
  buildReconnectCopy,
  buildWeMissYouCopy,
  buildRewardRepeatCopy,
  buildRequestReviewsCopy,
  buildFollowUpQuotesCopy,
  buildSeasonalCopy,
  buildMaintenanceReminderCopy,
  buildAnnounceServiceCopy,
  buildReferralCopy,
} from '@/lib/campaign-templates';

// Fixed inputs in, exact wording out — these builders stand in for an AI
// drafting call, so their whole value is that the words never drift and never
// name a number the caller didn't actually hand them.

const BIZ = 'BrokePipes Plumbing';

describe('the template catalog', () => {
  it('has exactly the 11 required templates, in a fixed order', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'fill-next-week',
      'follow-up-quotes',
      'maintenance-reminder',
      'reward-repeat',
      'seasonal-promotion',
      'reconnect',
      'we-miss-you',
      'request-reviews',
      'announce-service',
      'referral',
      'custom',
    ]);
  });

  it('gives every template except Custom Campaign a category', () => {
    for (const template of TEMPLATES) {
      if (template.id === 'custom') expect(template.category).toBeNull();
      else expect(template.category).not.toBeNull();
    }
  });

  it('keys every icon by the template id, so action-icon.tsx never needs a lookup table', () => {
    for (const template of TEMPLATES) expect(template.icon).toBe(template.id);
  });
});

describe('buildFillScheduleCopy', () => {
  it('names the real opening count instead of a vague plug', () => {
    const copy = buildFillScheduleCopy({ businessName: BIZ, openSlotCount: 3, bookingUrl: 'https://book.example.com/brokepipes' });
    expect(copy.body).toContain("3 openings");
    expect(copy.body).toContain('{name}');
    expect(copy.body).toContain(`— ${BIZ}`);
    expect(copy.body).toContain('https://book.example.com/brokepipes');
  });

  it('keeps the count singular for exactly one opening', () => {
    const copy = buildFillScheduleCopy({ businessName: BIZ, openSlotCount: 1, bookingUrl: null });
    expect(copy.body).toContain('1 opening on the schedule next week');
    expect(copy.body).not.toContain('1 openings');
  });

  it('never invents a count when there are no known openings, and falls back to a reply CTA without a link', () => {
    const copy = buildFillScheduleCopy({ businessName: BIZ, openSlotCount: 0, bookingUrl: null });
    expect(copy.body).not.toMatch(/\b0 opening/);
    expect(copy.body).toContain('room opening up on the schedule soon');
    expect(copy.body).toContain("Reply and let us know what day works");
  });
});

describe('buildReconnectCopy and buildWeMissYouCopy', () => {
  it('point to the booking link when one exists', () => {
    const reconnect = buildReconnectCopy({ businessName: BIZ, bookingUrl: 'https://book.example.com/x' });
    const weMissYou = buildWeMissYouCopy({ businessName: BIZ, bookingUrl: 'https://book.example.com/x' });
    expect(reconnect.body).toContain('https://book.example.com/x');
    expect(weMissYou.body).toContain('https://book.example.com/x');
  });

  it('fall back to a reply-based CTA rather than a broken link when there is no booking page', () => {
    const reconnect = buildReconnectCopy({ businessName: BIZ, bookingUrl: null });
    const weMissYou = buildWeMissYouCopy({ businessName: BIZ, bookingUrl: null });
    expect(reconnect.body).not.toContain('http');
    expect(weMissYou.body).not.toContain('http');
    expect(reconnect.body).toContain("we'll find a time that works");
    expect(weMissYou.body).toContain("we'll get you sorted");
  });

  it('read distinctly from one another even though both target the lapsed audience', () => {
    const reconnect = buildReconnectCopy({ businessName: BIZ, bookingUrl: null });
    const weMissYou = buildWeMissYouCopy({ businessName: BIZ, bookingUrl: null });
    expect(reconnect.subject).not.toBe(weMissYou.subject);
    expect(reconnect.body).not.toBe(weMissYou.body);
  });
});

describe('buildRewardRepeatCopy', () => {
  it('thanks the customer and names the business without a fabricated visit count', () => {
    const copy = buildRewardRepeatCopy({ businessName: BIZ });
    expect(copy.body).toContain('{name}');
    expect(copy.body).toContain(BIZ);
    expect(copy.body).not.toMatch(/\d+ (visits|jobs|times)/);
  });
});

describe('buildRequestReviewsCopy', () => {
  it('links to the real review URL it was given, not a placeholder', () => {
    const copy = buildRequestReviewsCopy({ businessName: BIZ, reviewUrl: 'https://search.google.com/local/writereview?placeid=abc123' });
    expect(copy.body).toContain('https://search.google.com/local/writereview?placeid=abc123');
  });
});

describe('buildFollowUpQuotesCopy', () => {
  it('never states a quote amount or date it was not given', () => {
    const copy = buildFollowUpQuotesCopy({ businessName: BIZ });
    expect(copy.body).not.toMatch(/\$\d/);
    expect(copy.body).toContain('{name}');
    expect(copy.subject.length).toBeGreaterThan(0);
  });
});

describe('buildSeasonalCopy', () => {
  it('builds the subject and body straight from the beat\'s own title and whyNow — no separate AI-authored wording', () => {
    const copy = buildSeasonalCopy({
      businessName: BIZ,
      beatTitle: 'Book a heating tune-up before the first cold snap',
      whyNow: 'Furnaces that skip a fall check tend to fail on the coldest night of the year.',
      monthName: 'October',
    });
    expect(copy.subject).toBe('Book a heating tune-up before the first cold snap — worth doing this October');
    expect(copy.body).toContain('Furnaces that skip a fall check tend to fail on the coldest night of the year.');
    expect(copy.body).toContain('{name}');
  });
});

describe('buildMaintenanceReminderCopy', () => {
  it('reminds about "your next visit" without naming a date it was never given', () => {
    const copy = buildMaintenanceReminderCopy({ businessName: BIZ });
    expect(copy.body).toContain(BIZ);
    expect(copy.body).not.toMatch(/\d{1,2}\/\d{1,2}/);
  });
});

describe('buildAnnounceServiceCopy', () => {
  it('names the real service passed in', () => {
    const copy = buildAnnounceServiceCopy({ businessName: BIZ, serviceName: 'Drain Cleaning' });
    expect(copy.subject).toContain('Drain Cleaning');
    expect(copy.body).toContain('Drain Cleaning');
  });
});

describe('buildReferralCopy', () => {
  it('asks for a referral and includes the booking link only when one exists', () => {
    const withLink = buildReferralCopy({ businessName: BIZ, bookingUrl: 'https://book.example.com/x' });
    const withoutLink = buildReferralCopy({ businessName: BIZ, bookingUrl: null });
    expect(withLink.body).toContain('https://book.example.com/x');
    expect(withoutLink.body).not.toContain('http');
    expect(withoutLink.body).toContain('reply to this or give us a call');
  });
});

describe('every copy builder', () => {
  const businessName = BIZ;
  const copies = [
    buildFillScheduleCopy({ businessName, openSlotCount: 2, bookingUrl: null }),
    buildReconnectCopy({ businessName, bookingUrl: null }),
    buildWeMissYouCopy({ businessName, bookingUrl: null }),
    buildRewardRepeatCopy({ businessName }),
    buildRequestReviewsCopy({ businessName, reviewUrl: 'https://example.com/review' }),
    buildFollowUpQuotesCopy({ businessName }),
    buildSeasonalCopy({ businessName, beatTitle: 'Fall gutter clean-out', whyNow: 'Leaves clog things up fast this time of year.', monthName: 'November' }),
    buildMaintenanceReminderCopy({ businessName }),
    buildAnnounceServiceCopy({ businessName, serviceName: 'Water Heater Install' }),
    buildReferralCopy({ businessName, bookingUrl: null }),
  ];

  it('keeps the {name} placeholder so every send can personalize', () => {
    for (const copy of copies) expect(copy.body).toContain('{name}');
  });

  it('signs off with the real business name', () => {
    for (const copy of copies) expect(copy.body.trim().endsWith(`— ${businessName}`)).toBe(true);
  });

  it('never leaves the subject empty', () => {
    for (const copy of copies) expect(copy.subject.trim().length).toBeGreaterThan(0);
  });
});
