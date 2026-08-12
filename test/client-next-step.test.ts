import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientNextStep, type NextStepInput } from '@/lib/client-next-step';

const PAGE = readFileSync(join(process.cwd(), 'src/app/client/jobs/[token]/page.tsx'), 'utf8');

const input = (over: Partial<NextStepInput> = {}): NextStepInput => ({
  businessName: 'Lawn & Order Landscapers',
  depositPayment: null,
  planStatus: null,
  scheduleOpen: false,
  scheduledLabel: null,
  openPayment: null,
  ...over,
});

describe('the customer\'s next step', () => {
  /**
   * THE BUG THIS FUNCTION EXISTS FOR.
   *
   * An approved job with a payment plan awaiting its deposit AND an open
   * scheduling request rendered "Set up how you would like to pay…" above a
   * button labelled "Choose a start date" that linked to #dates. The page
   * renders `scheduleSection` as null while a plan is pending, so #dates was
   * not on the page: the button did nothing at all when pressed.
   */
  it('never sends a pending plan to #dates', () => {
    const step = clientNextStep(input({ planStatus: 'pending_deposit', scheduleOpen: true }));
    expect(step.href).toBe('#plan');
    expect(step.label).toBe('Set up payment');
    expect(step.copy).toContain('Set up how you would like to pay');
  });

  /** The page must actually contain whatever this function points at. */
  it('only ever points at an anchor the page renders', () => {
    const anchors = new Set<string>();
    for (const match of PAGE.matchAll(/id="([a-z-]+)"/g)) anchors.add(`#${match[1]}`);

    const cases: NextStepInput[] = [
      input({ planStatus: 'pending_deposit', scheduleOpen: true }),
      input({ planStatus: 'pending_deposit' }),
      input({ scheduleOpen: true }),
      input({ scheduleOpen: true, scheduledLabel: 'Mon 6 Oct' }),
    ];
    for (const c of cases) {
      const { href } = clientNextStep(c);
      if (href?.startsWith('#')) expect(anchors, href).toContain(href);
    }
  });

  it('agrees with itself: a button always has both a link and words', () => {
    const cases: NextStepInput[] = [
      input(),
      input({ depositPayment: { id: 'pay_1', amount: 1750 } }),
      input({ planStatus: 'pending_deposit' }),
      input({ scheduleOpen: true }),
      input({ openPayment: { id: 'pay_2', amount: 500 } }),
      input({ scheduledLabel: 'Mon 6 Oct' }),
      input({ planStatus: 'active', scheduledLabel: 'Mon 6 Oct' }),
    ];
    for (const c of cases) {
      const step = clientNextStep(c);
      expect(Boolean(step.href), JSON.stringify(c)).toBe(Boolean(step.label));
      expect(step.copy.length).toBeGreaterThan(0);
    }
  });

  it('puts the deposit above everything — the page gates on it', () => {
    const step = clientNextStep(
      input({
        depositPayment: { id: 'pay_1', amount: 1750 },
        planStatus: 'pending_deposit',
        scheduleOpen: true,
        openPayment: { id: 'pay_2', amount: 500 },
      }),
    );
    expect(step.href).toBe('/pay/pay_1');
    expect(step.label).toBe('Pay $1,750.00 deposit');
  });

  /** A confirmed date is news, not a task, so anything still owed outranks it. */
  it('asks for a waiting payment even once the date is set', () => {
    const step = clientNextStep(input({ scheduledLabel: 'Mon 6 Oct', openPayment: { id: 'pay_2', amount: 500 } }));
    expect(step.href).toBe('/pay/pay_2');
    expect(step.label).toBe('Pay $500.00');
  });

  it('says who will be in touch when there is nothing to do', () => {
    const step = clientNextStep(input());
    expect(step.href).toBeNull();
    expect(step.label).toBeNull();
    expect(step.copy).toBe('Lawn & Order Landscapers will be in touch about scheduling.');
  });

  it('reports a confirmed date with no button on it', () => {
    const step = clientNextStep(input({ scheduledLabel: 'Mon 6 Oct' }));
    expect(step.copy).toBe('See you on Mon 6 Oct.');
    expect(step.href).toBeNull();
  });

  /** The three used to be built separately, which is what let them disagree. */
  it('is the page\'s only source for all three', () => {
    expect(PAGE).toContain('clientNextStep({');
    expect(PAGE).toContain('const { copy: nextStep, href: nextHref, label: nextLabel } = next;');
    expect(PAGE).not.toMatch(/const nextHref =/);
    expect(PAGE).not.toMatch(/const nextLabel =/);
  });
});
