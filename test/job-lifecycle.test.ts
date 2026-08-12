import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  jobStage,
  jobMoney,
  primaryJobAction,
  overageForNewRequest,
  shouldSuggestStages,
  JOB_STAGE_LABEL,
  JOB_STAGE_ORDER,
} from '@/lib/job-lifecycle';

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const stageInput = (over: Partial<Parameters<typeof jobStage>[0]> = {}) => ({
  status: 'in_progress',
  quotedAmount: 3500,
  startedAt: null,
  scheduledFor: null,
  clientLinkCount: 1,
  remainingCents: 0,
  ...over,
});

const actionInput = (over: Partial<Parameters<typeof primaryJobAction>[1]> = {}) => ({
  todayKey: '2026-08-11',
  scheduledFor: null,
  reviewConfigured: true,
  reviewAlreadyRequested: false,
  ...over,
});

describe('jobStage — one ladder, not four signals', () => {
  it('walks the job from unpriced to settled', () => {
    expect(jobStage(stageInput({ status: 'new_lead', quotedAmount: 0, clientLinkCount: 0 }))).toBe('pricing');
    expect(jobStage(stageInput({ status: 'new_lead', clientLinkCount: 0 }))).toBe('pricing');
    expect(jobStage(stageInput({ status: 'new_lead', clientLinkCount: 1 }))).toBe('quote_sent');
    expect(jobStage(stageInput({ status: 'in_progress' }))).toBe('approved');
    expect(jobStage(stageInput({ scheduledFor: '2026-08-15' }))).toBe('scheduled');
    expect(jobStage(stageInput({ scheduledFor: '2026-08-15', startedAt: '2026-08-15T13:00:00Z' }))).toBe('in_progress');
    expect(jobStage(stageInput({ status: 'complete', remainingCents: 40000 }))).toBe('complete');
    expect(jobStage(stageInput({ status: 'complete', remainingCents: 0 }))).toBe('settled');
    expect(jobStage(stageInput({ status: 'archived' }))).toBe('archived');
  });

  it('a started job is in progress whatever else is true of it', () => {
    // The reported page said Scheduled AND in progress AND offered "Job started"
    // AND "Mark Job Completed", all at once.
    expect(jobStage(stageInput({ scheduledFor: '2026-08-15', startedAt: '2026-08-15T13:00:00Z' }))).toBe('in_progress');
  });

  it('every stage has a label and the order has no gaps', () => {
    for (const stage of JOB_STAGE_ORDER) expect(JOB_STAGE_LABEL[stage]).toBeTruthy();
    expect(new Set(JOB_STAGE_ORDER).size).toBe(JOB_STAGE_ORDER.length);
  });
});

describe('primaryJobAction — one control looks like a control', () => {
  it('does not invite completing a job before it has started', () => {
    expect(primaryJobAction('scheduled', actionInput({ scheduledFor: '2026-08-15' }))).toBeNull();
    expect(primaryJobAction('approved', actionInput())?.key).toBe('schedule');
    // Only from in_progress.
    expect(primaryJobAction('in_progress', actionInput())?.key).toBe('complete');
  });

  it('offers "Job started" only from the booked day onward', () => {
    const scheduled = '2026-08-15';
    expect(primaryJobAction('scheduled', actionInput({ scheduledFor: scheduled, todayKey: '2026-08-11' }))).toBeNull();
    expect(primaryJobAction('scheduled', actionInput({ scheduledFor: scheduled, todayKey: '2026-08-15' }))?.key).toBe('start');
    expect(primaryJobAction('scheduled', actionInput({ scheduledFor: scheduled, todayKey: '2026-08-20' }))?.key).toBe('start');
  });

  it('manufactures no urgency while the customer is deciding', () => {
    expect(primaryJobAction('quote_sent', actionInput())).toBeNull();
  });

  it('asks for money only once there is work behind it', () => {
    expect(primaryJobAction('complete', actionInput())?.key).toBe('request_payment');
    expect(primaryJobAction('settled', actionInput())?.key).toBe('request_review');
    expect(primaryJobAction('settled', actionInput({ reviewAlreadyRequested: true }))).toBeNull();
    expect(primaryJobAction('settled', actionInput({ reviewConfigured: false }))).toBeNull();
  });
});

