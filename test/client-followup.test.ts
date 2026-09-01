import { describe, expect, it } from 'vitest';
import { toClientFeed } from '@/lib/client-feed';
import { clientNextStep, type NextStepInput } from '@/lib/client-next-step';

describe('client follow-up & rebooking feed presentation', () => {
  it('renders client_followup event in toClientFeed', () => {
    const items = toClientFeed([
      {
        id: 'evt_1',
        kind: 'client_followup',
        title: 'Dana Whitfield requested a follow-up',
        body: 'We noticed a squeak on the front porch step, could someone check it out?',
        amount: null,
        action_url: null,
        created_at: '2026-08-15T14:30:00Z',
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('You requested a follow-up');
    expect(items[0].body).toBe('We noticed a squeak on the front porch step, could someone check it out?');
    expect(items[0].status).toBe('Sent');
    expect(items[0].tone).toBe('info');
    expect(items[0].icon).toBe('message');
  });

  it('renders rebook_requested event in toClientFeed', () => {
    const items = toClientFeed([
      {
        id: 'evt_2',
        kind: 'rebook_requested',
        title: 'Dana Whitfield requested more work',
        body: 'We loved the kitchen remodel! We would like to get an estimate on the master bathroom now.',
        amount: null,
        action_url: null,
        created_at: '2026-08-20T10:00:00Z',
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('You requested more work');
    expect(items[0].body).toBe('We loved the kitchen remodel! We would like to get an estimate on the master bathroom now.');
    expect(items[0].status).toBe('Sent');
    expect(items[0].tone).toBe('info');
    expect(items[0].icon).toBe('tools');
  });
});

describe('clientNextStep completed job actions', () => {
  const baseInput = (over: Partial<NextStepInput> = {}): NextStepInput => ({
    businessName: 'Apex Roofing',
    depositPayment: null,
    planStatus: null,
    scheduleOpen: false,
    scheduledLabel: null,
    scheduledPast: false,
    jobStatus: 'complete',
    openPayment: null,
    ...over,
  });

  it('offers booking link when bookingPath is provided on completed jobs', () => {
    const step = clientNextStep(baseInput({ bookingPath: '/book/apex-roofing' }));
    expect(step.href).toBe('/book/apex-roofing');
    expect(step.label).toBe('Book next project');
    expect(step.copy).toContain('This job is complete');
  });

  it('safely degrades to no button when bookingPath is null on completed jobs', () => {
    const step = clientNextStep(baseInput({ bookingPath: null }));
    expect(step.href).toBeNull();
    expect(step.label).toBeNull();
    expect(step.copy).toBe('This job is complete. Your invoices and receipts are below.');
  });

  it('prioritizes open payments over booking links even on completed jobs', () => {
    const step = clientNextStep(
      baseInput({
        bookingPath: '/book/apex-roofing',
        openPayment: { id: 'pay_99', amount: 350 },
      }),
    );
    expect(step.href).toBe('/pay/pay_99');
    expect(step.label).toBe('Pay $350.00');
  });
});
