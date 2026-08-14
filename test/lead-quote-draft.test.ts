import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UNDOING A SENT QUOTE USED TO COST THE QUOTE.
 *
 * "Undo sent quote" deletes the job the quote created — it has to, because the
 * job is what the customer holds a link to, and leaving a half-real one behind
 * is worse than removing it. But every line item, the hours, the deposit
 * percentage and the installment schedule lived on that job, so correcting one
 * price in a ten-line quote meant typing the other nine again. The cheap thing
 * to do was leave the wrong quote out there, which is the opposite of what a
 * safety control should make easy.
 *
 * The draft now lives on the LEAD, which survives the delete. These tests hold
 * the three halves of that: it is written where the form's own answers exist,
 * refreshed from the job on the way out, and read back into the form.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const LEADS = read('src', 'lib', 'leads.ts');
const ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
const PAGE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx');
const DEPOSIT = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'DepositField.tsx');
const BUTTON = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'UndoQuoteButton.tsx');
const CSS = read('src', 'app', 'dashboard', 'leads', 'leads.module.css');

/** captureQuoteDraft alone — bounded, because a slice that ran to the end of
 *  the file would pick up every `throw` in the module after it. */
function captureBody(): string {
  const from = LEADS.indexOf('async function captureQuoteDraft(');
  expect(from, 'captureQuoteDraft is gone').toBeGreaterThan(-1);
  const next = LEADS.indexOf('\nexport ', from);
  return LEADS.slice(from, next > -1 ? next : undefined);
}

