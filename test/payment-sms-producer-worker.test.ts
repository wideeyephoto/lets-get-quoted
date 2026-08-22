import { describe, expect, it, vi } from 'vitest';

import {
  runPaymentSmsProducerBatch,
  type PaymentSmsProducerClaim,
  type PaymentSmsProducerStore,
} from '@/lib/payment-sms-producer-worker';

const IDS = {
  task: '11111111-1111-4111-8111-111111111111',
  token: '22222222-2222-4222-8222-222222222222',
  payment: '33333333-3333-4333-8333-333333333333',
  event: '44444444-4444-4444-8444-444444444444',
};

function claim(eventType: PaymentSmsProducerClaim['eventType'] = 'payment_paid'):
PaymentSmsProducerClaim {
  return Object.freeze({
    taskId: IDS.task,
    claimToken: IDS.token,
    paymentId: IDS.payment,
    eventType,
    attemptNumber: 1,
  });
}

function storeFor(claims: readonly PaymentSmsProducerClaim[]) {
  const complete = vi.fn().mockResolvedValue(undefined);
  const fail = vi.fn().mockResolvedValue(undefined);
  const store: PaymentSmsProducerStore = {
    claimBatch: vi.fn().mockResolvedValue(claims),
    complete,
    fail,
  };
  return { store, complete, fail };
}

describe('payment SMS producer worker', () => {
  it('finalizes a durable producer only after the canonical SMS event exists', async () => {
    const state = storeFor([claim()]);
    const send = vi.fn().mockResolvedValue({
      status: 'queued', eventId: IDS.event, deliveryState: 'queued',
    });

    await expect(runPaymentSmsProducerBatch(10, state.store, send))
      .resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith(IDS.payment, 'payment_paid');
    expect(state.complete).toHaveBeenCalledWith(claim(), 'queued', IDS.event);
    expect(state.fail).not.toHaveBeenCalled();
  });

  it.each(['skipped', 'opted_out'] as const)(
    'records %s as a terminal no-send fact',
    async (outcome) => {
      const state = storeFor([claim('payment_refunded')]);
      const send = vi.fn().mockResolvedValue({ status: outcome });
      await expect(runPaymentSmsProducerBatch(10, state.store, send))
        .resolves.toEqual({ claimed: 1, completed: 1, failed: 0 });
      expect(state.complete).toHaveBeenCalledWith(
        claim('payment_refunded'), outcome, null,
      );
    },
  );

  it('retries a failed enqueue without inventing a provider send', async () => {
    const state = storeFor([claim('payment_failed')]);
    const send = vi.fn().mockResolvedValue({ status: 'failed', error: 'db unavailable' });
    await expect(runPaymentSmsProducerBatch(10, state.store, send))
      .resolves.toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(state.fail).toHaveBeenCalledWith(
      claim('payment_failed'), 'payment_sms_enqueue_failed', true,
    );
  });

  it('turns a lost completion response into a safe retry of the stable enqueue key', async () => {
    const state = storeFor([claim()]);
    state.complete.mockRejectedValueOnce(new Error('response lost'));
    const send = vi.fn().mockResolvedValue({
      status: 'duplicate', eventId: IDS.event, deliveryState: 'queued',
    });
    await expect(runPaymentSmsProducerBatch(10, state.store, send))
      .resolves.toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(state.fail).toHaveBeenCalledWith(
      claim(), 'payment_sms_producer_failed', true,
    );
  });
});
