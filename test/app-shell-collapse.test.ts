import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NAV_COLLAPSED_STORAGE_KEY,
  NAV_COLLAPSED_COOKIE,
  readStoredNavCollapsed,
  writeStoredNavCollapsed,
} from '@/lib/nav-customization';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const SHELL = read('src', 'components', 'app-shell.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const CUSTOMIZATION = read('src', 'lib', 'nav-customization.ts');

describe('desktop collapsible navigation rail', () => {
  describe('state and persistence in nav-customization.ts', () => {
    it('defines storage and cookie constants', () => {
      expect(NAV_COLLAPSED_STORAGE_KEY).toBe('lgq_nav_collapsed');
      expect(NAV_COLLAPSED_COOKIE).toBe('lgq_nav_collapsed');
      expect(CUSTOMIZATION).toContain('export function useNavCollapsed');
      expect(CUSTOMIZATION).toContain('readStoredNavCollapsed');
      expect(CUSTOMIZATION).toContain('writeStoredNavCollapsed');
    });

    it('defaults to expanded (false) when no stored value is set', () => {
      expect(readStoredNavCollapsed()).toBe(false);
    });
  });

  describe('app-shell.tsx integration', () => {
    it('imports useNavCollapsed from nav-customization', () => {
      expect(SHELL).toMatch(/import\s*\{[^}]*useNavCollapsed[^}]*\}\s*from\s*['"]@\/lib\/nav-customization['"]/);
    });

    it('connects isCollapsed to chrome-shell and primary-nav aside', () => {
      expect(SHELL).toContain('sidenav-is-collapsed');
      expect(SHELL).toMatch(/<aside[^>]*id="primary-nav"[^>]*className=\{`sidenav\$\{isNavOpen \? ' open' : ''\}\$\{isCollapsed \? ' collapsed' : ''\}`\}/);
    });

    it('renders an accessible desktop collapse toggle button in the sidebar header', () => {
      expect(SHELL).toContain('className="sidenav-collapse-toggle"');
      expect(SHELL).toContain('aria-controls="primary-nav"');
      expect(SHELL).toContain('aria-expanded={!isCollapsed}');
      expect(SHELL).toContain("title={isCollapsed ? 'Expand navigation rail ([ or Ctrl+B)' : 'Collapse navigation rail ([ or Ctrl+B)'}");
    });

    it('supports keyboard shortcuts ([ and Ctrl+B / Cmd+B) while not typing in form inputs', () => {
      expect(SHELL).toContain("e.key === '['");
      expect(SHELL).toContain("(e.key === 'b' || e.key === 'B')");
      expect(SHELL).toContain("target.tagName === 'INPUT'");
      expect(SHELL).toContain("target.tagName === 'TEXTAREA'");
    });

    it('provides section name and hint in title tooltip when collapsed', () => {
      expect(SHELL).toContain("title={isCollapsed ? `${item.label}${item.hint ? ` — ${item.hint}` : ''}` : item.hint}");
    });
  });

  describe('globals.css styling', () => {
    it('reclaims screen space with 4.5rem width on desktop when collapsed', () => {
      expect(GLOBALS).toMatch(/\.chrome-shell-sidenav\.sidenav-is-collapsed\s*\{[^}]*--sidenav-w:\s*4\.5rem;/);
    });

    it('smoothly transitions rail width and main workspace padding', () => {
      expect(GLOBALS).toMatch(/\.sidenav\s*\{[^}]*transition:\s*width 0\.22s/);
      expect(GLOBALS).toMatch(/\.app-main\.app-main-sidenav\s*\{[^}]*transition:\s*padding-left 0\.22s/);
    });

    it('hides collapse toggle on mobile screens below 1080px', () => {
      expect(GLOBALS).toMatch(/@media\s*\(max-width:\s*1080px\)\s*\{[\s\S]*?\.sidenav-collapse-toggle\s*\{[^}]*display:\s*none\s*!important;/);
    });

    it('centers icons, hides labels, and collapses group eyebrows into minimal dividers', () => {
      expect(GLOBALS).toContain('.sidenav.collapsed .sidenav-link');
      expect(GLOBALS).toContain('.sidenav.collapsed .sidenav-link .sidenav-label');
      expect(GLOBALS).toContain('.sidenav.collapsed .sidenav-glabel');
      expect(GLOBALS).toContain('.sidenav.collapsed .sidenav-actions');
    });

    it('converts unread and attention count badges to floating notification dots', () => {
      expect(GLOBALS).toMatch(/\.sidenav\.collapsed\s+\.sidenav-unseen,\s*\.sidenav\.collapsed\s+\.sidenav-count,\s*\.sidenav\.collapsed\s+\.sidenav-total\s*\{[^}]*position:\s*absolute;/);
    });

    it('disables transitions when prefers-reduced-motion is requested', () => {
      expect(GLOBALS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sidenav,\s*\.app-main\.app-main-sidenav[\s\S]*?transition:\s*none\s*!important;/);
    });
  });
});
