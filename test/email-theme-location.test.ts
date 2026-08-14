import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const MARKETING = read('src', 'app', 'dashboard', 'marketing', 'MarketingOverviewScreen.tsx');
const PICKER = read('src', 'app', 'dashboard', 'marketing', 'EmailThemeSection.tsx');
const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');

describe('email theme placement', () => {
  it('lives on Marketing rather than Account settings', () => {
    expect(MARKETING).toContain('<EmailThemeSection {...emailTheme} accordion />');
    expect(SETTINGS).not.toContain('EmailThemeSection');
    expect(SETTINGS).not.toContain("'email-theme'");
  });

  it('is a closed-by-default native accordion', () => {
    const disclosure = PICKER.slice(PICKER.indexOf('<details'), PICKER.indexOf('</details>'));
    expect(disclosure).toContain('id="email-theme"');
    expect(disclosure).toContain('<summary');
    expect(disclosure).not.toMatch(/\bopen(?:=|\s|>)/);
  });

  it('keeps saving on the Marketing route', () => {
    const actions = read('src', 'app', 'dashboard', 'marketing', 'actions.ts');
    expect(actions).toContain('export async function updateEmailThemeAction');
    expect(actions).toContain("revalidatePath('/dashboard/marketing')");
  });
});
