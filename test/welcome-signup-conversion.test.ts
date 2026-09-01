import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  basePlanSubscriptionCheckoutEnabled: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  planUsageDashboardEnabled: vi.fn(),
  recordAccountEvent: vi.fn(),
  requireOwnerContext: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  sendContractorWelcomeEmail: vi.fn(),
  sendFounderSignupAlert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.requireOwnerContext,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/billing/base-plan-subscription-entrypoint', () => ({
  basePlanSubscriptionCheckoutEnabled: mocks.basePlanSubscriptionCheckoutEnabled,
}));

vi.mock('@/lib/billing/plan-usage', () => ({
  planUsageDashboardEnabled: mocks.planUsageDashboardEnabled,
}));

vi.mock('@/lib/founder-alerts', () => ({
  sendFounderSignupAlert: mocks.sendFounderSignupAlert,
}));

vi.mock('@/lib/contractor-lifecycle-emails', () => ({
  sendContractorWelcomeEmail: mocks.sendContractorWelcomeEmail,
}));

import { completeFirstRunAction } from '@/app/welcome/actions';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

const validInput = {
  businessName: 'Test Roofing Co.',
  trade: '',
  postalCode: '10001',
  accepted: true,
};

function ownerContext(account: Record<string, unknown> | null) {
  return {
    supabase: { from: mocks.from },
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    account,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { id: ACCOUNT_ID }, error: null });

  mocks.requireOwnerContext.mockResolvedValue(ownerContext({ terms_accepted_at: null }));
  mocks.recordAccountEvent.mockResolvedValue(undefined);
  mocks.sendContractorWelcomeEmail.mockResolvedValue(undefined);
  mocks.sendFounderSignupAlert.mockResolvedValue(undefined);
  mocks.planUsageDashboardEnabled.mockReturnValue(false);
  mocks.basePlanSubscriptionCheckoutEnabled.mockReturnValue(false);
});

describe('first-run signup conversion eligibility', () => {
  it('returns one stable opaque transaction ID only after a new account is persisted', async () => {
    const result = await completeFirstRunAction(validInput);
    const expectedDigest = createHash('sha256')
      .update(`lgq-signup:${ACCOUNT_ID}`)
      .digest('hex')
      .slice(0, 32);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful first-run result.');

    expect(result.signupConversionTransactionId).toBe(`signup_${expectedDigest}`);
    expect(result.signupConversionTransactionId).not.toContain(ACCOUNT_ID);
    expect(mocks.sendFounderSignupAlert).toHaveBeenCalledTimes(1);
    expect(mocks.sendContractorWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it('does not mark returning Terms acceptance as a signup or resend activation messages', async () => {
    mocks.requireOwnerContext.mockResolvedValue(ownerContext({
      terms_accepted_at: '2026-08-01T12:00:00.000Z',
      terms_version: '2026-07-01',
    }));

    const result = await completeFirstRunAction(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected updated Terms acceptance to succeed.');
    expect(result.signupConversionTransactionId).toBeNull();
    expect(mocks.sendFounderSignupAlert).not.toHaveBeenCalled();
    expect(mocks.sendContractorWelcomeEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the pre-update account state is unavailable', async () => {
    mocks.requireOwnerContext.mockResolvedValue(ownerContext(null));

    const result = await completeFirstRunAction(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected the account update to succeed.');
    expect(result.signupConversionTransactionId).toBeNull();
    expect(mocks.sendFounderSignupAlert).not.toHaveBeenCalled();
    expect(mocks.sendContractorWelcomeEmail).not.toHaveBeenCalled();
  });

  it('returns no conversion-eligible result when validation or persistence fails', async () => {
    const validationFailure = await completeFirstRunAction({ ...validInput, accepted: false });
    expect(validationFailure).toEqual({
      ok: false,
      error: 'Please accept the Terms of Service to continue.',
    });
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });
    const databaseFailure = await completeFirstRunAction(validInput);
    expect(databaseFailure).toEqual({
      ok: false,
      error: 'Something went wrong saving that. Try again.',
    });

    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const zeroRowUpdate = await completeFirstRunAction(validInput);
    expect(zeroRowUpdate).toEqual({
      ok: false,
      error: 'Something went wrong saving that. Try again.',
    });

    expect(mocks.sendFounderSignupAlert).not.toHaveBeenCalled();
    expect(mocks.sendContractorWelcomeEmail).not.toHaveBeenCalled();
  });

  it('preserves conversion eligibility through the paid-plan intent branch', async () => {
    const result = await completeFirstRunAction({
      ...validInput,
      plan: 'growth',
      billing: 'monthly',
      goal: 'choose_plan',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected paid-plan intent to succeed.');
    expect(result.signupConversionTransactionId).toMatch(/^signup_[a-f0-9]{32}$/);
    expect(result.planCheckoutPath).toBeNull();
    expect(mocks.recordAccountEvent).toHaveBeenCalledTimes(1);
  });
});
