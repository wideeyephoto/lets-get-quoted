import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (source: string) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const AUTOMATIONS = stripComments(read('src', 'app', 'dashboard', 'automations', 'page.tsx'));
const SETUP = stripComments(read('src', 'app', 'dashboard', 'settings', 'IntakeContentSection.tsx'));
const PREVIEW = stripComments(read('src', 'app', 'dashboard', 'sites', 'IntakePreviewModal.tsx'));
const BUILDER = stripComments(read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx'));
const LEADS = stripComments(read('src', 'app', 'dashboard', 'leads', 'LeadsWorkspace.tsx'));
const ACTIONS = stripComments(read('src', 'app', 'dashboard', 'settings', 'actions.ts'));
const INTAKE_ACTION = ACTIONS.slice(
  ACTIONS.indexOf('export async function updateIntakeContentAction'),
  ACTIONS.indexOf('export async function toggleClientPortalAction'),
);

describe('Smart Intake admin surfaces', () => {
  it('uses one customer-facing name while preserving the legacy anchor', () => {
    for (const source of [AUTOMATIONS, SETUP, PREVIEW, BUILDER, LEADS]) {
      expect(source).not.toMatch(/Intake AI|AI Intake|AI intake/);
    }
    expect(AUTOMATIONS).toContain('id="intake-ai"');
    expect(AUTOMATIONS).toContain('title="Smart Intake"');
  });

  it('reports the active intake method instead of presenting a second switch', () => {
    expect(AUTOMATIONS).not.toContain('toggleSmartIntakeAction');
    expect(ACTIONS).not.toContain('toggleSmartIntakeAction');
    expect(AUTOMATIONS).toContain("label: 'Smart Intake active'");
    expect(AUTOMATIONS).toContain("label: 'Classic form active'");
    expect(AUTOMATIONS).toContain('href="/dashboard/sites?open=intake"');
    expect(AUTOMATIONS).toContain('Change the intake method in Website Builder');
    expect(BUILDER).toContain("intake: { tab: 'page', card: 'estimate' }");
  });

  it('links directly to the canonical setup page', () => {
    expect(BUILDER).toContain('href="/dashboard/automations#intake-ai"');
    expect(LEADS).toContain('href="/dashboard/automations#intake-ai"');
    expect(BUILDER).not.toContain('href="/dashboard/settings#intake-ai"');
    expect(LEADS).not.toContain('href="/dashboard/settings#intake-ai"');
  });

  it('uses the real preview and labels the two save models', () => {
    expect(SETUP).not.toContain('iq-phone');
    expect(PREVIEW).toMatch(/<HeroQuickForm[^>]*\bdemo\b/);
    expect(PREVIEW).toContain('site={previewSite}');
    expect(PREVIEW).toContain('quoteForm: { ...siteContent.quoteForm, enabled: false }');
    expect(PREVIEW).toContain('<strong>Preview only:</strong>');
    expect(INTAKE_ACTION).toContain("revalidatePath('/dashboard/automations')");
    expect(AUTOMATIONS).toContain('<SaveButton onlyWhenChanged>Save pricing &amp; alerts</SaveButton>');
    expect(SETUP).toContain('changes save automatically');
  });
});
