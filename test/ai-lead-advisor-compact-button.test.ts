import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('AI Lead Advisor Compact Button', () => {
  it('verifies LeadsWorkspace renders headingTitleRow and compact button', () => {
    const workspace = readFileSync('src/app/dashboard/leads/LeadsWorkspace.tsx', 'utf8');
    expect(workspace).toContain('headingTitleRow');
    expect(workspace).toContain('advisorCompactButton');
    expect(workspace).not.toContain('advisorBanner');
  });

  it('verifies leads page.tsx passes headingTitle to LeadsWorkspace', () => {
    const page = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8');
    expect(page).toContain('headingTitle="Leads"');
    expect(page).toContain('headingTag="h1"');
    expect(page).toContain('eyebrow="Work pipeline"');
  });

  it('verifies AiLeadAdvisor renders compactAiBtn and floating popover dialog', () => {
    const advisor = readFileSync('src/components/leads/AiLeadAdvisor.tsx', 'utf8');
    expect(advisor).toContain('styles.compactAiBtn');
    expect(advisor).toContain('styles.popoverCard');
    expect(advisor).toContain('AI Advisor');
    expect(advisor).toContain('badgeUrgent');
    expect(advisor).toContain('handleOpenInCopilot');
  });

  it('verifies CSS contains compact button and popover styles', () => {
    const css = readFileSync('src/components/leads/AiLeadAdvisor.module.css', 'utf8');
    expect(css).toContain('.compactAiBtn');
    expect(css).toContain('.popoverCard');
    expect(css).toContain('.badgeUrgent');
  });
});
