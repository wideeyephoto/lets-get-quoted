import { describe, expect, it, vi } from 'vitest';

import { enqueueSmsDelivery, senderPurposeFor } from '@/lib/sms-delivery';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('SMS delivery sender routing', () => {
  it('maps owner alerts to the LGQ shared sender', () => {
    expect(senderPurposeFor('owner_alert')).toBe('lgq_shared');
  });

  it.each([
    ['owner_alert', 'lgq_dispatch'],
    ['customer_message', 'lgq_dispatch'],
    ['crew_message', 'lgq_shared'],
    ['crew_message', 'contractor_dedicated'],
  ] as const)('fails closed before enqueue for mismatched %s / %s routing', async (billingCategory, senderPurpose) => {
    const rpc = vi.fn();

    await expect(enqueueSmsDelivery({
      accountId: ACCOUNT_ID,
      phoneNumber: '+12485550100',
      body: 'Let\'s Get Quoted: owner alert. Reply STOP to opt out.',
      messageKind: 'owner-voice-call-notification',
      billingCategory,
      context: 'owner',
      senderPurpose,
      idempotencyKey: 'voice-call-notify:test-call',
    }, { rpc } as never)).rejects.toThrow('LGQ dispatch sender and crew billing category must match.');

    expect(rpc).not.toHaveBeenCalled();
  });
});
