import { describe, it, expect } from 'vitest';
import {
  QUOTE_FORM_STYLES,
  QUOTE_FORM_STYLE_KEYS,
  getQuoteFormStyle,
  getSiteContent,
  mergeSiteContent,
  type QuoteFormStyle,
} from '@/lib/site-content';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Instant Quote Form Appearance Styles', () => {
  it('defines exactly 4 distinct quote form styles', () => {
    expect(QUOTE_FORM_STYLES).toHaveLength(4);
    const keys = QUOTE_FORM_STYLES.map((s) => s.key);
    expect(keys).toEqual(['glow', 'clean', 'glass', 'bold']);
  });

  it('provides descriptive labels and descriptions for all styles', () => {
    for (const style of QUOTE_FORM_STYLES) {
      expect(style.label).toBeTruthy();
      expect(style.desc).toBeTruthy();
      expect(QUOTE_FORM_STYLE_KEYS.has(style.key)).toBe(true);
    }
  });

  it('defaults getQuoteFormStyle to glow when unset or empty', () => {
    expect(getQuoteFormStyle(null)).toBe('glow');
    expect(getQuoteFormStyle(undefined)).toBe('glow');
    expect(getQuoteFormStyle({})).toBe('glow');
    expect(getQuoteFormStyle({ quoteFormStyle: '' })).toBe('glow');
  });

  it('normalizes valid quote form styles accurately', () => {
    const styles: QuoteFormStyle[] = ['glow', 'clean', 'glass', 'bold'];
    for (const style of styles) {
      const content = getSiteContent({ quoteFormStyle: style });
      expect(content.quoteFormStyle).toBe(style);
      expect(getQuoteFormStyle({ quoteFormStyle: style })).toBe(style);
    }
  });

  it('safely falls back to glow for unknown or invalid style keys', () => {
    const content = getSiteContent({ quoteFormStyle: 'invalid-nonexistent-style' });
    expect(content.quoteFormStyle).toBe('glow');
    expect(getQuoteFormStyle({ quoteFormStyle: 'invalid-nonexistent-style' })).toBe('glow');
  });

  it('merges quoteFormStyle updates correctly', () => {
    const initial = { company_name: 'Apex Roofing', quoteFormStyle: 'glow' };
    const updated = mergeSiteContent(initial, { quoteFormStyle: 'glass' });
    expect(getQuoteFormStyle(updated)).toBe('glass');

    const boldUpdated = mergeSiteContent(updated, { quoteFormStyle: 'bold' });
    expect(getQuoteFormStyle(boldUpdated)).toBe('bold');
  });

  it('ensures HeroQuickForm passes data-form-style to the root form', () => {
    const heroCode = readFileSync(join(process.cwd(), 'src/lib/templates/HeroQuickForm.tsx'), 'utf-8');
    expect(heroCode).toContain('data-form-style={formStyle}');
  });

  it('ensures themes.module.css contains rules for all 4 form styles', () => {
    const cssCode = readFileSync(join(process.cwd(), 'src/lib/templates/themes.module.css'), 'utf-8');
    expect(cssCode).toContain("data-form-style='glow'");
    expect(cssCode).toContain("data-form-style='clean'");
    expect(cssCode).toContain("data-form-style='glass'");
    expect(cssCode).toContain("data-form-style='bold'");
  });

  it('ensures WebsiteBuilder exposes the quoteFormStyle picker in both Page and Design tabs', () => {
    const builderCode = readFileSync(join(process.cwd(), 'src/app/dashboard/sites/WebsiteBuilder.tsx'), 'utf-8');
    expect(builderCode).toContain('QUOTE_FORM_STYLES');
    expect(builderCode).toContain('quoteFormStyle');
    expect(builderCode).toContain('Instant quote form appearance');
  });
});
