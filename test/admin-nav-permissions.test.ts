import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS } from '@/app/admin/AdminNav';

describe('Admin Navigation and Page Authorization Gate (P4-1)', () => {
  it('ensures nav declared permissions match page.tsx authorization checks', () => {
    for (const item of ITEMS) {
      const relPath = item.href === '/admin' ? 'src/app/admin/page.tsx' : `src/app${item.href}/page.tsx`;
      const fullPath = path.resolve(process.cwd(), relPath);

      expect(fs.existsSync(fullPath), `Page for nav route ${item.href} must exist at ${relPath}`).toBe(true);

      const pageSource = fs.readFileSync(fullPath, 'utf8');
      const codeWithoutComments = pageSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

      // Check if the page requires a specific permission via requirePermission
      const permMatch = codeWithoutComments.match(/requirePermission\(\s*['"]([^'"]+)['"]\s*\)/);
      const pageRequiredPermission = permMatch ? permMatch[1] : undefined;

      if (pageRequiredPermission) {
        expect(
          item.permission,
          `Nav item for ${item.href} must declare permission: '${pageRequiredPermission}', but found '${item.permission}'`
        ).toBe(pageRequiredPermission);
      } else {
        expect(
          item.permission,
          `Nav item for ${item.href} declares permission: '${item.permission}', but ${relPath} does not require it`
        ).toBeUndefined();
      }
    }
  });

  it('verifies that /admin/operator is protected by ops.manage', () => {
    const operatorItem = ITEMS.find((i) => i.href === '/admin/operator');
    expect(operatorItem?.permission).toBe('ops.manage');

    const operatorPage = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/admin/operator/page.tsx'),
      'utf8'
    );
    expect(operatorPage).toContain("requirePermission('ops.manage')");
  });

  it('verifies that /admin/staff is protected by staff.manage', () => {
    const staffItem = ITEMS.find((i) => i.href === '/admin/staff');
    expect(staffItem?.permission).toBe('staff.manage');

    const staffPage = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/admin/staff/page.tsx'),
      'utf8'
    );
    expect(staffPage).toContain("requirePermission('staff.manage')");
  });
});
