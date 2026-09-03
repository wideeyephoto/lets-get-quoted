import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Clients Screen Single Unified Container', () => {
  it('verifies ClientsScreen renders only 1 single container merging hero into workspaceCard', () => {
    const screenSrc = readFileSync('src/app/dashboard/clients/ClientsScreen.tsx', 'utf8');

    // Does not have split hero section
    expect(screenSrc).not.toContain('<section className={`panel ${pageStyles.hero}`}');

    // Has single workspace section card containing the workspaceHeading
    expect(screenSrc).toContain('<section className={`panel workspace-section-card ${pageStyles.workspaceCard}`}');
    expect(screenSrc).toContain('workspace-section-heading');
    expect(screenSrc).toContain('pageStyles.workspaceHeading');
    expect(screenSrc).toContain('<h1 id="clients-title" className={pageStyles.title}>Customers</h1>');
    expect(screenSrc).toContain('ClientHeaderActions');
    expect(screenSrc).toContain('FieldIntakeHint');
    expect(screenSrc).toContain('ClientsWorkspace');
  });

  it('verifies clients-page.module.css styles workspaceHeading and single container padding', () => {
    const css = readFileSync('src/app/dashboard/clients/clients-page.module.css', 'utf8');
    expect(css).toContain('.workspaceHeading {');
    expect(css).toContain('.headingCopy {');
    expect(css).toContain('padding: 1.15rem 1.25rem 1.25rem;');
  });
});
