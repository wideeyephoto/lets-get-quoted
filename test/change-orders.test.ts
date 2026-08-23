import { describe, it, expect } from 'vitest';
import {
  canSend,
  changeOrderTotal,
  changeOrderTotals,
  isEditable,
  isSettled,
  jobTotalWithChangeOrders,
  marginImpact,
  sendBlockers,
  toClientChangeOrders,
  type ChangeOrder,
  type ChangeOrderStatus,
} from '@/lib/change-orders';
import { buildChangeOrderInput } from '@/lib/change-order-ai';
import type { QuoteItem } from '@/lib/jobs';

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return { id: 'i1', label: 'Replace sheathing', amount: 640, kind: 'base', selected: true, recommended: false, ...overrides };
}

function order(overrides: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: 'co1',
    jobId: 'job1',
    status: 'draft',
    crewId: 'crew1',
    crewName: 'Marcus',
    title: 'Replace rotted sheathing',
    fieldNote: 'Found six sheets of rot under the shingles over the garage.',
    scope: 'Six sheets of roof decking are rotted through and cannot hold a nail.',
    photoPaths: ['acct/1.jpg'],
    items: [item()],
    amount: 640,
    estimatedCost: 380,
    sentAt: null,
    respondedAt: null,
    signatureName: null,
    declineReason: null,
    paymentId: null,
    createdAt: '2026-08-03T10:00:00Z',
    ...overrides,
  };
}

describe('changeOrderTotal', () => {
  it('counts the base and selected add-ons, never subscriptions', () => {
    expect(
      changeOrderTotal([
        item({ id: 'a', amount: 640 }),
        item({ id: 'b', kind: 'addon', selected: true, amount: 100 }),
        item({ id: 'c', kind: 'addon', selected: false, amount: 900 }),
        item({ id: 'd', kind: 'subscription', selected: true, amount: 50 }),
      ]),
    ).toBe(740);
  });
});

describe('sendBlockers', () => {
  it('lets a complete draft go', () => {
    expect(sendBlockers(order())).toEqual([]);
    expect(canSend(order())).toBe(true);
  });

  it('refuses a $0 change order', () => {
    // A free change order reads to a customer as work thrown in, which is
    // exactly the misunderstanding this feature exists to prevent.
    expect(sendBlockers(order({ amount: 0 }))).toContain('Set a price. A $0 change order reads as work thrown in for free.');
  });

  it('refuses one with nothing written', () => {
    expect(sendBlockers(order({ scope: '  ' }))[0]).toContain('Describe the work');
  });

  it('refuses to send the same one twice', () => {
    expect(sendBlockers(order({ status: 'sent' }))).toContain('This is already with the customer.');
    expect(sendBlockers(order({ status: 'approved' }))).toContain('This has already been answered.');
  });
});

describe('isEditable', () => {
  it('freezes everything once it has been sent', () => {
    // Editing the price of something a customer is looking at rewrites a deal
    // under them. Withdraw and raise a new one instead.
    expect(isEditable('draft')).toBe(true);
    for (const status of ['sent', 'approved', 'declined', 'void'] as ChangeOrderStatus[]) {
      expect(isEditable(status)).toBe(false);
    }
  });

  it('knows which states are done', () => {
    expect(isSettled('sent')).toBe(false);
    expect(isSettled('approved')).toBe(true);
    expect(isSettled('declined')).toBe(true);
  });
});

describe('marginImpact', () => {
  it('reports what approving it does to the job', () => {
    const impact = marginImpact({ jobRevenue: 10000, jobCost: 6000, addedRevenue: 640, addedCost: 380 });
    expect(impact.addedMargin).toBeCloseTo(0.40625);
    expect(impact.jobMarginBefore).toBeCloseTo(0.4);
    expect(impact.jobMarginAfter).toBeCloseTo(0.4004, 3);
  });

  it('returns nulls — not 100% — when the added work has no cost', () => {
    // Otherwise every uncosted extra looks like free money, which is the most
    // dangerous possible thing for this particular screen to imply.
    const impact = marginImpact({ jobRevenue: 10000, jobCost: 6000, addedRevenue: 640, addedCost: null });
    expect(impact.addedMargin).toBeNull();
    expect(impact.jobMarginAfter).toBeNull();
    expect(impact.jobMarginBefore).toBeCloseTo(0.4);
  });

  it('shows a change order that loses money as negative rather than hiding it', () => {
    const impact = marginImpact({ jobRevenue: 10000, jobCost: 6000, addedRevenue: 200, addedCost: 500 });
    expect(impact.addedMargin).toBeCloseTo(-1.5);
  });

  it('does not divide by zero on a job with no revenue yet', () => {
    const impact = marginImpact({ jobRevenue: 0, jobCost: 0, addedRevenue: 0, addedCost: 0 });
    expect(impact.jobMarginBefore).toBeNull();
    expect(impact.addedMargin).toBeNull();
  });
});

