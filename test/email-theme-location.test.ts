import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const MARKETING = read('src', 'app', 'dashboard', 'marketing', 'MarketingOverviewScreen.tsx');
const PICKER = read('src', 'app', 'dashboard', 'marketing', 'EmailThemeSection.tsx');
const THEME_PAGE = read('src', 'app', 'dashboard', 'marketing', 'email-theme', 'page.tsx');
const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');

describe('email theme placement', () => {
  it('uses a dedicated Marketing subpage rather than expanding the overview', () => {
    expect(MARKETING).not.toContain('<EmailThemeSection');
    expect(MARKETING).toContain("'/dashboard/marketing/email-theme'");
    expect(THEME_PAGE).toContain('<EmailThemeSection');
    expect(SETTINGS).not.toContain('EmailThemeSection');
    expect(SETTINGS).not.toContain("'email-theme'");
  });

  it('keeps the full picker off the overview page', () => {
    expect(PICKER).not.toContain('<details');
    expect(PICKER).toContain('<section className="panel workspace-section-card" id="email-theme">');
  });

  it('keeps saving on the Marketing route', () => {
    const actions = read('src', 'app', 'dashboard', 'marketing', 'actions.ts');
    expect(actions).toContain('export async function updateEmailThemeAction');
    expect(actions).toContain("revalidatePath('/dashboard/marketing')");
    expect(actions).toContain("revalidatePath('/dashboard/marketing/email-theme')");
  });
});