describe('the draft is stored where it survives', () => {
  /**
   * NO MIGRATION, DELIBERATELY. A column would have to land before any deploy
   * could read it; `triage` is JSONB that already exists on every row, and the
   * message-channel preference is stored there for the same reason.
   */
  it('lives inside triage rather than in a new column', () => {
    expect(LEADS).toContain('quoteDraft?: LeadQuoteDraft | null;');
    expect(LEADS).toContain('export type LeadQuoteDraft = {');
    const migrations = read('schema.sql');
    expect(migrations).not.toContain('quote_draft');
  });

  it('keeps the answers the job never holds', () => {
    // Line items and hours end up on the job and can be read back off it. These
    // are turned into payment rows and stored nowhere as the owner's answers.
    for (const field of [
      'paymentTerms',
      'depositValue',
      'depositUnit',
      'depositTiming',
      'planDepositPercent',
      'planInstallments',
      'planFrequency',
      'planFirstDate',
      'planAllowPayInFull',
      'showHoursToClient',
    ]) {
      expect(LEADS, `LeadQuoteDraft is missing ${field}`).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it('is written by the send, before anything can throw', () => {
    const convert = ACTIONS.slice(ACTIONS.indexOf('export async function convertLeadAction('));
    const draftAt = convert.indexOf('const quoteDraft: LeadQuoteDraft = {');
    const jobAt = convert.indexOf('await convertLeadToJob(');
    expect(draftAt).toBeGreaterThan(-1);
    expect(jobAt).toBeGreaterThan(draftAt);
  });

  /**
   * Unconditional, unlike the channel write it shares a statement with: a draft
   * identical to the last one still has to be re-stamped, because what changed
   * may be the quote rather than the preference.
   */
  it('is re-stamped on every send', () => {
    const convert = strip(ACTIONS.slice(ACTIONS.indexOf('export async function convertLeadAction(')));
    expect(convert).not.toMatch(/if \(\(getLeadTriage\(lead\)\.messageChannel[^)]*\) !== messageChannel\) \{/);
    expect(convert).toContain('const nextTriage = { ...getLeadTriage(lead), messageChannel, quoteDraft }');
  });
});

/**
 * THE BUG THAT MADE THE FIRST VERSION OF THIS DO NOTHING.
 *
 * getLeadTriage does not read the JSONB blob, it REBUILDS it — field by known
 * field — and every triage write in the app is `{ ...getLeadTriage(lead),
 * ...change }`. So a field it does not parse survives being written and then
 * disappears at the next snooze, archive, decline or logged call, with nothing
 * failing. The draft was written correctly and read back as null for exactly
 * that reason; it was only visible by driving the real button in a browser.
 */
describe('the draft survives the triage rebuild', () => {
  it('is parsed by getLeadTriage, not just written by callers', () => {
    const parse = LEADS.slice(LEADS.indexOf('export function getLeadTriage('), LEADS.indexOf('function parseQuoteDraft('));
    expect(parse).toContain('quoteDraft: parseQuoteDraft(triage.quoteDraft)');
  });

  it('validates rather than trusts, and degrades to no draft', () => {
    const parse = LEADS.slice(LEADS.indexOf('function parseQuoteDraft('));
    // It seeds a form that is about to be sent to a customer, so a malformed
    // blob has to mean "no draft" and never "half a quote".
    expect(parse).toContain('if (!raw || typeof raw !== \'object\') return null;');
    expect(parse).toContain('if (!items.length) return null;');
    expect(parse).toContain('parseQuoteItems(');
    // Enumerated values are checked against their own union, not cast.
    expect(parse).toContain("terms === 'deposit' || terms === 'plan' ? terms : 'full'");
  });
});

describe('the undo hands the quote back', () => {
  it('reads the job before it deletes it', () => {
    const undo = LEADS.slice(LEADS.indexOf('export async function unconvertLeadFromJob('));
    const captureAt = undo.indexOf('await captureQuoteDraft(');
    const deleteAt = undo.indexOf('await deleteJob(');
    expect(captureAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(captureAt);
  });

  it('prefers the job for the two fields the job can change', () => {
    // Line items and hours are editable on the job after the quote is sent, so
    // the job is the current version of both; everything else comes from the
    // stored draft, which is the only place it exists.
    const capture = captureBody();
    expect(capture).toContain('parseQuoteItems(job.quote_items ?? [])');
    expect(capture).toContain('estimatedHours: job.estimated_hours ?? stored?.estimatedHours ?? null');
    expect(capture).toContain('...(stored ?? {})');
  });

  /**
   * This runs one step before an irreversible delete. A failure to read the
   * draft is not a reason to strand somebody with a job they asked to remove —
   * the worst case is a form that opens the way it always used to.
   */
  it('never fails the undo to save the draft', () => {
    const capture = captureBody();
    expect(capture).toContain('try {');
    expect(capture).toContain('return stored;');
    expect(capture).not.toContain('throw');
  });

  it('writes it onto the lead in the same update as the status revert', () => {
    const undo = LEADS.slice(LEADS.indexOf('export async function unconvertLeadFromJob('));
    expect(undo).toContain('triage: { ...triage, quoteDraft }');
    expect(undo).toContain('converted_job: null');
  });
});

describe('the form reopens where it was left', () => {
  it('seeds the builder from the draft when there is one', () => {
    expect(PAGE).toContain('const quoteDraft = getLeadTriage(lead).quoteDraft ?? null;');
    expect(PAGE).toContain('quoteDraft?.items?.length');
    // And still opens on the project type when there is not.
    expect(PAGE).toContain("id: 'seed-base'");
  });

  it('seeds the hours, the hours checkbox and the payment terms', () => {
    expect(PAGE).toContain('defaultChecked={quoteDraft?.showHoursToClient ?? false}');
    expect(PAGE).toContain('<DepositField draft={quoteDraft} />');
    expect(DEPOSIT).toContain("useState<Terms>(draft?.paymentTerms ?? 'full')");
    expect(DEPOSIT).toContain("defaultValue={draft?.depositValue ?? ''}");
    expect(DEPOSIT).toContain('defaultChecked={draft?.planAllowPayInFull ?? true}');
  });

  /**
   * A restored first-installment date that has already passed is worse than no
   * date: it looks deliberate.
   */
  it('will not restore an installment date that is in the past', () => {
    expect(DEPOSIT).toContain("draft.planFirstDate > new Date().toISOString().slice(0, 10)");
  });

  it('says why the form is already filled in', () => {
    expect(PAGE).toContain('Restored from the quote you sent');
    expect(PAGE).toMatch(/formatElapsedTime\(quoteDraft\.sentAt\)/);
    expect(CSS).toContain('.quoteRestored');
  });
});

describe('the control says what it now does', () => {
  it('is an edit rather than a demolition', () => {
    expect(BUTTON).toContain('Edit &amp; resend quote');
    expect(BUTTON).not.toContain('Undo sent quote');
  });

  /**
   * The confirm stays: deleting a job is not undoable and the copy has to name
   * what goes with it. What it must no longer say is that the quote is lost,
   * because it is the one thing that survives.
   */
  it('still names what the delete takes, and no longer warns about the quote', () => {
    expect(BUTTON).toMatch(/window\.confirm\(/);
    expect(BUTTON).toMatch(/costs, invoices or schedule requests/);
    expect(BUTTON).toMatch(/line items, hours and payment terms are kept/i);
    expect(BUTTON).not.toMatch(/so you can resend it with the correct details/);
  });
});
