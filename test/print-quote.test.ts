import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Print or save as PDF" on a customer's quote produced a two-page PDF with
 * nothing on it.
 *
 * Two separate faults, and only one of them was the reported page.
 *
 *   1. The client job page renders on a dark ground. No browser prints
 *      background colours by default, so stripping the panel backgrounds for
 *      print without ALSO forcing a text colour left every word set in the dark
 *      theme's light ink — white type on white paper. The right number of
 *      pages, and nothing visible on any of them.
 *
 *   2. The selection board's print isolation was `body * { visibility: hidden }`
 *      with no scope at all. It only reaches pages that load the full
 *      globals.css — the dashboard, admin and demo trees — so it was not what
 *      the customer saw, but it blanked the print output of every page in
 *      those trees.
 *
 * Print CSS cannot be exercised in a node test, so these read the sheet. The
 * assertions are about the two things that actually broke.
 */

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
const lite = readFileSync(join(process.cwd(), 'src', 'app', 'globals-lite.css'), 'utf8').replace(/\r\n/g, '\n');

/** Every `@media print { … }` block in a sheet, brace-matched. */
function printBlocks(sheet: string): string[] {
  const blocks: string[] = [];
  const marker = /@media\s+print\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(sheet))) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < sheet.length && depth > 0) {
      if (sheet[index] === '{') depth += 1;
      else if (sheet[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push(sheet.slice(start, index - 1));
  }
  return blocks;
}

describe('nothing hides every page on the way to the printer', () => {
  it('the selection board no longer blanks the whole product', () => {
    for (const block of printBlocks(css)) {
      // An unscoped `body *` visibility reset takes the page with it.
      expect(block).not.toMatch(/(^|[^)\s])\s*body\s*\*\s*\{[^}]*visibility:\s*hidden/);
    }
  });

  it('its isolation is scoped to a page that actually has a board', () => {
    expect(css).toMatch(/body:has\(\.selection-board\)\s*\*\s*\{\s*visibility:\s*hidden;/);
  });

  it('found at least one print block to check, so the matcher is not vacuous', () => {
    expect(printBlocks(css).length).toBeGreaterThan(2);
  });
});

describe('the customer’s quote prints as ink on paper', () => {
  const block = printBlocks(lite).find((b) => b.includes('.client-job-dashboard'));

  it('is in the sheet the client page actually loads', () => {
    // The root layout imports globals-lite for every route; only the dashboard,
    // admin and demo trees add the full sheet on top. A print fix that landed
    // only in globals.css would never reach a homeowner.
    expect(block, 'no client print rules in globals-lite.css').toBeTruthy();
  });

  it('forces a text colour rather than inheriting the dark theme’s', () => {
    expect(block).toMatch(/\.client-job-dashboard \*[\s\S]{0,120}color:\s*#111\s*!important/);
  });

  it('whitens the page ground, which is a gradient that never prints', () => {
    expect(block).toMatch(/body\s*\{\s*background:\s*#fff\s*!important/);
  });

  it('keeps the contractor on the document and drops the controls', () => {
    expect(block).toContain('.cbrand');
    for (const hidden of ['.client-ask', '.quote-doc-print', '.quote-doc-sign', '.client-secure-note']) {
      expect(block, `${hidden} should not print`).toContain(hidden);
    }
  });

  it('restores the rules the eye needs once the fills are gone', () => {
    expect(block).toMatch(/quote-doc-total[\s\S]{0,120}border-top/);
    expect(block).toMatch(/quote-doc-line[\s\S]{0,160}border-bottom/);
  });

  it('does not print an add-on the customer left unticked as though it were included', () => {
    expect(block).toContain('.quote-doc-addon:not(.is-selected)');
  });
});
