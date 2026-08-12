import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyOptionChoice,
  describeOptionChange,
  optionChangeSentence,
  optionsClosedCopy,
  quoteOptionsWindow,
  todayIn,
  type OptionsClosedReason,
  type OptionsWindowInput,
} from '@/lib/quote-options';
import { computeQuoteTotal, type QuoteItem } from '@/lib/jobs';

/**
 * Changing your mind about the extras, after you already said yes.
 *
 * The rules here are the ones that stop a checkbox doing something a checkbox
 * must not: moving a total a card is already authorized against, un-taking
 * money that has been taken, or changing the scope of a van that is already
 * loaded. All of them are re-derived server-side at the moment of the write —
 * the page hiding a form is not one of them.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const data = read('src', 'lib', 'quote-options-data.ts');
const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
const accept = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteAcceptance.tsx');
const actions = read('src', 'app', 'client', 'jobs', '[token]', 'actions.ts');

/** An approved job, three weeks out, nothing paid, no plan. */
const base: OptionsWindowInput = {
  approved: true,
  allowed: true,
  hasAddons: true,
  jobStatus: 'in_progress',
  startedAt: null,
  scheduledFor: '2026-09-01',
  today: '2026-08-13',
  planStatus: null,
  planAuthorized: false,
  paidToDate: 0,
};

const items: QuoteItem[] = [
  { id: 'b1', label: 'Cedar privacy fence, 120 ft', amount: 3200, kind: 'base', selected: true, recommended: false },
  { id: 'a1', label: 'Matching gate', amount: 300, kind: 'addon', selected: false, recommended: true },
  { id: 'a2', label: 'Post caps', amount: 120, kind: 'addon', selected: true, recommended: false },
  { id: 's1', label: 'Seasonal staining', amount: 90, kind: 'subscription', selected: false, recommended: false, frequency: 'monthly' },
];

/* --- when the window is open ------------------------------------------------ */

describe('quoteOptionsWindow', () => {
  it('is open on an approved job with a date still ahead of it', () => {
    const window = quoteOptionsWindow(base);
    expect(window.open).toBe(true);
    if (window.open) {
      expect(window.until).toBe('2026-09-01');
      expect(window.floor).toBe(0);
    }
  });

  it('is open on an approved job with no date at all', () => {
    const window = quoteOptionsWindow({ ...base, scheduledFor: null });
    expect(window.open).toBe(true);
    if (window.open) expect(window.until).toBeNull();
  });

  it('shuts at the START of the day the crew arrives, not the end of it', () => {
    // A change made at 7am on the morning of is a change made to a loaded van.
    expect(quoteOptionsWindow({ ...base, today: '2026-08-31' }).open).toBe(true);
    const onTheDay = quoteOptionsWindow({ ...base, today: '2026-09-01' });
    expect(onTheDay.open).toBe(false);
    if (!onTheDay.open) expect(onTheDay.reason).toBe('starts-today');
    expect(quoteOptionsWindow({ ...base, today: '2026-09-02' }).open).toBe(false);
  });

  it('shuts the moment work starts, whatever the calendar says', () => {
    const started = quoteOptionsWindow({ ...base, startedAt: '2026-08-13T08:00:00Z' });
    expect(started.open).toBe(false);
    if (!started.open) expect(started.reason).toBe('started');
  });

  it('shuts on a finished or archived job', () => {
    for (const status of ['complete', 'archived']) {
      const window = quoteOptionsWindow({ ...base, jobStatus: status });
      expect(window.open, status).toBe(false);
      if (!window.open) expect(window.reason).toBe('finished');
    }
  });

  it('is closed until the contractor turns it on', () => {
    const off = quoteOptionsWindow({ ...base, allowed: false });
    expect(off.open).toBe(false);
    if (!off.open) expect(off.reason).toBe('off');
  });

  it('will not move a total a card is already authorized against', () => {
    // Dated instalments are agreed against a fixed figure. A checkbox may not
    // silently change what a saved card gets charged.
    const active = quoteOptionsWindow({ ...base, planStatus: 'active', planAuthorized: true });
    expect(active.open).toBe(false);
    if (!active.open) expect(active.reason).toBe('plan-authorized');

    const authorizedDeposit = quoteOptionsWindow({ ...base, planStatus: 'pending_deposit', planAuthorized: true });
    expect(authorizedDeposit.open).toBe(false);

    // A plan that was OFFERED but never authorized has nothing agreed against
    // it yet, so it does not lock anything.
    expect(quoteOptionsWindow({ ...base, planStatus: 'pending_deposit', planAuthorized: false }).open).toBe(true);
  });

  it('carries money already paid through as a floor rather than as a lock', () => {
    // A deposit does not close the window — it just sets a bottom.
    const window = quoteOptionsWindow({ ...base, paidToDate: 1600 });
    expect(window.open).toBe(true);
    if (window.open) expect(window.floor).toBe(1600);
  });

  it('says nothing at all before approval or with no extras to change', () => {
    const notApproved = quoteOptionsWindow({ ...base, approved: false });
    expect(notApproved.open).toBe(false);
    if (!notApproved.open) expect(optionsClosedCopy(notApproved.reason, 'Evergreen')).toBeNull();

    const nothing = quoteOptionsWindow({ ...base, hasAddons: false });
    expect(nothing.open).toBe(false);
    if (!nothing.open) expect(optionsClosedCopy(nothing.reason, 'Evergreen')).toBeNull();
  });

  it('reports the truest reason when several apply', () => {
    // Telling somebody a setting is off, when the crew is on their roof, sends
    // them to argue with the wrong person.
    const all = quoteOptionsWindow({
      ...base,
      allowed: false,
      startedAt: '2026-08-13T08:00:00Z',
      jobStatus: 'complete',
      today: '2026-09-05',
    });
    expect(all.open).toBe(false);
    if (!all.open) expect(all.reason).toBe('finished');
  });
});

