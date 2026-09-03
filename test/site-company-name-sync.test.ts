import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Website company name to accounts.business_name synchronization', () => {
  const actionsCode = readFileSync(join(process.cwd(), 'src/app/dashboard/sites/actions.ts'), 'utf8');

  it('updateSiteAction syncs accounts.business_name when company_name is updated', () => {
    // Verifies updateSiteAction contains synchronization logic
    expect(actionsCode).toContain('editableUpdates.company_name?.trim()');
    expect(actionsCode).toContain('.from(\'accounts\')');
    expect(actionsCode).toContain('.update({ business_name: nextBusinessName })');
    expect(actionsCode).toContain('.eq(\'id\', accountId)');
  });

  it('revalidates both /dashboard/sites and /dashboard/settings paths', () => {
    expect(actionsCode).toContain("revalidatePath('/dashboard/sites')");
    expect(actionsCode).toContain("revalidatePath('/dashboard/settings')");
  });
});
