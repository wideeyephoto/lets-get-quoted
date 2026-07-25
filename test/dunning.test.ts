import { describe, it, expect } from 'vitest';
import { classifyDecline, extractStripeDecline, decideDunningTransition } from '@/lib/dunning';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('classifyDecline', () => {
  it('routes SCA / authentication to needs_card', () => {
    expect(classifyDecline('authentication_required', null)).toBe('needs_card');
    expect(classifyDecline('setup_intent_authentication_failure', null)).toBe('needs_card');
  });

  it('routes unrecoverable declines to needs_card whether they arrive as code OR decline_code', () => {
    // These commonly arrive as code='card_declined' with the real reason in decline_code —
    // the regression that used to be misclassified as a blind retry.
    for (const dc of ['expired_card', 'incorrect_cvc', 'incorrect_number', 'invalid_expiry_month', 'invalid_expiry_year', 'lost_card', 'stolen_card', 'pickup_card', 'revocation_of_authorization']) {
      expect(classifyDecline('card_declined', dc)).toBe('needs_card');
    }
    // and equally when the token shows up as the top-level code
    expect(classifyDecline('expired_card', null)).toBe('needs_card');
    expect(classifyDecline('incorrect_cvc', null)).toBe('needs_card');
  });

  it('routes transient declines to retry', () => {
    for (const dc of ['insufficient_funds', 'do_not_honor', 'generic_decline', 'try_again_later', 'processing_error']) {
      expect(classifyDecline('card_declined', dc)).toBe('retry');
    }
  });

  it('keeps no_action_taken and invalid_amount as retry (they are NOT a card problem)', () => {
    expect(classifyDecline(null, 'no_action_taken')).toBe('retry');
    expect(classifyDecline(null, 'invalid_amount')).toBe('retry');
    expect(classifyDecline('no_action_taken', null)).toBe('retry');
  });

  it('defaults to retry when nothing is known', () => {
    expect(classifyDecline(null, null)).toBe('retry');
    expect(classifyDecline('', '')).toBe('retry');
    expect(classifyDecline('some_unknown_future_code', null)).toBe('retry');
  });
});

describe('extractStripeDecline', () => {
  it('reads a top-level code / decline_code / message', () => {
    const d = extractStripeDecline({ code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card was declined.' });
    expect(d).toEqual({ code: 'card_declined', declineCode: 'insufficient_funds', message: 'Your card was declined.', intentId: null });
  });

  it('falls back to raw.* fields', () => {
    const d = extractStripeDecline({ raw: { code: 'expired_card', decline_code: 'expired_card', message: 'expired', payment_intent: { id: 'pi_raw' } } });
    expect(d.code).toBe('expired_card');
    expect(d.declineCode).toBe('expired_card');
    expect(d.intentId).toBe('pi_raw');
  });

  it('reads the decline off payment_intent.last_payment_error and grabs the intent id', () => {
    const d = extractStripeDecline({ payment_intent: { id: 'pi_123', last_payment_error: { code: 'card_declined', decline_code: 'do_not_honor', message: 'no' } } });
    expect(d.code).toBe('card_declined');
    expect(d.declineCode).toBe('do_not_honor');
    expect(d.intentId).toBe('pi_123');
  });

  it('returns all-null on an empty / unknown error shape', () => {
    expect(extractStripeDecline(undefined)).toEqual({ code: null, declineCode: null, message: null, intentId: null });
    expect(extractStripeDecline({})).toEqual({ code: null, declineCode: null, message: null, intentId: null });
    expect(extractStripeDecline(new Error('boom')).code).toBeNull();
  });
});

describe('decideDunningTransition', () => {
  const now = 1_800_000_000_000; // fixed epoch for deterministic scheduled timestamps

  it('schedules the first transient retry at +1 day', () => {
    const t = decideDunningTransition({ chargeAttempts: 1, dunningAttempts: 0, classification: 'retry', isRetry: false }, now);
    expect(t.state).toBe('scheduled');
    expect(t.newAttempts).toBe(0);
    expect(t.nextRetryAt).toBe(new Date(now + 1 * DAY_MS).toISOString());
  });

  it('increments the cycle counter on a retry and uses the next backoff offset (+3 days)', () => {
    const t = decideDunningTransition({ chargeAttempts: 2, dunningAttempts: 0, classification: 'retry', isRetry: true }, now);
    expect(t.newAttempts).toBe(1);
    expect(t.state).toBe('scheduled');
    expect(t.nextRetryAt).toBe(new Date(now + 3 * DAY_MS).toISOString());
  });

  it('uses the +5 day offset for the last scheduled retry of the cycle', () => {
    const t = decideDunningTransition({ chargeAttempts: 3, dunningAttempts: 1, classification: 'retry', isRetry: true }, now);
    expect(t.newAttempts).toBe(2);
    expect(t.state).toBe('scheduled');
    expect(t.nextRetryAt).toBe(new Date(now + 5 * DAY_MS).toISOString());
  });

  it('exhausts the cycle after the 3rd retry', () => {
    const t = decideDunningTransition({ chargeAttempts: 4, dunningAttempts: 2, classification: 'retry', isRetry: true }, now);
    expect(t.newAttempts).toBe(3);
    expect(t.state).toBe('exhausted');
    expect(t.nextRetryAt).toBeNull();
  });

  it('routes a needs_card decline to needs_card with no scheduled retry', () => {
    const t = decideDunningTransition({ chargeAttempts: 1, dunningAttempts: 0, classification: 'needs_card', isRetry: false }, now);
    expect(t.state).toBe('needs_card');
    expect(t.nextRetryAt).toBeNull();
  });

  it('lets the hard lifetime cap win over everything, even a needs_card decline', () => {
    const t = decideDunningTransition({ chargeAttempts: 8, dunningAttempts: 0, classification: 'needs_card', isRetry: false }, now);
    expect(t.state).toBe('exhausted');
    expect(t.nextRetryAt).toBeNull();
  });

  it('caps at 8 lifetime charge attempts regardless of the cycle counter', () => {
    const t = decideDunningTransition({ chargeAttempts: 8, dunningAttempts: 0, classification: 'retry', isRetry: false }, now);
    expect(t.state).toBe('exhausted');
  });
});
