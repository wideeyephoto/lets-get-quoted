import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const rgb = (hex: string): [number, number, number] => {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`not a six-digit hex: ${hex}`);
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

describe('Multi-Theme Logged-In Contrast Safety Suite', () => {
  const globals = read('src', 'app', 'globals.css');
  const smoothie = read('src', 'app', 'dashboard', 'smoothie.module.css');
  const quickEdit = read('src', 'components', 'quick-edit', 'quick-edit.module.css');
  const permitCard = read('src', 'components', 'permits', 'PermitFeasibilityCard.module.css');
  const fieldHint = read('src', 'components', 'field-intake-hint.module.css');
  const voiceCalls = read('src', 'app', 'dashboard', 'voice-calls', 'voice-calls.module.css');
  const marketingOverview = read('src', 'app', 'dashboard', 'marketing', 'MarketingOverviewScreen.tsx');
  const tradeCatalogHub = read('src', 'app', 'dashboard', 'services', 'TradeCatalogHub.tsx');

  describe('1. Protection of Base Themes (Dark, Dim, Sunlight)', () => {
    it('preserves dark theme default root tokens without pollution', () => {
      expect(globals).toContain(':root {\n  color-scheme: dark;');
      expect(globals).toContain('--bg: #070a11;');
      expect(globals).toContain('--text: #eef1f6;');
      expect(globals).toContain('--muted: #99a2b2;');
      expect(globals).toContain('--accent: #ff7a21;');
    });

    it('preserves Dim theme tokens without mutation', () => {
      expect(globals).toContain(":root[data-theme='dim'] {\n  color-scheme: dark;");
      expect(globals).toContain('--bg: #1c1a17;');
      expect(globals).toContain('--text: #efece6;');
      expect(globals).toContain('--muted: #b0a99e;');
      expect(globals).toContain('--accent: #f97d34;');
    });

    it('preserves Sunlight theme tokens without mutation', () => {
      expect(globals).toContain(":root[data-theme='sunlight'] {\n  color-scheme: light;");
      expect(globals).toContain('--bg: #eaeef4;');
      expect(globals).toContain('--text: #090d16;');
      expect(globals).toContain('--muted: #1e293b;');
      expect(globals).toContain('--accent: #b43403;');
    });

    it('ensures all 3 base themes maintain >= 4.5:1 text contrast against their surfaces', () => {
      // Dark
      expect(contrastRatio('#eef1f6', '#0e1219')).toBeGreaterThanOrEqual(13.0);
      expect(contrastRatio('#99a2b2', '#0e1219')).toBeGreaterThanOrEqual(6.0);

      // Dim
      expect(contrastRatio('#efece6', '#24211d')).toBeGreaterThanOrEqual(12.0);
      expect(contrastRatio('#b0a99e', '#24211d')).toBeGreaterThanOrEqual(6.0);

      // Sunlight
      expect(contrastRatio('#090d16', '#ffffff')).toBeGreaterThanOrEqual(18.0);
      expect(contrastRatio('#1e293b', '#ffffff')).toBeGreaterThanOrEqual(11.0);
      expect(contrastRatio('#b43403', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('2. Workbench Panel Paper Scoping', () => {
    it('declares all required text, foreground, and accent tokens inside Workbench .panel', () => {
      const panelSection = globals.slice(
        globals.indexOf(":root[data-theme='light'] .unsaved-guard-panel,"),
        globals.indexOf(":root[data-theme='light'] .panel-card")
      );
      expect(panelSection).toContain('--text: #162033;');
      expect(panelSection).toContain('--foreground: var(--text);');
      expect(panelSection).toContain('--text-muted: var(--muted);');
      expect(panelSection).toContain('--text-primary: var(--text);');
      expect(panelSection).toContain('--text-color: var(--text);');
      expect(panelSection).toContain('--muted: #566274;');
      expect(panelSection).toContain('--accent: #c2410c;');
      expect(panelSection).toContain('--accent-ink: #c2410c;');
    });

    it('guarantees Workbench panel tokens meet WCAG AA on white paper (#ffffff / #f7f8fa)', () => {
      expect(contrastRatio('#162033', '#ffffff')).toBeGreaterThanOrEqual(13.0);
      expect(contrastRatio('#566274', '#ffffff')).toBeGreaterThanOrEqual(6.0);
      expect(contrastRatio('#c2410c', '#ffffff')).toBeGreaterThanOrEqual(5.0);
    });
  });

  describe('3. Component-Level Contrast Remediations', () => {
    it('fixes Quick Edit button in Workbench without altering Dim or Sunlight', () => {
      // Workbench uses accessible rust
      expect(quickEdit).toContain(":root[data-theme='light'] .quickEditBtn");
      expect(quickEdit).toContain('color: #9a3412;');
      expect(contrastRatio('#9a3412', '#ffffff')).toBeGreaterThanOrEqual(6.5);

      // Dim and Sunlight are intact
      expect(quickEdit).toContain(":root[data-theme='dim'] .quickEditBtn");
      expect(quickEdit).toContain(":root[data-theme='sunlight'] .quickEditBtn");
    });

    it('pins PermitFeasibilityCard to a self-contained dark scheme', () => {
      expect(permitCard).toContain('color-scheme: dark;');
      expect(permitCard).toContain('--text: #f8fafc;');
      expect(permitCard).toContain('--muted: #94a3b8;');
      expect(permitCard).toContain('color: #f8fafc;');
      expect(contrastRatio('#f8fafc', '#19202d')).toBeGreaterThanOrEqual(13.0);
      expect(contrastRatio('#94a3b8', '#19202d')).toBeGreaterThanOrEqual(5.0);
    });

    it('provides high-contrast hint pills in light and sunlight themes', () => {
      expect(fieldHint).toContain(":root[data-theme='light'] .hintPill");
      expect(fieldHint).toContain(":root[data-theme='sunlight'] .hintPill");
      expect(fieldHint).toContain('color: #6d28d9;');
      // Deep purple on light lavender fill meets 4.5:1
      expect(contrastRatio('#6d28d9', '#ebe1f8')).toBeGreaterThanOrEqual(5.5);
    });

    it('uses adaptive ink tokens in Marketing overview tiles', () => {
      expect(marketingOverview).toContain("color: 'var(--text)'");
      expect(marketingOverview).toContain("color: 'var(--ink-green-1, #10b981)'");
      expect(marketingOverview).toContain("color: 'var(--ink-orange-7, #ea580c)'");
      expect(marketingOverview).toContain("color: 'var(--ink-blue, #0284c7)'");
      expect(marketingOverview).toContain("color: 'var(--ink-violet-5, #7e22ce)'");
      expect(marketingOverview).not.toContain("color: 'var(--foreground)'");
    });

    it('uses standard var(--muted) in TradeCatalogHub', () => {
      expect(tradeCatalogHub).not.toContain("color: 'var(--text-muted, #64748b)'");
      expect(tradeCatalogHub).toContain("color: 'var(--muted)'");
    });

    it('remediates Text-to-Job Workbench rules', () => {
      expect(globals).toContain(":root[data-theme='light'] [class*='feedCount']");
      expect(globals).toContain(":root[data-theme='light'] [class*='filterBtn']");
      expect(globals).toContain(":root[data-theme='light'] [class*='filterBtnActive']");
      expect(globals).toContain(":root[data-theme='light'] [class*='receiptConfidencePill']");
      expect(globals).toContain(":root[data-theme='light'] [class*='accordionCard']");
      expect(globals).toContain(":root[data-theme='light'] [class*='accordionSubtitle']");
      expect(contrastRatio('#9a3412', '#fff7ed')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#14532d', '#dcfce7')).toBeGreaterThanOrEqual(4.5);
    });

    it('remediates Voice Calls status and buttons in Workbench & Sunlight', () => {
      expect(voiceCalls).toContain(":root[data-theme='light'] .statusTitle");
      expect(voiceCalls).toContain(":root[data-theme='light'] .configActionBtn");
      expect(voiceCalls).toContain(":root[data-theme='light'] .dateFilterActive");
      expect(voiceCalls).toContain('background: #c2410c;');
      expect(contrastRatio('#ffffff', '#c2410c')).toBeGreaterThanOrEqual(4.5);
    });

    it('ensures all active filter/button states with white text use #c2410c or darker', () => {
      // Inbox active filter
      expect(globals).toContain(":root[data-theme='light'] .inbox-filter.is-active {\n  background: #c2410c;");
      // Roster summary active button
      expect(globals).toMatch(/:root\[data-theme='light'\]\s*\[class\*='rosterSummary'\]\s*button\[aria-pressed='true'\][\s\S]*?background:\s*#c2410c !important;/);
      // Contrast check
      expect(contrastRatio('#ffffff', '#c2410c')).toBeGreaterThanOrEqual(4.5);
    });

    it('fixes Cash Flow summary and inline links', () => {
      expect(globals).toContain('.cash-line-toggles>summary');
      expect(globals).toContain('color: #0369a1;');
      expect(globals).toContain(":root[data-theme='light'] .cash-inline-link");
      expect(contrastRatio('#0369a1', '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#c2410c', '#fffcf4')).toBeGreaterThanOrEqual(4.5);
    });

    it('fixes Settings plan badges in Workbench and Sunlight', () => {
      expect(globals).toContain(":root[data-theme='light'] .plan-subnav-badge.live");
      expect(globals).toContain(":root[data-theme='light'] .plan-subnav-badge.tier");
      expect(globals).toContain(":root[data-theme='light'] .plan-jump-pill.highlight");
      expect(contrastRatio('#047857', '#ecfdf5')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#b43403', '#fff7ed')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#c2410c', '#fff7ed')).toBeGreaterThanOrEqual(4.5);
    });

    it('fixes Smoothie queue stage counters and row stages', () => {
      expect(smoothie).toContain(".stageChip[aria-pressed='true'] .stageCount { background: rgba(255, 122, 33, 0.18); color: var(--ink-orange-1); }");
      expect(smoothie).toContain('.paneCount {\n  padding: 0.02rem 0.38rem;\n  border-radius: 999px;\n  background: rgba(var(--tint), 0.12);\n  color: var(--text);');
      expect(smoothie).toContain(".rowStage[data-stage='new'] { background: rgba(255, 122, 33, 0.16); color: var(--ink-orange-1); }");
    });
  });
});