describe('jobMoney — the sum nobody was doing', () => {
  it('reproduces the reported job: $99.94 approved, $500 asked for', () => {
    const money = jobMoney({
      quotedAmount: 99.94,
      payments: [
        { amount: 250, status: 'requested' },
        { amount: 250, status: 'requested' },
      ],
    });
    expect(money.approvedCents).toBe(9994);
    expect(money.requestedCents).toBe(50000);
    expect(money.paidCents).toBe(0);
    expect(money.remainingCents).toBe(-40006);
    expect(money.overRequestedCents).toBe(40006);
  });

  it('counts approved change orders toward the deal, and pending ones not at all', () => {
    const money = jobMoney({ quotedAmount: 1000, approvedChangeOrderTotal: 250, payments: [] });
    expect(money.approvedCents).toBe(125000);
  });

  it('treats refunded and failed as neither owed nor paid', () => {
    const money = jobMoney({
      quotedAmount: 1000,
      payments: [
        { amount: 400, status: 'paid' },
        { amount: 100, status: 'refunded' },
        { amount: 200, status: 'failed' },
        { amount: 300, status: 'processing' },
      ],
    });
    expect(money.paidCents).toBe(40000);
    expect(money.requestedCents).toBe(30000);
    expect(money.remainingCents).toBe(30000);
  });

  it('is exact on cents rather than drifting through floats', () => {
    const money = jobMoney({ quotedAmount: 0.1 + 0.2, payments: [{ amount: 0.3, status: 'paid' }] });
    expect(money.remainingCents).toBe(0);
  });
});

describe('overageForNewRequest — a confirmation, not a lock', () => {
  const money = jobMoney({ quotedAmount: 99.94, payments: [{ amount: 250, status: 'requested' }] });

  it('names the overage in cents', () => {
    expect(overageForNewRequest(money, 25000)).toBe(40006);
  });

  it('stays silent when the ask fits inside the deal', () => {
    const clean = jobMoney({ quotedAmount: 1000, payments: [{ amount: 400, status: 'paid' }] });
    expect(overageForNewRequest(clean, 60000)).toBe(0);
    expect(overageForNewRequest(clean, 60001)).toBe(1);
  });

  it('has nothing to exceed on a job with no agreed price', () => {
    const unpriced = jobMoney({ quotedAmount: 0, payments: [] });
    expect(overageForNewRequest(unpriced, 999999)).toBe(0);
  });
});

describe('shouldSuggestStages — "Split $99.94 into 4 stages" is the product talking to itself', () => {
  it('says no to a small, short job', () => {
    expect(shouldSuggestStages({ quotedAmount: 99.94, estimatedHours: 1 })).toBe(false);
  });

  it('says yes once the money is worth splitting', () => {
    expect(shouldSuggestStages({ quotedAmount: 1500, estimatedHours: 2 })).toBe(true);
    expect(shouldSuggestStages({ quotedAmount: 3500, estimatedHours: null })).toBe(true);
  });

  it('says yes to a small job that runs for days, where proof is the point', () => {
    expect(shouldSuggestStages({ quotedAmount: 400, estimatedHours: 20, dayHours: 8 })).toBe(true);
    expect(shouldSuggestStages({ quotedAmount: 400, estimatedHours: 10, dayHours: 8 })).toBe(false);
  });
});

/* --- wired in ------------------------------------------------------------- */

