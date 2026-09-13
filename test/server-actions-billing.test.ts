import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  headers: vi.fn(async () => new Headers({ host: 'app.letsgetquoted.com', 'x-forwarded-proto': 'https' })),
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
  checkRateLimitStrict: vi.fn(),
  recordAccountEvent: vi.fn(),
  basePlanSubscriptionCancellationEnabled: vi.fn(),
  cancelBasePlanSubscriptionAtPeriodEnd: vi.fn(),
  resumeBasePlanSubscription: vi.fn(),
  cancelPurchasedCapacitySubscriptionAtPeriodEnd: vi.fn(),
  createOrGetRecipientAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  refreshAccountOnboardingStatus: vi.fn(),
  setWorkspaceOverageAuthorization: vi.fn(),
  changeBasePlan: vi.fn(),
  clearScheduledPlanChange: vi.fn(),
  executeBasePlanSubscriptionCheckout: vi.fn(),
  executeTopUpPurchaseCheckout: vi.fn(),
  createCheckoutSessionForPayment: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.requireOwnerContext,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: mocks.checkRateLimitStrict,
}));
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));
vi.mock('@/lib/billing/subscription-cancellation', () => ({
  CANCELLATION_DISABLED_MESSAGE: 'Cancellation disabled',
  basePlanSubscriptionCancellationEnabled: mocks.basePlanSubscriptionCancellationEnabled,
  cancelBasePlanSubscriptionAtPeriodEnd: mocks.cancelBasePlanSubscriptionAtPeriodEnd,
  resumeBasePlanSubscription: mocks.resumeBasePlanSubscription,
  cancelPurchasedCapacitySubscriptionAtPeriodEnd: mocks.cancelPurchasedCapacitySubscriptionAtPeriodEnd,
}));
vi.mock('@/lib/stripe-connect', () => ({
  createOrGetRecipientAccount: mocks.createOrGetRecipientAccount,
  createOnboardingLink: mocks.createOnboardingLink,
  refreshAccountOnboardingStatus: mocks.refreshAccountOnboardingStatus,
}));
vi.mock('@/lib/billing/overage-authorization', () => ({
  setWorkspaceOverageAuthorization: mocks.setWorkspaceOverageAuthorization,
}));
vi.mock('@/lib/billing/plan-change', () => ({
  changeBasePlan: mocks.changeBasePlan,
  clearScheduledPlanChange: mocks.clearScheduledPlanChange,
}));
vi.mock('@/lib/billing/base-plan-subscription-entrypoint', () => ({
  executeBasePlanSubscriptionCheckout: mocks.executeBasePlanSubscriptionCheckout,
}));
vi.mock('@/lib/billing/top-up-purchase-entrypoint', () => ({
  executeTopUpPurchaseCheckout: mocks.executeTopUpPurchaseCheckout,
}));
vi.mock('@/lib/payments', () => ({
  createCheckoutSessionForPayment: mocks.createCheckoutSessionForPayment,
}));

import {
  cancelBasePlanSubscriptionAction,
  resumeBasePlanSubscriptionAction,
  cancelPurchasedCapacitySubscriptionAction,
} from '@/app/dashboard/settings/subscription-cancellation-actions';
import {
  connectStripeAction,
  connectStripeFromBannerAction,
  refreshStripeStatusAction,
  disconnectStripeAction,
} from '@/app/dashboard/stripe-actions';
import { setOverageAuthorizationAction } from '@/app/dashboard/settings/overage-actions';
import {
  changeBasePlanAction,
  cancelScheduledPlanChangeAction,
} from '@/app/dashboard/settings/plan-change-actions';
import { beginBasePlanSubscriptionCheckoutAction } from '@/app/dashboard/settings/subscription-checkout-actions';
import { beginTopUpPurchaseCheckoutAction } from '@/app/dashboard/settings/top-up-checkout-actions';
import { startCheckoutAction } from '@/app/pay/[id]/actions';

