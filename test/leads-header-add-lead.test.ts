import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Leads Workspace Header + Add Lead Button Layout', () => {
  it('verifies LeadsWorkspace renders the header with side-by-side + Add lead button', () => {
    const src = readFileSync('src/app/dashboard/leads/LeadsWorkspace.tsx', 'utf8');
    expect(src).toContain('styles.headingTitleRow');
    expect(src).toContain('<HeadingTag>{headingTitle}</HeadingTag>');
    expect(src).toContain('styles.addLeadBtn');
    expect(src).toContain('+ Add lead');
  });

  it('verifies leads.module.css styles the header row and add lead pill button', () => {
    const css = readFileSync('src/app/dashboard/leads/leads.module.css', 'utf8');
    expect(css).toContain('.headingTitleRow');
    expect(css).toContain('display: flex;');
    expect(css).toContain('align-items: center;');
    expect(css).toContain('.addLeadBtn');
    expect(css).toContain('border-radius: 999px;');
  });

  it('verifies LeadSmoothieView toolbar no longer duplicates + Add lead', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/leads/LeadSmoothieView.tsx', 'utf8');
    expect(smoothieSrc).not.toContain('+ Add lead');
  });

  it('verifies dashboard leads page passes headingTitle="Leads"', () => {
    const dashboardLeads = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8');
    expect(dashboardLeads).toContain('headingTitle="Leads"');
    expect(dashboardLeads).toContain('headingTag="h1"');
  });

  it('verifies LeadsWorkspace renders the Voice & Text-to-Lead button in the header', () => {
    const src = readFileSync('src/app/dashboard/leads/LeadsWorkspace.tsx', 'utf8');
    expect(src).toContain("import FieldIntakeHint from '@/components/field-intake-hint'");
    expect(src).toContain('<FieldIntakeHint page="leads" />');
    expect(src).toContain('styles.workspaceHeading');
    expect(src).toContain('styles.headerActions');

    const css = readFileSync('src/app/dashboard/leads/leads.module.css', 'utf8');
    expect(css).toContain('.workspaceHeading');
    expect(css).toContain('.headerActions');

    const hintSrc = readFileSync('src/components/field-intake-hint.tsx', 'utf8');
    expect(hintSrc).toContain("pillLabel: 'Voice & Text-to-Lead'");
    expect(hintSrc).toContain('capture new prospects or stage estimates for review');
  });
});