describe('optionsClosedCopy', () => {
  it('is written for the customer and names who to talk to', () => {
    const reasons: OptionsClosedReason[] = ['off', 'finished', 'started', 'starts-today', 'plan-authorized', 'settled'];
    for (const reason of reasons) {
      const copy = optionsClosedCopy(reason, 'Evergreen Landscaping')!;
      expect(copy, reason).toBeTruthy();
      expect(copy, reason).not.toMatch(/error|invalid|denied|unauthori[sz]ed/i);
    }
    expect(optionsClosedCopy('off', 'Evergreen Landscaping')).toContain('Evergreen Landscaping');
    expect(optionsClosedCopy('plan-authorized', 'Evergreen Landscaping')).toContain('Evergreen Landscaping');
  });
});

/* --- what a change may touch ------------------------------------------------ */

describe('applyOptionChoice moves the extras and nothing else', () => {
  it('cannot change the base scope or its price', () => {
    const after = applyOptionChoice(items, ['a1']);
    const base1 = after.find((item) => item.id === 'b1')!;
    expect(base1.amount).toBe(3200);
    expect(base1.kind).toBe('base');
    expect(base1.selected).toBe(true);
  });

  it('cannot start or stop a recurring plan, which has its own signup', () => {
    const after = applyOptionChoice(items, ['a1', 's1']);
    expect(after.find((item) => item.id === 's1')!.selected).toBe(false);
  });

  it('recomputes to a total that is base plus exactly the ticked extras', () => {
    expect(computeQuoteTotal(applyOptionChoice(items, []))).toBe(3200);
    expect(computeQuoteTotal(applyOptionChoice(items, ['a1']))).toBe(3500);
    expect(computeQuoteTotal(applyOptionChoice(items, ['a1', 'a2']))).toBe(3620);
  });

  it('ignores an id that is not an add-on on this quote', () => {
    expect(computeQuoteTotal(applyOptionChoice(items, ['b1', 'nope']))).toBe(3200);
  });
});

describe('describeOptionChange names what moved', () => {
  it('reports both directions and only real differences', () => {
    expect(describeOptionChange(items, ['a1'])).toEqual({ added: ['Matching gate'], removed: ['Post caps'], changed: true });
    expect(describeOptionChange(items, ['a2'])).toEqual({ added: [], removed: [], changed: false });
  });

  it('reads as a sentence, for the feed and the contractor’s email', () => {
    expect(optionChangeSentence(describeOptionChange(items, ['a1']))).toBe('Added Matching gate. Removed Post caps.');
    expect(optionChangeSentence(describeOptionChange(items, ['a1', 'a2']))).toBe('Added Matching gate.');
    expect(optionChangeSentence(describeOptionChange(items, ['a2']))).toBe('No change.');
  });
});

describe('todayIn is the crew’s day, not the browser’s', () => {
  const noon = new Date('2026-08-13T04:30:00Z');

  it('resolves the account timezone', () => {
    // 04:30 UTC is still the 12th in Los Angeles.
    expect(todayIn('America/Los_Angeles', noon)).toBe('2026-08-12');
    expect(todayIn('America/New_York', noon)).toBe('2026-08-13');
  });

  it('never throws on a customer’s page for an unset or broken timezone', () => {
    // UTC can close the window a few hours out. A stack trace closes the page.
    expect(todayIn(null, noon)).toBe('2026-08-13');
    expect(todayIn('Mars/Olympus', noon)).toBe('2026-08-13');
  });
});

/* --- the write --------------------------------------------------------------- */

