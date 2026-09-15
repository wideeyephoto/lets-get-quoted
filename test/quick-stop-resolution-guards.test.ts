import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUICK_STOP_ACTIVE_STATUSES, QUICK_STOP_TERMINAL_STATUSES, QUICK_STOP_STATUSES,
  QUICK_STOP_CLOSED_STATUSES, QUICK_STOP_OFFERABLE_STATUSES, QUICK_STOP_DAY_OCCUPYING_STATUSES,
  QUICK_STOP_TRANSITIONS, getQuickStopTransitionSources } from '@/lib/quick-stop';

const mocks = vi.hoisted(() => ({ request: vi.fn(), processRefunds: vi.fn(), queueRefund: vi.fn(), sms: vi.fn(), email: vi.fn(), audit: vi.fn(), ownerEmail: vi.fn() }));
vi.mock('@/lib/quick-stop-requests', () => ({ getQuickStopRequest: mocks.request, logQuickStopEvent: vi.fn() }));
vi.mock('@/lib/quick-stop-refund-recovery', () => ({ processQuickStopRefunds: mocks.processRefunds, queueQuickStopRefund: mocks.queueRefund }));
vi.mock('@/lib/sms', () => ({ sendQuickStopStatusSms: mocks.sms, sendQuickStopConfirmedSms: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: mocks.ownerEmail, sendContractorAlertEmail: mocks.email }));
vi.mock('@/lib/admin', () => ({ logAdminAction: mocks.audit, systemActor: () => ({ adminEmail: 'system' }) }));
vi.mock('@/lib/auth', () => ({ createAdminClient: vi.fn() }));
import { resolveQuickStopCancellation, RESOLVABLE_FROM } from '@/lib/quick-stop-refunds';
import { confirmQuickStopPayment } from '@/lib/quick-stop-payments';

const request = { id: 'request', account_id: 'account', status: 'confirmed', job_id: 'job', payment_id: 'payment',
  client_name: 'Customer', client_phone: '+15555550100', fee_cents: 12000, refund_cents: 0,
  paid_at: '2026-07-29T12:00:00Z', arrival_date: '2026-07-29', arrival_end: '15:00', arrived_at: null, en_route_at: null };
