import { describe, it, expect } from 'vitest';
import { buildPipelineChecklist, deriveJobListBadge } from '@/lib/job-badges';
import type { Job } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';
import type { Payment } from '@/lib/payments';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'job-1',
  account_id: 'acct-1',
  ref: 'J-1001',
  client_name: 'Victor Amadi',
  client_phone: null,
  client_email: null,
  address: null,
  scope: null,
  status: 'new_lead',
  scheduled_for: null,
  scheduled_time: null,
  estimated_hours: null,
  quoted_amount: 0,
  deposit_gate: null,
  quote_items: null,
  client_id: null,
  photo_paths: [],
  created_at: '2026-07-30T12:00:00.000Z',
  ...over,
});

const paid = (amount: number): Payment => ({ status: 'paid', amount } as unknown as Payment);
const requested = (): Payment => ({ status: 'requested', amount: 100 } as unknown as Payment);
const invoice = (status: Invoice['status'], total = 0): Invoice => ({ status, total } as unknown as Invoice);

const checklist = (j: Job, payments: Payment[] = [], invoices: Invoice[] = [], links = 0) =>
  buildPipelineChecklist(j, payments, invoices, links, null);
const badge = (j: Job, payments: Payment[] = [], invoices: Invoice[] = [], links = 0) =>
  deriveJobListBadge(j, payments, invoices, links);

describe('the header badge and the pipeline checklist agree', () => {
  // The bug this file exists for: the badge named the next action while the
  // checklist row directly beside it named the milestone, about the same job.
  it('names the quote step the same way the badge does', () => {
    const quotedButUnsent = job({ quoted_amount: 11800 });
    expect(badge(quotedButUnsent).label).toBe('Send to client');
    expect(checklist(quotedButUnsent)[0].label).toBe('Send to client');
    expect(checklist(quotedButUnsent)[0].complete).toBe(false);
  });

  it('says the price is missing in both places when there is no amount yet', () => {
    const noQuote = job();
    expect(badge(noQuote).label).toBe('Needs price');
    expect(checklist(noQuote)[0].label).toBe('Needs price');
  });

  it('only says it went out once a client link exists', () => {
    const shared = job({ quoted_amount: 11800 });
    expect(badge(shared, [], [], 1).label).toBe('Awaiting approval');
    expect(checklist(shared, [], [], 1)[0].label).toBe('Sent to client');
    expect(checklist(shared, [], [], 1)[0].complete).toBe(true);
  });

  // The whole point of the rename: "Add quote" and "Send quote" were three
  // characters apart and both parsed as "quote stuff to do".
  it('gives the three quote states no words in common', () => {
    const labels = [
      badge(job()).label,
      badge(job({ quoted_amount: 11800 })).label,
      badge(job({ quoted_amount: 11800 }), [], [], 1).label,
    ];
    const words = labels.flatMap((label) => label.toLowerCase().split(/\s+/));
    expect(new Set(words).size).toBe(words.length);
  });

  it('explains each quote state on hover', () => {
    expect(badge(job()).title).toBeTruthy();
    expect(badge(job({ quoted_amount: 11800 })).title).toBeTruthy();
    expect(badge(job({ quoted_amount: 11800 }), [], [], 1).title).toBeTruthy();
  });
});

describe('no step claims something that has not happened', () => {
  it('never shows a past-tense label on an unfinished step', () => {
    // Every combination that leaves steps open — a finished-sounding name on an
    // open step is the whole defect, so assert it across the board rather than
    // on the one row that was reported.
    const cases: Job[] = [
      job(),
      job({ quoted_amount: 11800 }),
      job({ quoted_amount: 11800, status: 'in_progress' }),
      job({ quoted_amount: 11800, scheduled_for: '2026-08-04' }),
    ];
    const pastTense = ['Sent to client', 'Quote approved', 'Scheduled / underway', 'Invoice / payment requested', 'Paid / signed off'];

    for (const j of cases) {
      for (const step of checklist(j)) {
        if (!step.complete) expect(pastTense).not.toContain(step.label);
      }
    }
  });

  it('never shows an outstanding-action label on a finished step', () => {
    const done = job({ quoted_amount: 11800, status: 'complete', scheduled_for: '2026-08-04' });
    const todo = ['Needs price', 'Send to client', 'Awaiting approval', 'Schedule the work', 'Request payment', 'Awaiting payment'];

    for (const step of checklist(done, [paid(11800)], [invoice('paid', 11800)], 1)) {
      expect(step.complete).toBe(true);
      expect(todo).not.toContain(step.label);
    }
  });

  it('does not say "no payment yet" under a ticked sign-off step', () => {
    // A job marked complete counts as signed off even with nothing collected —
    // the detail line has to explain that rather than contradict the tick.
    const completeUnpaid = job({ quoted_amount: 11800, status: 'complete' });
    const step = checklist(completeUnpaid).at(-1)!;
    expect(step.complete).toBe(true);
    expect(step.detail).toBe('Job marked complete');
  });

  it('does not tell you to schedule work it already calls scheduled', () => {
    const scheduled = job({ quoted_amount: 11800, scheduled_for: '2026-08-04' });
    const step = checklist(scheduled).find((s) => s.key === 'schedule')!;
    expect(step.complete).toBe(true);
    expect(step.detail).not.toBe('Schedule the work');
  });
});

describe('checklist details', () => {
  it('reports the quote amount and whether the feed link is out', () => {
    expect(checklist(job({ quoted_amount: 11800 }))[0].detail).toBe('$11,800 quoted · Share Job Feed link');
    expect(checklist(job({ quoted_amount: 11800 }), [], [], 1)[0].detail).toBe('$11,800 quoted · Job Feed shared');
  });

  it('does not talk about sharing a link for a job with no price', () => {
    expect(checklist(job())[0].detail).toBe('Price the work before you send it');
  });

  it('counts payment links once one is requested', () => {
    const step = checklist(job({ quoted_amount: 11800 }), [requested()]).find((s) => s.key === 'invoice')!;
    expect(step.label).toBe('Invoice / payment requested');
    expect(step.detail).toBe('1 payment link created');
  });

  it('reports what was actually paid', () => {
    const step = checklist(job({ quoted_amount: 11800 }), [paid(4000)]).at(-1)!;
    expect(step.detail).toBe('$4,000 paid');
  });

  it('keys stay stable while labels change with state', () => {
    const open = checklist(job({ quoted_amount: 11800 }));
    const closed = checklist(job({ quoted_amount: 11800, status: 'complete', scheduled_for: '2026-08-04' }), [paid(11800)], [], 1);
    expect(open.map((s) => s.key)).toEqual(closed.map((s) => s.key));
    expect(open[0].label).not.toBe(closed[0].label);
  });
});
