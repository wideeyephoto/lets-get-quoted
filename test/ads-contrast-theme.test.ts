import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf-8');
}

describe('Managed Ads Live Preview & Theme Contrast Guarantee', () => {
  const CSS_SRC = read('src/app/dashboard/marketing/ads/ManagedAdsScreen.module.css');
  const GLOBALS_SRC = read('src/app/globals.css');

  describe('1. Live Preview Contrast Isolation (Inside Google SERP #ffffff container)', () => {
    it('does NOT contain murky dark rgba overlays in qualityScoreItem or messageMatchChain', () => {
      // Prior bug: rgba(0, 0, 0, 0.25) and rgba(0, 0, 0, 0.3) created muddy gray boxes over white SERP
      expect(CSS_SRC).not.toMatch(/\.qualityScoreItem\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0/);
      expect(CSS_SRC).not.toMatch(/\.messageMatchChain\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0/);
    });

    it('renders quality score card and items with crisp high-contrast light surfaces and borders', () => {
      expect(CSS_SRC).toContain('.qualityScoreCard');
      expect(CSS_SRC).toContain('.qualityScoreItem');
      // qualityScoreCard uses clean light background and border
      expect(CSS_SRC).toMatch(/\.qualityScoreCard\s*\{[^}]*background:\s*#f8fafc/);
      expect(CSS_SRC).toMatch(/\.qualityScoreItem\s*\{[^}]*background:\s*#ffffff/);
      // Clean slate borders
      expect(CSS_SRC).toMatch(/\.qualityScoreCard\s*\{[^}]*border:\s*1px solid #cbd5e1/);
      expect(CSS_SRC).toMatch(/\.qualityScoreItem\s*\{[^}]*border:\s*1px solid #cbd5e1/);
    });

    it('provides accessible high-contrast typography in quality score items and chain', () => {
      // Labels use dark slate (contrast > 5.5:1 on white)
      expect(CSS_SRC).toContain('.qualityScoreItemLabel');
      expect(CSS_SRC).toMatch(/\.qualityScoreItemLabel\s*\{[^}]*color:\s*#475569/);

      // Value ratings use deep emerald #047857 (contrast > 4.8:1 on white)
      expect(CSS_SRC).toContain('.qualityScoreItemValue');
      expect(CSS_SRC).toMatch(/\.qualityScoreItemValue\s*\{[^}]*color:\s*#047857/);

      // Chain title uses Sky-700 #0369a1 (contrast > 5.2:1 on white)
      expect(CSS_SRC).toContain('.messageMatchChainTitle');
      expect(CSS_SRC).toMatch(/\.messageMatchChainTitle\s*\{[^}]*color:\s*#0369a1/);

      // Badge uses #15803d text on #dcfce7 background (contrast > 5.1:1)
      expect(CSS_SRC).toMatch(/\.qualityScoreBadge\s*\{[^}]*color:\s*#15803d/);
      expect(CSS_SRC).toMatch(/\.qualityScoreBadge\s*\{[^}]*background:\s*#dcfce7/);
    });

    it('pins high-contrast light text inside dark Auto-SMS and Keywords containers', () => {
      // Speed-to-lead benchmark box inside SMS demo container
      expect(CSS_SRC).toContain('.speedToLeadBenchmarkBox');
      expect(CSS_SRC).toMatch(/\.speedToLeadBenchmarkBox\s*\{[^}]*background:\s*#1e293b/);
      expect(CSS_SRC).toMatch(/\.benchmarkBoxTitle\s*\{[^}]*color:\s*#f8fafc/);
      expect(CSS_SRC).toMatch(/\.benchmarkSlowLabel\s*\{[^}]*color:\s*#cbd5e1/);
      expect(CSS_SRC).toMatch(/\.benchmarkFootnote\s*\{[^}]*color:\s*#94a3b8/);

      // Negative waste ticker inside Keywords card
      expect(CSS_SRC).toContain('.negativeWasteTicker');
      expect(CSS_SRC).toMatch(/\.negativeWasteTicker\s*\{[^}]*background:\s*#1e293b/);
      expect(CSS_SRC).toMatch(/\.negativeWasteTitle\s*\{[^}]*color:\s*#fca5a5/);
      expect(CSS_SRC).toMatch(/\.negativeWasteText\s*\{[^}]*color:\s*#cbd5e1/);
    });

    it('ensures device switcher and launch summary deck adapt to theme tokens', () => {
      expect(CSS_SRC).toMatch(/\.deviceSwitcher\s*\{[^}]*border:\s*1px solid var\(--line\)/);
      expect(CSS_SRC).toMatch(/\.launchSummaryCard\s*\{[^}]*background:\s*var\(--bg-elevated\)/);
      expect(CSS_SRC).toMatch(/\.launchSummaryCard\s*\{[^}]*border:\s*1px solid var\(--line\)/);
    });
  });

  describe('2. Workbench Theme (data-theme="light") - Elimination of Excessive Gray', () => {
    it('eliminates the muddy dark-gray sludge wash on selected plan in Workbench', () => {
      expect(CSS_SRC).toContain(":root[data-theme='light'] .bundleCard.selected");
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleCard\.selected[\s\S]*?background:\s*linear-gradient\(180deg,\s*#fff7ed 0%,\s*#ffedd5 100%\)/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleCard\.selected[\s\S]*?border-color:\s*#ea580c/);
    });

    it('provides clean paper cards and crisp borders for unselected bundle cards', () => {
      expect(CSS_SRC).toContain(":root[data-theme='light'] .bundleCard");
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleCard\b[^{]*\{[^}]*background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleCard\b[^{]*\{[^}]*border:\s*1\.5px solid #cbd5e1/);
    });

    it('provides high-contrast text and pills on plan bundle cards in Workbench', () => {
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleName\b[\s\S]*?color:\s*#334155/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundlePrice\b[\s\S]*?color:\s*#0f172a/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleAllocationPill\b[\s\S]*?color:\s*#0369a1/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleAllocationPill\b[\s\S]*?background:\s*#e0f2fe/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleLeads\b[\s\S]*?color:\s*#c2410c/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.bundleCheckItem span:first-child\b[\s\S]*?color:\s*#059669/);
    });

    it('transforms cockpit step navigation tabs from dark gray slab to clean, high-contrast tabs', () => {
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTabsNav\b[\s\S]*?background:\s*#edf2f7/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTabsNav\b[\s\S]*?border:\s*1px solid #cbd5e1/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTab\b[\s\S]*?color:\s*#475569/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTabActive\b[\s\S]*?background:\s*#ffffff !important/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTabActive\b[\s\S]*?color:\s*#c2410c !important/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.cockpitTabActive\b[\s\S]*?border-color:\s*#ea580c !important/);
    });

    it('transforms funding model buttons and deposit presets to clean paper surfaces', () => {
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.fundingModelBtn\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.fundingModelActive\b[\s\S]*?background:\s*#fff7ed !important/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.fundingModelActive\b[\s\S]*?color:\s*#9a3412 !important/);

      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.depositPresetBtn\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.depositActive\b[\s\S]*?background:\s*#ecfdf5 !important/);
    });

    it('transforms schedule, focus, ROI, and wallet containers from dark gray to clean light cards', () => {
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.scheduleSectionCard\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.dayBtn\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.hoursConfigBox\b[\s\S]*?background:\s*#f8fafc/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.timeSelect\b[\s\S]*?background:\s*#ffffff/);

      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.customFocusSectionCard\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.focusInput\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.roiCalcCard\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.sliderBox\b[\s\S]*?background:\s*#f8fafc/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.roiResultBox\b[\s\S]*?background:\s*#ffffff/);

      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.walletFlowCard\b[\s\S]*?background:\s*#f8fafc/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.walletStepsRow\b[\s\S]*?background:\s*#ffffff/);
    });

    it('transforms Knowledge Hub and comparison tables to clean light surfaces', () => {
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.knowledgeHubCard\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.stepCard\b[\s\S]*?background:\s*#ffffff/);
      expect(CSS_SRC).toMatch(/:root\[data-theme='light'\] \.compTable\b[\s\S]*?background:\s*#ffffff/);
    });
  });

  describe('3. Global Design System Integration', () => {
    it('defines --foreground as an alias for --text in globals.css', () => {
      expect(GLOBALS_SRC).toContain('--foreground: var(--text);');
    });

    it('supports Sunlight theme with identical contrast safeguards', () => {
      expect(CSS_SRC).toContain(":root[data-theme='sunlight'] .bundleCard.selected");
      expect(CSS_SRC).toContain(":root[data-theme='sunlight'] .cockpitTabActive");
      expect(CSS_SRC).toContain(":root[data-theme='sunlight'] .bundleAllocationPill");
    });
  });
});