describe('the job page uses the one ladder', () => {
  const page = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');

  it('derives the stage, the primary action and the money from lib/job-lifecycle', () => {
    expect(page).toContain("from '@/lib/job-lifecycle'");
    expect(page).toContain('const stage = jobStage(');
    expect(page).toContain('const primaryAction = primaryJobAction(');
    expect(page).toContain('const money = jobMoney(');
  });

  it('shows the money strip with all four figures', () => {
    for (const label of ['Approved', 'Requested', 'Paid', 'Remaining']) {
      expect(page).toContain(`<dt>${label}</dt>`);
    }
  });

  /**
   * ONE BRIGHT CONTROL, AND THE ALTERNATIVES IN A DRAWER.
   *
   * Every control used to render in the hero row at once, each deciding its own
   * emphasis from isPrimary — which meant a job at the pricing stage led with
   * "Request payment" and offered no way to price it. Now the stage picks the
   * control and everything else moves into JobActionMenu.
   */
  it('renders one control for the stage rather than all of them', () => {
    const row = page.slice(page.indexOf('<div className="actions workspace-actions">'), page.indexOf('</JobActionMenu>'));
    expect(row).toContain('{primaryControl}');
    expect(row).toContain('<JobActionMenu');
    // Exactly one `btn primary` can reach the row, and it is primaryControl's.
    expect(row).not.toContain('btn primary');
    expect(page).toContain("primary={isPrimary('start')}");
    expect(page).toContain("muted={!isPrimary('complete')}");
  });

  it('covers every key primaryJobAction can return', () => {
    for (const key of ['price', 'send_quote', 'schedule', 'start', 'complete', 'request_payment', 'request_review']) {
      expect(page, key).toContain(`'${key}'`);
    }
  });

  it('says whose move it is when the answer is not the contractor’s', () => {
    expect(page).toContain('const waitNote = jobWaitNote(stage, {');
    expect(page).toContain('{!primaryControl && waitNote ? <p className="job-wait-note">{waitNote}</p> : null}');
  });

  it('leads with the job rather than the customer', () => {
    expect(page).toContain('job-hero-title');
    expect(page).toContain('{jobTitle}');
    expect(page).not.toMatch(/<h1 className="workspace-title">\{job\.client_name\}<\/h1>/);
  });

  it('only suggests a four-way split where it earns its complexity', () => {
    expect(page).toContain('suggestSplit={suggestStages}');
  });
});

describe('a long record you can get around', () => {
  const page = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
  const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

  it('carries a sub-nav whose every link lands on a real section', () => {
    const nav = page.slice(page.indexOf('<nav className="job-subnav"'), page.indexOf('</nav>'));
    const targets = [...nav.matchAll(/href="#([\w-]+)"/g)].map((match) => match[1]);
    expect(targets).toEqual(['job-top', 'checklist', 'quote-breakdown', 'job-feed', 'request-payment', 'job-details']);
    for (const id of targets) {
      expect(page, `#${id} has no section`).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('works without JavaScript — plain anchors, not a click handler', () => {
    const nav = page.slice(page.indexOf('<nav className="job-subnav"'), page.indexOf('</nav>'));
    expect(nav).not.toContain('onClick');
    expect(nav).toMatch(/<a href="#/);
  });

  it('leaves room under the sticky bar so an anchor does not land behind it', () => {
    expect(css).toContain('scroll-margin-top');
  });

  it('collapses the sections that are only worth their height when filled', () => {
    expect(page).toMatch(/<details id="milestones"[\s\S]{0,200}open=\{milestoneViews\.length > 0\}/);
    expect(page).toMatch(/<details id="checklist"[\s\S]{0,200}open=\{jobTasks\.length > 0\}/);
  });

  it('puts the primary control first on a phone instead of stacking four buttons', () => {
    expect(css).toContain('.job-command-hero .workspace-actions > .btn.primary { order: -1; }');
  });
});

describe('the guardrails are on the server, not only in the markup', () => {
  it('a payment request past the approved total needs an explicit confirmation', () => {
    const actions = read('src', 'app', 'dashboard', 'jobs', 'payments-actions.ts');
    expect(actions).toContain('overageForNewRequest');
    expect(actions).toMatch(/confirmOverage/);
    // The check must run BEFORE the payment is created, or it guards nothing.
    expect(actions.indexOf('overageForNewRequest')).toBeLessThan(actions.indexOf('await createDepositRequest('));
  });

  it('saving over an approved quote needs an explicit revision', () => {
    const actions = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
    const block = actions.slice(actions.indexOf('export async function saveQuoteItemsAction'), actions.indexOf('export type QuoteNotifyResult'));
    expect(block).toContain('needsRevision: true');
    expect(block.indexOf('needsRevision: true')).toBeLessThan(block.indexOf('await saveQuoteItems('));
    // And the customer is told their approval no longer covers the total.
    expect(block).toContain("kind: 'quote_revised'");
    expect(block).toContain("visibility: 'client_financial'");
  });

  it('the builder says so before it saves', () => {
    const builder = read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteBuilder.tsx');
    expect(builder).toContain('quote-approved-lock');
    expect(builder).toContain('Save revised quote');
    expect(builder).toMatch(/if \(approved && !revision\)/);
  });

  it('the revised-quote event is something the client page knows how to render', () => {
    const feed = read('src', 'lib', 'client-feed.ts');
    expect(feed).toContain('quote_revised');
  });
});
