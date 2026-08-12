import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const BUILDER = read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteBuilder.tsx');
const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const CSS = read('src', 'app', 'globals.css');

const section = () => {
  const at = JOB_PAGE.indexOf('id="quote-breakdown"');
  expect(at).toBeGreaterThan(-1);
  return JOB_PAGE.slice(at, at + 2000);
};

/**
 * The quote header was a heading, a three-sentence paragraph, and then TWO
 * full-width bars — each a button beside a two-line explanation of what it did.
 * A hundred words of instruction above a quote nobody had written yet, and the
 * first thing on the screen every time the page loaded.
 */
describe('the quote header is a heading and a toolbar', () => {
  it('says it in one sentence', () => {
    expect(section()).toContain('Itemize the work, add optional upgrades, or leave this empty for one quoted amount.');
    expect(JOB_PAGE).not.toContain('The\n          quote total updates automatically');
  });

  /** Print was the only one of the three up in the title bar, which made the
   *  thing you reach for last look like the section's primary action. */
  it('puts all three actions on one row, under the heading', () => {
    expect(section()).not.toContain('Print estimate →');
    expect(JOB_PAGE).toContain('printHref={`/dashboard/jobs/${job.id}/quote`}');

    const toolbar = BUILDER.slice(BUILDER.indexOf('className="quote-head-actions"'), BUILDER.indexOf('quote-draft-error'));
    expect(toolbar).toContain('Draft from scope');
    expect(toolbar).toContain('Check before sending');
    expect(toolbar).toContain('Print estimate');
  });

  it('drops the two stacked explanation bars', () => {
    expect(BUILDER).not.toContain('quote-draft-bar');
    expect(CSS).not.toContain('.quote-draft-bar');
  });

  /** The explanations move onto the buttons rather than vanishing. */
  it('keeps what each tool does within reach', () => {
    expect(BUILDER).toContain('title="Builds line items from this job’s scope');
    expect(BUILDER).toContain('looks for work the description mentions that isn’t priced here.');
  });

  /**
   * "Check before sending" used to render only once a first line existed, so it
   * appeared out of nowhere mid-typing. A control that materialises is one you
   * have to notice; one that wakes up is one you were already looking at.
   */
  it('shows the check button asleep rather than absent', () => {
    expect(BUILDER).toContain('disabled={reviewing || rows.length === 0}');
    expect(BUILDER).not.toContain('reviewAction && rows.length > 0 ?');
    expect(BUILDER).toContain('Add a line item first');
    expect(CSS).toContain('.quote-tool:disabled');
  });

  /**
   * An emoji is a font: it renders at a different weight and color on every
   * platform, and it cannot take the muted grey these buttons are set in.
   */
  it('draws its glyphs rather than typing them', () => {
    // Comments out first — the icon block's own docs name what it replaced.
    const markup = BUILDER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(markup).not.toContain('✨');
    expect(markup).not.toContain('🔍');
    for (const icon of ['IconSpark', 'IconLens', 'IconPrinter']) expect(BUILDER, icon).toContain(`function ${icon}(`);
    expect(BUILDER).toContain('stroke="currentColor"');
  });

  it('stays thumb-sized where it wraps', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 560px) {', CSS.indexOf('.quote-print {')));
    expect(phone.slice(0, 220)).toContain('.quote-tool, .quote-print { min-height: 42px; }');
  });

  /** The lead form renders the same builder with no job to print yet. */
  it('leaves the print button off where there is nothing to print', () => {
    expect(BUILDER).toContain('{printHref ? (');
    expect(read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx')).not.toContain('printHref');
  });
});
