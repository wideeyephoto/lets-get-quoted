import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PRICING_CATALOG_VERSION,
  TOP_UPS,
  TOP_UPS_WITHHELD,
  type TopUpId,
} from '@/lib/billing/catalog';
import {
  PURCHASED_LOT_SOURCE_TYPE,
  TOP_UP_PURCHASE_FLAG,
  TopUpPurchaseError,
  buildTopUpCheckoutParams,
  fulfillmentFromMetadata,
  grantPurchasedTopUpCredits,
  requireSellableTopUp,
  resolveTopUpPrice,
  topUpPurchaseEnabled,
} from '@/lib/billing/top-up-purchase';

const priceFor = (overrides: Record<string, unknown> = {}) => ({
  id: 'price_test',
  object: 'price',
  active: true,
  currency: 'usd',
  unit_amount: TOP_UPS.text_1000.priceCents,
  tax_behavior: 'exclusive',
  recurring: null,
  product: 'prod_test',
  metadata: {
    lgq_price_purpose: 'top_up',
    lgq_top_up_id: 'text_1000',
    lgq_resource_code: 'text_segments',
    lgq_units: '1000',
    lgq_catalog_version: PRICING_CATALOG_VERSION,
  },
  ...overrides,
});
const searchReturning = (data: unknown[]) => vi.fn(async () => ({ data } as never));

