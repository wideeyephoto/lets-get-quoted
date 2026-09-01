import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  getGoogleLsaReportingSummary,
  googleLsaRollingWindow,
  isIssuedGoogleLsaCreditState,
  summarizeGoogleLsaRows,
} from '@/lib/google-lsa/reporting';

type Row = Record<string, unknown>;
type Filter = { operation: 'eq' | 'gte' | 'lte'; column: string; value: unknown };
type QueryCall = { table: string; selected: string; filters: Filter[] };

function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: QueryCall[] = [];

  const client = {
    from(table: string) {
      const call: QueryCall = { table, selected: '', filters: [] };
      calls.push(call);

      const filtered = () => (tables[table] ?? []).filter((row) =>
        call.filters.every(({ operation, column, value }) => {
          if (operation === 'eq') return row[column] === value;
          if (operation === 'gte') return String(row[column] ?? '') >= String(value);
          return String(row[column] ?? '') <= String(value);
        }),
      );

      const query = {
        select(selected: string) {
          call.selected = selected;
          return query;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ operation: 'eq', column, value });
          return query;
        },
        gte(column: string, value: unknown) {
          call.filters.push({ operation: 'gte', column, value });
          return query;
        },
        lte(column: string, value: unknown) {
          call.filters.push({ operation: 'lte', column, value });
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: filtered()[0] ?? null, error: null });
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: filtered(), error: null }).then(resolve, reject);
        },
      };

      return query;
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const NOW = new Date('2026-09-01T12:00:00.000Z');

