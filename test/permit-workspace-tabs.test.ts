import { describe, it, expect } from 'vitest';
import { JOB_TABS } from '../src/app/dashboard/jobs/JobDetailTabs';
import { LEAD_TABS } from '../src/app/dashboard/leads/LeadDetailTabs';
import { getPermitIntelligence } from '../src/lib/permit-intel/permit-service';

describe('Permit Workspace - Tab & Service Integration', () => {
  it('includes permits in the JOB_TABS array directly after property', () => {
    const tabIds = JOB_TABS.map((t) => t.id);
    expect(tabIds).toContain('permits');

    const propertyIndex = tabIds.indexOf('property');
    const permitsIndex = tabIds.indexOf('permits');
    expect(permitsIndex).toBe(propertyIndex + 1);
  });

  it('keeps LEAD_TABS focused on lead feasibility without separate draft application tab', () => {
    const tabIds = LEAD_TABS.map((t) => t.id);
    expect(tabIds).toContain('property');
    expect(tabIds).not.toContain('permits'); // Lead keeps permit feasibility on Property & Roof tab
  });

  it('generates a complete PermitWorkspaceDto with official portal link for Royal Oak', async () => {
    const dto = await getPermitIntelligence({
      address: '211 S Williams St, Royal Oak, MI 48067',
      rawScope: 'Complete roof tear-off and replacement with architectural shingles',
    });

    expect(dto.summary.verdict).toBe('required');
    expect(dto.authority.id).toBe('mi-royal-oak');
    expect(dto.authority.name).toBe('City of Royal Oak');
    expect(dto.authority.portalAction).toBeDefined();
    expect(dto.authority.portalAction?.url).toContain('accessmygov.com');
    expect(dto.authority.portalAction?.requiresContractorPin).toBe(true);
    expect(dto.codes.length).toBeGreaterThan(0);
    expect(dto.localAmendments.length).toBeGreaterThan(0);
    expect(dto.availableActions.canOpenPortal).toBe(true);
  });
});
