import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const rgb = (hex: string): [number, number, number] => {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error('not a hex');
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

const luminance = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (hex1: string, hex2: string): number => {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
};

describe('Field Intake Hint Popover High Contrast Multi-Theme Styling', () => {
  const css = readFileSync('src/components/field-intake-hint.module.css', 'utf8');

  it('defines dark theme popover styling with high contrast tokens', () => {
    expect(css).toContain('.hintPopover {');
    expect(css).toContain('background: #0f172a;');
    expect(css).toContain('color: #f1f5f9;');
    expect(css).toContain('.popoverDesc {');
    expect(css).toContain('color: #e2e8f0;');
    expect(css).toContain('.exampleItem {');
    expect(css).toContain('color: #f8fafc;');

    // Dark surface contrast: text (#f1f5f9, #e2e8f0, #f8fafc) on #0f172a
    expect(contrastRatio('#ffffff', '#0f172a')).toBeGreaterThanOrEqual(14.0);
    expect(contrastRatio('#f1f5f9', '#0f172a')).toBeGreaterThanOrEqual(13.0);
    expect(contrastRatio('#e2e8f0', '#0f172a')).toBeGreaterThanOrEqual(11.0);
    expect(contrastRatio('#f8fafc', '#0f172a')).toBeGreaterThanOrEqual(14.0);
  });

  it('defines dim theme popover styling with warm high contrast tokens', () => {
    expect(css).toContain(":root[data-theme='dim'] .hintPopover");
    expect(css).toContain('background: #24211d;');
    expect(css).toContain('color: #efece6;');
    expect(css).toContain(":root[data-theme='dim'] .popoverDesc");
    expect(css).toContain('color: #ded9d0;');

    expect(contrastRatio('#efece6', '#24211d')).toBeGreaterThanOrEqual(11.0);
    expect(contrastRatio('#ded9d0', '#24211d')).toBeGreaterThanOrEqual(9.0);
  });

  it('defines light and sunlight theme popover styling with crisp high contrast tokens', () => {
    expect(css).toContain(":root[data-theme='light'] .hintPopover");
    expect(css).toContain(":root[data-theme='sunlight'] .hintPopover");
    expect(css).toContain('background: #ffffff;');
    expect(css).toContain('border: 2px solid #090d16;');
    expect(css).toContain(":root[data-theme='light'] .popoverDesc");
    expect(css).toContain('color: #0f172a;');
    expect(css).toContain(":root[data-theme='light'] .exampleItem");
    expect(css).toContain('color: #090d16;');

    // Light surface contrast: dark text on white
    expect(contrastRatio('#090d16', '#ffffff')).toBeGreaterThanOrEqual(18.0);
    expect(contrastRatio('#0f172a', '#ffffff')).toBeGreaterThanOrEqual(14.0);
    expect(contrastRatio('#6d28d9', '#ffffff')).toBeGreaterThanOrEqual(6.0);
  });

  it('styles the Save Field Line contact button for high contrast across themes', () => {
    expect(css).toContain('.saveContactBtn {');
    expect(css).toContain('color: #d8b4fe !important;');
    expect(css).toContain(":root[data-theme='light'] .saveContactBtn");
    expect(css).toContain('color: #581c87 !important;');
    expect(css).toContain('background: #f5f3ff !important;');
    expect(contrastRatio('#581c87', '#f5f3ff')).toBeGreaterThanOrEqual(8.0);
  });
});
