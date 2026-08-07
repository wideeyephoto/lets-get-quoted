import { describe, it, expect } from 'vitest';
import {
  FOLLOWUP_FIRST_DELAY_DAYS,
  FOLLOWUP_INTERVAL_DAYS,
  MAX_FOLLOWUPS,
  followupSchedule,
  followupScheduleLabel,
  quoteFollowupText,
} from '@/lib/quote-followups';

// The Automations card states this cadence out loud. It used to describe it in
// prose ("up to twice, around day 2 and day 5") written beside the constants
// rather than derived from them, so changing the cron's spacing would have left
// the card quietly lying about when a customer gets texted.

describe('followupSchedule — the days the card claims', () => {
  it('starts at the first delay and steps by the interval', () => {
    expect(followupSchedule()).toEqual([2, 5]);
    expect(followupSchedule()).toHaveLength(MAX_FOLLOWUPS);
    expect(followupSchedule()[0]).toBe(FOLLOWUP_FIRST_DELAY_DAYS);
    expect(followupSchedule()[1] - followupSchedule()[0]).toBe(FOLLOWUP_INTERVAL_DAYS);
  });

  it('is strictly increasing, so no two nudges land on the same day', () => {
    const days = followupSchedule();
    for (let i = 1; i < days.length; i += 1) expect(days[i]).toBeGreaterThan(days[i - 1]);
  });

  it('reads as a sentence', () => {
    expect(followupScheduleLabel()).toBe('day 2 and day 5');
  });
});

describe('quoteFollowupText — the message the card shows', () => {
  const text = quoteFollowupText({ businessName: 'BrokePipes', clientName: 'Sarah', url: 'https://x.test/j/abc' });

  it('is from the contractor, not from us', () => {
    // It used to open "Let's Get Quoted:" — our name, on a text about somebody
    // else's quote, to a homeowner who has never heard of us.
    expect(text.startsWith('Hi Sarah,')).toBe(true);
    expect(text).not.toContain("Let's Get Quoted");
  });

  it('carries the opt-out and the link', () => {
    expect(text).toContain('Reply STOP to opt out.');
    expect(text).toContain('https://x.test/j/abc');
  });

  it('names the business and the person', () => {
    expect(text).toContain('Hi Sarah,');
    expect(text).toContain('your quote from BrokePipes');
  });

  it('never addresses somebody as an empty string', () => {
    const blank = quoteFollowupText({ businessName: '  ', clientName: '', url: 'https://x.test/j' });
    expect(blank).toContain('Hi there,');
    expect(blank).toContain('quote from your contractor');
  });
});