function client() {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { timezone: 'America/New_York', result: { changed: false } }, error: null }) };
  return { from: vi.fn().mockReturnValue(query), rpc: vi.fn().mockResolvedValue({ data: true, error: null }), query };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2026-07-29T18:00:00Z');
  mocks.request.mockReset().mockResolvedValue(request);
  mocks.ownerEmail.mockResolvedValue('owner@example.test');
  mocks.processRefunds.mockReset().mockResolvedValue({ completed: 0, pending: 0, review: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('cancellation status and paid-visit guards', () => {
  it.each(['offer_expired', 'contractor_declined', 'customer_declined', 'refunded'])(
    'rejects no-show resolution from %s before any mutation', async (status) => {
      mocks.request.mockResolvedValue({ ...request, status, paid_at: null, payment_id: null });
      const admin = client();
      await expect(resolveQuickStopCancellation(admin as never, 'account', 'request', { kind: 'no_show' })).rejects.toThrow(/cannot be resolved/);
      expect(admin.rpc).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.processRefunds).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
    });
  it('returns an already confirmed no-show outcome without applying it twice', async () => {
    mocks.request.mockResolvedValue({ ...request, status: 'no_show_confirmed', refund_due_cents: 12000, refund_cents: 12000, refund_state: 'completed' });
    const admin = client();
    await expect(resolveQuickStopCancellation(admin as never, 'account', 'request', { kind: 'no_show' })).resolves.toMatchObject({ refundCents: 12000, refundPending: false });
    expect(admin.rpc).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
  it('allows staff adjudication of a completed visit through the guarded transaction', async () => {
    mocks.request.mockResolvedValue({ ...request, status: 'no_show_confirmed', refund_due_cents: 12000, refund_cents: 12000 })
      .mockResolvedValueOnce({ ...request, status: 'completed' });
    const admin = client();
    await expect(resolveQuickStopCancellation(admin as never, 'account', 'request', { kind: 'no_show' })).resolves.toMatchObject({ refundCents: 12000, refundPending: false });
    expect(admin.rpc).toHaveBeenCalledWith('cancel_quick_stop_request', expect.objectContaining({ p_expected_status: 'completed', p_kind: 'no_show', p_refund_pct: 100 }));
  });
  it('stops enforcement, refunds and notifications when SQL rejects an unpaid visit', async () => {
    mocks.request.mockResolvedValue({ ...request, status: 'completed', paid_at: null, payment_id: null });
    const admin = client(); admin.rpc.mockResolvedValue({ data: null, error: { message: 'No-show requires a paid scheduled visit' } });
    await expect(resolveQuickStopCancellation(admin as never, 'account', 'request', { kind: 'no_show' })).rejects.toThrow('paid scheduled visit');
    expect(mocks.audit).not.toHaveBeenCalled(); expect(mocks.processRefunds).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
  });
});
describe('refund messages use durable provider-confirmed amounts', () => {
  it('reports a pending obligation when processing fails without claiming money moved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.request.mockResolvedValue({ ...request, status: 'customer_canceled', refund_due_cents: 12000, refund_cents: 0 })
      .mockResolvedValueOnce({ ...request, paid_at: '2026-07-29T17:59:00Z' });
    mocks.processRefunds.mockRejectedValue(new Error('provider unavailable'));
    expect(await resolveQuickStopCancellation(client() as never, 'account', 'request', { kind: 'customer_cancel' })).toMatchObject({ refundPending: true, refundCents: 0 });
    expect(mocks.sms.mock.calls[0][0].message).toMatch(/refund is pending/i);
    expect(mocks.sms.mock.calls[0][0].message).not.toMatch(/no charge was refunded|a refund of \$[\d.]+ has been issued/i);
    expect(mocks.email.mock.calls[0][0].bodyLines.join(' ')).toMatch(/refund is pending/i);
  });
  it('reports no refund for an arrived visit with a zero-percent obligation', async () => {
    mocks.request.mockResolvedValue({ ...request, status: 'customer_canceled', refund_due_cents: 0 })
      .mockResolvedValueOnce({ ...request, status: 'arrived', arrived_at: '2026-07-29T17:00:00Z' });
    const admin = client();
    expect(await resolveQuickStopCancellation(admin as never, 'account', 'request', { kind: 'customer_cancel' })).toMatchObject({ pct: 0, refundPending: false, refundCents: 0 });
    expect(admin.rpc).toHaveBeenCalledWith('cancel_quick_stop_request', expect.objectContaining({ p_refund_pct: 0 }));
    expect(mocks.sms.mock.calls[0][0].message).toMatch(/no charge was refunded/i);
  });
  it('reports an issued refund only after its persisted amount is confirmed', async () => {
    mocks.request.mockResolvedValue({ ...request, status: 'customer_canceled', refund_due_cents: 12000, refund_cents: 12000 })
      .mockResolvedValueOnce({ ...request, paid_at: '2026-07-29T17:59:00Z' });
    expect(await resolveQuickStopCancellation(client() as never, 'account', 'request', { kind: 'customer_cancel' })).toMatchObject({ refundPending: false, refundCents: 12000 });
    expect(mocks.sms.mock.calls[0][0].message).toMatch(/refund of \$120 has been issued/i);
  });
});
describe('late-payment reconciliation follows the closed booking outcome', () => {
  it.each(['offer_expired', 'customer_canceled', 'customer_declined', 'contractor_canceled', 'contractor_declined', 'no_show_confirmed', 'refunded'])(
    'queues reconciliation from %s without reopening the appointment', async (status) => {
      const admin = client(); admin.rpc.mockResolvedValue({ data: [], error: null });
      admin.query.maybeSingle.mockResolvedValue({ data: { ...request, status }, error: null });
      await confirmQuickStopPayment(admin as never, 'payment');
      expect(mocks.queueRefund).toHaveBeenCalledWith(admin, 'request');
      expect(mocks.processRefunds).toHaveBeenCalledWith(admin, 1, 'account', 'request'); expect(mocks.sms).not.toHaveBeenCalled();
    });
  it.each(['confirmed', 'en_route', 'arrived', 'completed', 'disputed'])(
    'does not queue a late-offer refund from %s', async (status) => {
      const admin = client(); admin.rpc.mockResolvedValue({ data: [], error: null });
      admin.query.maybeSingle.mockResolvedValue({ data: { ...request, status }, error: null });
      await confirmQuickStopPayment(admin as never, 'payment');
      expect(mocks.queueRefund).not.toHaveBeenCalled(); expect(mocks.processRefunds).not.toHaveBeenCalled();
    });
});
describe('the guard lists stay in step with the table and the SQL', () => {
  /**
   * RESOLVABLE_FROM is a MIRROR of the three status allowlists inside
   * cancel_quick_stop_request, which is the copy that actually decides — it holds
   * the row lock. A mirror that drifts is worse than no mirror, because the fast
   * TypeScript rejection and the transaction would disagree about the same
   * request, so both directions are pinned here.
   */
  const cancelSql = readFileSync(
    join(process.cwd(), 'migrations/20260914145738_quick_stop_refund_recovery.sql'), 'utf8',
  );
  const target = { customer_cancel: 'customer_canceled', contractor_cancel: 'contractor_canceled', no_show: 'no_show_confirmed' } as const;

  it('only ever allows a resolution the transition table also allows', () => {
    for (const [kind, froms] of Object.entries(RESOLVABLE_FROM)) {
      for (const from of froms) {
        expect(QUICK_STOP_TRANSITIONS[from], `${from} -> ${target[kind as keyof typeof target]}`)
          .toContain(target[kind as keyof typeof target]);
      }
    }
  });

  it('names exactly the statuses the cancellation transaction accepts', () => {
    // The migration spells each allowlist as `r.status not in (...)`; pull them
    // back out and compare as sets, so an edit to either side fails here.
    for (const [kind, froms] of Object.entries(RESOLVABLE_FROM)) {
      const clause = new RegExp(`p_kind='${kind}' and r\.status not in \(([^)]*)\)`).exec(cancelSql);
      expect(clause, `${kind} allowlist present in the migration`).not.toBeNull();
      const sqlStatuses = [...clause![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
      expect(sqlStatuses, kind).toEqual([...froms].sort());
    }
  });

  it('every guard list is made of real statuses, and a day-occupying one is never closed', () => {
    const known = new Set<string>(QUICK_STOP_STATUSES);
    for (const list of [QUICK_STOP_CLOSED_STATUSES, QUICK_STOP_OFFERABLE_STATUSES, QUICK_STOP_DAY_OCCUPYING_STATUSES]) {
      for (const status of list) expect(known.has(status), status).toBe(true);
    }
    // An offerable request can always still reach an offer...
    for (const status of QUICK_STOP_OFFERABLE_STATUSES) {
      expect(QUICK_STOP_TRANSITIONS[status]).toContain('contractor_offer_sent');
    }
    // ...and anything still holding a slot on the day cannot be closed.
    const closed = new Set<string>(QUICK_STOP_CLOSED_STATUSES);
    for (const status of QUICK_STOP_DAY_OCCUPYING_STATUSES) {
      expect(closed.has(status), `${status} holds a slot, so it cannot be closed`).toBe(false);
    }
  });
});

describe('lifecycle vocabulary remains consistent', () => {
  it('contains only known statuses and has no duplicate transitions', () => {
    const known = new Set(QUICK_STOP_STATUSES);
    expect(Object.keys(QUICK_STOP_TRANSITIONS).sort()).toEqual([...known].sort());
    for (const status of [...QUICK_STOP_ACTIVE_STATUSES, ...QUICK_STOP_TERMINAL_STATUSES]) expect(known.has(status)).toBe(true);
    for (const targets of Object.values(QUICK_STOP_TRANSITIONS)) {
      for (const target of targets) expect(known.has(target)).toBe(true);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
  it('keeps published offers active and prevents closed bookings from reopening an offer', () => {
    expect(getQuickStopTransitionSources('awaiting_customer_payment')).toEqual(['awaiting_contractor', 'more_information_requested', 'contractor_offer_sent']);
    expect(QUICK_STOP_ACTIVE_STATUSES).toContain('awaiting_customer_payment');
    for (const status of QUICK_STOP_TERMINAL_STATUSES) {
      expect(QUICK_STOP_ACTIVE_STATUSES).not.toContain(status);
      expect(QUICK_STOP_TRANSITIONS[status]).not.toContain('awaiting_customer_payment');
    }
  });
});
