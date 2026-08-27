import { describe, it, expect, vi } from 'vitest';
import {
  QUOTE_FORM_STYLES,
  QUOTE_FORM_STYLE_KEYS,
  getQuoteFormStyle,
  getSiteContent,
  mergeSiteContent,
  type QuoteFormStyle,
} from '@/lib/site-content';
import { trackQuoteFunnelStep } from '@/lib/analytics';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Instant Quote Form Appearance Styles & Intake Flow', () => {
  it('defines exactly 4 distinct quote form styles with Clean & Crisp first', () => {
    expect(QUOTE_FORM_STYLES).toHaveLength(4);
    const keys = QUOTE_FORM_STYLES.map((s) => s.key);
    expect(keys).toEqual(['clean', 'bold', 'glass', 'glow']);
    expect(QUOTE_FORM_STYLES[0].badge).toBe('Recommended');
  });

  it('provides outcome-based labels and descriptions for all styles', () => {
    for (const style of QUOTE_FORM_STYLES) {
      expect(style.label).toBeTruthy();
      expect(style.desc).toBeTruthy();
      expect(QUOTE_FORM_STYLE_KEYS.has(style.key)).toBe(true);
    }
  });

  it('defaults getQuoteFormStyle to clean when unset or empty', () => {
    expect(getQuoteFormStyle(null)).toBe('clean');
    expect(getQuoteFormStyle(undefined)).toBe('clean');
    expect(getQuoteFormStyle({})).toBe('clean');
    expect(getQuoteFormStyle({ quoteFormStyle: '' })).toBe('clean');
  });

  it('normalizes valid quote form styles accurately', () => {
    const styles: QuoteFormStyle[] = ['glow', 'clean', 'glass', 'bold'];
    for (const style of styles) {
      const content = getSiteContent({ quoteFormStyle: style });
      expect(content.quoteFormStyle).toBe(style);
      expect(getQuoteFormStyle({ quoteFormStyle: style })).toBe(style);
    }
  });

  it('safely falls back to clean for unknown or invalid style keys', () => {
    const content = getSiteContent({ quoteFormStyle: 'invalid-nonexistent-style' });
    expect(content.quoteFormStyle).toBe('clean');
    expect(getQuoteFormStyle({ quoteFormStyle: 'invalid-nonexistent-style' })).toBe('clean');
  });

  it('merges quoteFormStyle updates correctly', () => {
    const initial = { company_name: 'Apex Roofing', quoteFormStyle: 'clean' };
    const updated = mergeSiteContent(initial, { quoteFormStyle: 'glass' });
    expect(getQuoteFormStyle(updated)).toBe('glass');

    const boldUpdated = mergeSiteContent(updated, { quoteFormStyle: 'bold' });
    expect(getQuoteFormStyle(boldUpdated)).toBe('bold');
  });

  it('ensures HeroQuickForm passes data-form-style to the root form and uses clean fallback', () => {
    const heroCode = readFileSync(join(process.cwd(), 'src/lib/templates/HeroQuickForm.tsx'), 'utf-8');
    expect(heroCode).toContain('data-form-style={formStyle}');
    expect(heroCode).toContain("siteContent.quoteFormStyle || 'clean'");
    expect(heroCode).toContain('Start my estimate');
    expect(heroCode).toContain('Tell us what you need. We’ll ask up to 3 quick questions and show a price range—usually in about a minute.');
  });

  it('ensures themes.module.css contains high-contrast stepper numbers and brand-aware glow', () => {
    const cssCode = readFileSync(join(process.cwd(), 'src/lib/templates/themes.module.css'), 'utf-8');
    expect(cssCode).toContain("data-form-style='glow'");
    expect(cssCode).toContain("data-form-style='clean'");
    expect(cssCode).toContain("data-form-style='glass'");
    expect(cssCode).toContain("data-form-style='bold'");
    // Brand-aware glow uses var(--theme-accent)
    expect(cssCode).toContain('var(--theme-accent)');
    // High-contrast stepper
    expect(cssCode).toContain('.heroFormStepNum');
    expect(cssCode).toContain('.heroFormStepDotActive .heroFormStepNum');
    expect(cssCode).toContain('.heroFormStepDotComplete .heroFormStepNum');
  });

  it('ensures Forge hero has 2-column desktop layout positioning form in first viewport', () => {
    const cssCode = readFileSync(join(process.cwd(), 'src/lib/templates/themes.module.css'), 'utf-8');
    expect(cssCode).toContain('.forgeHero');
    expect(cssCode).toContain('grid-template-columns');
    const forgeCode = readFileSync(join(process.cwd(), 'src/lib/templates/forge.tsx'), 'utf-8');
    expect(forgeCode).toContain('forgeHeroTextColumn');
  });

  it('ensures WebsiteBuilder exposes the quoteFormStyle picker in Design tab and link in Page tab', () => {
    const builderCode = readFileSync(join(process.cwd(), 'src/app/dashboard/sites/WebsiteBuilder.tsx'), 'utf-8');
    expect(builderCode).toContain('QUOTE_FORM_STYLES');
    expect(builderCode).toContain('quoteFormStyle');
    expect(builderCode).toContain('formStyleBadge');
    expect(builderCode).toContain('formStyleLinkCard');
  });

  it('tracks quote funnel steps with segmentation metadata', () => {
    const dispatchSpy = vi.fn();
    const originalWindow = globalThis.window;
    const originalCustomEvent = globalThis.CustomEvent;

    class MockCustomEvent {
      type: string;
      detail: any;
      constructor(type: string, options?: { detail?: any }) {
        this.type = type;
        this.detail = options?.detail;
      }
    }

    (globalThis as any).CustomEvent = MockCustomEvent;
    (globalThis as any).window = {
      dispatchEvent: dispatchSpy,
    };

    trackQuoteFunnelStep({
      step: 'form_impression',
      formStyle: 'bold',
      template: 'forge',
      colorScheme: 'slate',
      device: 'desktop',
      siteId: 'site-123',
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0];
    expect(event.type).toBe('lgq:quote-funnel');
    expect(event.detail).toEqual({
      step: 'form_impression',
      formStyle: 'bold',
      template: 'forge',
      colorScheme: 'slate',
      device: 'desktop',
      siteId: 'site-123',
    });

    // Restore
    (globalThis as any).window = originalWindow;
    (globalThis as any).CustomEvent = originalCustomEvent;
  });
});

