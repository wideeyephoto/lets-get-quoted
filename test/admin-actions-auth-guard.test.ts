import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findActionFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findActionFiles(fullPath));
    } else if (entry.name === 'actions.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Checks if any auth guard call is inside a try block.
 * A try block starts with `try {` and ends at the corresponding `catch` or `finally`.
 */
function findAuthGuardsInsideTry(content: string): string[] {
  const violations: string[] = [];
  const lines = content.split('\n');
  let tryDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for entering try
    if (/\btry\s*\{/.test(trimmed)) {
      tryDepth++;
    }

    if (tryDepth > 0) {
      if (/\bawait\s+require(Admin|Permission|MfaPermission|MfaPermissions)\s*\(/.test(trimmed) ||
          /\brequire(Admin|Permission|MfaPermission|MfaPermissions)\s*\(/.test(trimmed)) {
        violations.push(`Line ${i + 1}: ${trimmed}`);
      }
    }

    // Check for exiting try via catch or finally block closure
    if (/\}\s*catch\b/.test(trimmed) || /\}\s*finally\b/.test(trimmed)) {
      if (tryDepth > 0) tryDepth--;
    }
  }

  return violations;
}

describe('Admin Server Actions Auth Guard Safety (P0-2)', () => {
  const adminDir = path.resolve(process.cwd(), 'src/app/admin');
  const actionFiles = findActionFiles(adminDir);

  it('found admin action files to test', () => {
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  for (const file of actionFiles) {
    const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    it(`never calls require* inside a try block in ${relativePath}`, () => {
      const content = fs.readFileSync(file, 'utf8');
      const violations = findAuthGuardsInsideTry(content);
      expect(violations, `Found auth guard inside try in ${relativePath}:\n${violations.join('\n')}`).toEqual([]);
    });
  }
});
