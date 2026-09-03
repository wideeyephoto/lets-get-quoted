import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Crew & Labor Timecards Dark Theme Contrast', () => {
  const css = readFileSync('src/app/dashboard/crew/crew.module.css', 'utf8');
  const barTsx = readFileSync('src/app/dashboard/crew/CrewPeriodBar.tsx', 'utf8');

  it('ensures .periodModes does not carry a hardcoded light background', () => {
    // The previous bug was `.periodModes { background: var(--surface-g4, #f1f5f9); }`
    // which caused HoursAndPay and LaborByJob toolbars to render as white boxes in dark mode.
    expect(css).not.toMatch(/\.periodModes\s*\{[^}]*#f1f5f9/);
    expect(css).not.toMatch(/\.periodModes\s*\{[^}]*var\(--surface-g4\)/);
  });

  it('defines dark-mode-first styling for periodModesTrack and modeBtn', () => {
    expect(css).toContain('.periodModesTrack');
    expect(css).toContain('.modeBtn');
    expect(css).toContain('.modeBtnActive');

    // Inactive mode buttons should not use undefined --text-g80
    expect(css).not.toMatch(/\.modeBtn\s*\{[^}]*--text-g80/);

    // Active mode button should not use undefined --surface-card or #ffffff fallback in dark mode
    expect(css).not.toMatch(/\.modeBtnActive\s*\{[^}]*--surface-card/);
  });

  it('styles .filter input alongside .filter select with dark color scheme', () => {
    expect(css).toMatch(/\.filter\s+select[\s\S]*?\.filter\s+input/);
    expect(css).toContain('color-scheme: dark;');
  });

  it('CrewPeriodBar uses scoped classes to avoid style collisions', () => {
    expect(barTsx).toContain('styles.periodModesTrack');
    expect(barTsx).toContain('styles.sharedPeriodLabel');
  });

  it('styles .customRange input and span for dark mode in tab=jobs', () => {
    const baseCss = css.split(/:root\[data-theme='(?:light|sunlight|parchment)'\]/)[0];
    expect(baseCss).toMatch(/\.customRange\s+input[\s\S]*?color-scheme:\s*dark/);
    expect(baseCss).toContain('.customRange span');
    expect(baseCss).not.toMatch(/\.customRange\s*\{[^}]*#f1f5f9/);
    expect(baseCss).not.toMatch(/\.customRange\s+input\s*\{[^}]*#ffffff/);
  });

  it('provides light theme overrides for all shared period controls', () => {
    expect(css).toContain(":root[data-theme='light'] .periodModesTrack");
    expect(css).toContain(":root[data-theme='light'] .modeBtn");
    expect(css).toContain(":root[data-theme='light'] .modeBtnActive");
    expect(css).toContain(":root[data-theme='light'] .currentTag");
    expect(css).toContain(":root[data-theme='light'] .customPeriodForm input");
    expect(css).toContain(":root[data-theme='light'] .customRange input");
    expect(css).toContain(":root[data-theme='light'] .customRange span");
    expect(css).toContain(":root[data-theme='light'] .periodArrow");
    expect(css).toContain(":root[data-theme='light'] .filter input");
  });
});