describe('top-up purchase', () => {
  it('is dark unless the flag is exactly 1', () => {
    expect(topUpPurchaseEnabled({})).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: 'true' })).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: '01' })).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: '1' })).toBe(true);
  });

  it('refuses the SKUs that are published but withheld', () => {
    // They remain in the price book; what is withheld is the sale.
    for (const id of Object.keys(TOP_UPS_WITHHELD)) {
      expect(() => requireSellableTopUp(id, 'scale')).toThrow(TopUpPurchaseError);
      try {
        requireSellableTopUp(id, 'scale');
      } catch (error) {
        expect((error as TopUpPurchaseError).code).toBe('sku_withheld');
      }
      expect(TOP_UPS[id as TopUpId]).toBeTruthy();
    }
  });

  it('keeps the Flex-only pack away from paid plans', () => {
    // 250 credits for $12 is a better per-credit rate than the $42/1,000 pack.
    // Selling it to a paid plan would be an unpriced discount.
    expect(requireSellableTopUp('flex_text_250', 'flex').id).toBe('flex_text_250');
    try {
      requireSellableTopUp('flex_text_250', 'growth');
      throw new Error('should have refused');
    } catch (error) {
      expect((error as TopUpPurchaseError).code).toBe('plan_ineligible');
    }
  });

  it('rejects an unknown SKU rather than treating it as free', () => {
    try {
      requireSellableTopUp('text_999999', 'flex');
      throw new Error('should have refused');
    } catch (error) {
      expect((error as TopUpPurchaseError).code).toBe('unknown_sku');
    }
  });

  it('resolves a Price that matches the catalog', async () => {
    const resolved = await resolveTopUpPrice(searchReturning([priceFor()]), TOP_UPS.text_1000);
    expect(resolved).toMatchObject({ priceId: 'price_test', productId: 'prod_test' });
    expect(resolved.unitAmountCents).toBe(TOP_UPS.text_1000.priceCents);
  });

  it('refuses a Price whose amount drifted from the catalog', async () => {
    // A Price is customer-visible money living outside this repository; nothing
    // stops an amount being edited in the dashboard.
    const search = searchReturning([priceFor({ unit_amount: 9_900 })]);
    await expect(resolveTopUpPrice(search, TOP_UPS.text_1000)).rejects.toMatchObject({
      code: 'price_contract_mismatch',
    });
  });

  it('refuses when two active Prices claim the same SKU', async () => {
    const search = searchReturning([priceFor(), priceFor({ id: 'price_other' })]);
    await expect(resolveTopUpPrice(search, TOP_UPS.text_1000)).rejects.toMatchObject({
      code: 'price_ambiguous',
    });
  });

  it('refuses when no Price exists at this catalog version', async () => {
    await expect(resolveTopUpPrice(searchReturning([]), TOP_UPS.text_1000)).rejects.toMatchObject({
      code: 'price_not_found',
    });
  });

  it('bills a credit pack once and storage monthly', () => {
    // Reversing these would charge a one-time pack every month forever.
    const oneOff = buildTopUpCheckoutParams({
      accountId: 'acct-1',
      sku: TOP_UPS.text_1000,
      price: { priceId: 'price_a', productId: 'prod_a', unitAmountCents: 4_200, recurring: false },
      successUrl: 'https://app.letsgetquoted.com/ok',
      cancelUrl: 'https://app.letsgetquoted.com/no',
    });
    expect(oneOff.mode).toBe('payment');
    expect(oneOff.subscription_data).toBeUndefined();

    const recurring = buildTopUpCheckoutParams({
      accountId: 'acct-1',
      sku: TOP_UPS.storage_100gb,
      price: { priceId: 'price_b', productId: 'prod_b', unitAmountCents: 1_500, recurring: true },
      successUrl: 'https://app.letsgetquoted.com/ok',
      cancelUrl: 'https://app.letsgetquoted.com/no',
    });
    expect(recurring.mode).toBe('subscription');
    expect(recurring.payment_intent_data).toBeUndefined();
  });

  it('carries the workspace on the Session and the resulting object', () => {
    const params = buildTopUpCheckoutParams({
      accountId: 'acct-42',
      sku: TOP_UPS.ai_intake_100,
      price: { priceId: 'price_c', productId: 'prod_c', unitAmountCents: 1_500, recurring: false },
      successUrl: 'https://app.letsgetquoted.com/ok',
      cancelUrl: 'https://app.letsgetquoted.com/no',
    });
    expect(params.metadata).toMatchObject({ lgq_purpose: 'top_up', lgq_account_id: 'acct-42' });
    // Fulfillment reads whichever object Stripe hands back, so both must carry it.
    expect(params.payment_intent_data?.metadata).toMatchObject({ lgq_account_id: 'acct-42' });
  });

  it('ignores metadata that is not a top-up', () => {
    expect(fulfillmentFromMetadata({ lgq_purpose: 'base_plan' }, 'k')).toBeNull();
    expect(fulfillmentFromMetadata(null, 'k')).toBeNull();
    expect(fulfillmentFromMetadata({ lgq_purpose: 'top_up' }, 'k')).toBeNull();
  });

  it('takes the granted quantity from the catalog, never from the metadata copy', () => {
    // The metadata proves WHICH SKU was bought. How much it grants is the
    // catalog's answer — otherwise an edited Stripe object could mint credits.
    const fulfillment = fulfillmentFromMetadata({
      lgq_purpose: 'top_up',
      lgq_top_up_id: 'ai_intake_100',
      lgq_account_id: 'acct-9',
      lgq_units: '999999',
      lgq_catalog_version: PRICING_CATALOG_VERSION,
    }, 'evt_1');
    expect(fulfillment?.units).toBe(TOP_UPS.ai_intake_100.units);
    expect(fulfillment?.resourceCode).toBe('ai_intake_threads');
  });

  it('grants a never-expiring purchased lot', async () => {
    // Typed params on purpose: an untyped vi.fn gives mock.calls the empty
    // tuple, so the assertions below become compile errors rather than checks.
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => (
      { data: 'lot-1', error: null }
    ));
    const admin = { rpc } as unknown as SupabaseClient;
    const id = await grantPurchasedTopUpCredits(admin, {
      accountId: 'acct-9',
      resourceCode: 'text_segments',
      units: 1_000,
      idempotencyKey: 'evt_abc',
      catalogVersion: PRICING_CATALOG_VERSION,
    });
    expect(id).toBe('lot-1');
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_source_type).toBe(PURCHASED_LOT_SOURCE_TYPE);
    // The database also enforces this; passing it explicitly keeps the appendix
    // rule readable at the call site.
    expect(args.p_expires_at).toBeNull();
    expect(args.p_idempotency_key).toBe('evt_abc');
  });

  it('does not leak Stripe detail when a grant fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '23503', message: 'workspace not found' } }));
    const admin = { rpc } as unknown as SupabaseClient;
    await expect(grantPurchasedTopUpCredits(admin, {
      accountId: 'acct-9',
      resourceCode: 'text_segments',
      units: 1_000,
      idempotencyKey: 'evt_abc',
      catalogVersion: PRICING_CATALOG_VERSION,
    })).rejects.toThrow(/23503/);
  });
});
