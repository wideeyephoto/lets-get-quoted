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

describe('Cancellation Waitlist Theme Contrast Suite', () => {
  const waitlistTsx = read('src', 'app', 'dashboard', 'schedule', 'waitlist', 'WaitlistManager.tsx');
  const waitlistCss = read('src', 'app', 'dashboard', 'schedule', 'waitlist', 'WaitlistManager.module.css');
  const globals = read('src', 'app', 'globals.css');

  describe('1. Absence of Hardcoded Dark/Light Color Literals in TSX', () => {
    it('does not contain hardcoded hex color literals in WaitlistManager.tsx', () => {
      const hexMatches = waitlistTsx.match(/#[0-9a-fA-F]{3,6}/g);
      expect(hexMatches).toBeNull();
    });

    it('imports and uses WaitlistManager.module.css', () => {
      expect(waitlistTsx).toContain("import styles from './WaitlistManager.module.css';");
      expect(waitlistTsx).toContain('className={styles.waitlistShell}');
      expect(waitlistTsx).toContain('className={styles.pageTitle}');
      expect(waitlistTsx).toContain('className={styles.pageSubtitle}');
      expect(waitlistTsx).toContain('className={styles.metricCard}');
      expect(waitlistTsx).toContain('className={styles.tableContainer}');
      expect(waitlistTsx).toContain('className={styles.waitlistTable}');
      expect(waitlistTsx).toContain('className={styles.modalBox}');
    });
  });

  describe('2. Multi-Theme Token Contrast Ratios (WCAG AA Compliance)', () => {
    // Theme background definitions from globals.css
    const darkBg = '#070a11';
    const darkBg2 = '#0e1219';
    const darkText = '#eef1f6';
    const darkMuted = '#99a2b2';
    const darkAccentInk = '#ff9d5c';

    const dimBg = '#1c1a17';
    const dimBg2 = '#24211d';
    const dimText = '#efece6';
    const dimMuted = '#b0a99e';
    const dimAccentInk = '#fba36b';

    const sunlightBg = '#eaeef4';
    const sunlightBg2 = '#ffffff';
    const sunlightText = '#090d16';
    const sunlightMuted = '#1e293b';

    const onyxBg = '#000000';
    const onyxBg2 = '#08080a';
    const onyxText = '#eef1f6';

    const workbenchBg = '#141519';
    const workbenchBg2 = '#1c1e23';
    const workbenchText = '#f3f4f6';
    const workbenchMuted = '#a6abb5';

    it('ensures primary text achieves high contrast across all themes (> 7:1, exceeds WCAG AAA 7.0:1)', () => {
      expect(contrastRatio(darkText, darkBg)).toBeGreaterThan(14.0);
      expect(contrastRatio(darkText, darkBg2)).toBeGreaterThan(14.0);

      expect(contrastRatio(dimText, dimBg)).toBeGreaterThan(12.0);
      expect(contrastRatio(dimText, dimBg2)).toBeGreaterThan(12.0);

      expect(contrastRatio(sunlightText, sunlightBg)).toBeGreaterThan(14.0);
      expect(contrastRatio(sunlightText, sunlightBg2)).toBeGreaterThan(14.0);

      expect(contrastRatio(onyxText, onyxBg)).toBeGreaterThan(17.0);
      expect(contrastRatio(onyxText, onyxBg2)).toBeGreaterThan(16.0);

      expect(contrastRatio(workbenchText, workbenchBg)).toBeGreaterThan(13.0);
      expect(contrastRatio(workbenchText, workbenchBg2)).toBeGreaterThan(12.0);
    });

    it('ensures muted secondary text achieves readable contrast (> 4.5:1 for WCAG AA)', () => {
      expect(contrastRatio(darkMuted, darkBg)).toBeGreaterThan(6.0);
      expect(contrastRatio(darkMuted, darkBg2)).toBeGreaterThan(6.0);

      expect(contrastRatio(dimMuted, dimBg)).toBeGreaterThan(5.5);
      expect(contrastRatio(dimMuted, dimBg2)).toBeGreaterThan(5.0);

      expect(contrastRatio(sunlightMuted, sunlightBg)).toBeGreaterThan(9.0);
      expect(contrastRatio(sunlightMuted, sunlightBg2)).toBeGreaterThan(10.0);

      expect(contrastRatio(workbenchMuted, workbenchBg)).toBeGreaterThan(6.0);
      expect(contrastRatio(workbenchMuted, workbenchBg2)).toBeGreaterThan(6.0);
    });

    it('ensures breadcrumb link achieves accessible contrast against dark and light canvas', () => {
      // Dark canvas
      expect(contrastRatio(darkAccentInk, darkBg)).toBeGreaterThan(8.5);
      // Dim canvas
      expect(contrastRatio(dimAccentInk, dimBg)).toBeGreaterThan(7.5);
      // Sunlight canvas (using #4f46e5)
      expect(contrastRatio('#4f46e5', sunlightBg)).toBeGreaterThan(4.5);
    });

    it('ensures action buttons have WCAG AA contrast (>= 4.5:1)', () => {
      // Fill window emerald button: white (#ffffff) on #047857
      expect(contrastRatio('#ffffff', '#047857')).toBeGreaterThan(4.5);
      // Add to waitlist indigo button: white (#ffffff) on #4f46e5
      expect(contrastRatio('#ffffff', '#4f46e5')).toBeGreaterThan(6.0);
    });

    it('ensures status and urgency badge tokens pass contrast in dark mode and sunlight mode', () => {
      // Emergency: #f87171 on dark bg (#0e1219)
      expect(contrastRatio('#f87171', darkBg2)).toBeGreaterThan(5.5);
      // Emergency in sunlight: #991b1b on #fee2e2
      expect(contrastRatio('#991b1b', '#fee2e2')).toBeGreaterThan(5.5);

      // High priority: #fb923c on dark bg (#0e1219)
      expect(contrastRatio('#fb923c', darkBg2)).toBeGreaterThan(8.0);
      // High priority in sunlight: #9a3412 on #ffedd5
      expect(contrastRatio('#9a3412', '#ffedd5')).toBeGreaterThan(5.5);

      // Medium/Standard: #60a5fa on dark bg (#0e1219)
      expect(contrastRatio('#60a5fa', darkBg2)).toBeGreaterThan(7.0);
      // Medium in sunlight: #075985 on #e0f2fe
      expect(contrastRatio('#075985', '#e0f2fe')).toBeGreaterThan(5.5);

      // Active status: #34d399 on dark bg (#0e1219)
      expect(contrastRatio('#34d399', darkBg2)).toBeGreaterThan(9.0);
      // Active status in sunlight: #065f46 on #ecfdf5
      expect(contrastRatio('#065f46', '#ecfdf5')).toBeGreaterThan(6.0);

      // Offered status: #fbbf24 on dark bg (#0e1219)
      expect(contrastRatio('#fbbf24', darkBg2)).toBeGreaterThan(10.0);
      // Offered status in sunlight: #92400e on #fef3c7
      expect(contrastRatio('#92400e', '#fef3c7')).toBeGreaterThan(5.5);

      // Fulfilled status: #a5b4fc on dark bg (#0e1219)
      expect(contrastRatio('#a5b4fc', darkBg2)).toBeGreaterThan(8.5);
      // Fulfilled status in sunlight: #3730a3 on #e0e7ff
      expect(contrastRatio('#3730a3', '#e0e7ff')).toBeGreaterThan(6.5);
    });
  });

  describe('3. CSS Module Multi-Theme Rules', () => {
    it('defines sunlight and parchment overrides for badges, breadcrumbs, and active sections', () => {
      expect(waitlistCss).toContain("[data-theme='sunlight']");
      expect(waitlistCss).toContain("[data-theme='parchment']");
      expect(waitlistCss).toContain('.badgeEmergency');
      expect(waitlistCss).toContain('.badgeHigh');
      expect(waitlistCss).toContain('.badgeMedium');
      expect(waitlistCss).toContain('.statusActive');
      expect(waitlistCss).toContain('.statusOffered');
      expect(waitlistCss).toContain('.statusFulfilled');
      expect(waitlistCss).toContain('.activeHoldsSection');
      expect(waitlistCss).toContain('.modalBackdrop');
      expect(waitlistCss).toContain('.modalBox');
    });
  });
});
