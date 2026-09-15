import { afterEach, describe, expect, it, vi } from 'vitest';
import { SMS_QUIET_HOURS_POLICY, smsQuietHoursResumeAt } from '@/lib/sms-quiet-hours-policy';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';

afterEach(() => vi.useRealTimers());

describe('shared SMS quiet-hours policy', () => {
  it('defines a reason and an explicit decision for all five categories', () => {
    expect(Object.keys(SMS_QUIET_HOURS_POLICY).sort()).toEqual([
      'crew_message', 'customer_message', 'owner_alert', 'payment_message', 'verification',
    ]);
    for (const policy of Object.values(SMS_QUIET_HOURS_POLICY)) expect(policy.reason.length).toBeGreaterThan(20);
  });

  it.each(['customer_message', 'payment_message'] as const)('defers %s at the 9pm cutoff and permits it at 8am', category => {
    expect(smsQuietHoursResumeAt(category, '+12485550140', new Date('2026-09-15T00:59:59Z'))).toBeNull();
    expect(smsQuietHoursResumeAt(category, '+12485550140', new Date('2026-09-15T01:00:00Z'))?.toISOString()).toBe('2026-09-15T12:01:00.000Z');
    expect(smsQuietHoursResumeAt(category, '+12485550140', new Date('2026-09-15T11:59:59Z'))?.toISOString()).toBe('2026-09-15T12:01:00.000Z');
    expect(smsQuietHoursResumeAt(category, '+12485550140', new Date('2026-09-15T12:00:00Z'))).toBeNull();
  });

  it.each(['owner_alert', 'crew_message', 'verification'] as const)('preserves the documented %s exemption overnight', category => {
    expect(smsQuietHoursResumeAt(category, '+12485550140', new Date('2026-09-15T03:00:00Z'))).toBeNull();
  });

  it('evaluates recipient local time and daylight-saving transitions', () => {
    expect(smsQuietHoursResumeAt('payment_message', '+12135550140', new Date('2026-09-15T01:00:00Z'))).toBeNull();
    expect(smsQuietHoursResumeAt('payment_message', '+12485550140', new Date('2026-11-01T01:00:00Z'))?.toISOString()).toBe('2026-11-01T13:01:00.000Z');
    expect(smsQuietHoursResumeAt('payment_message', '+12485550140', new Date('2026-03-08T02:00:00Z'))?.toISOString()).toBe('2026-03-08T12:01:00.000Z');
  });
});

describe('quiet-hours queue scheduling', () => {
  const input = {
    accountId: '11111111-1111-4111-8111-111111111111', phoneNumber: '+12485550140',
    body: 'Payment received.', messageKind: 'payment-confirmation', billingCategory: 'payment_message' as const,
    context: 'payment' as const, idempotencyKey: 'payment:test-quiet-hours',
  };
  function admin() {
    return { rpc: vi.fn().mockResolvedValue({ data: { sms_event_id: '22222222-2222-4222-8222-222222222222', task_state: 'pending', created: true }, error: null }) };
  }
  it.each([undefined, '2026-09-14T12:00:00Z', '2026-09-15T02:00:00Z'])('corrects an overnight or stale requested time: %s', async availableAt => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T01:00:00Z'));
    const db = admin();
    await enqueueSmsDelivery({ ...input, availableAt }, db as never);
    expect(db.rpc).toHaveBeenCalledWith('enqueue_sms_delivery', expect.objectContaining({ p_available_at: '2026-09-15T12:01:00.000Z' }));
  });
  it('retains a later permissible scheduled time', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T01:00:00Z'));
    const db = admin();
    await enqueueSmsDelivery({ ...input, availableAt: '2026-09-16T15:00:00Z' }, db as never);
    expect(db.rpc).toHaveBeenCalledWith('enqueue_sms_delivery', expect.objectContaining({ p_available_at: '2026-09-16T15:00:00Z' }));
  });
  it('rejects an invalid scheduled time before writing a task', async () => {
    const db = admin();
    await expect(enqueueSmsDelivery({ ...input, availableAt: 'not-a-date' }, db as never)).rejects.toThrow('availability time is invalid');
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