describe('Google LSA reporting', () => {
  it('uses 90 inclusive UTC calendar dates', () => {
    expect(googleLsaRollingWindow(NOW)).toEqual({
      periodStart: '2026-06-04',
      periodEnd: '2026-09-01',
      startsAt: '2026-06-04T00:00:00.000Z',
      endsAt: '2026-09-01T23:59:59.999Z',
    });
  });

  it('uses the Google Ads account day across the UTC-midnight boundary', () => {
    expect(googleLsaRollingWindow(
      new Date('2026-09-01T02:00:00.000Z'),
      'America/New_York',
    )).toEqual({
      periodStart: '2026-06-03',
      periodEnd: '2026-08-31',
      startsAt: '2026-06-03T04:00:00.000Z',
      endsAt: '2026-09-01T03:59:59.999Z',
    });
  });

  it('normalizes only issued credit states', () => {
    expect(isIssuedGoogleLsaCreditState(' credited ')).toBe(true);
    expect(isIssuedGoogleLsaCreditState('credit-issued')).toBe(true);
    expect(isIssuedGoogleLsaCreditState('CREDIT_STATE.CREDITED')).toBe(true);
    expect(isIssuedGoogleLsaCreditState('PENDING')).toBe(false);
    expect(isIssuedGoogleLsaCreditState('NOT_CREDITED')).toBe(false);
  });

  it('deduplicates provider leads and signed jobs, and sums only configured daily campaign facts', async () => {
    const accountId = 'account-1';
    const sharedSignedJob = {
      id: 'job-1',
      account_id: accountId,
      quoted_amount: '12000.00',
      quote_signed_at: '2026-08-20T14:00:00.000Z',
    };
    const { client, calls } = fakeSupabase({
      google_lsa_connections: [{
        account_id: accountId,
        customer_id: '123',
        customer_name: 'Acme Roofing',
        campaign_id: '999',
        campaign_mode: 'pmax',
        last_sync_at: '2026-09-01T10:00:00.000Z',
        last_error: null,
        disconnected_at: null,
      }],
      google_lsa_leads: [
        {
          id: 'lsa-1', account_id: accountId, customer_id: '123', google_lead_id: 'g-1', lead_type: 'PHONE_CALL',
          credit_state: 'CREDITED', feedback_submitted: true, google_created_at: '2026-08-01T12:00:00.000Z',
          crm_lead: { converted_job: 'job-1', signed_job: sharedSignedJob },
        },
        {
          id: 'lsa-2', account_id: accountId, customer_id: '123', google_lead_id: 'g-2', lead_type: 'phone-call',
          credit_state: 'credit issued', feedback_submitted: 'true', google_created_at: '2026-08-02T12:00:00.000Z',
          crm_lead: { converted_job: 'job-1', signed_job: sharedSignedJob },
        },
        {
          id: 'lsa-3', account_id: accountId, customer_id: '123', google_lead_id: 'g-3', lead_type: 'BOOKING',
          credit_state: 'PENDING', feedback_submitted: false, google_created_at: '2026-08-03T12:00:00.000Z',
          crm_lead: { converted_job: 'job-2', signed_job: { id: 'job-2', account_id: accountId, quoted_amount: 8000, quote_signed_at: null } },
        },
        {
          id: 'lsa-4', account_id: accountId, customer_id: '123', google_lead_id: 'g-4', lead_type: 'MESSAGE',
          credit_state: null, feedback_submitted: false, google_created_at: '2026-08-04T12:00:00.000Z', crm_lead: null,
        },
        {
          id: 'lsa-cross-tenant', account_id: accountId, customer_id: '123', google_lead_id: 'g-cross', lead_type: 'MESSAGE',
          google_created_at: '2026-08-05T12:00:00.000Z',
          crm_lead: { converted_job: 'foreign-job', signed_job: { id: 'foreign-job', account_id: 'account-2', quoted_amount: 999999, quote_signed_at: '2026-08-20T00:00:00Z' } },
        },
        {
          id: 'lsa-trashed-job', account_id: accountId, customer_id: '123', google_lead_id: 'g-trashed', lead_type: 'MESSAGE',
          google_created_at: '2026-08-06T12:00:00.000Z',
          crm_lead: { converted_job: 'trashed-job', signed_job: { id: 'trashed-job', account_id: accountId, quoted_amount: 888888, quote_signed_at: '2026-08-20T00:00:00Z', deleted_at: '2026-08-30T00:00:00Z' } },
        },
        // Same provider identity must not inflate any count.
        {
          id: 'lsa-duplicate', account_id: accountId, customer_id: '123', google_lead_id: 'g-4', lead_type: 'PHONE_CALL',
          credit_state: 'CREDITED', feedback_submitted: true, google_created_at: '2026-08-05T12:00:00.000Z', crm_lead: null,
        },
        // The query and the pure summarizer both enforce the window.
        {
          id: 'lsa-old', account_id: accountId, customer_id: '123', google_lead_id: 'g-old', lead_type: 'BOOKING',
          google_created_at: '2026-06-03T23:59:59.999Z', crm_lead: null,
        },
      ],
      google_lsa_spend: [
        {
          id: 'daily-old', account_id: accountId, customer_id: '123', campaign_id: '999', source: 'google_ads_api',
          period_start: '2026-08-30', period_end: '2026-08-30', gross_cost_micros: '5000000', phone_calls: 1,
          connected_phone_calls: 1, currency_code: 'USD', captured_at: '2026-08-30T20:00:00.000Z',
        },
        {
          id: 'daily-new', account_id: accountId, customer_id: '123', campaign_id: '999', source: 'google_ads_api',
          period_start: '2026-08-30', period_end: '2026-08-30', gross_cost_micros: '6000000', phone_calls: 3,
          connected_phone_calls: 2, currency_code: 'USD', captured_at: '2026-08-31T02:00:00.000Z',
        },
        {
          id: 'daily-2', account_id: accountId, customer_id: '123', campaign_id: '999', source: 'google_ads_api',
          period_start: '2026-08-31', period_end: '2026-08-31', gross_cost_micros: '4000000', phone_calls: 2,
          connected_phone_calls: 2, currency_code: 'USD', captured_at: '2026-09-01T02:00:00.000Z',
        },
        {
          id: 'other-campaign', account_id: accountId, customer_id: '123', campaign_id: '888', source: 'google_ads_api',
          period_start: '2026-08-31', period_end: '2026-08-31', gross_cost_micros: '99000000', phone_calls: 20,
          currency_code: 'USD', captured_at: '2026-09-01T02:00:00.000Z',
        },
        {
          id: 'overlap', account_id: accountId, customer_id: '123', campaign_id: '999', source: 'google_ads_api',
          period_start: '2026-08-25', period_end: '2026-08-31', gross_cost_micros: '500000000', phone_calls: 40,
          currency_code: 'USD', captured_at: '2026-09-01T02:00:00.000Z',
        },
        {
          id: 'legacy', account_id: accountId, customer_id: '123', campaign_id: null, source: 'local_services_account_report',
          period_start: '2026-06-04', period_end: '2026-09-01', gross_cost_micros: '700000000', phone_calls: 70,
          currency_code: 'USD', captured_at: '2026-09-01T03:00:00.000Z',
        },
      ],
    });

    const summary = await getGoogleLsaReportingSummary(client, accountId, { now: NOW });

    expect(summary).toMatchObject({
      connectionState: 'connected',
      spendSource: 'google_ads_api',
      costMicros: 10_000_000,
      costDollars: 10,
      currencyCode: 'USD',
      leadCount: 6,
      callCount: 5,
      bookingCount: 1,
      creditCount: 2,
      feedbackCount: 2,
      signedJobCount: 1,
      signedRevenueDollars: 12_000,
      roas: 1200,
    });

    expect(calls.map((call) => call.table)).toEqual([
      'google_lsa_connections',
      'google_lsa_leads',
      'google_lsa_spend',
    ]);
    expect(calls[1].selected).toContain('quote_signed_at');
    expect(calls[1].selected).toContain('account_id');
    expect(calls[1].selected).toContain('deleted_at');
    expect(calls[1].filters).toContainEqual({ operation: 'gte', column: 'google_created_at', value: '2026-06-04T00:00:00.000Z' });
    expect(calls[2].filters).toContainEqual({ operation: 'gte', column: 'period_end', value: '2026-06-04' });
  });

  it('uses only the newest exact legacy window instead of summing overlapping snapshots', () => {
    const summary = summarizeGoogleLsaRows({
      connection: {
        customer_id: '123',
        customer_name: 'Acme Roofing',
        campaign_mode: 'legacy',
      },
      leads: [{
        id: 'phone-1', customer_id: '123', google_lead_id: 'g-1', lead_type: 'PHONE_CALL',
        google_created_at: '2026-08-01T12:00:00.000Z',
      }],
      spend: [
        {
          id: 'old', customer_id: '123', source: 'local_services_account_report',
          period_start: '2026-06-04', period_end: '2026-09-01', gross_cost_micros: 40_000_000,
          phone_calls: 3, currency_code: 'usd', captured_at: '2026-09-01T08:00:00.000Z',
        },
        {
          id: 'new', customer_id: '123', source: 'local_services_account_report',
          period_start: '2026-06-04', period_end: '2026-09-01', gross_cost_micros: 45_000_000,
          phone_calls: 4, currency_code: 'USD', captured_at: '2026-09-01T10:00:00.000Z',
        },
        {
          id: 'overlap', customer_id: '123', source: 'local_services_account_report',
          period_start: '2026-06-03', period_end: '2026-09-01', gross_cost_micros: 900_000_000,
          phone_calls: 90, currency_code: 'USD', captured_at: '2026-09-01T11:00:00.000Z',
        },
        {
          id: 'daily', customer_id: '123', campaign_id: 'pmax-1', source: 'google_ads_api',
          period_start: '2026-08-31', period_end: '2026-08-31', gross_cost_micros: 20_000_000,
          phone_calls: 8, currency_code: 'USD', captured_at: '2026-09-01T11:00:00.000Z',
        },
      ],
    }, NOW);

    expect(summary).toMatchObject({
      spendSource: 'local_services_account_report',
      costMicros: 45_000_000,
      costDollars: 45,
      currencyCode: 'USD',
      leadCount: 1,
      callCount: 4,
    });
  });

  it('returns an honest empty state when no connection or facts exist', () => {
    const summary = summarizeGoogleLsaRows({ connection: null, leads: [], spend: [] }, NOW);

    expect(summary).toMatchObject({
      connectionState: 'not_connected',
      spendSource: null,
      costDollars: 0,
      currencyCode: null,
      leadCount: 0,
      signedJobCount: 0,
      signedRevenueDollars: 0,
      roas: null,
    });
    expect(summary.attributionCaveat).toContain('Credits are a count only');
    expect(summary.attributionCaveat).toContain('appointment details');
  });
});
