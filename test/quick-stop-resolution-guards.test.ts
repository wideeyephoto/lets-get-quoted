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
import { makeFakeAdmin, type Row, type RpcHandler } from './helpers/fake-supabase';
import {
  QUICK_STOP_TRANSITIONS,
  QUICK_STOP_CLOSED_STATUSES,
  QUICK_STOP_OFFERABLE_STATUSES,
  QUICK_STOP_DAY_OCCUPYING_STATUSES,
  QUICK_STOP_STATUSES,
  type QuickStopStatus,
} from '@/lib/quick-stop';

const processQuickStopRefunds = vi.fn();
const sendQuickStopStatusSms = vi.fn();
const sendContractorAlertEmail = vi.fn();
const logAdminAction = vi.fn();

vi.mock('@/lib/quick-stop-refund-recovery', () => ({
  processQuickStopRefunds: (...a: unknown[]) => processQuickStopRefunds(...a),
}));
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

function world(overrides: Row = {}, rpcs: Record<string, RpcHandler> = {}) {
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
  }, rpcs);
}

/**
 * A FIXTURE MIRRORING migrations/20260914132411_quick_stop_refund_recovery.sql,
 * not a second implementation of it. It reproduces only the parts these tests
 * depend on: the compare-and-set on the expected status, the paid-visit
 * precondition for a no-show, the refund obligation it records, and archiving the
 * placeholder job. Everything the real function also does under the row lock —
 * the lock ordering, the escalating account lock, queueing the refund task — is
 * the migration's business and is covered against a real PostgreSQL elsewhere.
 */
function cancelRpc(): Record<string, RpcHandler> {
  return {
    cancel_quick_stop_request: (args, tables) => {
      const row = tables.extra_stop_requests.find((r) => r.id === args.p_request_id);
      if (!row) throw new Error('Quick Stop not found');
      const status = args.p_kind === 'no_show' ? 'no_show_confirmed'
        : args.p_kind === 'contractor_cancel' ? 'contractor_canceled' : 'customer_canceled';
      if (row.status === status) return false;
      if (row.status !== args.p_expected_status) return false;
      if (args.p_kind === 'no_show' && (!row.paid_at || !row.payment_id || !row.job_id)) {
        throw new Error('No-show requires a paid scheduled visit that never arrived');
      }
      const pct = args.p_kind === 'customer_cancel' && row.paid_at ? (args.p_refund_pct as number) : 100;
      const due = row.payment_id ? Math.round(((row.fee_cents as number) ?? 0) * pct / 100) : 0;
      Object.assign(row, { status, refund_due_cents: due, refund_state: due > 0 ? 'pending' : 'none' });
      const job = tables.jobs.find((j) => j.id === row.job_id);
      if (job) job.status = 'archived';
      return true;
    },
  };
}

