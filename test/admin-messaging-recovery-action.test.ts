import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireMfaPermission: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireMfaPermission: mocks.requireMfaPermission,
}));
vi.mock('@/lib/admin', () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { reconcileMessagingUnmatchedStatusAction } from '@/app/admin/messaging/actions';

const REVIEW = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';

describe('manual unmatched SMS status recovery action', () => {
  const rpc = vi.fn();
  const admin = { rpc };
  const context = {
    admin,
    adminEmail: 'operator@example.com',
    staff: { id: 'staff-1' },
    permission: 'ops.manage',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMfaPermission.mockResolvedValue(context);
    rpc.mockResolvedValue({ data: true, error: null });
  });

  function form(overrides: Record<string, string> = {}): FormData {
    const data = new FormData();
    data.set('reviewId', overrides.reviewId ?? REVIEW);
    data.set('smsEventId', overrides.smsEventId ?? EVENT);
    data.set('note', overrides.note ?? 'Matched against the SignalWire message log.');
    return data;
  }

  it('requires MFA, calls only the narrow RPC, and writes the admin audit', async () => {
    await reconcileMessagingUnmatchedStatusAction(form());

    expect(mocks.requireMfaPermission).toHaveBeenCalledWith('ops.manage');
    expect(rpc).toHaveBeenCalledWith('reconcile_sms_unmatched_status', {
      p_review_item_id: REVIEW,
      p_sms_event_id: EVENT,
      p_resolution_note: 'Matched against the SignalWire message log.',
      p_resolution_actor: 'operator@example.com',
    });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(admin, context, {
      action: 'sms_unmatched_status_reconcile',
      targetType: 'sms_operator_review_item',
      targetId: REVIEW,
      reason: 'Matched against the SignalWire message log.',
      meta: { smsEventId: EVENT },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/messaging');
  });

  it('rejects anything except an exact SMS event UUID before the RPC', async () => {
    await expect(reconcileMessagingUnmatchedStatusAction(form({ smsEventId: 'maybe-this-one' })))
      .rejects.toThrow('Enter the exact SMS event UUID.');
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it('does not audit or claim success when the database refuses the binding', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '55000' } });
    await expect(reconcileMessagingUnmatchedStatusAction(form()))
      .rejects.toThrow('Unmatched status could not be reconciled');
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });
});
