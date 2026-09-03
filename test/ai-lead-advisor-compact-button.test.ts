import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('AI Lead Advisor Compact Button', () => {
  it('verifies LeadsWorkspace passes advisor to LeadSmoothieView with align="right"', () => {
    const workspace = readFileSync('src/app/dashboard/leads/LeadsWorkspace.tsx', 'utf8');
    expect(workspace).toContain('advisorCompactButton');
    expect(workspace).toContain('align="right"');
    expect(workspace).toContain('advisor={advisorCompactButton}');
    expect(workspace).not.toContain('advisorBanner');
  });

  it('verifies LeadSmoothieView renders advisor in 1st row of queue aligned right in queueHeadTop', () => {
    const smoothie = readFileSync('src/app/dashboard/leads/LeadSmoothieView.tsx', 'utf8');
    expect(smoothie).toContain('advisor?: ReactNode;');
    expect(smoothie).toContain('styles.queueHeadTop');
    expect(smoothie).toContain('styles.queueHeadLeft');
    expect(smoothie).toContain('{advisor}');
  });

  it('verifies leads page.tsx passes headingTitle to LeadsWorkspace', () => {
    const page = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8');
    expect(page).toContain('headingTitle="Leads"');
    expect(page).toContain('headingTag="h1"');
    expect(page).toContain('eyebrow="Work pipeline"');
  });

  it('verifies AiLeadAdvisor renders compactAiBtn and floating popover dialog with right alignment', () => {
    const advisor = readFileSync('src/components/leads/AiLeadAdvisor.tsx', 'utf8');
    expect(advisor).toContain('styles.compactAiBtn');
    expect(advisor).toContain('styles.popoverCard');
    expect(advisor).toContain('styles.popoverCardRight');
    expect(advisor).toContain('AI Advisor');
    expect(advisor).toContain('badgeUrgent');
    expect(advisor).toContain('handleOpenInCopilot');
  });

  it('verifies CSS contains compact button and popover styles including popoverCardRight', () => {
    const css = readFileSync('src/components/leads/AiLeadAdvisor.module.css', 'utf8');
    expect(css).toContain('.compactAiBtn');
    expect(css).toContain('.popoverCard');
    expect(css).toContain('.popoverCardRight');
    expect(css).toContain('.badgeUrgent');
  });
});
