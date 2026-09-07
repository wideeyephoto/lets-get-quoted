import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const SHELL = read('src', 'components', 'app-shell.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const GLOBALS_LITE = read('src', 'app', 'globals-lite.css');
const SMART_SEARCH_TSX = read('src', 'components', 'smart-search.tsx');
const SMART_SEARCH_CSS = read('src', 'components', 'smart-search.module.css');

describe('Mobile Topbar & Drawer Polish (375px / 390px Viewport Audit)', () => {
  describe('1. Touch Target Compliance (>= 44px WCAG & iOS Guidelines)', () => {
    it('enforces min 44px height and width on SmartSearch mobile trigger', () => {
      expect(SMART_SEARCH_CSS).toMatch(/\.mobileTrigger\s*\{[^}]*min-height:\s*44px;/);
      expect(SMART_SEARCH_CSS).toMatch(/\.mobileTrigger\s*\{[^}]*min-width:\s*44px;/);
    });

    it('enforces min 44px height on Plan Day and + New mobile bar buttons', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/\.sidenav-mobilebar \.mobilebar-plan,\s*\.sidenav-mobilebar \.mobilebar-new\s*\{[^}]*min-height:\s*44px;/);
      }
    });

    it('enforces min 44px touch target on drawer close button (.sidenav-close)', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/\.sidenav-close\s*\{[^}]*width:\s*44px;/);
        expect(css).toMatch(/\.sidenav-close\s*\{[^}]*height:\s*44px;/);
        expect(css).toMatch(/\.sidenav-close\s*\{[^}]*min-width:\s*44px;/);
        expect(css).toMatch(/\.sidenav-close\s*\{[^}]*min-height:\s*44px;/);
      }
    });
  });

  describe('2. SmartSearch Compact Mobile Mode (<= 540px)', () => {
    it('wraps Search text in mobileTriggerText span for responsive suppression', () => {
      expect(SMART_SEARCH_TSX).toContain('className={styles.mobileTriggerText}>Search<');
    });

    it('hides text and sets 44x44 circular button on compact mobile screens', () => {
      expect(SMART_SEARCH_CSS).toMatch(/@media\s*\(max-width:\s*540px\)\s*\{[\s\S]*?\.mobileTriggerText\s*\{\s*display:\s*none;\s*\}/);
      expect(SMART_SEARCH_CSS).toMatch(/@media\s*\(max-width:\s*540px\)\s*\{[\s\S]*?\.mobileTrigger\s*\{[\s\S]*?width:\s*44px;\s*height:\s*44px;/);
    });
  });

  describe('3. Action Grouping & Auto-Margin Alignment', () => {
    it('assigns auto-margin to the first mobile action to keep brand left and actions grouped right', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/\.sidenav-mobilebar \[class\*="mobileTrigger"\]\s*\{\s*margin-left:\s*auto;\s*\}/);
        expect(css).toMatch(/\.sidenav-mobilebar \[class\*="mobileTrigger"\] \+ \.mobilebar-plan\s*\{\s*margin-left:\s*0;\s*\}/);
      }
    });
  });

  describe('4. Small Viewport Safeguards (375px / 360px overflow prevention)', () => {
    it('clamps contractor business name to max-width 100px on <= 440px viewports', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/@media\s*\(max-width:\s*440px\)[\s\S]*?\.sidenav-mobilebar \.mobilebar-contractor-bizname\s*\{\s*max-width:\s*100px;/);
      }
    });

    it('clamps contractor business name to max-width 80px on <= 400px viewports', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/@media\s*\(max-width:\s*400px\)[\s\S]*?\.sidenav-mobilebar \.mobilebar-contractor-bizname\s*\{\s*max-width:\s*80px;/);
      }
    });
  });

  describe('5. Dashboard Drawer Parity (Visible Escape Hatch & Safe Area)', () => {
    it('renders a visible .sidenav-close button in dashboard drawer when isNavOpen', () => {
      const dashboardShellTop = SHELL.slice(
        SHELL.indexOf('<aside id="primary-nav"'),
        SHELL.indexOf('className="sidenav-lead"'),
      );
      expect(dashboardShellTop).toContain('isNavOpen ?');
      expect(dashboardShellTop).toContain('className="sidenav-close"');
      expect(dashboardShellTop).toContain('onClick={closeNav}');
      expect(dashboardShellTop).toContain('aria-label="Close navigation"');
    });

    it('declares env(safe-area-inset-top) on mobile topbar for notch / Dynamic Island clearance', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/\.sidenav-mobilebar\s*\{[\s\S]*?padding-top:\s*max\(0\.65rem,\s*env\(safe-area-inset-top\)\);/);
      }
    });

    it('declares env(safe-area-inset-bottom) on mobile drawer for home indicator clearance', () => {
      for (const css of [GLOBALS, GLOBALS_LITE]) {
        expect(css).toMatch(/@media\s*\(max-width:\s*1080px\)[\s\S]*?\.sidenav\s*\{[\s\S]*?padding-bottom:\s*max\(1\.5rem,\s*env\(safe-area-inset-bottom\)\);/);
      }
    });
  });
});
