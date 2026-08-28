import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(filePath: string) {
  return readFileSync(resolve(process.cwd(), filePath), 'utf8');
}

describe('Problem 7: Mobile Density & Persistent Chrome', () => {
  const flagshipCss = read('src/components/flagship/flagship.module.css');
  const flagshipGenerator = read('scripts/generate-flagship-css.mjs');
  const siteChrome = read('src/components/flagship/site-chrome.tsx');
  const workflowCss = read('src/components/flagship/hero-connected-workflow.module.css');
  const intakeCss = read('src/components/flagship/hero-intake-story.module.css');
  const quoteDemoCss = read('src/components/marketing/interactive-quote-upsell-demo.module.css');
  const assistantCss = read('src/components/marketing/marketing-ai-assistant.module.css');
  const assistantCode = read('src/components/marketing/MarketingAiAssistant.tsx');
  const pricingCss = read('src/app/pricing/pricing.module.css');

  describe('Single Top Navigation Surface (Header)', () => {
    it('enforces 56–60px mobile header height (58px)', () => {
      expect(flagshipCss).toMatch(/\.site-header[\s\S]*?height:\s*58px/);
    });

    it('hides header CTA and signin button on mobile bar to keep header clean', () => {
      expect(flagshipCss).toMatch(/\.header-cta\),\s*\.root :global\(\.header-signin\)\s*\{\s*display:\s*none\s*!important/);
    });

    it('ensures nav toggle button has at least 44x44px tap target', () => {
      expect(flagshipCss).toMatch(/\.nav-toggle\)\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?min-width:\s*44px;/);
    });

    it('manages focus trap, escape key, and return-focus in the mobile drawer', () => {
      expect(siteChrome).toContain("e.key === 'Escape'");
      expect(siteChrome).toContain("e.key === 'Tab'");
      expect(siteChrome).toContain('toggleRef.current?.focus()');
      expect(siteChrome).toContain("window.dispatchEvent(new CustomEvent('lgq-menu-toggle'");
    });

    it('sizes the drawer to the viewport below the filtered sticky header', () => {
      for (const css of [flagshipGenerator, flagshipCss]) {
        expect(css).toMatch(/\.site-menu\)\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*100%;[\s\S]*?height:\s*calc\(100dvh - 58px\)/);
        expect(css).not.toMatch(/\.site-menu\)\s*\{\s*position:\s*fixed;\s*top:\s*58px;/);
      }
    });
  });

  describe('Single Coordinated Bottom Action Dock', () => {
    it('hides when scrolling down, menu is open, or inputs are focused', () => {
      expect(siteChrome).toContain("data-scroll', delta > 0 && y > 240 ? 'down' : 'up'");
      expect(siteChrome).toContain("data-input-focused', isInput ? 'true' : 'false'");
      expect(siteChrome).toContain("data-menu-open', customEvent.detail?.open ? 'true' : 'false'");
    });

    it('applies translateY hide transition in CSS for all suppressed states', () => {
      expect(flagshipCss).toMatch(/\.mobile-cta\[data-redundant="true"\]/);
      expect(flagshipCss).toMatch(/\.mobile-cta\[data-scroll="down"\]/);
      expect(flagshipCss).toContain('transform: translateY(110%)');
    });

    it('applies safe-area-inset-bottom padding to the bottom dock', () => {
      expect(flagshipCss).toMatch(/padding-bottom:\s*max\(\d+px,\s*env\(safe-area-inset-bottom\)\)/);
    });
  });

  describe('Eliminating Floating AI Collisions', () => {
    it('hides floating AI assistant trigger pill on mobile viewports (< 768px)', () => {
      expect(assistantCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.floatingTrigger\s*\{\s*display:\s*none\s*!important/);
    });

    it('renders AI assistant as a full-width bottom sheet on mobile when summoned', () => {
      expect(assistantCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.drawer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?width:\s*100vw;[\s\S]*?bottom:\s*0;/);
      expect(assistantCss).toMatch(/padding-bottom:\s*max\(16px,\s*env\(safe-area-inset-bottom\)\)/);
    });

    it('supports global open-marketing-assistant custom events from inline triggers', () => {
      expect(assistantCode).toContain("addEventListener('open-marketing-assistant'");
      expect(assistantCode).toContain('styles.backdrop');
    });
  });

  describe('Pricing Mobile Streamlining', () => {
    it('makes sectionNav non-sticky in-flow jump menu on mobile viewports', () => {
      expect(pricingCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.sectionNav\s*\{[\s\S]*?position:\s*static;[\s\S]*?top:\s*auto;/);
    });
  });

  describe('Touch Targets & Cognitive Density', () => {
    it('enforces 44px minimum tap target height on primary buttons and links', () => {
      expect(flagshipCss).toMatch(/min-height:\s*48px/);
    });

    it('keeps the live homepage demo controls at least 44px tall on phones', () => {
      expect(workflowCss).toMatch(/\.tradePill,[\s\S]*?\.actionBtnNext,[\s\S]*?\.replayBtn\s*\{[\s\S]*?min-height:\s*44px/);
      expect(intakeCss).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.replayBtn\s*\{[\s\S]*?min-height:\s*44px/);
      expect(quoteDemoCss).toMatch(/\.tradeTab,[\s\S]*?\.payTab,[\s\S]*?\.signBtn,[\s\S]*?\.resetBtn,[\s\S]*?\.featureLink\s*\{[\s\S]*?min-height:\s*44px/);
    });

    it('keeps the sticky homepage step rail controls at least 44px square', () => {
      expect(flagshipGenerator).toMatch(/\.step-rail button\)\s*\{\s*width:\s*44px;\s*height:\s*44px/);
      expect(flagshipCss).toMatch(/\.step-rail button\)\s*\{\s*width:\s*44px;\s*height:\s*44px/);
    });

    it('reduces section vertical padding to 56–72px on mobile screens', () => {
      expect(flagshipCss).toMatch(/padding-block:\s*clamp\(56px,\s*12vw,\s*72px\)/);
    });
  });
});
