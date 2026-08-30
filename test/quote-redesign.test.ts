import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatUsdExact, formatUsdRounded } from '@/lib/money-format';
import { formatMoneyExact } from '@/lib/jobs';
import { isSignature } from '@/app/client/jobs/[token]/QuoteDeck';
import { firstNameOf, projectTypeOf, properName, quoteHeadline } from '@/lib/quote-hero';
import type { QuoteItem } from '@/lib/jobs';

/**
 * The customer's quote page, rebuilt around the decision it exists to get.
 *
 * The old page was a stack of cards in the order the product happens to store
 * things: the total lived at the bottom of the itemised list, the Approve
 * button lived under the total, the start dates lived inside an activity feed,
 * and paying in full did not exist for a homeowner whose contractor had quoted
 * on plan terms. There is no DOM in this suite, so these read the source — but
 * every assertion below is about a fact somebody can see on the page.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));
const rawFile = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
const deck = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDeck.tsx');
const accept = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteAcceptance.tsx');
const doc = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx');
const dates = read('src', 'app', 'client', 'jobs', '[token]', 'ScheduleChoice.tsx');
const css = rawFile('src', 'app', 'globals.css');
const lite = rawFile('src', 'app', 'globals-lite.css');

const item = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  id: 'i1',
  label: 'Cedar privacy fence, 120 ft',
  amount: 3500,
  kind: 'base',
  selected: true,
  recommended: false,
  ...over,
});

/* --- one total, computed once ---------------------------------------------- */

describe('every surface reads the same total from the same place', () => {
  it('the running total lives in the provider, not in whichever card renders a control', () => {
    expect(deck).toContain('const total = baseTotal + addonsTotal;');
    // The document used to own it, so the rail could not have shown it at all.
    expect(doc).toContain('useQuoteDeck()');
    expect(accept).toContain('useQuoteDeck()');
    expect(doc).not.toContain('useState');
  });

  it('is announced from exactly one place, not once per surface', () => {
    // The same number renders in the rail, the mobile bar, the document and
    // the button label. Four live regions would read it four times.
    expect(deck).toContain("aria-live={live ? 'polite' : undefined}");
    const liveUses = accept.match(/<LiveTotal[^/]*live/g) ?? [];
    expect(liveUses).toHaveLength(1);
  });

  it('settles on cents and only rounds while it is moving', () => {
    expect(formatUsdExact(437.5)).toBe('$437.50');
    expect(formatUsdRounded(437.5)).toBe('$438');
    expect(deck).toContain('atRest ? formatUsdExact(total) : formatUsdRounded(shownTotal)');
  });

  it('has one implementation of money, shared by the server and the browser', () => {
    // The client page carried its own formatUsd, which is how one page ends up
    // showing two roundings of the same figure.
    expect(formatMoneyExact(99.94)).toBe(formatUsdExact(99.94));
    expect(read('src', 'lib', 'jobs.ts')).toContain("export { formatUsdExact as formatMoneyExact } from '@/lib/money-format';");
    expect(doc).toContain("from '@/lib/money-format'");
  });
});

/* --- the button is beside the number it commits to -------------------------- */

describe('the approval sits in the rail with the total', () => {
  it('is one form, in the rail, with the add-on boxes bound to it by form id', () => {
    expect(accept).toContain('id={QUOTE_FORM_ID}');
    expect(accept).toContain('action={approveAction}');
    // Association across the DOM. Without this the checkboxes are in a
    // different subtree and none of them reach the server action.
    expect(doc).toContain('form={QUOTE_FORM_ID}');
    expect(doc).toContain('name="addon"');
  });

  it('names the figure on the button itself', () => {
    expect(accept).toContain('Approve quote · {formatUsd(total)}');
  });

  it('will not submit without a name and a signature', () => {
    expect(accept).toContain('disabled={!canApprove}');
    expect(accept).toContain('aria-describedby="quote-signer-hint"');
    // Each method is gated on its own evidence, not on the other's.
    expect(deck).toContain("canApprove: signerValid && (signMethod === 'typed' || signaturePath !== null)");
  });

  it('keeps the server action, the field names and the loading state exactly as they were', () => {
    const actions = read('src', 'app', 'client', 'jobs', '[token]', 'actions.ts');
    expect(actions).toContain("formData.getAll('addon')");
    expect(actions).toContain("optionalText(formData.get('signerName'))");
    expect(page).toContain('approveClientJobQuoteAction.bind(null, params.token)');
    // SaveButton is inside the form, so useFormStatus still drives "Approving…".
    expect(accept).toMatch(/<SaveButton[\s\S]{0,220}pendingLabel="Approving…"/);
  });
});

