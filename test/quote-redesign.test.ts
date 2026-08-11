import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatUsdExact, formatUsdRounded } from '@/lib/money-format';
import { formatMoneyExact } from '@/lib/jobs';
import { isSignature } from '@/app/client/jobs/[token]/QuoteDeck';
import { firstNameOf, projectTypeOf, quoteHeadline } from '@/lib/quote-hero';
import {
  DEFAULT_QUOTE_STYLE,
  normalizeQuoteStyle,
  QUOTE_STYLES,
  QUOTE_STYLE_META,
  quoteStyleClass,
} from '@/lib/quote-style';
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
    expect(page).toContain('Prepared for {dashboard.job.client_name}');
    expect(page).toContain('{headline}');
    expect(page).toContain('{dashboard.job.address}');
    expect(page).toContain('{status.label}');
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

/* --- three styles ----------------------------------------------------------- */

describe('a contractor picks one of three treatments', () => {
  it('normalizes anything it does not recognize rather than reaching a className', () => {
    expect(normalizeQuoteStyle('classic')).toBe('classic');
    expect(normalizeQuoteStyle('bold')).toBe('bold');
    expect(normalizeQuoteStyle(null)).toBe(DEFAULT_QUOTE_STYLE);
    expect(normalizeQuoteStyle(undefined)).toBe(DEFAULT_QUOTE_STYLE);
    expect(normalizeQuoteStyle('neon')).toBe(DEFAULT_QUOTE_STYLE);
    expect(normalizeQuoteStyle(7)).toBe(DEFAULT_QUOTE_STYLE);
  });

  it('every style has a class, a name and a stylesheet that answers to it', () => {
    for (const style of QUOTE_STYLES) {
      expect(quoteStyleClass(style)).toBe(`qstyle-${style}`);
      expect(QUOTE_STYLE_META[style].name.length, style).toBeGreaterThan(0);
      expect(QUOTE_STYLE_META[style].bestFor.length, style).toBeGreaterThan(20);
    }
    // The default needs no overrides — it IS the base — so only the other two
    // are required to appear as selectors.
    expect(css).toContain('.qstyle-classic {');
    expect(css).toContain('.qstyle-bold {');
  });

  it('reaches the page a customer opens, not only the sheet the dashboard loads', () => {
    // The root layout gives every route globals-lite; only /dashboard, /admin
    // and /demo add the full sheet. A style that landed only in globals.css
    // would never reach a homeowner.
    expect(lite).toContain('.qstyle-classic');
    expect(lite).toContain('.qstyle-bold');
    expect(lite).toContain('.quote-deck');
  });

  it('changes presentation only — the three differ in type, geometry and hero, never in content', () => {
    const classic = css.slice(css.indexOf('.qstyle-classic {'), css.indexOf('}', css.indexOf('.qstyle-classic {')));
    const bold = css.slice(css.indexOf('.qstyle-bold {'), css.indexOf('}', css.indexOf('.qstyle-bold {')));
    for (const block of [classic, bold]) {
      // Only --q-* custom properties. A style that could set `display: none` or
      // `content:` could change what a customer is shown, which is the one
      // thing a presentation choice must never do.
      for (const line of block.split('\n').slice(1)) {
        const declaration = line.trim();
        if (!declaration || declaration.startsWith('/*') || declaration.startsWith('*')) continue;
        expect(declaration, declaration).toMatch(/^--q-[a-z-]+:/);
      }
    }
  });

  it('is loaded defensively, so an un-migrated database renders the default rather than nothing', () => {
    const feed = read('src', 'lib', 'job-feed.ts');
    expect(feed).toContain("select('quote_style')");
    expect(feed).toContain('normalizeQuoteStyle(styleRow?.quote_style)');
    // Not folded into the accounts select above it, which would fail the whole
    // query — and the whole page — on a database missing the column.
    expect(feed).not.toContain("select('business_name, quote_style')");
  });

  it('the contractor picks it by looking at it, in their own color', () => {
    const picker = read('src', 'app', 'dashboard', 'settings', 'QuoteStyleSection.tsx');
    expect(picker).toContain('quoteStyleClass(style)');
    // The preview renders the customer page's real classes, so it cannot drift
    // from the page it is previewing.
    expect(picker).toContain('client-job-dashboard');
    expect(picker).toContain('style={brandStyle}');
    expect(picker).toContain('role="radiogroup"');
    expect(read('src', 'app', 'dashboard', 'settings', 'actions.ts')).toContain('normalizeQuoteStyle(style)');
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
    expect(tablet).toContain('.quote-rail-sticky { position: static; }');
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
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {', css.indexOf('.qstyle-picker')));
    expect(reduced).toContain('.date-card');
    expect(reduced).toContain('.pay-option');
  });
});
