import { describe, expect, it } from 'vitest';
import {
  groupEmailFailures,
  groupSmsFailures,
  groupWebhookFailures,
} from '@/lib/admin-failure-groups';

describe('admin failure grouping', () => {
  it('collapses repeated webhook failures while preserving their full batch', () => {
    const groups = groupWebhookFailures([
      {
        id: 'first',
        source: 'stripe',
        event_type: 'payment_intent.succeeded',
        reference_id: 'pi_1',
        error_message: 'Account 1dd2c55f-59d4-42c1-81cc-ad8a35b64651 was not found',
        created_at: '2026-08-15T10:00:00Z',
      },
      {
        id: 'latest',
        source: 'stripe',
        event_type: 'payment_intent.succeeded',
        reference_id: 'pi_2',
        error_message: 'Account 63e9fd43-38a0-4991-9dc5-0770195cbcb3 was not found',
        created_at: '2026-08-15T11:00:00Z',
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      count: 2,
      firstAt: '2026-08-15T10:00:00Z',
      latestAt: '2026-08-15T11:00:00Z',
      sample: { id: 'latest' },
      ids: ['first', 'latest'],
    });
  });

  it('keeps distinct providers, event types, accounts, and delivery kinds apart', () => {
    const sms = groupSmsFailures([
      { id: '1', account_id: 'a', payment_id: null, event_type: 'receipt', phone_number: '+1', error_reason: 'code 30007', created_at: '2026-08-15T10:00:00Z' },
      { id: '2', account_id: 'b', payment_id: null, event_type: 'receipt', phone_number: '+2', error_reason: 'code 30007', created_at: '2026-08-15T10:01:00Z' },
    ]);
    const email = groupEmailFailures([
      { id: '3', account_id: 'a', kind: 'receipt', recipient: 'one@example.test', status: 'bounced', error_reason: 'mailbox 12345 unavailable', occurred_at: '2026-08-15T10:00:00Z' },
      { id: '4', account_id: 'a', kind: 'login', recipient: 'one@example.test', status: 'bounced', error_reason: 'mailbox 98765 unavailable', occurred_at: '2026-08-15T10:01:00Z' },
    ]);

    expect(sms).toHaveLength(2);
    expect(email).toHaveLength(2);
  });

  it('orders groups by their latest occurrence, newest first', () => {
    const groups = groupWebhookFailures([
      { id: 'old', source: 'resend', event_type: 'email.bounced', reference_id: null, error_message: 'old failure', created_at: '2026-08-14T10:00:00Z' },
      { id: 'new', source: 'stripe', event_type: 'charge.failed', reference_id: null, error_message: 'new failure', created_at: '2026-08-15T10:00:00Z' },
    ]);

    expect(groups.map((item) => item.sample.id)).toEqual(['new', 'old']);
  });
});
