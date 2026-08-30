import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const GLOBALS = read('src', 'app', 'globals.css');
const CREW_PAGE = read('src', 'app', 'dashboard', 'crew', 'page.tsx');
const LEADS_MODULE = read('src', 'app', 'dashboard', 'leads', 'leads.module.css');

/**
 * The logged-in app fills the screen; the pages that merely share its wrapper
 * class do not.
 *
 * `.wide-shell` is worn by two different kinds of page. Inside the sidebar
 * layout it is the workspace — a calendar, a nine-column table, a master-detail
 * — and capping it at 1100px threw away 531px of a 1920 screen. Outside it, the
 * same class dresses an invoice, a booking flow and a customer's job link,
 * where the column IS the design.
 *
 * So the fluid rule has to stay scoped. An unscoped `.wide-shell { max-width:
 * none }` would look identical on every screen anybody would think to check and
 * quietly stretch a customer's invoice across a desktop monitor.
 */
describe('the app shell fills the screen', () => {
  it('makes .wide-shell fluid, and only inside the app', () => {
    expect(GLOBALS).toMatch(/\.app-main-sidenav \.wide-shell \{[^}]*max-width:\s*none/);
  });

  it('leaves the shared 1100px column in place for the document pages', () => {
    // The base rule is what /invoice, /book and /client/jobs still ride on.
    expect(GLOBALS).toMatch(/\.wide-shell \{[^}]*max-width:\s*1100px/);
  });

  /**
   * The one screen that asked to stay narrow, and the pairing that keeps it so.
   *
   * `crew-wide` means "this view wants room" and is toggled per view — from a
   * cookie server-side and again on the client. The cap now hangs off its
   * ABSENCE, which means it needs a class that is always there to hang from.
   * Rename either half and nothing errors: crew Overview silently goes
   * full-bleed and strands its detail pane's buttons a screen from the list
   * they were picked from, which is the exact thing the cap exists to prevent.
   */
  it('keeps crew Overview at the standard column', () => {
    expect(GLOBALS).toMatch(
      /\.app-main-sidenav \.wide-shell\.crew-shell:not\(\.crew-wide\) \{[^}]*max-width:\s*1100px/,
    );
  });

  it('and the crew page still wears the class that rule keys off', () => {
    expect(CREW_PAGE).toContain("'crew-shell'");
    // Unconditional: inside the array literal, not behind a ternary.
    expect(CREW_PAGE).not.toMatch(/\?\s*'crew-shell'/);
  });

  it('still toggles crew-wide per view rather than pinning it on', () => {
    expect(CREW_PAGE).toContain("'crew-wide'");
  });
});

/**
 * Filling the screen is right for a table and wrong for a sentence. Without a
 * measure, the widening handed the app's explanatory paragraphs the whole
 * 1631px too — 236 characters on one unbroken line on the cash-flow page.
 */
describe('the reading measure that came with it', () => {
  it('defines --read-note once, in ch', () => {
    const match = GLOBALS.match(/--read-note:\s*(\d+)ch/);
    expect(match, '--read-note must be defined in ch, not px or rem').toBeTruthy();
    // ch so one number means the same sentence length in a 0.76rem hint and a
    // 1rem lede; the value only has to stay inside the readable band.
    const measure = Number(match![1]);
    expect(measure).toBeGreaterThanOrEqual(60);
    expect(measure).toBeLessThanOrEqual(90);
  });

  /**
   * The blocks that crossed the line when the shell went fluid, found by
   * measuring every text node in the app rather than by reading the markup.
   * Each is load-bearing: drop one and that page alone goes back to a single
   * 150-to-240-character line, on the widest screens only.
   */
  it('applies it to every block that measured too wide', () => {
    for (const selector of [
      '.ins-shell .ins-sub',
      '.ins-more-sub',
      '.cash-chart-hint',
      '.cash-source-warn',
      '.cash-where-list li',
      '.review-feedback-body',
      '.bset-head p',
      '.es-demand-lede',
      '.qs-foot-copy',
      '.plan-drag-hint',
      '.payroll-note',
      '.mkt-rec-why',
    ]) {
      expect(GLOBALS, `${selector} lost its reading measure`).toContain(selector);
    }
    expect(GLOBALS).toMatch(/\.mkt-rec-why\s*\{\s*max-width:\s*var\(--read-note\);/);
  });

  /**
   * A bubble that grows to whatever the window gives it stops reading as a
   * message — these reached 990px at 2560 before the cap.
   */
  it('caps the message bubbles at the same measure', () => {
    expect(GLOBALS).toMatch(
      /\.inbox-bubble \{[^}]*max-width:\s*min\(100%,\s*var\(--read-note\)\)/,
    );
  });

  // The leads score legend lives in a CSS module and reads the same variable,
  // which only works because custom properties inherit through the DOM rather
  // than through the stylesheet they were declared in.
  it('reaches into the leads module too', () => {
    expect(LEADS_MODULE).toMatch(/\.scoreLegendRow > span:last-child \{[^}]*var\(--read-note\)/);
    expect(LEADS_MODULE).toMatch(/\.scoreLegendNote \{[^}]*var\(--read-note\)/);
  });
});