describe('isSignature', () => {
  it('stops an empty box and a stray keystroke', () => {
    expect(isSignature('')).toBe(false);
    expect(isSignature('   ')).toBe(false);
    expect(isSignature('x')).toBe(false);
    expect(isSignature('...')).toBe(false);
    expect(isSignature('42')).toBe(false);
  });

  it('accepts a real name, including one that is not two Latin words', () => {
    expect(isSignature('Dana Whitfield')).toBe(true);
    expect(isSignature('  Bo  ')).toBe(true);
    // A rule requiring a space would lock somebody with a single legal name out
    // of approving their own quote, with no recovery path on this page.
    expect(isSignature('Teller')).toBe(true);
    expect(isSignature('Ngô Bảo Châu')).toBe(true);
    expect(isSignature('李雷')).toBe(true);
  });
});

/* --- the hero, from facts the contractor already filled in ------------------ */

describe('the hero is personalized without inventing anything', () => {
  it('names the work from the contractor’s own first line', () => {
    expect(projectTypeOf([item()], null)).toBe('Cedar privacy fence, 120 ft');
  });

  it('refuses to headline a paragraph', () => {
    const prose = 'A large limb came down across the front lawn and it needs removing before the weekend.';
    expect(projectTypeOf([], prose)).toBeNull();
    // A short scope line that is plainly a title still works.
    expect(projectTypeOf([], 'Gutter clean and downspout flush')).toBe('Gutter clean and downspout flush');
  });

  it('cuts a long label on a word and says that it cut', () => {
    const long = projectTypeOf([item({ label: 'Full tear-off and replacement of the existing asphalt shingle roof including underlayment' })], null)!;
    expect(long.length).toBeLessThanOrEqual(53);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it('drops the greeting rather than filling in a pronoun', () => {
    expect(firstNameOf('Dana Whitfield')).toBe('Dana');
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    // "you, here's your quote" is what a template does with a missing name.
    expect(quoteHeadline({ firstName: null, projectType: 'Gutter clean', approved: false })).toBe("Here's your quote for Gutter clean.");
    expect(quoteHeadline({ firstName: 'Dana', projectType: null, approved: false })).toBe("Dana, here's your quote.");
  });

  it('stops calling itself a quote once it has been approved', () => {
    expect(quoteHeadline({ firstName: 'Dana', projectType: 'Gutter clean', approved: true })).toBe('Gutter clean — approved.');
    expect(quoteHeadline({ firstName: 'Dana', projectType: null, approved: true })).toBe('Your quote is approved.');
  });

  it('carries all five facts: who from, who for, what, where, and where it stands', () => {
    expect(page).toContain('{dashboard.businessName}');
    expect(page).toContain('Prepared for {clientName}');
    expect(page).toContain('{headline}');
    expect(page).toContain('{dashboard.job.address}');
    expect(page).toContain('{status.label}');
  });

  /**
   * THE NAME IS CASED, AND IT IS CASED ONCE.
   *
   * `jobs.client_name` is typed by whoever took the call, so it arrives as
   * "dana whitfield" as often as "DANA WHITFIELD". Both were printed raw at the
   * top of a document somebody was about to sign — the headline said "dana,
   * here's your quote" over a line reading "Prepared for DANA WHITFIELD".
   */
  it('cases the name once, so the headline and the line under it agree', () => {
    expect(page).toContain('const clientName = properName(dashboard.job.client_name)');
    // The first name is taken FROM the cased name, not separately from the raw
    // column — two derivations off one field is how they come to disagree.
    expect(page).toContain('const firstName = firstNameOf(clientName)');
    expect(page).not.toContain('firstNameOf(dashboard.job.client_name)');
  });

  it('un-shouts a name and lifts one that was never capitalized', () => {
    expect(properName('DANA WHITFIELD')).toBe('Dana Whitfield');
    expect(properName('dana whitfield')).toBe('Dana Whitfield');
    expect(properName('  dana   whitfield ')).toBe('Dana Whitfield');
    expect(quoteHeadline({ firstName: firstNameOf(properName('dana whitfield')), projectType: null, approved: false }))
      .toBe("Dana, here's your quote.");
  });

  /**
   * A word that already mixes cases is never touched. Somebody chose that, and
   * a title-caser that "fixes" it gets a person's own name wrong on a contract
   * — which is worse than doing nothing at all.
   */
  it('never overrules a name that was deliberately cased', () => {
    for (const name of ['Dana McBride', 'Kim DeLuca', 'JoAnne Parker', 'Seán d’Arcy', 'Dana Whitfield']) {
      expect(properName(name), name).toBe(name);
    }
    // Mixed input: only the shouted half moves.
    expect(properName('McBride LANDSCAPING')).toBe('McBride Landscaping');
  });

  /* Apostrophes and hyphens have only one reading, so they are handled. Mc and
     Mac do not — the rule that gets McBride right turns Machado into MacHado —
     so they are deliberately left alone. */
  it('capitalizes across the punctuation inside a name, and not the Scottish prefixes', () => {
    expect(properName("o'neill")).toBe("O'Neill");
    expect(properName('MARY-JANE HOLT')).toBe('Mary-Jane Holt');
    expect(properName('j.r. okafor')).toBe('J.R. Okafor');
    expect(properName('mcbride')).toBe('Mcbride');
  });

  it('leaves what it cannot case, and says nothing when there is nothing', () => {
    expect(properName('JOSÉ')).toBe('José');
    // No cased letters at all — nothing to be wrong about.
    expect(properName('林 家豪')).toBe('林 家豪');
    expect(properName('')).toBeNull();
    expect(properName('   ')).toBeNull();
    expect(properName(null)).toBeNull();
    expect(properName(undefined)).toBeNull();
  });
});

/* --- the dates are dates ---------------------------------------------------- */

describe('start dates are choosable, not buried in the feed', () => {
  it('is one radio group sharing one note, not one form per option', () => {
    expect(dates).toContain('type="radio"');
    expect(dates).toContain('name="optionIndex"');
    // Exactly one field named notes reaches the select action.
    const selectForm = dates.slice(dates.indexOf('action={selectAction}'), dates.indexOf('action={differentAction}'));
    expect(selectForm.match(/name="notes"/g) ?? []).toHaveLength(1);
  });

  it('cannot be submitted before a date is picked', () => {
    expect(dates).toContain('disabled={chosen === null}');
  });

  it('tells the truth about what choosing a date does before the quote is approved', () => {
    // Selecting an option accepts the quote — existing server behavior.
    expect(dates).toContain("awaitingApproval ? 'Approve quote and book this date' : 'Confirm this date'");
  });

  it('feeds the rail, so the summary knows the date the page is showing', () => {
    expect(dates).toContain('setPreferredDate(option.label)');
    expect(accept).toContain('preferredDate');
  });
});

/* --- money that reconciles -------------------------------------------------- */

describe('the rail never prints a total the plan does not cover', () => {
  it('compares the live selection against the plan in cents and says so out loud', () => {
    expect(accept).toContain('Math.round(planTotal * 100) !== Math.round(total * 100)');
    expect(accept).toContain('quote-rail-mismatch');
    expect(accept).toContain('was set up to cover');
  });

  it('does not invent a recalculated schedule the server will not charge', () => {
    // The plan's total_cents is fixed at quote time. A live preview derived
    // from the new total would be a number nobody is going to be charged.
    expect(accept).not.toContain('planSchedulePreview');
    expect(accept).not.toContain('buildPlanSchedule');
  });
});

/* --- states ---------------------------------------------------------------- */

describe('every end of the road has a page', () => {
  it('a dead link explains itself and says what to do', () => {
    expect(page).toContain('This quote link is no longer active');
    expect(page).toContain('ask for a fresh link');
  });

  it('a render failure is not Next’s stack-trace screen', () => {
    const error = read('src', 'app', 'client', 'jobs', '[token]', 'error.tsx');
    expect(error).toContain("'use client'");
    expect(error).toContain('onClick={reset}');
    expect(error).toContain('Try again');
    // The digest is logged, never rendered at a homeowner.
    expect(error).toContain('console.error');
    expect(error).not.toMatch(/>\{error\.digest\}/);
  });

  it('the wait has a skeleton in the shape of the real page', () => {
    const loading = read('src', 'app', 'client', 'jobs', '[token]', 'loading.tsx');
    expect(loading).toContain('quote-deck');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Loading your quote');
  });

  it('a quote with nothing in it says so instead of rendering an empty card', () => {
    expect(page).toContain('hasn&rsquo;t added the details to this quote yet');
  });

  it('an approval reads back as a receipt, not a banner', () => {
    expect(accept).toContain('export function QuoteApproved');
    for (const fact of ['Accepted by', 'Start date', 'quote-rail-next']) {
      expect(accept, fact).toContain(fact);
    }
    expect(page).toContain('signerName={signedName}');
  });

  it('money already taken is shown back, not only money still owed', () => {
    expect(page).toContain('settledPayments');
    expect(page).toContain('Payments made');
  });

  it('reads the flags its own actions redirect with', () => {
    // Every action redirects with one of these and nothing read them, so a
    // question that failed to send looked exactly like one that had.
    for (const key of ['approved', 'scheduled', 'schedule-requested', 'asked', 'ask-failed']) {
      expect(page, key).toContain(`${key.includes('-') ? `'${key}'` : key}:`);
    }
    expect(page).toContain('searchParams?.[key]');
  });
});

/* --- one style, and only one ----------------------------------------------- */

describe('there is one quote treatment, not a choice of three', () => {
  /**
   * There were three — Classic, Signature and Bold — behind a picker in
   * Settings. Nobody had chosen one: every account was on the default, so the
   * two alternatives were two extra documents to keep correct on the page a
   * homeowner uses to agree to spend money. They are gone, along with the
   * column reader, the server action and the picker.
   */
  it('keeps no trace of the two treatments nobody used', () => {
    for (const dead of ['.qstyle-classic', '.qstyle-bold', '.qstyle-picker', '.qstyle-choice', '.qstyle-preview']) {
      expect(css, dead).not.toContain(dead);
      expect(lite, dead).not.toContain(dead);
    }
    const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
    expect(page).not.toContain('quoteStyleClass');
    expect(page).not.toContain('qstyle-');
    expect(read('src', 'lib', 'job-feed.ts')).not.toContain('quote_style');
    expect(read('src', 'app', 'dashboard', 'settings', 'actions.ts')).not.toContain('quote_style');
    expect(read('src', 'app', 'dashboard', 'settings', 'page.tsx')).not.toContain('QuoteStyleSection');
  });

  /**
   * The one that survived is the one every account was already being served, so
   * removing the choice changed nobody's quote. It lives on the page root
   * itself now rather than behind a class, which is what makes that true.
   */
  it('is the base, so the page needs no style class to wear it', () => {
    expect(css).toContain('.client-job-dashboard {');
    const root = css.slice(css.indexOf('.client-job-dashboard {'), css.indexOf('}', css.indexOf('.client-job-dashboard {')));
    // The --q-* properties are still how the page keeps geometry and type in
    // one place; that was true before there were styles and still is.
    for (const prop of ['--q-radius', '--q-title-size', '--q-hero-pad', '--q-card-shadow']) {
      expect(root, prop).toContain(prop);
    }
  });

  /** It has to reach a homeowner, who only ever gets the lite sheet. */
  it('reaches the page a customer opens, not only the sheet the dashboard loads', () => {
    expect(lite).toContain('.client-job-dashboard {');
    expect(lite).toContain('.quote-deck');
  });
});

/* --- extras that can no longer be changed ------------------------------------ */

describe('a closed options window looks closed', () => {
  const doc = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx');

  /**
   * THE BUG. Once the window closed, each row was still a <label> wrapping a
   * DISABLED checkbox: it kept its pointer cursor, its hover lift and a pill
   * reading "+ Add". A customer pressed "+ Add" on a $2,500 line and got
   * nothing back, and concluded the page was broken.
   */
  it('renders no input at all once the extras are locked', () => {
    // The locked branch only, ending at its own closing brace — the editable
    // branch that follows it legitimately still has an <input>.
    const start = doc.indexOf('if (!canEditOptions) {');
    const locked = doc.slice(start, doc.indexOf('\n              }\n', start));
    expect(locked).not.toContain('<input');
    expect(locked).not.toContain('<label');
    expect(locked).toContain('is-locked');
    // It states what was chosen instead of offering to change it.
    expect(locked).toContain("'Included'");
    expect(locked).toContain("'Not added'");
  });

  it('takes the pointer and the hover off the row', () => {
    expect(css).toMatch(/\.quote-doc-addon\.is-locked \.quote-doc-addon-hit\s*\{\s*cursor:\s*default;/);
    expect(css).toMatch(/\.quote-doc-addon\.is-locked:hover \{[^}]*transform: none/);
  });

  /**
   * SOURCE ORDER, NOT SPECIFICITY. The contractor-colour block paints the
   * selected pill at the same weight; a locked rule written earlier in the file
   * loses to it, which is exactly what happened first time — the pill kept its
   * filled button look while claiming to be a tag.
   */
  it('states the locked pill AFTER the rule that paints it', () => {
    // lastIndexOf, because there are two of these: the base rule and the
    // contractor-colour one that overrides it. The later one is what a locked
    // rule has to be written after.
    const brand = css.lastIndexOf('.quote-doc-addon.is-selected .quote-doc-addon-btn');
    const locked = css.indexOf('.quote-doc-addon.is-locked.is-selected .quote-doc-addon-btn');
    expect(brand).toBeGreaterThan(-1);
    expect(locked).toBeGreaterThan(brand);
  });

  /** The reason belongs where the buttons were, not only in the rail. */
  it('says why, next to the extras', () => {
    expect(doc).toContain('quote-doc-addons-closed');
    expect(doc).toContain('closedNote');
    expect(read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx')).toContain('closedNote={optionsClosedNote}');
  });
});

/* --- dates you can see but not yet pick --------------------------------------- */

describe('the offered dates are shown even when they cannot be chosen yet', () => {
  const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
  const locked = read('src', 'app', 'client', 'jobs', '[token]', 'ScheduleLockedOptions.tsx');

  /**
   * A payment plan awaiting its deposit used to render the whole dates section
   * as null. A homeowner who had been texted "here are three dates" opened the
   * page, found no dates and no explanation, and could not tell whether the
   * offer was real.
   */
  it('renders #dates while a plan is awaiting its deposit', () => {
    expect(page).toContain("scheduleOpen && plan?.status === 'pending_deposit'");
    const block = page.slice(page.indexOf("scheduleOpen && plan?.status === 'pending_deposit'"));
    expect(block.slice(0, 1200)).toContain('id="dates"');
    expect(block.slice(0, 1200)).toContain('<ScheduleLockedOptions');
  });

  /** The deposit-gate state showed a card that PROMISED the options would
   *  appear once paid — while holding them the whole time. */
  it('shows them behind a deposit gate too', () => {
    const block = page.slice(page.indexOf('depositBlocksScheduling ? ('));
    expect(block.slice(0, 1600)).toContain('<ScheduleLockedOptions');
  });

  /**
   * Not a disabled form. A radio a screen reader announces and then refuses to
   * operate is worse than a list that never claimed to be a control.
   */
  it('is a list, with no input to tab onto', () => {
    expect(locked).toContain('<ul');
    expect(locked).not.toContain('<input');
    expect(locked).not.toContain('disabled');
    expect(locked).toContain('aria-hidden');
  });

  /** Readable, not greyed into decoration — the date is the reason to act. */
  it('dims the card without hiding the date', () => {
    const rule = css.slice(css.indexOf('.date-card.is-locked {'), css.indexOf('}', css.indexOf('.date-card.is-locked {')));
    const opacity = Number(rule.match(/opacity:\s*([\d.]+)/)?.[1] ?? 0);
    expect(opacity).toBeGreaterThanOrEqual(0.6);
    expect(css).toContain('.date-choice-locked');
    expect(lite).toContain('.date-card.is-locked');
  });

  /**
   * Selecting a date on an UNAPPROVED quote still approves and books it in one
   * step. That is a step saved, not a gate skipped, and locking it would have
   * added a round trip to every booking.
   */
  it('leaves the one-step approve-and-book path alone', () => {
    const choice = read('src', 'app', 'client', 'jobs', '[token]', 'ScheduleChoice.tsx');
    expect(choice).toContain('Approve quote and book this date');
    // The pickable branch is reached on `scheduleOpen` alone. Approval is not
    // one of the conditions in the chain, so an unapproved quote still gets a
    // real picker rather than the locked list.
    const section = page.slice(page.indexOf('const scheduleSection'), page.indexOf('const scheduledSection'));
    expect(section).toContain(') : scheduleOpen ? (');
    expect(section).toContain('<ScheduleChoice');
    expect(section).not.toContain('!awaitingApproval');
  });
});

/* --- the page wears the contractor, not us ---------------------------------- */

describe('the whole page is painted in the contractor’s color', () => {
  it('the add-on cards stopped being hardcoded platform orange', () => {
    // The repaint sits in the quote-page block; `.quote-doc-addon` also appears
    // in the original rules above it and in the reduced-motion block below.
    const start = css.indexOf('.quote-doc-addon {', css.indexOf("THE CUSTOMER'S QUOTE PAGE"));
    const addon = css.slice(start, css.indexOf('.quote-doc-group-note', start));
    expect(start).toBeGreaterThan(-1);
    expect(addon).toContain('var(--cbrand-edge,');
    expect(addon).toContain('var(--cbrand-on,');
    expect(addon).not.toMatch(/:\s*#ff8a3d\s*[;)]/);
  });

  it('every brand reference falls back to the platform palette for an unreadable hex', () => {
    const block = css.slice(css.indexOf('THE CUSTOMER\'S QUOTE PAGE'));
    const bare = block.match(/var\(--cbrand(?:-on|-soft|-edge)?\)/g) ?? [];
    expect(bare, `these have no fallback: ${bare.join(', ')}`).toEqual([]);
  });

  it('and the one contrast decision is computed, not chosen', () => {
    expect(css).toContain('var(--cbrand-on,');
    expect(page).toContain('brandPaint(dashboard.brand.accent)');
  });
});

/* --- responsive and print ---------------------------------------------------- */

describe('it works on a phone and on paper', () => {
  it('the rail becomes a stacked panel and a pinned bar below the two-column breakpoint', () => {
    const tablet = css.slice(css.indexOf('@media (max-width: 1023px) {', css.indexOf('THE CUSTOMER\'S QUOTE PAGE')));
    expect(tablet).toMatch(/\.quote-rail-sticky\s*\{\s*position:\s*static;/);
    expect(tablet).toContain('.quote-bottom-bar {');
    expect(tablet).toContain('position: fixed');
    // Room for the bar, or it covers the last section.
    expect(tablet).toContain('padding-bottom: 5.5rem');
  });

  it('the bar reviews rather than approves', () => {
    // A fixed bar that signs a contract with one thumb press, halfway through
    // reading it, is the wrong control.
    expect(deck).toContain('href={`#${QUOTE_FORM_ID}`}');
    expect(deck).not.toMatch(/quote-bottom-cta[\s\S]{0,200}type="submit"/);
    expect(css).toContain('scroll-margin-top: 5rem');
  });

  it('the fixed bar is prefixed for the browser it exists for', () => {
    expect(lite).toMatch(/-webkit-backdrop-filter: blur\(10px\);\s*\n\s*backdrop-filter: blur\(10px\);/);
  });

  it('prints the document and none of the controls', () => {
    const block = lite.slice(lite.indexOf('@media print'));
    for (const hidden of ['.quote-deck-rail', '.quote-bottom-bar', '.date-choice', '.pay-choice-grid', '.quote-flash']) {
      expect(block, `${hidden} should not print`).toContain(hidden);
    }
    // Two columns on paper puts the document in a 60% gutter.
    expect(block).toMatch(/\.quote-deck,[\s\S]{0,80}display: block !important/);
  });

  it('forces ink on the hero, which Bold fills with the contractor’s color', () => {
    // Backgrounds do not print. Computed light ink on an unprinted dark fill is
    // exactly what produced an empty two-page PDF.
    const block = lite.slice(lite.indexOf('@media print'));
    expect(block).toMatch(/\.quote-hero \*\s*\{\s*color: #111 !important/);
  });

  it('asks for no motion from somebody who asked for none', () => {
    expect(deck).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.sign-method {')));
    expect(reduced).toContain('.date-card');
    expect(reduced).toContain('.pay-option');
  });
});
