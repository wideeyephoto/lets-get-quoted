import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

// These four routes were scheduled and registered for health monitoring by the
// 2026-09-12 audit. Each worker collects an `errors` array; each route used to
// return a hardcoded `ok: true` and drop it, so cronSummaryHasFailures had
// nothing to key on and the run recorded healthy however much the sweep could
// not do. Two of the four (smart-dunning, activation-autopilot) push an error
// for every item because no outbound dispatcher is wired, so they would have
// reported green forever while delivering nothing.
const ROUTES = ['smart-dunning', 'activation-autopilot', 'webhook-heal', 'db-guard'] as const;

const sourceOf = (name: string) =>
  readFileSync(join(process.cwd(), 'src/app/api/cron', name, 'route.ts'), 'utf8');

describe('cron summaries can report failure', () => {
  for (const name of ROUTES) {
    it(`${name} surfaces the worker's error count`, () => {
      const src = sourceOf(name);
      expect(src).toContain('errors: result.errors.length');
    });

    it(`${name} does not hardcode ok: true`, () => {
      const src = sourceOf(name);
      expect(src).not.toContain('ok: true');
      expect(src).toContain('ok: result.errors.length === 0');
    });
  }

  it('an error count is what the failure matcher actually keys on', () => {
    // Guards the coupling: renaming the summary field would silently restore
    // the blindness, because the matcher tests the KEY name.
    expect(cronSummaryHasFailures({ ok: false, errors: 3 })).toBe(true);
    expect(cronSummaryHasFailures({ ok: true, errors: 0 })).toBe(false);
  });

  it('the sample field does not itself trip the matcher', () => {
    // errorSamples is for a human reading the row; only the count decides.
    expect(cronSummaryHasFailures({ errorSamples: ['a', 'b'], errors: 0 })).toBe(false);
  });
});
