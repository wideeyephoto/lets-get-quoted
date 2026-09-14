/**
 * Sending a Quick Stop offer: the day it commits to, the slot it takes, and what
 * happens when the payment hand-off falls over.
 *
 * Three holes, all in createQuickStopOfferAction:
 *   - the DAY was never validated. Only the weekday and the times were checked, so
 *     an offer could be dated in the past — which the sweep then auto-completes and
 *     which immediately trips the contractorMissedWindow tier, a 100% refund — and
 *     nothing enforced `daysAhead`, even though the customer-facing picker does.
 *   - the daily cap was check-then-act. The count and the claim were separate round
 *     trips and the claim wrote only `status`; `arrival_date` was stamped later, so
 *     the row did not occupy the day until well after it had been counted, and two
 *     different requests offered for the same date at once both got through.
 *   - if sendQuickStopOffer threw, the request was stranded in
 *     `contractor_offer_sent` — a status nothing swept — with a live placeholder job
 *     on the calendar, permanently holding one of the account's daily slots.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeAdmin, type Row } from './helpers/fake-supabase';

const state: { admin: ReturnType<typeof makeFakeAdmin> } = { admin: null as never };
const sendQuickStopOffer = vi.fn();
const createJob = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: async () => ({ supabase: state.admin, accountId: ACCOUNT }),
  createAdminClient: () => state.admin,
}));
vi.mock('@/lib/jobs', () => ({ createJob: (...a: unknown[]) => createJob(...a) }));
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
    // A COPY, like the real client returns. Handing back the live row would alias
    // the snapshot the action holds to the row it is about to update, so a
    // rollback reading `request.status` would read the value it just wrote.
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

const ACCOUNT_ROW: Row = {
  id: ACCOUNT,
  timezone: 'America/New_York',
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
  extra_stop_days_ahead: 1, // today or tomorrow
  extra_stop_response_deadline_mins: 30,
  extra_stop_payment_deadline_mins: 15,
};

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = { arrivalDate: TODAY, arrivalStart: '13:00', arrivalEnd: '15:00', fee: '120', visitMinutes: '45', ...overrides };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
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
  });
  return state.admin;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  sendQuickStopOffer.mockResolvedValue(undefined);
  createJob.mockImplementation(async () => {
    const job = { id: 'job-new', account_id: ACCOUNT, status: 'new_lead' };
    state.admin.tables.jobs.push(job);
    return job;
  });
});
afterEach(() => vi.useRealTimers());

describe('the day an offer commits to is validated', () => {
  it('refuses a date that has already gone', async () => {
    const admin = setup();
    await expect(createQuickStopOfferAction('req1', form({ arrivalDate: '2026-07-28' }))).rejects.toThrow(/already passed/i);
    expect(admin.tables.extra_stop_requests[0].status).toBe('awaiting_contractor');
    expect(createJob).not.toHaveBeenCalled();
  });

  it('refuses a date beyond what the account’s own settings allow', async () => {
    // daysAhead is 1, so Friday is two days past the horizon.
    const admin = setup();
    await expect(createQuickStopOfferAction('req1', form({ arrivalDate: '2026-07-31' }))).rejects.toThrow(/outside it/i);
    expect(admin.tables.extra_stop_requests[0].status).toBe('awaiting_contractor');
  });

  it('refuses today once today’s last arrival time has passed', async () => {
    vi.setSystemTime(new Date('2026-07-30T01:00:00Z')); // 21:00 on the 29th in New York
    const admin = setup();
    await expect(createQuickStopOfferAction('req1', form({ arrivalDate: TODAY, arrivalStart: '08:00', arrivalEnd: '09:00' })))
      .rejects.toThrow(/last arrival time/i);
    expect(admin.tables.extra_stop_requests[0].status).toBe('awaiting_contractor');
  });

  it('accepts a date inside the window', async () => {
    const admin = setup();
    await createQuickStopOfferAction('req1', form({ arrivalDate: TOMORROW }));
    expect(admin.tables.extra_stop_requests[0].status).toBe('contractor_offer_sent');
    expect(admin.tables.extra_stop_requests[0].arrival_date).toBe(TOMORROW);
    expect(sendQuickStopOffer).toHaveBeenCalledOnce();
  });
});

describe('the daily cap holds even when two offers race for the same day', () => {
  it('rejects up front when the day is already full', async () => {
    const admin = setup([
      { id: 'other', account_id: ACCOUNT, status: 'confirmed', arrival_date: TODAY, created_at: '2026-07-29T08:00:00.000Z' },
    ]);
    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/Quick Stop limit/i);
    expect(admin.tables.extra_stop_requests[0].status).toBe('awaiting_contractor');
  });

  it('stands down and puts the request back when it loses the race', async () => {
    /* The race the old code could not see: the pre-check counts zero, and a
       competing offer for the same day lands before this one claims. Simulated by
       inserting the competitor at the exact moment of the claim — with an earlier
       created_at, so the deterministic oldest-wins tie-break hands it the slot. */
    const admin = setup();
    let injected = false;
    const base = admin.from.bind(admin);
    (admin as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const q = base(table) as { update: (p: Row) => unknown };
      if (table === 'extra_stop_requests') {
        const original = q.update.bind(q);
        q.update = (patch: Row) => {
          if (patch.status === 'contractor_offer_sent' && !injected) {
            injected = true;
            admin.tables.extra_stop_requests.push({
              id: 'winner',
              account_id: ACCOUNT,
              status: 'contractor_offer_sent',
              arrival_date: TODAY,
              created_at: '2026-07-29T08:00:00.000Z',
            });
          }
          return original(patch);
        };
      }
      return q;
    };

    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/Quick Stop limit/i);

    const req = admin.tables.extra_stop_requests.find((r) => r.id === 'req1')!;
    expect(req.status).toBe('awaiting_contractor'); // handed back, not stranded
    expect(req.arrival_date).toBeNull(); // and the day released
    expect(sendQuickStopOffer).not.toHaveBeenCalled();
  });
});

describe('a failed payment hand-off leaves nothing stranded', () => {
  it('reverts the request, unlinks and archives the placeholder, and says nothing was charged', async () => {
    sendQuickStopOffer.mockRejectedValue(new Error('Stripe is down'));
    const admin = setup();

    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/nothing was charged/i);

    const req = admin.tables.extra_stop_requests.find((r) => r.id === 'req1')!;
    // Back in the contractor's queue rather than parked in a status no sweep read.
    expect(req.status).toBe('awaiting_contractor');
    // And no longer holding a slot on the day — this is what used to leak forever.
    expect(req.arrival_date).toBeNull();
    expect(req.job_id).toBeNull();
    expect(admin.tables.jobs.find((j) => j.id === 'job-new')!.status).toBe('archived');
  });

  it('surfaces the underlying reason so the contractor knows whether to retry', async () => {
    sendQuickStopOffer.mockRejectedValue(new Error('Finish your Stripe payout setup'));
    setup();
    await expect(createQuickStopOfferAction('req1', form())).rejects.toThrow(/Finish your Stripe payout setup/);
  });
});
