import { describe, it, expect } from 'vitest';

import { buildAdBudgetCheckoutIdempotencyKey } from '@/lib/ad-billing';

/**
 * The ad-budget checkout route accepts an idempotency key from its caller.
 * Stripe scopes idempotency keys per PLATFORM account, so before this binding
 * every workspace shared one flat namespace and any authenticated account could
 * occupy a key string another account might use.
 */
describe('buildAdBudgetCheckoutIdempotencyKey', () => {
  const KEY = 'checkout-attempt-1';

  it('is deterministic for one account and key, so a retry reuses it', () => {
    expect(buildAdBudgetCheckoutIdempotencyKey('acc_alpha', KEY))
      .toBe(buildAdBudgetCheckoutIdempotencyKey('acc_alpha', KEY));
  });

  it('separates two accounts that send the identical caller key', () => {
    // The finding itself: without this, account B claiming "checkout-attempt-1"
    // collides with account A's in Stripe's namespace.
    expect(buildAdBudgetCheckoutIdempotencyKey('acc_alpha', KEY))
      .not.toBe(buildAdBudgetCheckoutIdempotencyKey('acc_beta', KEY));
  });

  it('separates two keys from one account', () => {
    expect(buildAdBudgetCheckoutIdempotencyKey('acc_alpha', 'first'))
      .not.toBe(buildAdBudgetCheckoutIdempotencyKey('acc_alpha', 'second'));
  });

  it('does not let a caller forge another account\'s key by splicing the separator', () => {
    // Concatenation without a separator would make ("acc_a", "bc") and
    // ("acc_ab", "c") the same key. The NUL join is what prevents it.
    expect(buildAdBudgetCheckoutIdempotencyKey('acc_a', 'bc'))
      .not.toBe(buildAdBudgetCheckoutIdempotencyKey('acc_ab', 'c'));
  });

  it('bounds the key well inside Stripe\'s 255-character limit whatever the caller sends', () => {
    const enormous = 'x'.repeat(50_000);
    const key = buildAdBudgetCheckoutIdempotencyKey('acc_alpha', enormous);
    expect(key.length).toBeLessThanOrEqual(255);
    expect(key).toMatch(/^lgq:ad-budget:v1:checkout\.create:[0-9a-f]{64}$/);
  });

  it('never echoes the caller\'s string back into the key', () => {
    const key = buildAdBudgetCheckoutIdempotencyKey('acc_alpha', 'secret-marker-value');
    expect(key).not.toContain('secret-marker-value');
    expect(key).not.toContain('acc_alpha');
  });

  it('refuses an empty account rather than producing an unbound key', () => {
    expect(() => buildAdBudgetCheckoutIdempotencyKey('', KEY)).toThrow();
    expect(() => buildAdBudgetCheckoutIdempotencyKey('   ', KEY)).toThrow();
  });
});
