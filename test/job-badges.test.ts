import { describe, it, expect } from 'vitest';
import { buildPipelineChecklist, deriveJobListBadge, formatStartedOn } from '@/lib/job-badges';
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
    expect(badge(noQuote).label).toBe('Quote needed');
    expect(checklist(noQuote)[0].label).toBe('Quote needed');
  });

  it('only says it went out once a client link exists', () => {
    const shared = job({ quoted_amount: 11800 });
    expect(badge(shared, [], [], 1).label).toBe('Awaiting approval');
    expect(checklist(shared, [], [], 1)[0].label).toBe('Quote shared');
    expect(checklist(shared, [], [], 1)[0].complete).toBe(true);
  });

  /**
   * TWO KINDS OF ACCESS, AND STEP ONE STOPPED CONFLATING THEM.
   *
   * The quote reaches a customer by whatever route sent it; the Job Feed needs
   * a client_job_access row. Deciding step one on the second of those printed
   * "Send to client" (open) directly above "Quote approved" (done) — a job they
   * had demonstrably seen and said yes to, listed as unsent.
   */
  it('never leaves the send step open above an approved step', () => {
    for (const approved of [
      job({ quoted_amount: 11800, status: 'in_progress' }),
      job({ quoted_amount: 11800, scheduled_for: '2026-08-20' }),
      job({ quoted_amount: 11800, status: 'complete' }),
    ]) {
      const steps = checklist(approved);
      expect(steps[1].complete).toBe(true);
      expect(steps[0].complete, steps[0].label).toBe(true);
    }
  });

  /** And the client page link keeps being reported — in the detail line, which
   *  is where it belongs, rather than by silently deciding the step. */
  it('says whether the client page link exists, either way', () => {
    const approvedNoLink = job({ quoted_amount: 11800, status: 'in_progress' });
    expect(checklist(approvedNoLink)[0].detail).toContain('Client page not shared yet');
    expect(checklist(approvedNoLink, [], [], 1)[0].detail).toContain('Client page shared');
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

  /**
   * A finished job has no step still claiming work is underway.
   *
   * started_at is sticky by design — it records a thing that happened and is
   * never cleared — so the schedule step read "Work in progress" forever, sat
   * directly under a hero badge reading Complete. Two labels about one job,
   * contradicting each other on the same screen.
   */
  it('closes the schedule step when the job is finished', () => {
    const done = job({ status: 'complete', started_at: '2026-08-04T13:00:00.000Z', scheduled_for: '2026-08-10' });
    const schedule = checklist(done).find((step) => step.key === 'schedule');
    expect(schedule?.label).toBe('Complete');
    // The detail line is left alone: "Started Tue, Aug 4" is still true, and is
    // the useful half of the row once the label has stopped hedging.
    expect(schedule?.detail).toBeTruthy();
  });

  it('and says the same for a cancelled one', () => {
    // Archived is how this product files a cancellation. No work is underway
    // there either.
    const cancelled = job({ status: 'archived', started_at: '2026-08-04T13:00:00.000Z' });
    expect(checklist(cancelled).find((step) => step.key === 'schedule')?.label).toBe('Complete');
  });

  it('never has any step call a finished job work in progress', () => {
    for (const status of ['complete', 'archived'] as const) {
      const finished = job({ status, started_at: '2026-08-04T13:00:00.000Z', quoted_amount: 4200 });
      const labels = checklist(finished, [], [], 1).map((step) => step.label);
      expect(labels, status).not.toContain('Work in progress');
    }
  });

  /**
   * Recording a verbal acceptance moves a job to in_progress without a date,
   * and that state has its own name.
   *
   * The branch existed before but was nearly unreachable: every route to
   * in_progress also set a date, so the scheduled_for check above caught them
   * first. Now the owner's "Mark won" reaches it every time — and it was
   * reading "Ready to invoice", telling somebody to bill for work that has not
   * been scheduled, let alone done.
   */
  it('calls an accepted job with no date approved, not ready to invoice', () => {
    const accepted = job({ status: 'in_progress', quoted_amount: 4200 });
    expect(badge(accepted, [], [], 1).label).toBe('Approved — needs scheduling');
  });

  it('and moves on to Scheduled the moment it gets a date', () => {
    const booked = job({ status: 'in_progress', quoted_amount: 4200, scheduled_for: '2026-08-20' });
    expect(badge(booked, [], [], 1).label).toBe('Scheduled');
  });

  it('still says work is in progress while it actually is', () => {
    // The guard above must not have closed the step for live jobs too.
    const live = job({ status: 'in_progress', started_at: '2026-08-04T13:00:00.000Z' });
    expect(checklist(live).find((step) => step.key === 'schedule')?.label).toBe('Work in progress');
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
    const pastTense = ['Quote shared', 'Quote approved', 'Scheduled', 'Invoice / payment requested', 'Paid / signed off'];

    for (const j of cases) {
      for (const step of checklist(j)) {
        if (!step.complete) expect(pastTense).not.toContain(step.label);
      }
    }
  });

  it('never shows an outstanding-action label on a finished step', () => {
    const done = job({ quoted_amount: 11800, status: 'complete', scheduled_for: '2026-08-04' });
    const todo = ['Quote needed', 'Send to client', 'Awaiting approval', 'Schedule the work', 'Request payment', 'Awaiting payment'];

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
    expect(checklist(job({ quoted_amount: 11800 }))[0].detail).toBe('$11,800 quoted · Client page not shared yet');
    expect(checklist(job({ quoted_amount: 11800 }), [], [], 1)[0].detail).toBe('$11,800 quoted · Client page shared');
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

describe('the schedule step stops hedging once work has started', () => {
  // "Scheduled / underway" covered both a job on next Tuesday's calendar and a
  // job with a crew in the driveway. Pressing "Job started" is what tells the
  // two apart, so the step has to say which one it means — and it now says so
  // in the canonical stage words rather than a slash between two of them.
  const scheduled = job({ quoted_amount: 11800, status: 'in_progress', scheduled_for: '2026-08-04' });

  it('says only that it is scheduled while that is all that is true', () => {
    const step = checklist(scheduled)[2];
    expect(step.label).toBe('Scheduled');
    expect(step.detail).toContain('Aug');
  });

  it('commits once there is a start time, and shows the day', () => {
    const step = checklist({ ...scheduled, started_at: '2026-08-04T14:20:00.000Z' })[2];
    expect(step.label).toBe('Work in progress');
    expect(step.detail).toMatch(/^Started /);
  });

  it('keeps the step key and its completeness either way', () => {
    const before = checklist(scheduled)[2];
    const after = checklist({ ...scheduled, started_at: '2026-08-04T14:20:00.000Z' })[2];
    expect(after.key).toBe(before.key);
    expect(after.complete).toBe(before.complete);
  });
});

describe('the header badge moves when work starts', () => {
  // The reported bug: press "Job started" and the status card carried on saying
  // "Scheduled", because the badge only ever looked at scheduled_for.
  const scheduled = job({ quoted_amount: 11800, scheduled_for: '2026-08-04' });
  const started = { ...scheduled, status: 'in_progress' as const, started_at: '2026-08-04T14:20:00.000Z' };

  it('says scheduled while it is only scheduled', () => {
    expect(badge(scheduled).label).toBe('Scheduled');
  });

  it('stops saying scheduled once there is a start time', () => {
    expect(badge(started).label).not.toBe('Scheduled');
    expect(badge(started).label).toBe('Work in progress');
  });

  it('says the same thing the pipeline step beside it says', () => {
    // The two sit inches apart on the job header; disagreeing is the whole
    // defect class this module exists to prevent.
    expect(badge(started).label).toBe(checklist(started)[2].label);
  });

  it('names the day it started on hover', () => {
    expect(badge(started).title).toMatch(/^Started /);
  });

  it('covers a job started without ever being put on the calendar', () => {
    // Used to fall through to "Ready for invoice" — a job with a crew on site
    // is not waiting to be invoiced.
    const noDate = job({ quoted_amount: 11800, status: 'in_progress', started_at: '2026-08-04T14:20:00.000Z' });
    expect(badge(noDate).label).toBe('Work in progress');
  });

  it('still lets money states outrank it', () => {
    // An invoice awaiting payment is the more urgent fact, and completion ends
    // the story regardless of when it started.
    expect(badge(started, [requested()]).label).toBe('Invoice sent — awaiting payment');
    expect(badge({ ...started, status: 'complete' }).label).toBe('Complete');
  });
});

describe('formatStartedOn', () => {
  it('is null when nobody pressed the button — never "started when it was created"', () => {
    expect(formatStartedOn(null)).toBeNull();
    expect(formatStartedOn(undefined)).toBeNull();
  });

  it('is null rather than "Invalid Date" on a value that will not parse', () => {
    expect(formatStartedOn('not a timestamp')).toBeNull();
  });

  it('reads as a day, not a timestamp', () => {
    expect(formatStartedOn('2026-08-04T14:20:00.000Z')).toMatch(/^Started \w{3}, \w{3} \d+$/);
  });
});
