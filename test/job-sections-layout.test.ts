import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * The job page's sections are one column, and it matters that they stay that way.
 *
 * They used to sit in a `detail-grid` — 2fr holding Job expenses alone, 1fr
 * holding Selections, Warranty, Change orders and ROI. The column with four
 * cards got a third of the width, so its headings wrapped to three and four
 * lines and it stood 456px tall next to a 130px card: a ragged 327px of nothing
 * under Job expenses.
 *
 * Rebalancing the columns does not survive contact with the page. Every card
 * here is a <details> the owner opens and shuts independently, and the Change
 * orders card only exists on some jobs, so any split that lines up while they
 * are all closed goes ragged the moment one is opened.
 */
describe('the job page sections stack in one column', () => {
  it('uses a single-column grid for #job-costs', () => {
    expect(JOB_PAGE).toMatch(/<section id="job-costs" className="workspace-grid">/);
  });

  it('and .workspace-grid really is one column', () => {
    // No grid-template-columns of its own — one column is the grid default, and
    // .two-up is the opt-in that adds a second.
    expect(GLOBALS).toMatch(/\.workspace-grid \{\s*display: grid;\s*gap: 1\.25rem;\s*\}/);
  });

  // Matched inside className= rather than anywhere in the file: the comment
  // above the section names both old classes to explain why they went.
  it('does not put the sections back into two columns', () => {
    expect(JOB_PAGE).not.toMatch(/className="[^"]*\bdetail-grid\b/);
  });

  /**
   * ROI carried `sticky-card` so it would ride along beside the expenses being
   * logged. Good idea, never worked: it was the LAST child of its column, so
   * there was no track below it to slide along — measured, it did not move a
   * pixel after scrolling 900px past a tall expenses list. In one column the
   * class would be wrong as well as inert.
   */
  it('drops the sticky ROI card that never actually stuck', () => {
    expect(JOB_PAGE).not.toMatch(/className="[^"]*\bsticky-card\b/);
  });

  /**
   * Scoped to this page. `.detail-grid` is a genuine main-plus-rail layout on
   * three other pages, where the wide column carries a real list rather than
   * one collapsed accordion — deleting the class would break all three.
   */
  it('leaves the shared two-column layout alone for the pages that use it properly', () => {
    expect(GLOBALS).toMatch(/\.detail-grid \{[^}]*grid-template-columns: 2fr 1fr/);
    for (const page of [
      ['src', 'app', 'dashboard', 'clients', '[id]', 'page.tsx'],
      ['src', 'app', 'dashboard', 'jobs', '[id]', 'invoices', '[invoiceId]', 'page.tsx'],
    ]) {
      expect(read(...page), `${page.join('/')} lost its detail-grid`).toContain('detail-grid');
    }
  });

  /**
   * The customer's quote page left this list on purpose.
   *
   * It used `.detail-grid` for one thing — the activity feed beside the
   * documents card, low on the page — which put the log level with the quote
   * itself and left the total scrolling away from the button that agreed to it.
   * The whole page is a main-plus-rail now, and the rail is the approval: the
   * total, the selections, the date, the payment choice and the signature, all
   * sticky. That is a different layout with a different job, not a page that
   * lost its columns.
   */
  it('the client quote page uses its own main-plus-rail instead', () => {
    const quote = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
    expect(quote).not.toContain('detail-grid');
    expect(quote).toContain('quote-deck');
    expect(quote).toContain('quote-deck-rail');
    expect(GLOBALS).toMatch(/\.quote-deck \{[^}]*grid-template-columns: minmax\(0, 1fr\) 22rem/);
    // And it collapses, rather than staying two columns on a phone.
    expect(GLOBALS).toMatch(/@media \(max-width: 1023px\) \{\s*\.quote-deck \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
