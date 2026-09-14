/**
 * Sending a Quick Stop offer: the day it commits to, the slot it takes, and what
 * happens when the payment hand-off falls over.
 *
 * Three holes were found in createQuickStopOfferAction. All three are closed, but
 * two of them are no longer closed HERE, so this file checks them where they now
 * live rather than pretending the TypeScript still decides:
 *
 *   - the DAY was never validated, so an offer could be dated in the past — which
 *     the sweep then auto-completes, immediately tripping the
 *     contractorMissedWindow tier and a 100% refund. validateQuickStopOfferWindow
 *     now resolves both ends of the window in the account's zone and refuses one
 *     that has already ended. It is a pure function, so it is tested as one.
 *   - the daily cap was check-then-act: the count and the claim were separate
 *     round trips, so two requests offered for the same date at once both got
 *     through. Counting and claiming are now a single statement inside
 *     create_quick_stop_offer, under the row lock. A fake client cannot
 *     demonstrate that; the test that can is the concurrency script against a
 *     real PostgreSQL. What is checked here is that the guard is in the
 *     transaction and that the action surfaces its refusal.
 *   - if sendQuickStopOffer threw, the request was stranded in
 *     `contractor_offer_sent` with a live placeholder job holding a daily slot.
 *     The offer is now published atomically before any notification is attempted,
 *     and recover_stale_quick_stop_offers sweeps an interrupted one instead of
 *     rolling back by hand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFakeAdmin, type Row, type RpcHandler } from './helpers/fake-supabase';
import { validateQuickStopOfferWindow } from '@/lib/quick-stop-offers';
import { QUICK_STOP_DAY_OCCUPYING_STATUSES } from '@/lib/quick-stop';

const state: { admin: ReturnType<typeof makeFakeAdmin> } = { admin: null as never };
const sendQuickStopOffer = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: async () => ({ supabase: state.admin, accountId: ACCOUNT }),
  createAdminClient: () => state.admin,
}));
vi.mock('@/lib/jobs', () => ({ createJob: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendQuickStopStatusSms: vi.fn() }));
vi.mock('@/lib/sms-templates', () => ({ quickStopStatusText: () => 'msg' }));
vi.mock('@/lib/geocode', () => ({ geocodeArea: vi.fn() }));
vi.mock('@/lib/quick-stop-refunds', () => ({ resolveQuickStopCancellation: vi.fn() }));
vi.mock('@/lib/quick-stop-route', () => ({
  computeQuickStopRoute: async () => ({ detourMiles: 1, detourMinutes: 2, routeExtensionMinutes: 3 }),
}));
vi.mock('@/lib/quick-stop-payments', () => ({ sendQuickStopOffer: (...a: unknown[]) => sendQuickStopOffer(...a) }));
vi.mock('@/lib/quick-stop-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quick-stop-requests')>('@/lib/quick-stop-requests');
  return {
    ...actual,
    logQuickStopEvent: vi.fn(),
    getQuickStopRequest: async (_admin: unknown, accountId: string, id: string) => {
      const row = state.admin.tables.extra_stop_requests.find((r) => r.id === id && r.account_id === accountId);
      return row ? { ...row } : null;
    },
  };
});

const { createQuickStopOfferAction } = await import('@/app/dashboard/quick-stops/actions');

const ACCOUNT = 'acct1';
// 2026-07-29 is a Wednesday; 10:00 in New York is 14:00Z.
const NOW = '2026-07-29T14:00:00Z';
const TODAY = '2026-07-29';
const TOMORROW = '2026-07-30';
const ZONE = 'America/New_York';
const SETTINGS = { weekdays: [1, 2, 3, 4, 5], earliestTime: '08:00', latestEnd: '20:00' };

const ACCOUNT_ROW: Row = {
  id: ACCOUNT,
  timezone: ZONE,
  connect_onboarded: true,
  stripe_connect_id: 'acct_stripe',
  instant_book_drive_time: false,
  extra_stop_enabled: true,
  extra_stop_weekdays: [1, 2, 3, 4, 5],
  extra_stop_earliest_time: '08:00',
  extra_stop_latest_end: '20:00',
  extra_stop_max_per_day: 1,
  extra_stop_min_fee_cents: 5000,
  extra_stop_max_fee_cents: 25000,
  extra_stop_days_ahead: 1,
  extra_stop_response_deadline_mins: 30,
  extra_stop_payment_deadline_mins: 15,
};

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = { arrivalDate: TODAY, arrivalStart: '13:00', arrivalEnd: '15:00', fee: '120', visitMinutes: '45', ...overrides };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

/**
 * A FIXTURE MIRRORING migrations/20260914132439_quick_stop_atomic_offer.sql, not
 * a second implementation of it. It publishes the offer and applies the daily cap
 * over the same day-occupying statuses; the row locking that makes the real one
 * safe under concurrency is the migration's business.
 */
