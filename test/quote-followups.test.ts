import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOLLOWUP_DAYS,
  DEFAULT_FOLLOWUP_HOUR,
  FOLLOWUP_GRACE_DAYS,
  MAX_FOLLOWUPS,
  dayKeyDiff,
  dueFollowupIndex,
  followupHourLabel,
  followupMaxAgeDays,
  followupScheduleLabel,
  followupSequence,
  followupSettingsFromAccount,
  followupTimingLabel,
  isFollowupHourNow,
  isFollowupWindowOpen,
  isWeekendDateKey,
  normalizeFollowupChannel,
  normalizeFollowupDays,
  normalizeFollowupHour,
  quoteFollowupEmailPreview,
  quoteFollowupText,
} from '@/lib/quote-followups';

// The Automations card states this cadence out loud and the cron sweeps on it.
// It used to be four hardcoded constants nobody could change; now it is a
// per-account schedule, and every function here is shared by the card and the
// sweep so the two cannot describe different behaviour.

describe('normalizeFollowupDays — what the sweep is allowed to believe', () => {
  it('falls back to the cadence that used to be hardcoded', () => {
    expect(normalizeFollowupDays(null)).toEqual([2, 5]);
    expect(normalizeFollowupDays(undefined)).toEqual([2, 5]);
    expect(normalizeFollowupDays([])).toEqual([2, 5]);
    expect(normalizeFollowupDays(DEFAULT_FOLLOWUP_DAYS)).toEqual([2, 5]);
  });

  it('sorts and de-duplicates rather than rejecting', () => {
    // Two nudges on the same day is one nudge, and an out-of-order array is a
    // schedule somebody meant in order.
    expect(normalizeFollowupDays([5, 2])).toEqual([2, 5]);
    expect(normalizeFollowupDays([3, 3, 3])).toEqual([3]);
    expect(normalizeFollowupDays([7, 1, 4])).toEqual([1, 4, 7]);
  });

  it('never lets more than three through', () => {
    expect(normalizeFollowupDays([1, 2, 3, 4, 5])).toHaveLength(MAX_FOLLOWUPS);
    expect(normalizeFollowupDays([1, 2, 3, 4, 5])).toEqual([1, 2, 3]);
  });

  it('clamps out-of-range days instead of dropping them', () => {
    expect(normalizeFollowupDays([0])).toEqual([1]);
    expect(normalizeFollowupDays([999])).toEqual([30]);
    expect(normalizeFollowupDays([2.4, 4.6])).toEqual([2, 5]);
  });

  it('survives a raw Postgres array literal', () => {
    // supabase-js parses integer[] for us, but this function is also what the
    // sweep trusts, and it is the only thing standing between a hand-edited row
    // and a text to somebody's customer.
    expect(normalizeFollowupDays('{2,5}')).toEqual([2, 5]);
    expect(normalizeFollowupDays('{4}')).toEqual([4]);
  });

  it('ignores entries that are not numbers at all', () => {
    expect(normalizeFollowupDays(['x', 'y'])).toEqual([2, 5]);
    expect(normalizeFollowupDays([2, 'x'])).toEqual([2]);
  });
});

describe('normalizeFollowupHour — midnight is not the same as missing', () => {
  it('defaults when the column is absent', () => {
    expect(normalizeFollowupHour(null)).toBe(DEFAULT_FOLLOWUP_HOUR);
    expect(normalizeFollowupHour(undefined)).toBe(DEFAULT_FOLLOWUP_HOUR);
    expect(normalizeFollowupHour('')).toBe(DEFAULT_FOLLOWUP_HOUR);
  });

  it('keeps a stored zero, which Number() would have conflated with absent', () => {
    expect(normalizeFollowupHour(0)).toBe(0);
  });

  it('rejects hours that are not hours', () => {
    expect(normalizeFollowupHour(24)).toBe(DEFAULT_FOLLOWUP_HOUR);
    expect(normalizeFollowupHour(-1)).toBe(DEFAULT_FOLLOWUP_HOUR);
    expect(normalizeFollowupHour('nope')).toBe(DEFAULT_FOLLOWUP_HOUR);
  });
});

describe('normalizeFollowupChannel', () => {
  it('accepts only the two channels that can actually deliver', () => {
    expect(normalizeFollowupChannel('auto')).toBe('auto');
    expect(normalizeFollowupChannel('email')).toBe('email');
  });

  it('refuses sms-only, which would silently send nothing to most customers', () => {
    // Texting needs a mobile on file AND a recorded opt-in. An automation that
    // looks on and reaches nobody is worse than one that is off.
    expect(normalizeFollowupChannel('sms')).toBe('auto');
    expect(normalizeFollowupChannel(null)).toBe('auto');
  });
});

