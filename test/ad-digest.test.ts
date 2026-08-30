import { describe, expect, it } from 'vitest';
import { generateWeeklyAdDigest } from '@/lib/ad-digest';

describe('Weekly Ad Autopilot ROI Digest Engine', () => {
  it('aggregates past 7-day ad leads, spend, won revenue, and ROAS', () => {
    const now = new Date('2026-08-30T12:00:00Z');
    const threeDaysAgo = new Date('2026-08-27T10:00:00Z').toISOString();
    const tenDaysAgo = new Date('2026-08-20T10:00:00Z').toISOString();

    const fakeLeads: any[] = [
      {
        id: 'lead_1',
        created_at: threeDaysAgo,
        status: 'won',
        converted_job: 'job_101',
        triage: {
          attribution: { source: 'google', medium: 'cpc', clickId: 'gclid_1', clickIdType: 'gclid' },
        },
      },
      {
        id: 'lead_2',
        created_at: threeDaysAgo,
        status: 'contacted',
        triage: {
          attribution: { source: 'google', medium: 'cpc', clickId: 'gclid_2', clickIdType: 'gclid' },
        },
      },
      {
        id: 'lead_3', // Outside 7-day window
        created_at: tenDaysAgo,
        status: 'won',
        converted_job: 'job_102',
        triage: {
          attribution: { source: 'google', medium: 'cpc', clickId: 'gclid_3', clickIdType: 'gclid' },
        },
      },
    ];

    const fakeJobLookup = {
      job_101: { total: 4200, isWon: true },
      job_102: { total: 5000, isWon: true },
    };

    const digest = generateWeeklyAdDigest({
      leads: fakeLeads,
      jobLookup: fakeJobLookup,
      weeklyBudgetDollars: 150,
      now,
    });

    expect(digest.leadsCount).toBe(2);
    expect(digest.wonJobsCount).toBe(1);
    expect(digest.wonRevenueDollars).toBe(4200);
    expect(digest.spendDollars).toBe(150);
    expect(digest.roasMultiplier).toBe(28); // 4200 / 150
    expect(digest.smsText).toContain('Google Ads Weekly Digest');
    expect(digest.smsText).toContain('$4,200');
    expect(digest.smsText).toContain('28x ROAS');
  });
});