describe('Server Actions: Billing & Payments', () => {
  const fakeAdmin = { id: 'fake-admin' };
  const fakeSupabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.requireOwnerContext.mockResolvedValue({
      accountId: 'acc-123',
      userId: 'usr-123',
      userEmail: 'owner@example.com',
      supabase: fakeSupabase,
    });
    mocks.basePlanSubscriptionCancellationEnabled.mockReturnValue(true);
  });

  describe('subscription-cancellation-actions', () => {
    it('returns error when base plan cancellation feature flag is disabled', async () => {
      mocks.basePlanSubscriptionCancellationEnabled.mockReturnValue(false);
      const res = await cancelBasePlanSubscriptionAction();
      expect(res).toEqual({ ok: false, error: 'Cancellation disabled' });
    });

    it('enforces rate limits on base plan cancellation', async () => {
      mocks.checkRateLimitStrict.mockResolvedValue(false);
      const res = await cancelBasePlanSubscriptionAction();
      expect(res).toEqual({
        ok: false,
        error: 'Too many attempts just now. Wait a few minutes and try again.',
      });
      expect(mocks.cancelBasePlanSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('cancels base plan subscription and revalidates path on success', async () => {
      mocks.cancelBasePlanSubscriptionAtPeriodEnd.mockResolvedValue({
        ok: true,
        alreadyScheduled: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });

      const res = await cancelBasePlanSubscriptionAction();
      expect(res).toEqual({
        ok: true,
        alreadyScheduled: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });
      expect(mocks.cancelBasePlanSubscriptionAtPeriodEnd).toHaveBeenCalledWith({
        admin: fakeAdmin,
        accountId: 'acc-123',
        actorEmail: 'owner@example.com',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });

    it('resumes base plan subscription on success', async () => {
      mocks.resumeBasePlanSubscription.mockResolvedValue({
        ok: true,
        alreadyActive: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });

      const res = await resumeBasePlanSubscriptionAction();
      expect(res).toEqual({
        ok: true,
        alreadyActive: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });
      expect(mocks.resumeBasePlanSubscription).toHaveBeenCalledWith({
        admin: fakeAdmin,
        accountId: 'acc-123',
        actorEmail: 'owner@example.com',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });

    it('validates subscription ID format when cancelling purchased capacity', async () => {
      const invalid = await cancelPurchasedCapacitySubscriptionAction('invalid_id');
      expect(invalid).toEqual({ ok: false, error: 'A valid subscription ID is required.' });

      mocks.cancelPurchasedCapacitySubscriptionAtPeriodEnd.mockResolvedValue({
        ok: true,
        alreadyScheduled: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });

      const valid = await cancelPurchasedCapacitySubscriptionAction('sub_12345');
      expect(valid).toEqual({
        ok: true,
        alreadyScheduled: false,
        currentPeriodEnd: '2026-10-01T00:00:00Z',
      });
      expect(mocks.cancelPurchasedCapacitySubscriptionAtPeriodEnd).toHaveBeenCalledWith({
        admin: fakeAdmin,
        accountId: 'acc-123',
        stripeSubscriptionId: 'sub_12345',
        actorEmail: 'owner@example.com',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });
  });

  describe('stripe-actions', () => {
    it('redirects to generated Stripe onboarding URL', async () => {
      fakeSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { business_name: 'Acme Plumbing' }, error: null }),
          }),
        }),
      });
      fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'plumber@acme.test' } } });
      mocks.createOrGetRecipientAccount.mockResolvedValue('acct_stripe123');
      mocks.createOnboardingLink.mockResolvedValue('https://connect.stripe.com/setup/123');

      await expect(connectStripeAction()).rejects.toThrow('NEXT_REDIRECT:https://connect.stripe.com/setup/123');
      expect(mocks.createOrGetRecipientAccount).toHaveBeenCalledWith(
        fakeSupabase,
        'acc-123',
        'Acme Plumbing',
        'plumber@acme.test',
      );
    });

    it('handles banner connect failures gracefully by redirecting to settings', async () => {
      fakeSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
          }),
        }),
      });

      await expect(connectStripeFromBannerAction()).rejects.toThrow('NEXT_REDIRECT:/dashboard/settings#payments');
    });

    it('refreshes onboarding status when stripe_connect_id exists', async () => {
      fakeSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { stripe_connect_id: 'acct_123' }, error: null }),
          }),
        }),
      });

      await refreshStripeStatusAction();
      expect(mocks.refreshAccountOnboardingStatus).toHaveBeenCalledWith(fakeSupabase, 'acc-123', 'acct_123');
    });

    it('disconnects Stripe account cleanly', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      fakeSupabase.from.mockReturnValue({ update: updateMock });

      await disconnectStripeAction();
      expect(updateMock).toHaveBeenCalledWith({ stripe_connect_id: null, connect_onboarded: false });
    });
  });

  describe('overage-actions', () => {
    it('validates input types and dollar amounts', async () => {
      const badEnabled = await setOverageAuthorizationAction('true', 50);
      expect(badEnabled.ok).toBe(false);

      const nanAmount = await setOverageAuthorizationAction(true, 'not-a-number');
      expect(nanAmount).toEqual({ ok: false, error: 'Enter a spending limit, like 50.' });

      const negativeAmount = await setOverageAuthorizationAction(true, -5);
      expect(negativeAmount).toEqual({ ok: false, error: 'Enter a spending limit above zero.' });

      const tooHigh = await setOverageAuthorizationAction(true, 50000);
      expect(tooHigh.ok).toBe(false);
      expect(tooHigh.error).toMatch(/higher than we can accept/);
    });

    it('enforces rate limit for overage changes', async () => {
      mocks.checkRateLimitStrict.mockResolvedValue(false);
      const res = await setOverageAuthorizationAction(true, 50);
      expect(res).toEqual({
        ok: false,
        error: 'Too many changes just now. Wait a few minutes and try again.',
      });
    });

    it('saves overage authorization and records account event when changed', async () => {
      mocks.setWorkspaceOverageAuthorization.mockResolvedValue({
        ok: true,
        changed: true,
        enabled: true,
        capCents: 5000,
      });

      const res = await setOverageAuthorizationAction(true, 50);
      expect(res.ok).toBe(true);
      expect(mocks.setWorkspaceOverageAuthorization).toHaveBeenCalledWith({
        supabase: fakeSupabase,
        accountId: 'acc-123',
        enabled: true,
        capCents: 5000,
      });
      expect(mocks.recordAccountEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-123',
          kind: 'overage_authorization_changed',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });
  });

  describe('plan-change-actions', () => {
    it('validates plan codes and billing intervals', async () => {
      const badPlan = await changeBasePlanAction('super-enterprise-unknown', 'monthly');
      expect(badPlan).toEqual({ ok: false, error: 'That is not a plan we can move you to.' });

      const badInterval = await changeBasePlanAction('starter', 'bi-weekly');
      expect(badInterval).toEqual({ ok: false, error: 'That is not a plan we can move you to.' });
    });

    it('executes base plan changes and revalidates settings', async () => {
      mocks.changeBasePlan.mockResolvedValue({ ok: true, planCode: 'growth', effectiveAt: 'immediately' });

      const res = await changeBasePlanAction('growth', 'monthly');
      expect(res).toEqual({ ok: true, planCode: 'growth', effectiveAt: 'immediately' });
      expect(mocks.changeBasePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-123',
          targetPlanCode: 'growth',
          targetBillingInterval: 'monthly',
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });

    it('clears scheduled plan change', async () => {
      mocks.clearScheduledPlanChange.mockResolvedValue({ ok: true });

      const res = await cancelScheduledPlanChangeAction();
      expect(res).toEqual({ ok: true });
      expect(mocks.clearScheduledPlanChange).toHaveBeenCalledWith({
        admin: fakeAdmin,
        accountId: 'acc-123',
        actorEmail: 'owner@example.com',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });
  });

  describe('checkout and pay actions', () => {
    it('delegates base plan checkout to entrypoint', async () => {
      const form = new FormData();
      mocks.executeBasePlanSubscriptionCheckout.mockResolvedValue({ ok: true, redirectUrl: 'https://stripe.test/chk' });

      const res = await beginBasePlanSubscriptionCheckoutAction(null, form);
      expect(res).toEqual({ ok: true, redirectUrl: 'https://stripe.test/chk' });
      expect(mocks.executeBasePlanSubscriptionCheckout).toHaveBeenCalledWith(form);
    });

    it('delegates top-up checkout to entrypoint', async () => {
      const form = new FormData();
      mocks.executeTopUpPurchaseCheckout.mockResolvedValue({ ok: true, redirectUrl: 'https://stripe.test/topup' });

      const res = await beginTopUpPurchaseCheckoutAction(null, form);
      expect(res).toEqual({ ok: true, redirectUrl: 'https://stripe.test/topup' });
      expect(mocks.executeTopUpPurchaseCheckout).toHaveBeenCalledWith(form);
    });

    it('initiates direct payment checkout and redirects', async () => {
      mocks.createCheckoutSessionForPayment.mockResolvedValue('https://checkout.stripe.com/pay/123');

      await expect(startCheckoutAction('pay-999')).rejects.toThrow(
        'NEXT_REDIRECT:https://checkout.stripe.com/pay/123',
      );
      expect(mocks.createCheckoutSessionForPayment).toHaveBeenCalledWith(
        'pay-999',
        'https://app.letsgetquoted.com',
      );
    });
  });
});
