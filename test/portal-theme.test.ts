import { readFileSync } from 'fs';
import { test, expect } from 'vitest';
import { join } from 'path';

test('portal page has no inline hex colors', () => {
  const content = readFileSync(join(__dirname, '../src/app/portal/view/[token]/page.tsx'), 'utf-8');
  const hexColorRegex = /#[0-9a-fA-F]{3,6}/g;
  const matches = content.match(hexColorRegex) || [];
  expect(matches.length).toBe(0);
});
