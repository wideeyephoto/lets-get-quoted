import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const FAB = read('src', 'components', 'theme-fab.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const LAYOUT = read('src', 'app', 'layout.tsx');
const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const USE_THEME = read('src', 'components', 'use-theme.ts');
const SPECULATION_RULES = read('src', 'components', 'speculation-rules.tsx');

describe('the floating visibility action', () => {
  it('is an ordinary action button, not a false binary switch', () => {
    expect(FAB).not.toContain('role="switch"');
    expect(FAB).not.toContain('aria-checked');
    expect(FAB).toContain('themeToggleLabel(theme)');
    expect(FAB).toContain('setChoice(next)');
  });

  it('remains available on the schedule and workspace at phone widths', () => {
    expect(GLOBALS).not.toContain('body:has(.schedule-shell) .theme-fab');
    expect(GLOBALS).not.toContain('body:has(.workspace-shell) .theme-fab');
  });

  it('keeps every appearance option at least 44 CSS pixels tall', () => {
    const start = GLOBALS.indexOf('.theme-choice-opt {');
    const rule = GLOBALS.slice(start, GLOBALS.indexOf('\n}', start));
    expect(rule).toContain('min-height: 2.75rem;');
    expect(rule).not.toMatch(/\n\s*height:\s*1\.85rem/);
  });

  it('explains the emergency action separately from the full palette', () => {
    expect(SETTINGS).toContain('one-tap visibility shortcut between Sunlight and Dark');
    expect(SETTINGS).toContain('use this picker for the full palette');
  });
});

describe('first paint and browser chrome', () => {
  it('resolves Auto before hydration and acknowledges the intentional root stamp', () => {
    expect(LAYOUT).toContain('id="lgq-theme-init"');
    expect(LAYOUT).toContain('nonce={nonce}');
    expect(LAYOUT).toMatch(/id="lgq-theme-init"[\s\S]*?suppressHydrationWarning[\s\S]*?dangerouslySetInnerHTML/);
    expect(LAYOUT).toContain("window.matchMedia('(prefers-color-scheme: light)')");
    expect(LAYOUT).toContain('suppressHydrationWarning');
    expect(SPECULATION_RULES).toMatch(/nonce=\{nonce\}[\s\S]*?suppressHydrationWarning/);
  });

  it('seeds one shared provider from the server-rendered choice', () => {
    expect(LAYOUT).toContain('<ThemeProvider');
    expect(LAYOUT).toContain('initialChoice={isStandaloneSite ? \'dark\' : choice}');
    expect(LAYOUT).toContain('initialTheme={theme}');
    expect(USE_THEME).toContain('createContext<ThemeContextValue | null>');
  });

  it('sets the initial theme-color dynamically and updates it on client changes', () => {
    expect(LAYOUT).toMatch(/export (?:async )?function generateViewport\(\): (?:Promise<)?Viewport/);
    expect(LAYOUT).toMatch(/themeColor\((?:readServerTheme\(\)|serverTheme)\.theme\)/);
    expect(USE_THEME).toContain("meta[name=\"theme-color\"]");
    expect(USE_THEME).toContain('themeColor(theme)');
  });
});

describe('light palette inheritance', () => {
  it('limits the descendant palette flip to Workbench', () => {
    const start = GLOBALS.indexOf('/* THE WORKBENCH FLIP.');
    const selectors = GLOBALS.slice(start, GLOBALS.indexOf('{', start));
    expect(selectors).toContain(":root[data-theme='light'] .panel");
    expect(selectors).not.toContain("data-theme='sunlight'");
    expect(selectors).not.toContain("data-theme='parchment'");
  });

  it('uses the darker Sunlight tab ink required for normal-size text', () => {
    const start = GLOBALS.indexOf(":root[data-theme='sunlight'] .settings-tab.active {");
    const rule = GLOBALS.slice(start, GLOBALS.indexOf('\n}', start));
    expect(rule).toContain('color: #b43403;');
  });
});
