/**
 * The guards around resolving a Quick Stop, and the sentences it sends afterwards.
 *
 * Covers four separate holes, all in the same neighbourhood:
 *   - resolveQuickStopCancellation had NO status precondition, so the admin
 *     console (the one caller with no guard of its own) could record a no-show
 *     against a request that was declined or expired unpaid — moving no money, but
 *     still applying the escalating account lock, whose third tier is 3650 days.
 *   - a failed Stripe refund reset refund_cents to 0 and then read that zero back
 *     to text the customer "No charge was refunded.", which is the opposite of
 *     what had happened to somebody owed a full refund.
 *   - a charge that landed after the offer closed was only handed back from
 *     `offer_expired`, so the same race after a decline or a cancel kept the money
 *     against no appointment.
 *   - the transition table had drifted away from the guards that implement it, and
 *     nothing held them together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeAdmin, type Row } from './helpers/fake-supabase';
import {
  QUICK_STOP_TRANSITIONS,
  QUICK_STOP_CLOSED_STATUSES,
  QUICK_STOP_OFFERABLE_STATUSES,
  QUICK_STOP_DAY_OCCUPYING_STATUSES,
  QUICK_STOP_STATUSES,
  type QuickStopStatus,
} from '@/lib/quick-stop';

const refundPayment = vi.fn();
const sendQuickStopStatusSms = vi.fn();
const sendContractorAlertEmail = vi.fn();
const logAdminAction = vi.fn();

vi.mock('@/lib/payments', () => ({ refundPayment: (...a: unknown[]) => refundPayment(...a) }));
vi.mock('@/lib/sms', () => ({ sendQuickStopStatusSms: (...a: unknown[]) => sendQuickStopStatusSms(...a) }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn().mockResolvedValue('owner@example.com'),
  sendContractorAlertEmail: (...a: unknown[]) => sendContractorAlertEmail(...a),
}));
vi.mock('@/lib/admin', () => ({
  logAdminAction: (...a: unknown[]) => logAdminAction(...a),
  systemActor: () => ({ kind: 'system' }),
}));
vi.mock('@/lib/quick-stop-requests', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quick-stop-requests')>('@/lib/quick-stop-requests');
  return {
    ...actual,
    logQuickStopEvent: vi.fn(),
    // A copy, like the real client returns — never the live row.
    getQuickStopRequest: async (admin: { tables: Record<string, Row[]> }, accountId: string, id: string) => {
      const row = admin.tables.extra_stop_requests.find((r) => r.id === id && r.account_id === accountId);
      return row ? { ...row } : null;
    },
  };
});

const { resolveQuickStopCancellation, RESOLVABLE_FROM } = await import('@/lib/quick-stop-refunds');

const ACCOUNT = 'acct1';
const PAID_AT = '2026-07-29T12:00:00.000Z';

function world(overrides: Row = {}) {
  return makeFakeAdmin({
    extra_stop_requests: [
      {
        id: 'req1',
        account_id: ACCOUNT,
        status: 'confirmed',
        client_name: 'Dana',
        client_phone: '+15550001111',
        job_id: 'job1',
        payment_id: 'pay1',
        fee_cents: 12000,
        refund_cents: 0,
        paid_at: PAID_AT,
        arrival_date: '2026-07-29',
        arrival_end: '15:00',
        arrived_at: null,
        en_route_at: null,
        no_show_reported_at: null,
        ...overrides,
      },
    ],
    accounts: [{ id: ACCOUNT, timezone: 'America/New_York', extra_stop_refund_tiers: null, extra_stop_locked_until: null }],
    jobs: [{ id: 'job1', account_id: ACCOUNT, status: 'in_progress' }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  refundPayment.mockResolvedValue({ refundedTotal: 120, isFull: true });
});

describe('a resolution has to be legal for the status it is aimed at', () => {
  it.each(['offer_expired', 'contractor_declined', 'customer_declined', 'refunded', 'no_show_confirmed'])(
    'refuses to record a no-show against a %s request',
    async (status) => {
      const admin = world({ status, paid_at: null, payment_id: null });
      await expect(
        resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' }),
      ).rejects.toThrow(/can't be recorded/i);

      // The point of the guard: no lock, no audit row, no status change.
      expect(admin.tables.accounts[0].extra_stop_locked_until).toBeNull();
      expect(logAdminAction).not.toHaveBeenCalled();
      expect(admin.tables.extra_stop_requests[0].status).toBe(status);
    },
  );

  it('still lets staff record a no-show against an auto-completed visit', async () => {
    // The sweep completes on an assumption — window elapsed, nobody complained —
    // so `completed` is not proof the tech arrived, and this must stay possible.
    const admin = world({ status: 'completed' });
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' });
    expect(out.refundCents).toBe(12000); // noShow tier is a fixed 100%
    expect(admin.tables.extra_stop_requests[0].status).toBe('no_show_confirmed');
    expect(admin.tables.accounts[0].extra_stop_locked_until).toBeTruthy();
  });

  it('never locks an account over a request nobody paid for', async () => {
    // Reachable because the admin console can force `completed` from anywhere; the
    // lock is gated on the money rather than inferred from the lifecycle.
    const admin = world({ status: 'completed', paid_at: null, payment_id: null, fee_cents: null });
    await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' });
    expect(admin.tables.accounts[0].extra_stop_locked_until).toBeNull();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('every RESOLVABLE_FROM entry is a transition the table actually allows', () => {
    const target: Record<string, QuickStopStatus> = {
      customer_cancel: 'customer_canceled',
      contractor_cancel: 'contractor_canceled',
      no_show: 'no_show_confirmed',
    };
    for (const [kind, froms] of Object.entries(RESOLVABLE_FROM)) {
      for (const from of froms) {
        expect(QUICK_STOP_TRANSITIONS[from], `${from} -> ${target[kind]}`).toContain(target[kind]);
      }
    }
  });
});

describe('a refund that did not happen is never reported as one that did', () => {
  it('tells the customer the money is still coming, and the owner to go and fix it', async () => {
    refundPayment.mockRejectedValue(new Error('card_declined'));
    const admin = world({ paid_at: new Date().toISOString() }); // inside grace -> 100%

    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });

    expect(out.refundFailed).toBe(true);
    expect(out.refundCents).toBe(0);
    // The row must never claim money that did not move.
    expect(admin.tables.extra_stop_requests[0].refund_cents).toBe(0);

    const sms = sendQuickStopStatusSms.mock.calls[0][0].message as string;
    expect(sms).not.toMatch(/no charge was refunded/i);
    expect(sms).toMatch(/\$120/);
    expect(sms).toMatch(/didn't complete|finishing it by hand/i);

    const email = sendContractorAlertEmail.mock.calls[0][0];
    expect(email.subject).toMatch(/action needed/i);
    expect(email.bodyLines.join(' ')).toMatch(/has NOT been sent/);
  });

  it('says so plainly when there was genuinely nothing to refund', async () => {
    const admin = world({ status: 'arrived', arrived_at: new Date().toISOString(), paid_at: PAID_AT });
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });
    expect(out.pct).toBe(0); // afterArrived tier
    expect(out.refundFailed).toBe(false);
    expect(refundPayment).not.toHaveBeenCalled();
    expect(sendQuickStopStatusSms.mock.calls[0][0].message).toMatch(/no charge was refunded/i);
  });

  it('reports a successful refund as issued', async () => {
    const admin = world({ paid_at: new Date().toISOString() });
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });
    expect(out.refundFailed).toBe(false);
    expect(out.refundCents).toBe(12000);
    expect(sendQuickStopStatusSms.mock.calls[0][0].message).toMatch(/refund of \$120 has been issued/i);
    expect(admin.tables.jobs[0].status).toBe('archived');
  });
});

describe('a late charge is handed back from every state that closed the offer', () => {
  it('covers the ways an offer stops being payable, and nothing that has an appointment', async () => {
    const { LATE_PAYMENT_REFUNDABLE } = await import('@/lib/quick-stop-payments');

    // Every closed status that can hold a payment must be rescuable. `refunded`
    // and `disputed` are excluded on purpose: they have their own resolution and
    // this path must not overwrite it.
    for (const status of QUICK_STOP_CLOSED_STATUSES) {
      if (status === 'refunded' || status === 'disputed' || status === 'completed') continue;
      expect(LATE_PAYMENT_REFUNDABLE, `${status} can hold a late charge`).toContain(status);
    }
    for (const status of ['confirmed', 'en_route', 'arrived', 'completed', 'refunded', 'disputed']) {
      expect(LATE_PAYMENT_REFUNDABLE, `${status} has an appointment or its own resolution`).not.toContain(status);
    }
    // And each one is a transition the table admits, since the rescue writes
    // `refunded` from whichever status it found.
    for (const status of LATE_PAYMENT_REFUNDABLE) {
      expect(QUICK_STOP_TRANSITIONS[status as QuickStopStatus]).toContain('refunded');
    }
  });
});

describe('the transition table and the guards that implement it stay together', () => {
  it('every status in every guard list is a real status', () => {
    const known = new Set<string>(QUICK_STOP_STATUSES);
    for (const list of [QUICK_STOP_CLOSED_STATUSES, QUICK_STOP_OFFERABLE_STATUSES, QUICK_STOP_DAY_OCCUPYING_STATUSES]) {
      for (const status of list) expect(known.has(status), status).toBe(true);
    }
  });

  it('the table names every status, and points only at real ones', () => {
    expect(Object.keys(QUICK_STOP_TRANSITIONS).sort()).toEqual([...QUICK_STOP_STATUSES].sort());
    const known = new Set<string>(QUICK_STOP_STATUSES);
    for (const [from, tos] of Object.entries(QUICK_STOP_TRANSITIONS)) {
      for (const to of tos) expect(known.has(to), `${from} -> ${to}`).toBe(true);
      expect(new Set(tos).size, `${from} lists a duplicate`).toBe(tos.length);
    }
  });

  it('an offerable request can always reach an offer, and a day-occupying one is never closed', () => {
    for (const status of QUICK_STOP_OFFERABLE_STATUSES) {
      expect(QUICK_STOP_TRANSITIONS[status]).toContain('contractor_offer_sent');
    }
    const closed = new Set<string>(QUICK_STOP_CLOSED_STATUSES);
    for (const status of QUICK_STOP_DAY_OCCUPYING_STATUSES) {
      expect(closed.has(status), `${status} holds a slot, so it cannot be closed`).toBe(false);
    }
  });
});
