import { describe, expect, it, vi } from 'vitest';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';

const accountId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const input = (phoneNumber: string) => ({
  accountId, phoneNumber, body: 'A controlled test notification.',
  messageKind: 'owner-alert', billingCategory: 'owner_alert' as const,
  context: 'owner' as const, idempotencyKey: 'destination-policy:test',
});

describe('SMS destination-country boundary', () => {
  it.each([
    ['United Kingdom', '+447700900123'], ['Mexico', '+525555501234'],
    ['Bahamas', '+12425550140'], ['Barbados', '+12465550140'],
    ['Bermuda', '+14415550140'], ['Jamaica', '+18765550140'],
    ['Dominican Republic', '+18095550140'], ['Puerto Rico', '+17875550140'],
    ['US Virgin Islands', '+13405550140'], ['Guam', '+16715550140'],
    ['unknown NANP area', '+15555550140'], ['international toll free', '+80012345678'],
  ])('rejects %s before creating a queue record', async (_country, phone) => {
    const rpc = vi.fn().mockResolvedValue({ data: { sms_event_id: eventId, task_state: 'queued', created: true }, error: null });
    await expect(enqueueSmsDelivery(input(phone), { rpc } as never))
      .rejects.toThrow('SMS destinations are limited to supported US and Canada numbers.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['+12485550140', '+12125550140', '+14165550140', '+16045550140', '+18005550140'])
    ('queues a supported destination without rewriting it: %s', async (phone) => {
      const rpc = vi.fn().mockResolvedValue({ data: { sms_event_id: eventId, task_state: 'queued', created: true }, error: null });
      expect(await enqueueSmsDelivery(input(phone), { rpc } as never)).toMatchObject({ eventId, created: true });
      expect(rpc).toHaveBeenCalledWith('enqueue_sms_delivery', expect.objectContaining({ p_phone_number: phone }));
    });
});