describe('followupSettingsFromAccount — a row built before the migration', () => {
  it('reads every absent column as the old behaviour, not as zero', () => {
    expect(followupSettingsFromAccount(null)).toEqual({
      days: [2, 5],
      hour: DEFAULT_FOLLOWUP_HOUR,
      channel: 'auto',
      skipWeekends: false,
    });
  });

  it('takes what is stored when it is stored', () => {
    expect(
      followupSettingsFromAccount({
        quote_followup_days: [1, 3, 7],
        quote_followup_hour: 14,
        quote_followup_channel: 'email',
        quote_followup_skip_weekends: true,
      }),
    ).toEqual({ days: [1, 3, 7], hour: 14, channel: 'email', skipWeekends: true });
  });
});

describe('the labels the card says out loud', () => {
  it('reads as a sentence at every length', () => {
    expect(followupScheduleLabel([2])).toBe('day 2');
    expect(followupScheduleLabel([2, 5])).toBe('day 2 and day 5');
    expect(followupScheduleLabel([1, 3, 7])).toBe('day 1, day 3 and day 7');
  });

  it('writes hours the way an owner does', () => {
    expect(followupHourLabel(10)).toBe('10:00 AM');
    expect(followupHourLabel(12)).toBe('12:00 PM');
    expect(followupHourLabel(0)).toBe('12:00 AM');
    expect(followupHourLabel(20)).toBe('8:00 PM');
  });

  it('puts the whole schedule in one line', () => {
    expect(followupTimingLabel([2, 5], 10, 'EDT')).toBe('day 2 and day 5, at 10:00 AM EDT');
  });
});

