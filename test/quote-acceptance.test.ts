import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const JOB_FEED = read('src', 'lib', 'job-feed.ts');
const INVOICES = read('src', 'lib', 'invoices.ts');
const SCHEDULING = read('src', 'lib', 'scheduling.ts');
const LEAD_ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
const INSIGHTS = read('src', 'lib', 'insights.ts');

/**
 * "Accepted" has one definition, and four ways in.
 *
 * A quote can be accepted by the customer tapping their link, by them signing
 * the invoice, by them picking a start date, or by the owner recording that
 * somebody rang up and said yes. All four mean the same three things — the job
 * leaves the quote stage, the lead is won, the feed records it — and each one
 * used to implement its own subset:
 *
 *   client link        all three
 *   invoice signed     job + lead, no feed row
 *   date selected      job + lead, no feed row
 *   owner "Mark won"   LEAD ONLY
 *
 * These are source assertions rather than behavioural ones: the paths reach for
 * Twilio, Resend and the service-role client, and what is being pinned is that
 * they all go through one function rather than what that function does on a
 * given row.
 */

describe('every acceptance path goes through one function', () => {
  it('and that function exists, doing all three things', () => {
    expect(JOB_FEED).toContain('export async function applyQuoteAcceptance(');
    const body = JOB_FEED.slice(
      JOB_FEED.indexOf('export async function applyQuoteAcceptance('),
      JOB_FEED.indexOf('export async function approveClientJobQuote('),
    );
    // 1. the feed row Insights counts
    expect(body).toContain("kind: 'quote_approved'");
    // 2. the job leaves the quote stage, and only from the quote stage
    expect(body).toMatch(/if \(job\.status === 'new_lead'\) \{/);
    expect(body).toMatch(/\.update\(\{ status: 'in_progress' \}\)/);
    // 3. the lead behind it is won
    expect(body).toContain('getLeadByConvertedJob');
    expect(body).toMatch(/updateLeadStatus\(admin, accountId, lead\.id, 'won'\)/);
  });

  it('the client tapping their own link', () => {
    expect(JOB_FEED).toMatch(/applyQuoteAcceptance\(admin, accountId, jobId, \{\s*source: 'client_link'/);
  });

  it('the client signing the invoice', () => {
    expect(INVOICES).toContain("source: 'invoice_signed'");
    // And no longer flipping the two rows itself.
    expect(INVOICES).not.toMatch(/\.from\('leads'\)\s*\.update\(\{ status: 'won'/);
    expect(INVOICES).not.toMatch(/\.from\('jobs'\)\s*\.update\(\{ status: 'in_progress' \}\)/);
  });

  it('the client picking a start date', () => {
    expect(SCHEDULING).toContain("source: 'schedule_selected'");
    // The date is still this function's business; the status is not.
    expect(SCHEDULING).toMatch(/\.update\(\{ scheduled_for: option\.date, scheduled_time: option\.time \}\)/);
    expect(SCHEDULING).not.toMatch(/scheduled_time: option\.time, status: 'in_progress'/);
  });

  it('and the owner recording a verbal yes', () => {
    // The path that did nothing to the job at all, which is why marking a lead
    // won left it reading "Awaiting approval" indefinitely.
    expect(LEAD_ACTIONS).toContain("source: 'owner_verbal'");
    expect(LEAD_ACTIONS).toMatch(/if \(status === 'won' && jobId\)/);
    expect(LEAD_ACTIONS).toMatch(/revalidatePath\(`\/dashboard\/jobs\/\$\{jobId\}`\)/);
  });

  it('only ever forwards — a lead moved back never un-approves live work', () => {
    const action = LEAD_ACTIONS.slice(
      LEAD_ACTIONS.indexOf('export async function updateLeadStatusAction('),
      LEAD_ACTIONS.indexOf('export async function reopenLeadAction('),
    );
    expect(action).toContain("status === 'won'");
    expect(action).not.toContain("'new_lead'");
  });
});

describe('the acceptance is idempotent, and finishes what it started', () => {
  /**
   * The guard used to return early on the feed row alone, which meant an
   * approval interrupted between that insert and the jobs update could never
   * complete: every retry saw the row, returned, and left the job at 'new_lead'
   * forever underneath a feed entry announcing it had been approved.
   */
  it('does not skip the promotion just because the feed row is already there', () => {
    const approve = JOB_FEED.slice(JOB_FEED.indexOf('export async function approveClientJobQuote('));
    expect(approve).toContain('const alreadyApproved = Boolean(existingApproval);');
    // The early return is gone.
    expect(approve).not.toMatch(/if \(existingApproval\) return;/);
    // And the acceptance runs BEFORE the once-only side effects bail out.
    const acceptAt = approve.indexOf('applyQuoteAcceptance(');
    const bailAt = approve.indexOf('if (alreadyApproved) return;');
    expect(acceptAt).toBeGreaterThan(-1);
    expect(bailAt).toBeGreaterThan(acceptAt);
  });

  it('still fires the once-only side effects exactly once', () => {
    // The owner's alert email and deposit-on-approval sit after the bail, so a
    // double-submit cannot re-email or raise a second deposit.
    const approve = JOB_FEED.slice(JOB_FEED.indexOf('export async function approveClientJobQuote('));
    const bailAt = approve.indexOf('if (alreadyApproved) return;');
    const after = approve.slice(bailAt);
    expect(after).toContain('deposit_on_approval');
    expect(after).toContain('sendContractorAlertEmail');
  });
});

describe('the conversion metric can see all four', () => {
  it('counts quote_approved, which every path now writes', () => {
    // This is why the missing feed rows mattered rather than being cosmetic: a
    // contractor whose customers sign invoices rather than tapping Approve had
    // a conversion rate reading zero.
    expect(INSIGHTS).toContain("'quote_approved'");
  });
});
