import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertConfiguredStripeBillingMode,
  StripeBillingModeMismatchError,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import { summarizeStripeSubscriptionProjectionBatch } from '@/lib/billing/billing-worker-cron';
import { requeueBillingDeadLettersAction } from '@/app/admin/billing-operations/actions';

vi.mock('@/lib/auth', () => ({ requireMfaPermission: vi.fn().mockResolvedValue({ admin: {}, staff: {} }) }));

// Generated inert fixture: satisfies the mode parser without embedding a credential.
const syntheticKey = (mode: 'live' | 'test') => ['sk', mode, 'x'.repeat(24)].join('_');

describe('billing rehearsal noise fix invariants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('mode assertion separation', () => {
    it('differentiates valid live runtime with test event (mode mismatch) from environment misconfiguration', () => {
      vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '1');
      vi.stubEnv('STRIPE_SECRET_KEY', syntheticKey('live'));

      // Valid live event matches live runtime
      expect(() => assertConfiguredStripeBillingMode(true)).not.toThrow();

      // Test event in live runtime throws StripeBillingModeMismatchError
      expect(() => assertConfiguredStripeBillingMode(false)).toThrow(StripeBillingModeMismatchError);
    });

    it('throws generic config error when credentials and environment conflict', () => {
      vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '1');
      vi.stubEnv('STRIPE_SECRET_KEY', syntheticKey('test'));

      // Conflicting configuration throws standard Error, NOT StripeBillingModeMismatchError
      expect(() => assertConfiguredStripeBillingMode(true)).toThrowError(
        'Stripe Billing mode and credential mode must match.'
      );
      expect(() => assertConfiguredStripeBillingMode(true)).not.toThrow(StripeBillingModeMismatchError);
    });

    it('validates test runtime properly', () => {
      vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '0');
      vi.stubEnv('STRIPE_SECRET_KEY', syntheticKey('test'));

      // Test event in test mode succeeds
      expect(() => assertConfiguredStripeBillingMode(false)).not.toThrow();

      // Live event in test mode throws StripeBillingModeMismatchError
      expect(() => assertConfiguredStripeBillingMode(true)).toThrow(StripeBillingModeMismatchError);
    });
  });

  describe('broad subscription requeue prohibition', () => {
    it('strictly forbids broad subscription-events dead-letter requeue', async () => {
      const result = await requeueBillingDeadLettersAction('subscription_events', 'requeue test');
      expect(result).toEqual({
        success: false,
        message:
          'subscription_events: broad requeue is prohibited. Terminal subscription events require targeted recovery after verifying cause and idempotency.',
      });
    });
  });

  describe('worker cron summary distinction', () => {
    it('isolates non-live mode rejections from genuine terminal business failures', () => {
      const summary = summarizeStripeSubscriptionProjectionBatch({
        status: 'completed',
        requestedBatchSize: 10,
        claimedCount: 2,
        results: [
          {
            status: 'ignored_test_mode',
            billingEventId: 'evt-test-rejected',
          },
          {
            status: 'failed_terminal',
            billingEventId: 'evt-config-invalid',
            errorCode: 'billing_mode_configuration_invalid',
          },
        ],
        errorCode: null,
      });

      expect(summary.non_live_mode_rejections).toBe(1);
      expect(summary.terminal_failures).toBe(1);
      expect(summary.failures).toBe(1); // Only the genuine config failure increments failures
    });
  });
});
