import { describe, it, expect } from 'vitest';
import {
  getCurrentSeason,
  resolveSeasonalRecallTopic,
  buildSeasonalRecallMessage,
  isJobEligibleForRecall,
} from '../src/lib/seasonal-recall';

describe('Seasonal Recall Engine', () => {
  it('correctly maps months to meteorological seasons', () => {
    expect(getCurrentSeason(new Date('2026-04-15'))).toBe('spring');
    expect(getCurrentSeason(new Date('2026-07-20'))).toBe('summer');
    expect(getCurrentSeason(new Date('2026-10-10'))).toBe('fall');
    expect(getCurrentSeason(new Date('2026-01-05'))).toBe('winter');
  });

  it('resolves trade-tailored seasonal topics', () => {
    const hvacSpring = resolveSeasonalRecallTopic('HVAC Repair', 'spring');
    expect(hvacSpring.suggestion.toLowerCase()).toContain('a/c');

    const plumbingFall = resolveSeasonalRecallTopic('Plumbing Services', 'fall');
    expect(plumbingFall.suggestion.toLowerCase()).toContain('winter pipe');

    const roofingFall = resolveSeasonalRecallTopic('Roofing Contractor', 'fall');
    expect(roofingFall.suggestion.toLowerCase()).toContain('roof');

    const generalAnnual = resolveSeasonalRecallTopic('Handyman', 'annual');
    expect(generalAnnual.suggestion).toContain('Annual maintenance');
  });

  it('builds clear, actionable SMS outreach messages', () => {
    const message = buildSeasonalRecallMessage({
      clientName: 'Michael Scott',
      businessName: 'Comfort Air HVAC',
      trade: 'hvac',
      bookingUrl: 'https://comfortair.com/book',
      season: 'spring',
    });

    expect(message).toContain('Hi Michael');
    expect(message).toContain('Comfort Air HVAC');
    expect(message).toContain('https://comfortair.com/book');
    expect(message.toLowerCase()).toContain('a/c');
  });

  it('evaluates job completion dates for recall eligibility', () => {
    const now = new Date('2026-08-24T12:00:00Z');

    // Completed 6 months ago (Feb 2026) -> Eligible (6-month cadence)
    const sixMonthsAgo = isJobEligibleForRecall('2026-02-24T12:00:00Z', now);
    expect(sixMonthsAgo.eligible).toBe(true);
    expect(sixMonthsAgo.monthsAgo).toBe(6);

    // Completed 12 months ago (Aug 2025) -> Eligible (Annual cadence)
    const twelveMonthsAgo = isJobEligibleForRecall('2025-08-24T12:00:00Z', now);
    expect(twelveMonthsAgo.eligible).toBe(true);
    expect(twelveMonthsAgo.monthsAgo).toBe(12);

    // Completed 1 month ago -> Not eligible yet
    const oneMonthAgo = isJobEligibleForRecall('2026-07-24T12:00:00Z', now);
    expect(oneMonthAgo.eligible).toBe(false);

    // Invalid or empty date -> Not eligible
    expect(isJobEligibleForRecall(null, now).eligible).toBe(false);
    expect(isJobEligibleForRecall('not-a-date', now).eligible).toBe(false);
  });
});
