import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('FieldIntakeHint Popover Positioning & Stacking', () => {
  it('verifies hintPopover anchors to right: 0 and uses high z-index', () => {
    const css = readFileSync('src/components/field-intake-hint.module.css', 'utf8');
    expect(css).toContain('.hintPopover {');
    expect(css).toContain('right: 0;');
    expect(css).toContain('left: auto;');
    expect(css).toContain('z-index: 1000;');
    expect(css).toContain('max-width: min(320px, calc(100vw - 2rem));');
  });

  it('verifies clients hero and heroActions establish stacking context above workspaceCard', () => {
    const css = readFileSync('src/app/dashboard/clients/clients-page.module.css', 'utf8');
    expect(css).toContain('.hero {');
    expect(css).toContain('z-index: 30;');
    expect(css).toContain('.heroActions {');
    expect(css).toContain('z-index: 31;');
  });
});
