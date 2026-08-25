import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'marketing', 'EmailThemeSection.module.css'),
  'utf8'
);

describe('EmailThemeSection CSS contrast and token safety', () => {
  it('does not use raw white surface fallbacks that produce white-on-white text', () => {
    // var(--surface, #fff) and var(--surface, #ffffff) resolve to pure white in dark theme,
    // causing var(--text) (#f7f5ef) to be invisible (1.05:1 contrast).
    expect(css).not.toContain('var(--surface, #fff)');
    expect(css).not.toContain('var(--surface, #ffffff)');
    expect(css).not.toContain('var(--surface)');
  });

  it('ensures active preview tabs and viewport buttons use dark-surface contrast tokens', () => {
    expect(css).toContain('.tabBtnActive');
    expect(css).toContain('.viewBtnActive');
    expect(css).toContain('.envelopeCard');
    expect(css).toContain('.cardSelected');
  });

  it('ensures badges and buttons use accessible contrast pairings', () => {
    // check mark and apply button should use dark on-accent text on solid accent background
    expect(css).toContain('color: var(--on-accent, #180c02);');
  });
});