describe('toClientChangeOrders', () => {
  it('hides drafts and withdrawn ones entirely', () => {
    // A draft is the contractor working something out. Showing it invites an
    // argument about a price they had not decided to charge.
    const visible = toClientChangeOrders([
      order({ id: 'd', status: 'draft' }),
      order({ id: 'v', status: 'void' }),
      order({ id: 's', status: 'sent' }),
    ]);
    expect(visible.map((o) => o.id)).toEqual(['s']);
  });

  it('never leaks cost or margin', () => {
    const [visible] = toClientChangeOrders([order({ status: 'sent' })]);
    expect(JSON.stringify(visible)).not.toContain('380');
    expect(visible).not.toHaveProperty('estimatedCost');
    expect(visible).not.toHaveProperty('crewName');
    expect(visible).not.toHaveProperty('fieldNote');
  });

  it('marks the one that needs an answer', () => {
    const [sent] = toClientChangeOrders([order({ status: 'sent' })]);
    const [approved] = toClientChangeOrders([order({ status: 'approved' })]);
    expect(sent.awaitingDecision).toBe(true);
    expect(sent.statusLabel).toBe('Waiting on you');
    expect(approved.awaitingDecision).toBe(false);
  });

  it('shows a photo count without exposing the paths', () => {
    const [visible] = toClientChangeOrders([order({ status: 'sent', photoPaths: ['a/1.jpg', 'a/2.jpg'] })]);
    expect(visible.photoCount).toBe(2);
    expect(JSON.stringify(visible)).not.toContain('a/1.jpg');
  });
});

describe('changeOrderTotals', () => {
  it('separates money agreed, money waiting, and money never asked for', () => {
    const totals = changeOrderTotals([
      order({ id: '1', status: 'approved', amount: 640 }),
      order({ id: '2', status: 'sent', amount: 300 }),
      order({ id: '3', status: 'declined', amount: 200 }),
      order({ id: '4', status: 'draft', amount: 150 }),
    ]);
    // The last one is the interesting number: work written up on site that
    // nobody ever sent, which is money left on the table.
    expect(totals).toEqual({ approved: 640, awaiting: 300, declined: 200, unsent: 150 });
  });
});

describe('jobTotalWithChangeOrders', () => {
  it('only counts what the customer actually agreed to', () => {
    const orders = [
      order({ id: '1', status: 'approved', amount: 640 }),
      order({ id: '2', status: 'sent', amount: 300 }),
      order({ id: '3', status: 'declined', amount: 200 }),
    ];
    expect(jobTotalWithChangeOrders(10000, orders)).toBe(10640);
  });
});

describe('buildChangeOrderInput', () => {
  it('says "JSON" in the input, not only the instructions', () => {
    // The Responses API 400s without it, that 400 is caught, and the drafter
    // then fails silently on every change order. Same trap as quote-guard-ai.
    expect(buildChangeOrderInput({ accountId: 'acct', trade: 'Roofing', jobScope: 'Re-roof', fieldNote: 'Rot found', photos: [], services: [] })).toMatch(/json/i);
  });

  it('sends the original job so the model does not re-sell it', () => {
    const built = buildChangeOrderInput({ accountId: 'acct', trade: null, jobScope: 'Full re-roof', fieldNote: 'Rot', photos: [], services: [] });
    expect(built).toContain('THE JOB ALREADY SOLD');
    expect(built).toContain('Full re-roof');
  });
});
