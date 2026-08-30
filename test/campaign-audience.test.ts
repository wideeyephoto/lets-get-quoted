import { describe, it, expect } from 'vitest';
import { matchesAudience, AUDIENCE_DEFS, LAPSED_DAYS, type CampaignAudience } from '@/lib/campaigns';

// This decides WHO receives a marketing email or text. It is the only untested
// function in the app whose mistakes are irreversible — you cannot unsend a
// message to somebody who should never have been on the list.

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

const person = (jobCount: number, lastJobAt: string | null = daysAgo(10)) => ({ jobCount, lastJobAt });
const match = (recipient: { jobCount: number; lastJobAt: string | null }, audience: CampaignAudience) =>
  matchesAudience(recipient, audience, NOW);

describe('matchesAudience', () => {
  it('"all" includes somebody who has never bought anything', () => {
    expect(match(person(0, null), 'all')).toBe(true);
  });

  it('"past" means at least one job — an enquiry is not a customer', () => {
    expect(match(person(0, null), 'past')).toBe(false);
    expect(match(person(1), 'past')).toBe(true);
  });

  it('"repeat" means at least two — one job is not a relationship', () => {
    expect(match(person(1), 'repeat')).toBe(false);
    expect(match(person(2), 'repeat')).toBe(true);
  });

  it('"lapsed" needs them to have been a customer first', () => {
    // Somebody who never bought anything has not lapsed; they were never here.
    expect(match(person(0, daysAgo(400)), 'lapsed')).toBe(false);
  });

  it('"lapsed" turns on exactly at the threshold, not before it', () => {
    expect(match(person(1, daysAgo(LAPSED_DAYS - 1)), 'lapsed')).toBe(false);
    expect(match(person(1, daysAgo(LAPSED_DAYS)), 'lapsed')).toBe(true);
    expect(match(person(1, daysAgo(LAPSED_DAYS + 200)), 'lapsed')).toBe(true);
  });

  it('counts a customer with no recorded last job as lapsed', () => {
    // They bought something and we do not know when. Treating that as recent
    // would keep them out of every win-back campaign forever.
    expect(match(person(3, null), 'lapsed')).toBe(true);
  });

  it('sends to nobody for an audience it does not recognise', () => {
    // Fails CLOSED. The alternative — defaulting to everyone — is a mailshot to
    // the entire customer book because of a typo in a querystring.
    expect(match(person(5), 'everyone' as CampaignAudience)).toBe(false);
    expect(match(person(5), '' as CampaignAudience)).toBe(false);
  });

  it('never matches a lapsed customer whose last job is in the future', () => {
    expect(match(person(2, new Date(NOW + 10 * DAY).toISOString()), 'lapsed')).toBe(false);
  });

  it('is not confused by an unparseable date — it just is not lapsed yet', () => {
    expect(match(person(2, 'not a date'), 'lapsed')).toBe(false);
  });

  it('every audience the UI offers is one this function actually handles', () => {
    // A definition without a branch here would render a chooser that quietly
    // selects nobody.
    for (const audience of AUDIENCE_DEFS) {
      const everybody = { jobCount: 9, lastJobAt: daysAgo(LAPSED_DAYS + 1) };
      expect(matchesAudience(everybody, audience.id, NOW), audience.id).toBe(true);
    }
  });

  it('the audiences narrow as you go down the list', () => {
    const oneRecentJob = person(1, daysAgo(5));
    expect(match(oneRecentJob, 'all')).toBe(true);
    expect(match(oneRecentJob, 'past')).toBe(true);
    expect(match(oneRecentJob, 'repeat')).toBe(false);
    expect(match(oneRecentJob, 'lapsed')).toBe(false);
  });
});

describe('affirmative marketing SMS consent sources', () => {
  it('accepts only affirmative marketing sources and rejects transactional/backfill/unknown sources', async () => {
    const { AFFIRMATIVE_MARKETING_SOURCES } = await import('@/lib/campaigns');
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('marketing_opt_in')).toBe(true);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('campaign_opt_in')).toBe(true);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('promo_opt_in')).toBe(true);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('web_form_marketing_opt_in')).toBe(true);

    // Fail-closed checks:
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('crew_backfill')).toBe(false);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('payment_request')).toBe(false);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('arrival_time_changed')).toBe(false);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('unknown_source')).toBe(false);
    expect(AFFIRMATIVE_MARKETING_SOURCES.has('')).toBe(false);
  });
});
