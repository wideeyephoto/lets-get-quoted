import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        results.push(...findTsFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Tenant IDOR & Action Authorization Guard', () => {
  const dashboardDir = join(process.cwd(), 'src/app/dashboard');
  const actionFiles = findTsFiles(dashboardDir).filter(
    (file) => file.endsWith('actions.ts') || file.endsWith('actions.tsx'),
  );

  it('verifies all dashboard server action files establish verified session context', () => {
    expect(actionFiles.length).toBeGreaterThan(20);

    const violations: Array<{ file: string; reason: string }> = [];

    for (const filePath of actionFiles) {
      const rel = relative(dashboardDir, filePath).replace(/\\/g, '/');
      const content = readFileSync(filePath, 'utf8');

      // Recognized server context entrypoints
      const hasAuthGuard =
        content.includes('requireOwnerContext') ||
        content.includes('requireOfficeContext') ||
        content.includes('requireDashboardShellContext') ||
        content.includes('executeMerchantOnboardingStart') ||
        content.includes('executeBasePlanSubscriptionCheckout') ||
        content.includes('executeTopUpPurchaseCheckout') ||
        content.includes('requireAuth') ||
        content.includes('requireStaffContext');

      if (!hasAuthGuard) {
        violations.push({
          file: rel,
          reason: 'Server action file does not import or invoke a recognized dashboard auth guard',
        });
      }
    }

    expect(
      violations,
      `Action files missing session context guard: ${JSON.stringify(violations, null, 2)}`,
    ).toEqual([]);
  });

  it('verifies dashboard action signatures do not trust client-supplied accountId', () => {
    // Ensuring no action accepts untrusted accountId without server verification
    const suspiciousSignatures: Array<{ file: string; line: string }> = [];

    for (const filePath of actionFiles) {
      const rel = relative(dashboardDir, filePath).replace(/\\/g, '/');
      const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

      for (const line of lines) {
        // Detect exported action functions that take accountId directly as an argument from the caller
        if (
          line.includes('export async function') &&
          (line.includes('accountId:') || line.includes('account_id:'))
        ) {
          suspiciousSignatures.push({ file: rel, line: line.trim() });
        }
      }
    }

    expect(
      suspiciousSignatures,
      `Actions must resolve accountId from server session rather than accepting it as an untrusted parameter: ${JSON.stringify(
        suspiciousSignatures,
        null,
        2,
      )}`,
    ).toEqual([]);
  });
});