function offerRpc(): Record<string, RpcHandler> {
  return {
    create_quick_stop_offer: (args, tables) => {
      const row = tables.extra_stop_requests.find((r) => r.id === args.p_request_id);
      if (!row) throw new Error('Quick Stop not found');
      const offer = args.p_offer as Row;
      const cap = (tables.accounts[0].extra_stop_max_per_day as number) ?? 2;
      const taken = tables.extra_stop_requests.filter(
        (r) => r.id !== row.id
          && r.arrival_date === offer.arrival_date
          && QUICK_STOP_DAY_OCCUPYING_STATUSES.includes(r.status as never),
      ).length;
      if (taken >= cap) throw new Error(`You are at your Quick Stop limit (${cap}) for that day.`);
      Object.assign(row, { status: 'contractor_offer_sent', ...offer, job_id: 'job-new', payment_id: 'pay-new' });
      tables.jobs.push({ id: 'job-new', account_id: ACCOUNT, status: 'new_lead' });
      return true;
    },
  };
}

function setup(extraRequests: Row[] = [], accountRow: Row = ACCOUNT_ROW) {
  state.admin = makeFakeAdmin({
    extra_stop_requests: [
      {
        id: 'req1',
        account_id: ACCOUNT,
        status: 'awaiting_contractor',
        client_name: 'Dana',
        client_phone: '+15550001111',
        created_at: '2026-07-29T09:00:00.000Z',
        arrival_date: null,
        job_id: null,
        payment_id: null,
        ai_summary: 'leaking tap',
        ai_visit_minutes: 45,
        lat: 1,
        lng: 2,
      },
      ...extraRequests,
    ],
    accounts: [accountRow],
    jobs: [],
  }, offerRpc());
  return state.admin;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  sendQuickStopOffer.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('the day an offer commits to is validated', () => {
  const check = (date: string, start: string, end: string, now = Date.parse(NOW)) =>
    () => validateQuickStopOfferWindow(date, start, end, ZONE, SETTINGS, now);

  it('refuses a date that has already gone', () => {
    expect(check('2026-07-28', '13:00', '15:00')).toThrow(/has not ended/i);
  });

  it('refuses today once today’s last arrival time has passed', () => {
    // 21:00 on the 29th in New York: an 08:00–09:00 window that day is long over.
    expect(check(TODAY, '08:00', '09:00', Date.parse('2026-07-30T01:00:00Z'))).toThrow(/has not ended/i);
  });

  it('measures “already ended” in the account’s zone, not the server’s', () => {
    // 18:00Z is 14:00 in New York — the 13:00–15:00 window is still open. Read as
    // UTC it would already have ended, which is the bug this replaced.
    expect(check(TODAY, '13:00', '15:00', Date.parse('2026-07-29T18:00:00Z'))).not.toThrow();
  });

  it('still refuses a malformed or nonexistent local time', () => {
    expect(check(TODAY, '13:00', 'half past')).toThrow(/valid arrival date and window/i);
    expect(check(TODAY, '15:00', '13:00')).toThrow(/end must be after its start/i);
  });

  it('holds the offer to the account’s own schedule', () => {
    expect(check('2026-08-01', '13:00', '15:00')).toThrow(/isn’t in your Quick Stop schedule/i); // a Saturday
    expect(check(TOMORROW, '07:00', '09:00')).toThrow(/can’t start before 08:00/i);
    expect(check(TOMORROW, '18:00', '21:00')).toThrow(/can’t end after 20:00/i);
  });

  /**
   * DELIBERATELY NOT ENFORCED: `daysAhead` bounds the customer-facing picker, not
   * the contractor. A contractor answering a request may negotiate a date beyond
   * the horizon the customer could have asked for — see the note on
   * validateQuickStopOfferWindow. Pinned so that reading the horizon into this
   * guard is a decision somebody makes on purpose.
   */
  it('lets a contractor offer beyond the customer request horizon', () => {
    expect(ACCOUNT_ROW.extra_stop_days_ahead).toBe(1);
    expect(check('2026-07-31', '13:00', '15:00')).not.toThrow(); // two days out, a Friday
  });

  it('accepts a date inside the window and publishes the offer', async () => {
    const admin = setup();
    await createQuickStopOfferAction('req1', form({ arrivalDate: TOMORROW }));
    expect(admin.tables.extra_stop_requests[0].status).toBe('contractor_offer_sent');
    expect(admin.tables.extra_stop_requests[0].arrival_date).toBe(TOMORROW);
    expect(sendQuickStopOffer).toHaveBeenCalledOnce();
  });
});

describe('the daily cap holds even when two offers race for the same day', () => {
  const offerSql = readFileSync(join(process.cwd(), 'migrations/20260914132439_quick_stop_atomic_offer.sql'), 'utf8');

  it('counts the day and claims the slot inside one transaction', () => {
    /* The race the old code could not see: the pre-check counts zero, and a
       competing offer for the same day lands before this one claims. There is no
       pre-check any more — the count and the raise are inside
       create_quick_stop_offer, so a competitor cannot land between them. */
    const fn = offerSql.slice(offerSql.indexOf('function public.create_quick_stop_offer'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/Quick Stop limit/);
    expect(body).toMatch(/extra_stop_max_per_day/);
  });

  it('counts exactly the statuses that still hold a slot on the day', () => {
    // Drift guard: the SQL list and QUICK_STOP_DAY_OCCUPYING_STATUSES are the
    // same rule, and a status added to one and not the other silently changes
    // the cap.
    for (const status of QUICK_STOP_DAY_OCCUPYING_STATUSES) {
      expect(offerSql, `${status} holds a slot`).toContain(`'${status}'`);
    }
  });

  it('surfaces the refusal to the contractor rather than swallowing it', async () => {
    const admin = setup([
      { id: 'other', account_id: ACCOUNT, status: 'confirmed', arrival_date: TODAY, created_at: '2026-07-29T08:00:00.000Z' },
    ]);
    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/Quick Stop limit/i);
    expect(admin.tables.extra_stop_requests[0].status).toBe('awaiting_contractor');
    expect(sendQuickStopOffer).not.toHaveBeenCalled();
  });
});

describe('a failed notification never strands the request', () => {
  it('publishes the offer before it tries to tell anybody', async () => {
    /* The ordering IS the fix. The offer, its job and its payment are created in
       one transaction; the notification comes after and cannot leave a
       half-created offer behind if it fails. The contractor still sees the error
       — the reason matters, it tells them whether retrying is worth it — but the
       work is durable by then. */
    sendQuickStopOffer.mockRejectedValue(new Error('Finish your Stripe payout setup'));
    const admin = setup();

    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/Finish your Stripe payout setup/);

    const req = admin.tables.extra_stop_requests.find((r) => r.id === 'req1')!;
    expect(req.status).toBe('contractor_offer_sent');
    expect(req.job_id).toBe('job-new');
    expect(admin.rpcCalls.map((c) => c.name)).toContain('create_quick_stop_offer');
  });

  it('leaves an offer nobody was told about for the sweep to recover', () => {
    // What replaced the hand-rolled rollback: an offer whose payment never got
    // off the ground is expired by recover_stale_quick_stop_offers rather than
    // sitting in a status nothing read, holding a daily slot forever.
    const sweepSql = readFileSync(join(process.cwd(), 'migrations/20260914132439_quick_stop_atomic_offer.sql'), 'utf8');
    expect(sweepSql).toMatch(/function public\.recover_stale_quick_stop_offers/);
    expect(sweepSql).toMatch(/contractor_offer_sent/);
  });
});