describe('the endpoint decides for itself', () => {
  it('re-derives the window from the database rather than trusting the page', () => {
    // A server action is reachable by anybody holding the link, so "the form
    // was hidden" is not a check.
    expect(data).toContain('quoteOptionsWindow({');
    expect(data).toContain('if (!window.open)');
    expect(data).toContain("select('client_quote_changes, timezone')");
    expect(data).toContain('client_quote_changes === true');
  });

  it('only accepts ids that are add-ons on THIS quote', () => {
    expect(data).toContain("const validIds = new Set(items.filter((item) => item.kind === 'addon').map((item) => item.id));");
    expect(data).toContain('addonIds.filter((id) => validIds.has(id))');
  });

  it('will not let a checkbox take the total below money already paid', () => {
    // That is a refund, and a refund is a decision a contractor makes.
    expect(data).toContain('Math.round(newTotal * 100) < Math.round(paidToDate * 100)');
    expect(data).toContain('cannot go below that');
  });

  it('does nothing, successfully, when nothing actually changed', () => {
    expect(data).toContain('if (!change.changed) return { ok: true');
  });

  it('writes a client-visible financial note, because the total on their page moved', () => {
    expect(data).toContain("kind: 'quote_revised'");
    expect(data).toContain("visibility: 'client_financial'");
    expect(data).toContain('The total changed from');
  });

  it('tells the contractor at once, and leads with a removal', () => {
    // They may have bought materials for the thing that was just dropped.
    expect(data).toContain('sendContractorAlertEmail');
    expect(data).toContain("change.removed.length > 0\n            ? `${clientName} removed work from");
    expect(data).toContain("tone: change.removed.length > 0 ? 'warning' : 'info'");
    // And an invoice already raised still shows the old figure.
    expect(data).toContain('still shows the old total');
  });

  it('never fails the save because a notification failed', () => {
    const afterWrite = data.slice(data.indexOf('const { error } = await admin'));
    expect((afterWrite.match(/catch \(error\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/* --- the page ---------------------------------------------------------------- */

describe('the page offers it only where it is open', () => {
  it('computes the window and passes it to the deck', () => {
    expect(page).toContain('const optionsWindow = quoteOptionsWindow({');
    expect(page).toContain('optionsOpen={optionsWindow.open}');
    expect(page).toContain('todayIn(dashboard.timezone)');
  });

  it('explains itself when it is closed, rather than showing nothing', () => {
    expect(page).toContain('optionsClosedCopy(optionsWindow.reason, dashboard.businessName)');
    expect(page).toContain('quote-options-closed');
  });

  it('keeps the receipt on screen while the change is being made', () => {
    const rail = page.slice(page.indexOf('<QuoteApproved'));
    expect(rail.indexOf('<QuoteOptionsUpdate')).toBeGreaterThan(0);
  });

  it('is a deliberate act, never an autosave', () => {
    // Ticking a box on a signed agreement must not change what somebody owes
    // the moment their thumb lifts.
    expect(accept).toContain('Confirm change · {formatUsd(total)}');
    expect(accept).toContain('was {formatUsd(committedTotal)}');
    expect(accept).toContain('action={updateAction}');
  });

  it('reuses the one form id, so the add-on boxes never have to know which form is live', () => {
    expect(accept).toMatch(/QuoteOptionsUpdate[\s\S]{0,900}id=\{QUOTE_FORM_ID\}/);
    expect(read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx')).toContain('form={QUOTE_FORM_ID}');
  });

  /**
   * This used to be `disabled={!canEditOptions}` on a checkbox that stayed in
   * the markup. A disabled input inside a <label> that keeps its pointer cursor
   * and its hover lift is a control that looks live and answers to nothing —
   * customers pressed "+ Add" on a closed quote and concluded the page was
   * broken. The row is not a control at all now when the window has shut.
   */
  it('removes the checkbox outright when the window has closed, rather than disabling it', () => {
    const doc = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx');
    expect(doc).not.toContain('disabled={!canEditOptions}');
    expect(doc).toContain('if (!canEditOptions) {');
  });

  it('says what happened, either way', () => {
    expect(page).toContain("'options-updated':");
    expect(page).toContain("'options-failed':");
    expect(actions).toContain("options-updated=1' : 'options-failed=1'");
  });
});

describe('the contractor decides, and can see where the door shuts', () => {
  const section = read('src', 'app', 'dashboard', 'settings', 'QuoteChangesSection.tsx');

  it('is off until they turn it on', () => {
    const migration = readFileSync(join(process.cwd(), 'migrations', '2026-08-13-client-quote-changes.sql'), 'utf8');
    expect(migration).toContain('boolean not null default false');
    expect(readFileSync(join(process.cwd(), 'schema.sql'), 'utf8')).toContain(
      'alter table accounts add column if not exists client_quote_changes boolean not null default false;',
    );
  });

  it('names every rule beside the switch rather than in a help article', () => {
    for (const rule of ['start date', 'Job started', 'payment plan', 'already paid']) {
      expect(section, rule).toContain(rule);
    }
  });

  it('says the uncomfortable half out loud', () => {
    // They can remove work as well as add it.
    expect(section).toContain('they can remove work as well as add it');
  });

  it('saves through an action that reads the owner’s own session', () => {
    expect(read('src', 'app', 'dashboard', 'settings', 'actions.ts')).toContain('export async function setClientQuoteChangesAction');
    expect(read('src', 'app', 'dashboard', 'settings', 'page.tsx')).toContain('<QuoteChangesSection enabled={clientQuoteChanges} />');
  });
});
