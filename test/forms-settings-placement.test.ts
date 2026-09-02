import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const SHELL = read('src', 'components', 'app-shell.tsx');
const SETTINGS = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const FORMS_HUB = read('src', 'app', 'dashboard', 'forms', 'FormsHubClient.tsx');
const SECTION = read('src', 'app', 'dashboard', 'settings', 'FieldFormsSettingsSection.tsx');

describe('Forms & QA navigation and settings placement', () => {
  it('is removed from the primary nav rail and baseNavItems', () => {
    // Should not be a nav item in the Work group
    expect(SHELL).not.toContain("'/dashboard/forms'");
    expect(SHELL).not.toContain("{ href: '/dashboard/forms', label: 'Forms & QA'");
  });

  it('is located in Settings -> Business -> Trust & compliance', () => {
    // Settings imports and loads form templates
    expect(SETTINGS).toContain("import FieldFormsSettingsSection from './FieldFormsSettingsSection'");
    expect(SETTINGS).toContain("import { listFormTemplates } from '@/lib/forms/forms-data'");
    expect(SETTINGS).toContain('listFormTemplates(supabase, accountId');

    // Business tab and trust section claim the forms anchors
    expect(SETTINGS).toContain("'forms'");
    expect(SETTINGS).toContain("'field-forms'");
    expect(SETTINGS).toContain("'qa'");

    // FieldFormsSettingsSection sits in Trust & compliance right next to InsuranceSection
    const trustIndex = SETTINGS.indexOf("id: 'trust'");
    expect(trustIndex).toBeGreaterThan(0);
    const trustSlice = SETTINGS.slice(trustIndex, SETTINGS.indexOf("id: 'apps'", trustIndex));
    expect(trustSlice).toContain('<InsuranceSection');
    expect(trustSlice).toContain('<FieldFormsSettingsSection');
  });

  it('renders a dedicated FieldFormsSettingsSection card with forms anchors and actions', () => {
    expect(SECTION).toContain('id="forms"');
    expect(SECTION).toContain('Field forms, checklists &amp; QA');
    expect(SECTION).toContain('/dashboard/forms/builder');
    expect(SECTION).toContain('/dashboard/forms');
  });

  it('includes a back link from the forms hub to Business settings', () => {
    expect(FORMS_HUB).toContain('/dashboard/settings#forms');
    expect(FORMS_HUB).toContain('Back to Business settings');
  });
});
