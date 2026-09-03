import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Quick Edit Popups across Leads and Jobs', () => {
  const root = process.cwd();

  it('verifies quick-edit CSS contains high-contrast styling for all 4 themes', () => {
    const cssPath = join(root, 'src/components/quick-edit/quick-edit.module.css');
    expect(existsSync(cssPath)).toBe(true);
    const css = readFileSync(cssPath, 'utf8');

    // Default / Dark theme
    expect(css).toContain('background: var(--bg-3, #171b23);');
    expect(css).toContain('color: var(--text, #eef1f6);');

    // Dim theme
    expect(css).toContain(":root[data-theme='dim'] .modal");
    expect(css).toContain('background: #24211d;');
    expect(css).toContain('color: #efece6;');

    // Light theme (dark slate)
    expect(css).toContain(":root[data-theme='light'] .modal");
    expect(css).toContain('background: #1c1e23;');
    expect(css).toContain('color: #f3f4f6;');

    // Sunlight theme (true high-contrast light theme)
    expect(css).toContain(":root[data-theme='sunlight'] .modal");
    expect(css).toContain('background: #ffffff;');
    expect(css).toContain('color: #090d16;');
    expect(css).toContain('border: 2px solid #090d16;');
    expect(css).toContain(":root[data-theme='sunlight'] .form input");

    // Portaled dialog high z-index & backdrop
    expect(css).toContain('z-index: 10005;');
  });

  it('verifies reusable quick-edit components are exported from @/components/quick-edit', () => {
    const indexPath = join(root, 'src/components/quick-edit/index.ts');
    expect(existsSync(indexPath)).toBe(true);
    const indexContent = readFileSync(indexPath, 'utf8');

    expect(indexContent).toContain('QuickEditModal');
    expect(indexContent).toContain('QuickEditNameModal');
    expect(indexContent).toContain('QuickEditContactModal');
    expect(indexContent).toContain('QuickEditAddressModal');
    expect(indexContent).toContain('quickEditStyles');
  });

  it('verifies lead server actions include updateLeadNameAction, updateLeadAddressAction, and updateLeadContactAction', () => {
    const actionsPath = join(root, 'src/app/dashboard/leads/actions.ts');
    const actionsContent = readFileSync(actionsPath, 'utf8');

    expect(actionsContent).toContain('export async function updateLeadNameAction');
    expect(actionsContent).toContain('export async function updateLeadAddressAction');
    expect(actionsContent).toContain('export async function updateLeadContactAction');
  });

  it('verifies job server actions include updateJobClientNameAction, updateJobContactAction, and updateJobAddressAction', () => {
    const actionsPath = join(root, 'src/app/dashboard/jobs/actions.ts');
    const actionsContent = readFileSync(actionsPath, 'utf8');

    expect(actionsContent).toContain('export async function updateJobClientNameAction');
    expect(actionsContent).toContain('export async function updateJobContactAction');
    expect(actionsContent).toContain('export async function updateJobAddressAction');
  });

  it('verifies Lead surfaces integrate quick-edit triggers and modals', () => {
    const leadDetailTabs = readFileSync(join(root, 'src/app/dashboard/leads/LeadDetailTabs.tsx'), 'utf8');
    expect(leadDetailTabs).toContain('QuickEditContactModal');
    expect(leadDetailTabs).toContain('QuickEditAddressModal');
    expect(leadDetailTabs).toContain('Edit contact');
    expect(leadDetailTabs).toContain('Edit address');

    const leadSmoothie = readFileSync(join(root, 'src/app/dashboard/leads/LeadSmoothieView.tsx'), 'utf8');
    expect(leadSmoothie).toContain('QuickEditNameModal');
    expect(leadSmoothie).toContain('updateLeadNameAction');

    const leadFocus = readFileSync(join(root, 'src/app/dashboard/leads/LeadFocusView.tsx'), 'utf8');
    expect(leadFocus).toContain('QuickEditNameModal');
    expect(leadFocus).toContain('updateLeadNameAction');

    const leadFullPage = readFileSync(join(root, 'src/app/dashboard/leads/[leadId]/page.tsx'), 'utf8');
    expect(leadFullPage).toContain('LeadTitleHeader');

    const leadContactCard = readFileSync(join(root, 'src/app/dashboard/leads/[leadId]/LeadContactCard.tsx'), 'utf8');
    expect(leadContactCard).toContain('QuickEditContactModal');

    const leadAddressCard = readFileSync(join(root, 'src/app/dashboard/leads/[leadId]/LeadAddressCard.tsx'), 'utf8');
    expect(leadAddressCard).toContain('QuickEditAddressModal');
  });

  it('verifies Job surfaces integrate quick-edit triggers and modals', () => {
    const jobDetailTabs = readFileSync(join(root, 'src/app/dashboard/jobs/JobDetailTabs.tsx'), 'utf8');
    expect(jobDetailTabs).toContain('QuickEditNameModal');
    expect(jobDetailTabs).toContain('QuickEditContactModal');
    expect(jobDetailTabs).toContain('QuickEditAddressModal');

    const jobSmoothie = readFileSync(join(root, 'src/app/dashboard/jobs/JobSmoothieView.tsx'), 'utf8');
    expect(jobSmoothie).toContain('QuickEditNameModal');
    expect(jobSmoothie).toContain('updateJobClientNameAction');

    const jobFocus = readFileSync(join(root, 'src/app/dashboard/jobs/FocusView.tsx'), 'utf8');
    expect(jobFocus).toContain('QuickEditNameModal');
    expect(jobFocus).toContain('updateJobClientNameAction');

    const jobFullPage = readFileSync(join(root, 'src/app/dashboard/jobs/[id]/page.tsx'), 'utf8');
    expect(jobFullPage).toContain('JobClientNameHeader');
    expect(jobFullPage).toContain('JobAddressHeader');
    expect(jobFullPage).toContain('JobContactHeader');
  });
});
