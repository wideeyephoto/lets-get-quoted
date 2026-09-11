import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A duplicate key in package.json is silent in the one place it matters.
 *
 * `test:pg17:job-access` was defined twice. JSON.parse keeps the LAST
 * definition and discards the first without complaint, so `npm run` resolved to
 * a two-line shim while the entry a reader would find first — and the entry a
 * reviewer would check against the CI step name — was dead text. Nothing failed.
 * The only symptom was an esbuild warning printed above every vitest run, which
 * is exactly the kind of notice that gets read as background noise.
 *
 * The same shape would be worse on a gate: silently shadowing
 * `test:pg17:closure-domains` or `check:schema:order` with a second definition
 * gives you a green CI step that runs something else. So the parse this asserts
 * on is the raw text, not the object — the object cannot show you the defect it
 * was created by dropping.
 */

const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');

/** Top-level keys of one object literal, by text, so duplicates survive to be counted. */
function keysInSection(source: string, section: string): string[] {
  const start = source.indexOf(`"${section}": {`);
  expect(start, `package.json has no "${section}" section`).toBeGreaterThan(-1);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = source.slice(start, end);
  return [...body.matchAll(/^\s{4}"([^"]+)":/gm)].map((match) => match[1]);
}

describe('package.json', () => {
  for (const section of ['scripts', 'dependencies', 'devDependencies']) {
    it(`defines every ${section} entry exactly once`, () => {
      const keys = keysInSection(raw, section);
      expect(keys.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      const duplicated = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
      expect([...new Set(duplicated)]).toEqual([]);
    });
  }

  // The specific one that was wrong, named rather than implied: the CI step
  // "Office Data API boundary on PostgreSQL 17" runs this script, so the script
  // has to be the office boundary harness and not something that merely
  // forwards to it.
  it('points the CI PostgreSQL boundary gate straight at its harness', () => {
    const scripts = JSON.parse(raw).scripts as Record<string, string>;
    expect(scripts['test:pg17:job-access']).toBe('node scripts/verify-office-data-api-boundary.mjs');

    const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('npm run test:pg17:job-access');
  });

  /**
   * Every `npm run` target a CI workflow names must exist. A renamed script and
   * a stale workflow line fail the job with "missing script", which is loud —
   * but only once CI has already spent the minutes to get there.
   */
  it('defines every script the CI workflows invoke', () => {
    const scripts = JSON.parse(raw).scripts as Record<string, string>;
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const invoked = [...workflow.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((match) => match[1]);
    expect(invoked.length).toBeGreaterThan(0);
    for (const name of invoked) expect(scripts, `ci.yml runs "${name}", which package.json does not define`).toHaveProperty(name);
  });
});