describe('followupSequence — Quote sent → Day 2 → Day 5 → Stop', () => {
  it('brackets the nudges with the two landmarks', () => {
    const steps = followupSequence([2, 5]);
    expect(steps.map((step) => step.label)).toEqual(['Quote sent', 'Day 2', 'Day 5', 'Stop']);
    expect(steps[0].detail).toBe('Day 0');
    expect(steps[steps.length - 1].detail).toBe(`Day ${followupMaxAgeDays([2, 5])}`);
  });

  it('numbers the reminders only when there is more than one', () => {
    expect(followupSequence([3]).map((step) => step.detail)).toEqual(['Day 0', 'Reminder', `Day ${3 + FOLLOWUP_GRACE_DAYS}`]);
    expect(followupSequence([1, 3, 7])[2].detail).toBe('Reminder 2');
  });

  it('gives every step a stable key, so React is not guessing', () => {
    const keys = followupSequence([1, 3, 7]).map((step) => step.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('followupMaxAgeDays — where chasing stops', () => {
  it('is the last nudge plus the catch-up allowance, not a fixed 21 days', () => {
    // It used to be a constant, so an owner who set day 20 as their last nudge
    // would have had the window close before it fired.
    expect(followupMaxAgeDays([2, 5])).toBe(5 + FOLLOWUP_GRACE_DAYS);
    expect(followupMaxAgeDays([1, 10, 20])).toBe(20 + FOLLOWUP_GRACE_DAYS);
  });

  it('closes the window past the last day plus grace', () => {
    expect(isFollowupWindowOpen(5, [2, 5])).toBe(true);
    expect(isFollowupWindowOpen(8, [2, 5])).toBe(true);
    expect(isFollowupWindowOpen(9, [2, 5])).toBe(false);
  });
});

describe('dueFollowupIndex — which nudge, if any, is due today', () => {
  const days = [2, 5];

  it('sends nothing before the first day', () => {
    expect(dueFollowupIndex({ daysSinceShare: 0, sentCount: 0, days })).toBeNull();
    expect(dueFollowupIndex({ daysSinceShare: 1, sentCount: 0, days })).toBeNull();
  });

  it('sends the first nudge on its day', () => {
    expect(dueFollowupIndex({ daysSinceShare: 2, sentCount: 0, days })).toBe(0);
  });

  it('does not send a second on the same schedule position', () => {
    expect(dueFollowupIndex({ daysSinceShare: 3, sentCount: 1, days })).toBeNull();
    expect(dueFollowupIndex({ daysSinceShare: 4, sentCount: 1, days })).toBeNull();
  });

  it('sends the second on its day', () => {
    expect(dueFollowupIndex({ daysSinceShare: 5, sentCount: 1, days })).toBe(1);
  });

  it('stops once the schedule is finished', () => {
    expect(dueFollowupIndex({ daysSinceShare: 6, sentCount: 2, days })).toBeNull();
    expect(dueFollowupIndex({ daysSinceShare: 30, sentCount: 2, days })).toBeNull();
  });

  it('SKIPS a missed day rather than replaying it late', () => {
    // The whole reason this function exists. Switch follow-ups on with a quote
    // already 9 days old and the old sweep — which measured gaps from the last
    // event rather than reading absolute offsets — sent "just checking in" on
    // day 9 and again on day 12. The customer experiences that as the system
    // waking up and working through a backlog at them.
    expect(dueFollowupIndex({ daysSinceShare: 9, sentCount: 0, days })).toBe(1);
    // And having sent index 1, there is nothing left: index 0 never comes back.
    expect(dueFollowupIndex({ daysSinceShare: 10, sentCount: 2, days })).toBeNull();
  });

  it('catches up by one day when a run is missed', () => {
    expect(dueFollowupIndex({ daysSinceShare: 3, sentCount: 0, days })).toBe(0);
  });

  it('handles a one-nudge and a three-nudge schedule', () => {
    expect(dueFollowupIndex({ daysSinceShare: 4, sentCount: 0, days: [4] })).toBe(0);
    expect(dueFollowupIndex({ daysSinceShare: 5, sentCount: 1, days: [4] })).toBeNull();
    expect(dueFollowupIndex({ daysSinceShare: 7, sentCount: 2, days: [1, 3, 7] })).toBe(2);
  });

  it('normalises the schedule it is handed, so an unsorted row cannot misfire', () => {
    expect(dueFollowupIndex({ daysSinceShare: 2, sentCount: 0, days: [5, 2] })).toBe(0);
  });
});

describe('dayKeyDiff — calendar days, not elapsed milliseconds', () => {
  it('counts whole days between two local dates', () => {
    expect(dayKeyDiff('2026-08-01', '2026-08-03')).toBe(2);
    expect(dayKeyDiff('2026-08-03', '2026-08-03')).toBe(0);
  });

  it('crosses a month and a year boundary', () => {
    expect(dayKeyDiff('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayKeyDiff('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('is not fooled by a DST day being 23 or 25 hours long', () => {
    // US clocks spring forward on 2026-03-08. Subtracting timestamps would make
    // this 0.958 days and round the wrong way.
    expect(dayKeyDiff('2026-03-07', '2026-03-09')).toBe(2);
    expect(dayKeyDiff('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('returns 0 rather than NaN on a key it cannot parse', () => {
    expect(dayKeyDiff('', '2026-08-03')).toBe(0);
    expect(dayKeyDiff('nonsense', 'also nonsense')).toBe(0);
  });
});

describe('isWeekendDateKey', () => {
  it('finds Saturday and Sunday', () => {
    // 2026-08-08 is a Saturday, 2026-08-09 a Sunday.
    expect(isWeekendDateKey('2026-08-08')).toBe(true);
    expect(isWeekendDateKey('2026-08-09')).toBe(true);
  });

  it('leaves the working week alone', () => {
    expect(isWeekendDateKey('2026-08-07')).toBe(false);
    expect(isWeekendDateKey('2026-08-10')).toBe(false);
  });
});

describe('isFollowupHourNow — whose hour is it', () => {
  it('fires at the configured hour', () => {
    expect(isFollowupHourNow('10:00', 10)).toBe(true);
    expect(isFollowupHourNow('10:59', 10)).toBe(true);
  });

  it('does not fire before it', () => {
    expect(isFollowupHourNow('09:59', 10)).toBe(false);
    expect(isFollowupHourNow('00:00', 10)).toBe(false);
  });

  it('catches up for a few hours, so a missed run is late rather than lost', () => {
    expect(isFollowupHourNow('12:30', 10)).toBe(true);
    expect(isFollowupHourNow('13:00', 10)).toBe(false);
  });

  it('never wraps past midnight into a day whose offsets have all moved', () => {
    expect(isFollowupHourNow('23:00', 22)).toBe(true);
    expect(isFollowupHourNow('00:30', 22)).toBe(false);
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

describe('quoteFollowupEmailPreview — the message most customers actually get', () => {
  const email = quoteFollowupEmailPreview({ businessName: 'BrokePipes', clientName: 'Sarah' });

  it('names the contractor in the subject, not us', () => {
    expect(email.subject).toBe('Still thinking it over? Your quote from BrokePipes');
    expect(email.subject).not.toContain("Let's Get Quoted");
  });

  it('is what sendQuoteFollowupEmail builds its own body from', () => {
    // The card previews this. If the sender stopped importing it, the preview
    // would become a screenshot of an intention again — which is exactly what
    // the hand-written SMS preview had already become.
    expect(email.heading).toContain('Sarah');
    expect(email.body).toContain('BrokePipes');
    expect(email.cta).toBe('View & approve your quote');
  });
});
