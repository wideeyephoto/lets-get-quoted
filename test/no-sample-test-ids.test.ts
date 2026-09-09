import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('No Sample or Test IDs in AI Operator (P1-5 Gate)', () => {
  const operatorDir = path.resolve(process.cwd(), 'src/lib/ai-operator');
  const files = fs.readdirSync(operatorDir).filter((f) => f.endsWith('.ts'));

  it('ensures no sample or test identifiers exist in src/lib/ai-operator/', () => {
    const pattern = /(dp|acc|cus|sub)[-_](sample|test)/i;
    const violations: { file: string; match: string; line: number }[] = [];

    for (const file of files) {
      const fullPath = path.join(operatorDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const m = line.match(pattern);
        if (m) {
          violations.push({
            file,
            match: m[0],
            line: idx + 1,
          });
        }
      });
    }

    expect(
      violations,
      `Found hardcoded sample/test identifiers in ai-operator:\n${JSON.stringify(violations, null, 2)}`
    ).toHaveLength(0);
  });
});
