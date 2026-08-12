import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src', 'app', 'dashboard', 'leads', 'leads.module.css'), 'utf8').replace(/\r\n/g, '\n');

const rule = (selector: string) => {
  const at = CSS.indexOf(selector);
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at) + 1);
};

/**
 * THE BUG.
 *
 * `.actionForm input { width: 100%; min-height: 42px }` matched every
 * descendant input, checkboxes included. "Also let them pay in full" came out
 * 952px wide and 42px tall on a 1400px screen, which pushed its own label
 * clean outside the card and left it wrapping one word per line down the
 * right-hand margin, with ~300px of dead space under it.
 */
describe('the send-quote form sizes text boxes, not checkboxes', () => {
  it('excludes checkboxes and radios from the full-width text-field rule', () => {
    const base = rule(".actionForm input:where(:not([type='checkbox'], [type='radio']))");
    expect(base).toContain('width: 100%');
    expect(base).toContain('min-height: 42px');
  });

  /**
   * THE PART THAT BIT ON THE FIRST ATTEMPT.
   *
   * A bare `:not([type='checkbox'])` raises the selector to (0,2,1), which
   * lifts it above the narrower rules written to override it —
   * `.planInline input { width: 4.5rem }` is (0,1,1), and the "50 % now" box
   * silently went from 72px to half the row. :where() contributes zero, so the
   * rule weighs exactly what it always did.
   */
  it('keeps the base rule at its original specificity', () => {
    expect(CSS).toContain(":where(:not([type='checkbox'], [type='radio']))");
    expect(CSS).not.toMatch(/\.actionForm input:not\(/);
    // The two overrides that depend on winning against it.
    expect(rule('.planInline input')).toContain('width: 4.5rem');
    expect(rule('.actionForm .quoteAmountInput input')).toContain('min-height: 4.25rem');
  });

  /** Belt and braces: the box states its own size, so nothing it inherits can
   *  decide that for it — the same thing .sms-consent-check already does. */
  it('states the pay-in-full checkbox size in its own rule', () => {
    const box = rule('.planAllowFull input');
    expect(box).toContain('width: 16px');
    expect(box).toContain('height: 16px');
    expect(box).toContain('min-height: 0');

    const label = rule('.planAllowFull {');
    expect(label).toContain('grid-template-columns: 16px minmax(0, 1fr)');
  });
});