/** The recovery worker succeeding: the obligation is settled in full. */
function settleRefund() {
  processQuickStopRefunds.mockImplementation(async (admin: { tables: Record<string, Row[]> }, _n, _acct, id) => {
    const row = admin.tables.extra_stop_requests.find((r) => r.id === id);
    if (row) row.refund_cents = row.refund_due_cents ?? 0;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the refund does NOT settle synchronously. That is the honest
  // default for a durable queue — the obligation is recorded, the money moves
  // later — and a test that wants the settled case says so.
  processQuickStopRefunds.mockResolvedValue(undefined);
});

describe('a resolution has to be legal for the status it is aimed at', () => {
  it.each(['offer_expired', 'contractor_declined', 'customer_declined', 'refunded'])(
    'refuses to record a no-show against a %s request',
    async (status) => {
      const admin = world({ status, paid_at: null, payment_id: null });
      await expect(
        resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' }),
      ).rejects.toThrow(/can't be recorded/i);

      // The point of the guard: it fails before the round trip, so no lock, no
      // audit row, no status change, and cancel_quick_stop_request never runs.
      expect(admin.rpcCalls).toEqual([]);
      expect(admin.tables.accounts[0].extra_stop_locked_until).toBeNull();
      expect(logAdminAction).not.toHaveBeenCalled();
      expect(admin.tables.extra_stop_requests[0].status).toBe(status);
    },
  );

  it('treats a repeat of a no-show already recorded as a no-op, not an error', async () => {
    // Distinct from the statuses above: this is the SAME resolution arriving
    // twice (a double submit, or a retry), and the honest answer to "record this
    // no-show" on a request that already carries one is "already done" rather
    // than a thrown error the caller has to pattern-match. It must still not
    // extend the lock or write a second audit row.
    const admin = world({ status: 'no_show_confirmed', paid_at: null, payment_id: null });
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' });
    expect(out.refundCents).toBe(0);
    expect(admin.rpcCalls).toEqual([]);
    expect(admin.tables.accounts[0].extra_stop_locked_until).toBeNull();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('still lets staff record a no-show against an auto-completed visit', async () => {
    // The sweep completes on an assumption — window elapsed, nobody complained —
    // so `completed` is not proof the tech arrived, and this must stay possible.
    // `completed` is in RESOLVABLE_FROM.no_show, so the guard lets it through to
    // the transaction that decides.
    expect(RESOLVABLE_FROM.no_show).toContain('completed');
    const admin = world({ status: 'completed' }, cancelRpc());
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' });
    expect(out.pct).toBe(100); // noShow tier is a fixed 100%
    expect(admin.tables.extra_stop_requests[0].status).toBe('no_show_confirmed');
    expect(admin.tables.extra_stop_requests[0].refund_due_cents).toBe(12000);
  });

  it('leaves the paid-visit precondition for a no-show to the transaction', async () => {
    /* The lock is gated on the MONEY, not inferred from the lifecycle — reachable
       because the admin console can force `completed` from any status at all,
       which puts an unpaid request back inside the allowlist. That check now sits
       inside cancel_quick_stop_request, under the row lock, next to the lock it
       guards ("No-show requires a paid scheduled visit that never arrived"), and
       a rejection there must surface rather than be swallowed. */
    const admin = world(
      { status: 'completed', paid_at: null, payment_id: null, fee_cents: null },
      cancelRpc(),
    );
    await expect(
      resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'no_show' }),
    ).rejects.toThrow(/paid scheduled visit/i);
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
  /**
   * THE ORIGINAL BUG: the sentence read `refund_cents`, which a failed Stripe
   * call reset to 0 — so somebody who cancelled inside the grace window, owed
   * every cent back, was texted "No charge was refunded."
   *
   * The shape of the fix changed with the architecture. The refund is no longer
   * attempted inline with a flag for when it fails; the obligation is committed
   * with the cancellation and a durable worker settles it. So the distinction the
   * sentence has to carry is no longer refunded-vs-failed but SETTLED versus
   * STILL OWED, which `refundPending` names and `refund_cents` alone still
   * cannot. "No charge was refunded" must remain reachable only when nothing was
   * ever owed.
   */
  it('tells the customer the money is still coming, and the owner to go and fix it', async () => {
    // Inside the grace window -> 100% owed, and the worker has not settled it.
    const admin = world({ paid_at: new Date().toISOString() }, cancelRpc());

    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });

    expect(out.refundPending).toBe(true);
    expect(out.refundCents).toBe(0);
    // The row must never claim money that did not move...
    expect(admin.tables.extra_stop_requests[0].refund_cents).toBe(0);
    // ...but it must still record that it is owed.
    expect(admin.tables.extra_stop_requests[0].refund_due_cents).toBe(12000);

    const sms = sendQuickStopStatusSms.mock.calls[0][0].message as string;
    expect(sms).not.toMatch(/no charge was refunded/i);
    expect(sms).toMatch(/refund is pending/i);

    const email = sendContractorAlertEmail.mock.calls[0][0];
    expect(email.subject).toMatch(/quick stop canceled/i);
    expect(email.bodyLines.join(' ')).toMatch(/refund is pending/i);
  });

  it('says so plainly when there was genuinely nothing to refund', async () => {
    const admin = world(
      { status: 'arrived', arrived_at: new Date().toISOString(), paid_at: PAID_AT },
      cancelRpc(),
    );
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });
    expect(out.pct).toBe(0); // afterArrived tier
    expect(out.refundPending).toBe(false);
    expect(admin.tables.extra_stop_requests[0].refund_due_cents).toBe(0);
    expect(sendQuickStopStatusSms.mock.calls[0][0].message).toMatch(/no charge was refunded/i);
  });

  it('reports a settled refund as issued', async () => {
    settleRefund();
    const admin = world({ paid_at: new Date().toISOString() }, cancelRpc());
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });
    expect(out.refundPending).toBe(false);
    expect(out.refundCents).toBe(12000);
    expect(sendQuickStopStatusSms.mock.calls[0][0].message).toMatch(/refund of \$120 has been issued/i);
    expect(admin.tables.jobs[0].status).toBe('archived');
  });

  it('promises the refund even when the charge has not landed yet', async () => {
    // An unpaid offer cancellation still owes 100% of a charge that settles
    // later, and saying "no charge was refunded" to that customer would be a
    // promise the ledger contradicts.
    const admin = world({ status: 'awaiting_customer_payment', paid_at: null }, cancelRpc());
    const out = await resolveQuickStopCancellation(admin as never, ACCOUNT, 'req1', { kind: 'customer_cancel' });
    expect(out.refundPending).toBe(true);
    expect(sendQuickStopStatusSms.mock.calls[0][0].message).toMatch(/will be refunded/i);
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
    // `refunded` is deliberately NOT excluded: queueing is idempotent and a
    // redelivered webhook against an already-refunded request must still
    // reconcile rather than leave money sitting against no appointment.
    for (const status of ['confirmed', 'en_route', 'arrived', 'completed', 'disputed']) {
      expect(LATE_PAYMENT_REFUNDABLE, `${status} has an appointment or its own resolution`).not.toContain(status);
    }
    // And each one either reaches `refunded` in the table, or is already there,
    // since the rescue settles as `refunded` from whichever status it found.
    for (const status of LATE_PAYMENT_REFUNDABLE) {
      if (status === 'refunded') continue;
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
