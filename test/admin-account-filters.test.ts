import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_FILTERS,
  ACCOUNT_FILTER_INFO,
  ONBOARDING_STAGE_INFO,
  connectDashboardUrl,
  isAccountFilter,
  joinedSince,
  onboardingSeverity,
  onboardingStage,
} from '@/lib/admin-account-filters';

// This module exists so a count in the console can hand its rows to a list. The
// thing worth testing is the part that decides what a stuck account is stuck
// ON, because that is what staff act on.

describe('reading a filter off a URL', () => {
  it('accepts the ones the list knows', () => {
    for (const key of ACCOUNT_FILTERS) expect(isAccountFilter(key)).toBe(true);
  });

  // A bad ?filter= must fall through to the unfiltered list, never to a
  // narrower one the caller did not name.
  it('rejects anything else, including near misses', () => {
    for (const bad of ['', null, undefined, 'suspend', 'SUSPENDED', 'all', '__proto__'])
      expect(isAccountFilter(bad)).toBe(false);
  });

  it('describes every filter it offers', () => {
    for (const key of ACCOUNT_FILTERS) {
      expect(ACCOUNT_FILTER_INFO[key].label.length).toBeGreaterThan(0);
      expect(ACCOUNT_FILTER_INFO[key].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('how far an account got through payout setup', () => {
  it('is done once Stripe has cleared them', () => {
    expect(onboardingStage({ connect_onboarded: true, stripe_connect_id: 'acct_1' })).toBe('done');
  });

  // The distinction the whole module exists for: these two need different
  // things done about them, and "not onboarded" hides that they differ.
  it('separates never-started from stopped-partway', () => {
    expect(onboardingStage({ connect_onboarded: false, stripe_connect_id: null })).toBe('not_started');
    expect(onboardingStage({ connect_onboarded: false, stripe_connect_id: 'acct_1' })).toBe('in_progress');
  });

  // connect_onboarded is `boolean not null default false`, but the console also
  // renders rows from older selects that can hand it back null.
  it('treats a missing flag as not onboarded rather than as done', () => {
    expect(onboardingStage({ connect_onboarded: null, stripe_connect_id: null })).toBe('not_started');
  });

  it('says what is missing and what to do about it for both stuck stages', () => {
    for (const stage of ['not_started', 'in_progress'] as const) {
      expect(ONBOARDING_STAGE_INFO[stage].missing.length).toBeGreaterThan(0);
      expect(ONBOARDING_STAGE_INFO[stage].action.length).toBeGreaterThan(0);
    }
  });
});

describe('the link to their Connect record', () => {
  it('exists only once Stripe has something to show', () => {
    expect(connectDashboardUrl('acct_123')).toBe('https://dashboard.stripe.com/connect/accounts/acct_123');
    expect(connectDashboardUrl(null)).toBeNull();
    expect(connectDashboardUrl(undefined)).toBeNull();
    // An empty string is what an unset text column reads back as, and
    // /connect/accounts/ is a 404, not a useful destination.
    expect(connectDashboardUrl('')).toBeNull();
  });
});

describe('how worried to be about a stalled signup', () => {
  const now = new Date('2026-08-07T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000).toISOString();

  it('leaves this week alone', () => {
    expect(onboardingSeverity(daysAgo(0), now)).toBe('neutral');
    expect(onboardingSeverity(daysAgo(6), now)).toBe('neutral');
  });

  it('escalates at a week, then at a month', () => {
    expect(onboardingSeverity(daysAgo(7), now)).toBe('warn');
    expect(onboardingSeverity(daysAgo(29), now)).toBe('warn');
    expect(onboardingSeverity(daysAgo(30), now)).toBe('bad');
    expect(onboardingSeverity(daysAgo(400), now)).toBe('bad');
  });

  // A row with a corrupt created_at should render flat, not throw and not paint
  // itself the most alarming colour on the page.
  it('stays quiet on an unreadable date', () => {
    expect(onboardingSeverity('not a date', now)).toBe('neutral');
  });
});

describe('the joined-in-the-last-N-days window', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('matches the range vocabulary the Command Center counts over', () => {
    expect(joinedSince('7d', now)).toBe('2026-07-31T12:00:00.000Z');
    expect(joinedSince('30d', now)).toBe('2026-07-08T12:00:00.000Z');
    expect(joinedSince('90d', now)).toBe('2026-05-09T12:00:00.000Z');
  });
});
