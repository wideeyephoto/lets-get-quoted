import { describe, expect, it } from 'vitest';
import {
  mergeManualSmsEventProjection,
  outboundDeliveryLabel,
  type SmsMessage,
} from '../src/lib/messages';

const accepted = (over: Partial<SmsMessage> = {}): SmsMessage => ({
  id: '11111111-1111-4111-8111-111111111111',
  account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  phone_number: '+12485550100',
  direction: 'outbound',
  body: 'Accepted message',
  provider_id: 'provider-1',
  created_at: '2026-08-21T15:00:00Z',
  ...over,
});

const queued = (over: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  phone_number: '+12485550100',
  body: 'Queued message',
  provider_id: null,
  provider: 'signalwire' as const,
  sender_number_id: null,
  status: 'queued',
  queued_at: '2026-08-21T15:01:00Z',
  created_at: '2026-08-21T15:01:00Z',
  ...over,
});

describe('Messages durable queued projection', () => {
  it('shows a durable event immediately before a provider-accepted mirror exists', () => {
    const rows = mergeManualSmsEventProjection([accepted()], [queued()]);
    expect(rows.map((row) => [row.body, row.delivery_status])).toEqual([
      ['Accepted message', undefined],
      ['Queued message', 'queued'],
    ]);
    expect(rows[1]).toMatchObject({ direction: 'outbound', sms_event_id: queued().id });
  });

  it('collapses the provider-accepted mirror and event to one transcript row', () => {
    const event = queued({ status: 'delivered' });
    const mirror = accepted({ id: event.id as string, sms_event_id: event.id as string });
    const rows = mergeManualSmsEventProjection([mirror], [event]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: 'Accepted message', delivery_status: 'delivered' });
  });

  it('keeps failed and ambiguous outcomes visible instead of manufacturing Sent', () => {
    const rows = mergeManualSmsEventProjection([], [
      queued({ id: '33333333-3333-4333-8333-333333333333', status: 'failed' }),
      queued({ id: '44444444-4444-4444-8444-444444444444', status: 'indeterminate' }),
    ]);
    expect(rows.map((row) => outboundDeliveryLabel(row.delivery_status))).toEqual([
      'Failed',
      'Delivery unknown',
    ]);
    expect(outboundDeliveryLabel(undefined)).toBe('Sent');
  });
});
