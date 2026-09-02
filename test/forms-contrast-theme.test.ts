import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Forms hub & components contrast & theme compliance', () => {
  const formsCss = read('src', 'components', 'forms', 'forms.module.css');
  const formsHub = read('src', 'app', 'dashboard', 'forms', 'FormsHubClient.tsx');
  const builderWorkspace = read('src', 'components', 'forms', 'FormBuilderWorkspace.tsx');
  const jobFormsPanel = read('src', 'components', 'forms', 'JobFormsPanel.tsx');
  const fieldJobForms = read('src', 'components', 'forms', 'FieldJobForms.tsx');
  const fieldFormRunner = read('src', 'components', 'forms', 'FieldFormRunner.tsx');

  it('forms.module.css uses design system tokens and has no hardcoded white card surfaces', () => {
    // Should NOT have hardcoded #ffffff or #f8fafc as background surfaces in CSS
    expect(formsCss).not.toMatch(/background:\s*(?:var\(--surface-card,\s*)?#ffffff/);
    expect(formsCss).not.toMatch(/color:\s*(?:var\(--text-primary,\s*)?#0f172a/);

    // Should use elevated background tokens and standard theme text
    expect(formsCss).toContain('var(--bg-elevated)');
    expect(formsCss).toContain('var(--text)');
    expect(formsCss).toContain('var(--muted)');
    expect(formsCss).toContain('var(--line)');
  });

  it('FormsHubClient uses workspace shell and semantic stat card classes', () => {
    // Should wrap in workspace shell
    expect(formsHub).toContain('wide-shell workspace-shell');

    // Should NOT have hardcoded #ffffff inline backgrounds on stats
    expect(formsHub).not.toMatch(/style=\{\{\s*background:\s*['"]#ffffff['"]/);
    expect(formsHub).not.toMatch(/color:\s*['"]#0f172a['"]/);

    // Should use the CSS module stats classes
    expect(formsHub).toContain('styles.statsGrid');
    expect(formsHub).toContain('styles.statCard');
    expect(formsHub).toContain('styles.statLabel');
    expect(formsHub).toContain('styles.statValue');
  });

  it('Secondary buttons inside cards have explicit color assurance to prevent invisible text', () => {
    expect(formsCss).toContain('.cardFooter :global(.btn.secondary)');
    expect(formsCss).toMatch(/\.cardFooter :global\(\.btn\.secondary\)\s*\{\s*color:\s*var\(--text\)/);
  });

  it('FormBuilderWorkspace does not blow contrast with hardcoded light backgrounds', () => {
    expect(builderWorkspace).toContain('wide-shell workspace-shell');
    expect(builderWorkspace).not.toMatch(/style=\{\{\s*background:\s*['"]#ffffff['"]/);
    expect(builderWorkspace).not.toMatch(/style=\{\{\s*background:\s*['"]#f8fafc['"]/);
  });

  it('JobFormsPanel, FieldJobForms, and FieldFormRunner use theme tokens instead of stark white hex surfaces', () => {
    expect(jobFormsPanel).not.toMatch(/background:\s*['"](?:var\(--surface-primary,\s*)?#ffffff['"]/);
    expect(fieldJobForms).not.toMatch(/style=\{\{\s*background:\s*['"]#ffffff['"]/);
    expect(fieldFormRunner).not.toMatch(/style=\{\{\s*background:\s*['"]#ffffff['"]/);
  });
});
