import { describe, expect, it } from 'vitest';
import { decidePlanTransition, isSelfServicePaidPlan } from '@/lib/billing/plan-transition';

describe('approved plan-transition policy', () => {
  it('starts a paid plan only after successful subscription payment', () => {
    const decision = decidePlanTransition(
      { planCode: 'flex', billingInterval: 'none' },
      { planCode: 'solo', billingInterval: 'annual' },
    );

    expect(decision).toMatchObject({
      kind: 'activate_after_payment',
      paymentMode: 'new_subscription',
      platformFeeEffective: 'payment_charge_created_after_activation',
      targetSnapshot: { planCode: 'solo', billingInterval: 'annual', platformFeeBps: 50 },
    });
    expect(decision.kind === 'activate_after_payment' && decision.creditGrants).toHaveLength(4);
  });

  it('invoices a paid capacity upgrade and does not reset consumed usage', () => {
    const decision = decidePlanTransition(
      { planCode: 'solo', billingInterval: 'monthly' },
      { planCode: 'growth', billingInterval: 'monthly' },
    );

    expect(decision).toMatchObject({
      kind: 'activate_after_payment',
      paymentMode: 'invoice_proration',
      creditGrants: [
        { resourceCode: 'text_segments', units: 1_000 },
        { resourceCode: 'marketing_email_sends', units: 2_000 },
        { resourceCode: 'ai_intake_threads', units: 250 },
        { resourceCode: 'ai_writing_drafts', units: 200 },
      ],
    });
  });

  it('schedules lower capacity, Flex, and cycle-only changes at renewal', () => {
    expect(decidePlanTransition(
      { planCode: 'growth', billingInterval: 'monthly' },
      { planCode: 'solo', billingInterval: 'monthly' },
    ).kind).toBe('schedule_at_renewal');

    expect(decidePlanTransition(
      { planCode: 'solo', billingInterval: 'annual' },
      { planCode: 'flex', billingInterval: 'none' },
    ).kind).toBe('schedule_at_renewal');

    expect(decidePlanTransition(
      { planCode: 'growth', billingInterval: 'monthly' },
      { planCode: 'growth', billingInterval: 'annual' },
    ).kind).toBe('schedule_at_renewal');
  });

  it('does nothing for the exact current selection and rejects invalid intervals', () => {
    expect(decidePlanTransition(
      { planCode: 'scale', billingInterval: 'annual' },
      { planCode: 'scale', billingInterval: 'annual' },
    ).kind).toBe('no_change');

    expect(() => decidePlanTransition(
      { planCode: 'flex', billingInterval: 'monthly' },
      { planCode: 'solo', billingInterval: 'monthly' },
    )).toThrow(/current flex/i);
    expect(() => decidePlanTransition(
      { planCode: 'flex', billingInterval: 'none' },
      { planCode: 'growth', billingInterval: 'none' },
    )).toThrow(/target paid/i);
  });

  it('keeps Enterprise out of self-service plan mechanics', () => {
    expect(isSelfServicePaidPlan('flex')).toBe(false);
    expect(isSelfServicePaidPlan('solo')).toBe(true);
    expect(isSelfServicePaidPlan('growth')).toBe(true);
    expect(isSelfServicePaidPlan('scale')).toBe(true);
  });
});
