import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Interactive Demonstration Accessibility & Performance Architecture', () => {
  const quoteDemoSource = readFileSync('src/components/marketing/InteractiveQuoteUpsellDemo.tsx', 'utf8').replace(/\r\n/g, '\n');
  const highTechSource = readFileSync('src/components/marketing/HighTechShowcase.tsx', 'utf8').replace(/\r\n/g, '\n');
  const flagshipSource = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8').replace(/\r\n/g, '\n');
  const homePageSource = readFileSync('src/app/page.tsx', 'utf8').replace(/\r\n/g, '\n');
  const rootLayoutSource = readFileSync('src/app/layout.tsx', 'utf8').replace(/\r\n/g, '\n');
  const quotesPageSource = readFileSync('src/app/features/quotes/page.tsx', 'utf8').replace(/\r\n/g, '\n');

  describe('InteractiveQuoteUpsellDemo Accessibility', () => {
    it('has valid WAI-ARIA tablist and tabpanel semantics for trade scenario switcher', () => {
      expect(quoteDemoSource).toContain('role="tablist"');
      expect(quoteDemoSource).toContain('role="tab"');
      expect(quoteDemoSource).toContain('aria-selected={scenarioIndex === idx}');
      expect(quoteDemoSource).toContain('aria-controls={`quote-panel-${sc.id}`}');
      expect(quoteDemoSource).toContain('id={`quote-tab-${sc.id}`}');
      expect(quoteDemoSource).toContain('role="tabpanel"');
      expect(quoteDemoSource).toContain('aria-labelledby={`quote-tab-${activeScenario.id}`}');
    });

    it('implements arrow key roving tabindex on tabs and tiers', () => {
      expect(quoteDemoSource).toContain('handleTradeTabKeyDown');
      expect(quoteDemoSource).toContain('handleTierKeyDown');
      expect(quoteDemoSource).toContain('tabIndex={scenarioIndex === idx ? 0 : -1}');
      expect(quoteDemoSource).toContain('tabIndex={isSelected ? 0 : -1}');
    });

    it('has radiogroup semantics for package tier and payment options', () => {
      expect(quoteDemoSource).toContain('role="radiogroup" aria-labelledby="package-tiers-label"');
      expect(quoteDemoSource).toContain('role="radio"');
      expect(quoteDemoSource).toContain('aria-checked={isSelected}');
      expect(quoteDemoSource).toContain('role="radiogroup" aria-label="Payment options"');
    });

    it('has accessible checkbox add-ons and aria-live confirmation', () => {
      expect(quoteDemoSource).toContain('role="checkbox"');
      expect(quoteDemoSource).toContain('aria-checked={isChecked}');
      expect(quoteDemoSource).toContain('aria-live="polite"');
    });
  });

  describe('HighTechShowcase Accessibility', () => {
    it('has valid tablist, tabpanel, and roving tabindex for multimodal tabs', () => {
      expect(highTechSource).toContain('role="tablist"');
      expect(highTechSource).toContain('role="tab"');
      expect(highTechSource).toContain('aria-controls={`sparky-panel-${feature.id}`}');
      expect(highTechSource).toContain('role="tabpanel"');
      expect(highTechSource).toContain('aria-labelledby={`sparky-tab-${currentFeature.id}`}');
    });

    it('has radiogroup and radio semantics for trade filters and scenario pickers', () => {
      expect(highTechSource).toContain('role="radiogroup" aria-label="Preview for Trade"');
      expect(highTechSource).toContain('role="radio"');
      expect(highTechSource).toContain('aria-checked={isSelected}');
      expect(highTechSource).toContain('handleTradeFilterKeyDown');
    });

    it('has aria-live polite regions for dynamic ticker and AI copilot stream', () => {
      expect(highTechSource).toContain('role="status" aria-live="polite"');
      expect(highTechSource).toContain('className={styles.chatStream} aria-live="polite"');
    });
  });

  describe('Performance & Cellular Optimization', () => {
    it('defers below-the-fold interactive components via client-side dynamic imports', () => {
      expect(flagshipSource).toContain("const HighTechShowcase = dynamic(() => import('@/components/marketing/HighTechShowcase'), {\n  ssr: false,");
      expect(flagshipSource).toContain("const TradeOrbit = dynamic(() => import('./trade-orbit'), { ssr: false });");
    });

    it('renders the interactive quote demo on the quotes feature page', () => {
      expect(quotesPageSource).toContain('<InteractiveQuoteUpsellDemo />');
    });

    it('defers initial scroll measurement to idle time to avoid main-thread blocking', () => {
      expect(flagshipSource).toContain('requestIdleCallback');
    });

    it('marks the marketing homepage as dynamic for per-request CSP nonce stamping', () => {
      expect(homePageSource).toContain("export const dynamic = 'force-dynamic'");
    });

    it('configures display: swap for root fonts to avoid render-blocking latency', () => {
      expect(rootLayoutSource).toContain("display: 'swap'");
    });
  });
});
