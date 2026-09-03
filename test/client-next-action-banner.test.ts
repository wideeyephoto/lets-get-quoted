import { describe, it, expect } from 'vitest';
import { clientNextStep } from '@/lib/client-next-step';

describe('Client Dashboard Next Action Step Resolution', () => {
  it('identifies deposit payment as #1 priority when unpaid', () => {
    const next = clientNextStep({
      businessName: 'Royal Oak Plumbing',
      depositPayment: { id: 'pay-123', amount: 500 },
      planStatus: null,
      scheduleOpen: true,
      scheduledLabel: null,
      scheduledPast: false,
      jobStatus: 'in_progress',
      openPayment: null,
      bookingPath: null,
    });

    expect(next.href).toBe('/pay/pay-123');
    expect(next.label).toBe('Pay $500.00 deposit');
    expect(next.copy).toBe('Your deposit is the last step before the work is booked in.');
  });

  it('identifies schedule selection as next step when quote approved and scheduling open', () => {
    const next = clientNextStep({
      businessName: 'Royal Oak Plumbing',
      depositPayment: null,
      planStatus: null,
      scheduleOpen: true,
      scheduledLabel: null,
      scheduledPast: false,
      jobStatus: 'in_progress',
      openPayment: null,
      bookingPath: null,
    });

    expect(next.href).toBe('#dates');
    expect(next.label).toBe('Choose a start date');
    expect(next.copy).toBe('Choose the start date that suits you.');
  });

  it('returns confirmation copy with null href when job is scheduled', () => {
    const next = clientNextStep({
      businessName: 'Royal Oak Plumbing',
      depositPayment: null,
      planStatus: null,
      scheduleOpen: false,
      scheduledLabel: 'Thursday, Sep 10 · 9:00 AM',
      scheduledPast: false,
      jobStatus: 'in_progress',
      openPayment: null,
      bookingPath: null,
    });

    expect(next.href).toBeNull();
    expect(next.label).toBeNull();
    expect(next.copy).toContain('Thursday, Sep 10 · 9:00 AM');
  });
});
