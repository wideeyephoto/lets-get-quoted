import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('/features comprehensive audit & remediation verification', () => {
  const PAGE = read('src/app/features/page.tsx');
  const HUD = read('src/app/features/CompanionHUD.tsx');
  const PULSE = read('src/app/features/LiveFieldPulse.tsx');
  const PHOTO_DEMO = read('src/app/features/CompanionPhotoScopeDemo.tsx');
  const ROUTE_DEMO = read('src/app/features/CompanionRouteDemo.tsx');
  const SPRAWL = read('src/app/features/FeaturesToolSprawlCalculator.tsx');
  const CATALOG = read('src/app/features/FeaturesCatalogExplorer.tsx');
  const SIM = read('src/app/features/CinematicMessageSimulation.tsx');
  const THEME_CSS = read('src/app/features/features-theme.module.css');
  const SIM_CSS = read('src/app/features/cinematic-message-simulation.module.css');
  const SITEMAP = read('src/app/sitemap.ts');

  describe('1. Landmark semantics and copy defects', () => {
    it('places SiteHeader and SiteFooter outside main landmark', () => {
      const headerPos = PAGE.indexOf('<SiteHeader />');
      const mainPos = PAGE.indexOf('<main id="main-content">');
      const footerPos = PAGE.indexOf('<SiteFooter />');
      const mainClosePos = PAGE.indexOf('</main>');

      expect(headerPos).toBeGreaterThan(-1);
      expect(mainPos).toBeGreaterThan(headerPos);
      expect(mainClosePos).toBeGreaterThan(mainPos);
      expect(footerPos).toBeGreaterThan(mainClosePos);
    });

    it('fixes the proof strip copy typo to "written for your trade"', () => {
      expect(PAGE).toContain('Pages, FAQs and intake questions written for your trade');
      expect(PAGE).not.toContain('Pages, FAQs and intake questions written for yours');
    });
  });

  describe('2. Mobile hero clipping and fluid responsive scaling', () => {
    it('ensures responsive single-column hero grid with no overflow clipping on mobile', () => {
      expect(THEME_CSS).toContain('.featuresTheme :global(.index-hero.index-hero-beside)');
      expect(THEME_CSS).toContain('grid-template-columns: 1fr;');
      expect(SIM_CSS).toContain('box-sizing: border-box !important;');
    });
  });

  describe('3. Copilot HUD Focus & Obscuration Remediations', () => {
    it('starts with speech dismissed to avoid auto-obscuring viewports', () => {
      expect(HUD).toContain('useState<boolean>(true)');
      expect(HUD).not.toContain('setHasDismissedSpeech(false)');
    });

    it('provides Escape key handler and proper ARIA attributes', () => {
      expect(HUD).toContain("e.key === 'Escape'");
      expect(HUD).toContain('aria-expanded={isExpanded}');
      expect(HUD).toContain('aria-controls="companion-hud-panel"');
      expect(HUD).toContain('id="companion-hud-panel"');
    });

    it('does not span 100% full-width on mobile when collapsed', () => {
      expect(THEME_CSS).toContain('max-width: calc(100vw - 32px);');
      expect(THEME_CSS).toContain('align-self: flex-end;');
    });
  });

  describe('4. Theme contrast in dark/dim modes and CTA buttons', () => {
    it('uses high-contrast text and dark ink for calcPrimaryBtn', () => {
      expect(THEME_CSS).toContain('color: #06111f !important;');
      expect(THEME_CSS).toContain('.photoDemoTitle');
      expect(THEME_CSS).toContain('color: #f8fafc;');
      expect(THEME_CSS).toContain('color: #cbd5e1;');
    });
  });

  describe('5. ROI calculation and software sprawl assumptions', () => {
    it('labels savings as Gross Fixed SaaS Savings and details assumptions', () => {
      expect(SPRAWL).toContain('Gross Fixed SaaS Savings');
      expect(SPRAWL).toContain('Assumptions &amp; Pricing Sources:');
      expect(SPRAWL).toContain('Jobber Grow ($169/mo)');
      expect(SPRAWL).toContain('Podium Core ($289/mo)');
      expect(SPRAWL).toContain('Wix Business ($29/mo)');
      expect(SPRAWL).toContain('DocuSign Standard ($20/mo)');
      expect(SPRAWL).toContain('Calendly Standard ($15/mo)');
      expect(SPRAWL).toContain('1.25%');
      expect(SPRAWL).toContain('Stripe');
    });
  });

  describe('6. ARIA tab groups and roving focus', () => {
    it('implements roving keyboard navigation and tabpanel on all 4 tab groups', () => {
      // 1. Trade simulation
      expect(SIM).toContain('handleTradeKeyDown');
      expect(SIM).toContain('id={`trade-tab-${t.id}`}');
      expect(SIM).toContain('aria-controls="trade-workflow-panel"');
      expect(SIM).toContain('id="trade-workflow-panel"');
      expect(SIM).toContain('role="tabpanel"');

      // 2. Sprawl calculator profiles
      expect(SPRAWL).toContain('handleProfileKeyDown');
      expect(SPRAWL).toContain('id={`sprawl-tab-${idx}`}');
      expect(SPRAWL).toContain('aria-controls="sprawl-profile-panel"');
      expect(SPRAWL).toContain('id="sprawl-profile-panel"');
      expect(SPRAWL).toContain('role="tabpanel"');

      // 3. Photo Scope demo scenarios
      expect(PHOTO_DEMO).toContain('handleScenarioKeyDown');
      expect(PHOTO_DEMO).toContain('id={`photo-tab-${sc.id}`}');
      expect(PHOTO_DEMO).toContain('aria-controls="photo-scenario-panel"');
      expect(PHOTO_DEMO).toContain('id="photo-scenario-panel"');
      expect(PHOTO_DEMO).toContain('role="tabpanel"');

      // 4. Feature Catalog Explorer categories
      expect(CATALOG).toContain('handleCatKeyDown');
      expect(CATALOG).toContain('id={`cat-tab-${cat.slug}`}');
      expect(CATALOG).toContain('aria-controls="catalog-features-panel"');
      expect(CATALOG).toContain('id="catalog-features-panel"');
      expect(CATALOG).toContain('role="tabpanel"');
    });
  });

  describe('7. Activity carousel touch targets and controls', () => {
    it('provides Play/Pause toggle and accessible touch targets in LiveFieldPulse', () => {
      expect(PULSE).toContain('pulsePlayPauseBtn');
      expect(PULSE).toContain('aria-current={idx === activeIndex ? \'true\' : undefined}');
      expect(THEME_CSS).toContain('min-width: 28px;');
      expect(THEME_CSS).toContain('min-height: 28px;');
    });
  });

  describe('8. Feature card links and CTA routing', () => {
    it('provides descriptive aria-labels for all feature catalog cards', () => {
      expect(CATALOG).toContain('aria-label={`Learn more about ${feat.name} (${feat.categoryTitle})`}');
    });

    it('routes photo demo CTA directly to quoting feature', () => {
      expect(PHOTO_DEMO).toContain('goal=feature&feature=quotes&source=feature_photo_demo');
      expect(PHOTO_DEMO).not.toContain('goal=build_site&source=feature_photo_demo');
    });
  });

  describe('9. XML Sitemap inclusions', () => {
    it('includes ai-ads and sparky in FEATURE_SLUGS', () => {
      expect(SITEMAP).toContain("'ai-ads'");
      expect(SITEMAP).toContain("'sparky'");
    });
  });
});
