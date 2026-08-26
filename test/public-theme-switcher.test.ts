import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const PUBLIC_LAYOUT = read('src', 'components', 'flagship', 'public-header-layout.tsx');
const FLAGSHIP_HOME = read('src', 'components', 'flagship', 'flagship-home.tsx');
const APP_SHELL = read('src', 'components', 'app-shell.tsx');
const GLOBALS = read('src', 'app', 'globals.css');
const GLOBALS_LITE = read('src', 'app', 'globals-lite.css');
const FLAGSHIP_CSS = read('src', 'components', 'flagship', 'flagship.module.css');

describe('public site theme switcher', () => {
  it('mounts ThemeFab in PublicHeaderLayout for all public marketing sub-pages', () => {
    expect(PUBLIC_LAYOUT).toContain("import ThemeFab from '@/components/theme-fab';");
    expect(PUBLIC_LAYOUT).toContain('<ThemeFab />');
  });

  it('mounts ThemeFab in FlagshipHome for the homepage', () => {
    expect(FLAGSHIP_HOME).toContain("import ThemeFab from '@/components/theme-fab';");
    expect(FLAGSHIP_HOME).toContain('<ThemeFab />');
  });

  it('mounts ThemeFab in AppShell public layout branch', () => {
    expect(APP_SHELL).toContain('<ThemeFab />');
    expect(APP_SHELL).toContain('app-main-public');
  });

  it('positions .theme-fab correctly on public pages without the docked app rail', () => {
    expect(GLOBALS).toContain('.chrome-shell-public .theme-fab');
    expect(GLOBALS).toContain('body:not(:has(.app-main-sidenav)) .theme-fab');
    expect(GLOBALS_LITE).toContain('.chrome-shell-public .theme-fab');
    expect(GLOBALS_LITE).toContain('body:not(:has(.app-main-sidenav)) .theme-fab');
  });
});

describe('public site light & dim mode styling', () => {
  it('defines light mode tokens in flagship.module.css', () => {
    expect(FLAGSHIP_CSS).toContain(":root[data-theme='light'] .root");
    expect(FLAGSHIP_CSS).toContain('--ink: #f8fafc;');
    expect(FLAGSHIP_CSS).toContain('--ink-2: #ffffff;');
    expect(FLAGSHIP_CSS).toContain('--panel: #ffffff;');
  });

  it('defines light mode header and hero rules in flagship.module.css', () => {
    expect(FLAGSHIP_CSS).toContain(":root[data-theme='light'] .root :global(.site-header)");
    expect(FLAGSHIP_CSS).toContain(":root[data-theme='light'] .root :global(.hero)");
    expect(FLAGSHIP_CSS).toContain(":root[data-theme='light'] .root :global(.site-menu)");
  });

  it('defines dim mode tokens in flagship.module.css', () => {
    expect(FLAGSHIP_CSS).toContain(":root[data-theme='dim'] .root");
    expect(FLAGSHIP_CSS).toContain('--ink: #0d1722;');
    expect(FLAGSHIP_CSS).toContain('--panel: #162938;');
  });
});
