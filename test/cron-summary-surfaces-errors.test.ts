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

/**
 * The four routes above were made to report failure by converting their
 * worker's `errors` array into a count, because a count is a shape
 * `cronSummaryHasFailures` could read. The array shape itself stayed invisible
 * to it: an array is neither number, boolean nor string, so it fell past every
 * branch and read as a clean run.
 *
 * That left three scheduled jobs recording Healthy on every failure they
 * collected — `purge-expired`, `google-lsa-sync` and `weather-morning-alert`,
 * whose routes hand the worker's result to `cronRoute` untouched. Detecting the
 * array fixes all three at once, and any worker written the same way later.
 */
describe('a summary whose failures arrive as a list', () => {
  it('reads a populated errors array as failed work', () => {
    expect(cronSummaryHasFailures({ errors: ['Item deletion-1 error: boom'] })).toBe(true);
  });

  it('reads an empty errors array as a clean run', () => {
    expect(cronSummaryHasFailures({ errors: [] })).toBe(false);
  });

  it.each(['failed', 'failures', 'error_count', 'pause_failures'])(
    'reads a populated %s array as failed work too',
    (key) => {
      expect(cronSummaryHasFailures({ [key]: ['one'] })).toBe(true);
      expect(cronSummaryHasFailures({ [key]: [] })).toBe(false);
    },
  );

  it('still ignores a list under a key that does not name a failure', () => {
    expect(cronSummaryHasFailures({ purged: ['lead-1', 'lead-2'], notes: ['fine'] })).toBe(false);
  });

  it('judges the real purge-worker summary shape', () => {
    expect(
      cronSummaryHasFailures({ purgedDeletionsCount: 0, processedClosureJobsCount: 0, errors: ['Claim error: lock timeout'] }),
    ).toBe(true);
    expect(cronSummaryHasFailures({ purgedDeletionsCount: 4, processedClosureJobsCount: 1, errors: [] })).toBe(false);
  });

  it('leaves the count and string shapes working as they did', () => {
    expect(cronSummaryHasFailures({ errors: 3 })).toBe(true);
    expect(cronSummaryHasFailures({ errors: 0 })).toBe(false);
    expect(cronSummaryHasFailures({ errors: 'boom' })).toBe(true);
    expect(cronSummaryHasFailures({ errors: '0' })).toBe(false);
    expect(cronSummaryHasFailures({ failed: true })).toBe(true);
  });

  it('holds the three routes that depend on the array being seen', () => {
    for (const name of ['purge-expired', 'google-lsa-sync', 'weather-morning-alert']) {
      const src = sourceOf(name);
      // They pass the worker result straight through, so the detection above is
      // the only thing standing between a failed sweep and a Healthy badge.
      expect(src).toContain('cronRoute(');
    }
  });
});
