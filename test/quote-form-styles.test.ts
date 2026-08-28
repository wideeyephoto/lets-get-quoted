import { describe, it, expect, vi } from 'vitest';
import {
  QUOTE_FORM_STYLES,
  QUOTE_FORM_STYLE_KEYS,
  getQuoteFormStyle,
  QUOTE_FORM_FIELD_BGS,
  QUOTE_FORM_FIELD_BG_KEYS,
  getQuoteFormFieldBg,
  QUOTE_FORM_RADII,
  QUOTE_FORM_RADIUS_KEYS,
  getQuoteFormRadius,
  getSiteContent,
  mergeSiteContent,
  type QuoteFormStyle,
  type QuoteFormFieldBg,
  type QuoteFormRadius,
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

  it('defines field background options including light/white for high-contrast readability', () => {
    expect(QUOTE_FORM_FIELD_BGS.length).toBeGreaterThanOrEqual(3);
    const keys = QUOTE_FORM_FIELD_BGS.map((b) => b.key);
    expect(keys).toContain('light');
    expect(keys).toContain('dark');
    expect(keys).toContain('auto');
    expect(QUOTE_FORM_FIELD_BG_KEYS.has('light')).toBe(true);
    expect(QUOTE_FORM_FIELD_BG_KEYS.has('dark')).toBe(true);
    expect(QUOTE_FORM_FIELD_BG_KEYS.has('auto')).toBe(true);
  });

  it('defaults getQuoteFormFieldBg to auto when unset or empty', () => {
    expect(getQuoteFormFieldBg(null)).toBe('auto');
    expect(getQuoteFormFieldBg(undefined)).toBe('auto');
    expect(getQuoteFormFieldBg({})).toBe('auto');
    expect(getQuoteFormFieldBg({ quoteFormFieldBg: '' })).toBe('auto');
  });

  it('normalizes valid field background settings accurately', () => {
    const bgs: QuoteFormFieldBg[] = ['light', 'dark', 'auto'];
    for (const bg of bgs) {
      const content = getSiteContent({ quoteFormFieldBg: bg });
      expect(content.quoteFormFieldBg).toBe(bg);
      expect(getQuoteFormFieldBg({ quoteFormFieldBg: bg })).toBe(bg);
    }
  });

  it('safely falls back to auto for unknown field background values', () => {
    const content = getSiteContent({ quoteFormFieldBg: 'invalid-nonexistent-bg' });
    expect(content.quoteFormFieldBg).toBe('auto');
    expect(getQuoteFormFieldBg({ quoteFormFieldBg: 'invalid-nonexistent-bg' })).toBe('auto');
  });

  it('merges quoteFormFieldBg updates correctly', () => {
    const initial = { company_name: 'Apex Plumbing', quoteFormFieldBg: 'auto' };
    const updated = mergeSiteContent(initial, { quoteFormFieldBg: 'light' });
    expect(getQuoteFormFieldBg(updated)).toBe('light');

    const darkUpdated = mergeSiteContent(updated, { quoteFormFieldBg: 'dark' });
    expect(getQuoteFormFieldBg(darkUpdated)).toBe('dark');
  });

  it('defines card corner radius options including soft, pill, sharp, and default', () => {
    expect(QUOTE_FORM_RADII).toHaveLength(4);
    const keys = QUOTE_FORM_RADII.map((r) => r.key);
    expect(keys).toEqual(['default', 'soft', 'pill', 'sharp']);
    expect(QUOTE_FORM_RADIUS_KEYS.has('default')).toBe(true);
    expect(QUOTE_FORM_RADIUS_KEYS.has('soft')).toBe(true);
    expect(QUOTE_FORM_RADIUS_KEYS.has('pill')).toBe(true);
    expect(QUOTE_FORM_RADIUS_KEYS.has('sharp')).toBe(true);
  });

  it('defaults getQuoteFormRadius to default when unset or empty', () => {
    expect(getQuoteFormRadius(null)).toBe('default');
    expect(getQuoteFormRadius(undefined)).toBe('default');
    expect(getQuoteFormRadius({})).toBe('default');
    expect(getQuoteFormRadius({ quoteFormRadius: '' })).toBe('default');
  });

  it('normalizes valid card corner radius settings accurately', () => {
    const radii: QuoteFormRadius[] = ['default', 'soft', 'pill', 'sharp'];
    for (const r of radii) {
      const content = getSiteContent({ quoteFormRadius: r });
      expect(content.quoteFormRadius).toBe(r);
      expect(getQuoteFormRadius({ quoteFormRadius: r })).toBe(r);
    }
  });

  it('safely falls back to default for unknown card corner radius values', () => {
    const content = getSiteContent({ quoteFormRadius: 'invalid-nonexistent-radius' });
    expect(content.quoteFormRadius).toBe('default');
    expect(getQuoteFormRadius({ quoteFormRadius: 'invalid-nonexistent-radius' })).toBe('default');
  });

  it('merges quoteFormRadius updates correctly', () => {
    const initial = { company_name: 'Apex Plumbing', quoteFormRadius: 'default' };
    const updated = mergeSiteContent(initial, { quoteFormRadius: 'pill' });
    expect(getQuoteFormRadius(updated)).toBe('pill');

    const softUpdated = mergeSiteContent(updated, { quoteFormRadius: 'soft' });
    expect(getQuoteFormRadius(softUpdated)).toBe('soft');
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

  it('ensures HeroQuickForm passes data-form-style, data-field-bg, and data-form-radius to the root form', () => {
    const heroCode = readFileSync(join(process.cwd(), 'src/lib/templates/HeroQuickForm.tsx'), 'utf-8');
    expect(heroCode).toContain('data-form-style={formStyle}');
    expect(heroCode).toContain('data-field-bg={fieldBg}');
    expect(heroCode).toContain('data-form-radius={formRadius}');
    expect(heroCode).toContain("siteContent.quoteFormStyle || 'clean'");
    expect(heroCode).toContain("siteContent.quoteFormFieldBg || 'auto'");
    expect(heroCode).toContain("siteContent.quoteFormRadius || 'default'");
    expect(heroCode).toContain('heroFormEyebrowBadge');
    expect(heroCode).toContain('AI Instant Estimate');
    expect(heroCode).toContain('heroFormBtnArrow');
    expect(heroCode).toContain('Start my estimate');
    expect(heroCode).toContain('Tell us what you need. We’ll ask up to 3 quick questions and show a price range—usually in about a minute.');
  });

  it('ensures themes.module.css contains high-contrast stepper, shimmer, and corner radius styles', () => {
    const cssCode = readFileSync(join(process.cwd(), 'src/lib/templates/themes.module.css'), 'utf-8');
    expect(cssCode).toContain("data-form-style='glow'");
    expect(cssCode).toContain("data-form-style='clean'");
    expect(cssCode).toContain("data-form-style='glass'");
    expect(cssCode).toContain("data-form-style='bold'");
    expect(cssCode).toContain("data-field-bg='light'");
    expect(cssCode).toContain("data-field-bg='dark'");
    expect(cssCode).toContain("data-form-radius='sharp'");
    expect(cssCode).toContain("data-form-radius='soft'");
    expect(cssCode).toContain("data-form-radius='pill'");
    expect(cssCode).toContain('heroBtnShimmer');
    expect(cssCode).toContain('heroFormEyebrowBadge');
    expect(cssCode).toContain('sparklePulse');
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

  it('ensures WebsiteBuilder exposes quoteFormStyle, fieldBg, and quoteFormRadius pickers', () => {
    const builderCode = readFileSync(join(process.cwd(), 'src/app/dashboard/sites/WebsiteBuilder.tsx'), 'utf-8');
    expect(builderCode).toContain('QUOTE_FORM_STYLES');
    expect(builderCode).toContain('QUOTE_FORM_FIELD_BGS');
    expect(builderCode).toContain('QUOTE_FORM_RADII');
    expect(builderCode).toContain('quoteFormStyle');
    expect(builderCode).toContain('quoteFormFieldBg');
    expect(builderCode).toContain('quoteFormRadius');
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

