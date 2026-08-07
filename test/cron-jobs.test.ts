import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CRON_JOBS,
  cronHealth,
  cronJob,
  expectedIntervalMs,
  graceMs,
  scheduleInWords,
  type CronJobSpec,
} from '@/lib/cron-jobs';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  crons: { path: string; schedule: string }[];
};

// The registry is a second copy of the schedule, which is a real risk: a job
// graded against a cadence it no longer runs at reports healthy while it is
// hours late. These are the tests that make the copy safe to keep.

describe('the registry and vercel.json agree', () => {
  const scheduled = new Map(vercel.crons.map((c) => [c.path.replace('/api/cron/', ''), c.schedule]));

  it('covers every scheduled job and invents none', () => {
    expect(CRON_JOBS.map((j) => j.job).sort()).toEqual([...scheduled.keys()].sort());
  });

  it('carries the same expression for each', () => {
    for (const spec of CRON_JOBS) expect(spec.schedule).toBe(scheduled.get(spec.job));
  });

  // A job whose route was deleted but whose schedule remains would 404 on every
  // fire, silently, forever.
  it('has a route on disk for every scheduled job', () => {
    const routes = readdirSync(join(process.cwd(), 'src/app/api/cron'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const job of scheduled.keys()) expect(routes).toContain(job);
  });

  // The name written to cron_runs.job has to be the one the health page looks
  // up, and the route is the only place that decides it.
  it('registers each job under the name its route reports', () => {
    for (const spec of CRON_JOBS) {
      const source = readFileSync(join(process.cwd(), 'src/app/api/cron', spec.job, 'route.ts'), 'utf8');
      expect(source).toContain(`cronRoute('${spec.job}'`);
    }
  });

  it('says what breaks for every job', () => {
    for (const spec of CRON_JOBS) expect(spec.consequence.length).toBeGreaterThan(20);
  });
});

describe('reading a cron expression', () => {
  it('handles the four shapes this schedule uses', () => {
    expect(expectedIntervalMs('*/15 * * * *')).toBe(15 * MINUTE);
    expect(expectedIntervalMs('0 * * * *')).toBe(HOUR);
    expect(expectedIntervalMs('0 13 * * *')).toBe(DAY);
    expect(expectedIntervalMs('0 13 * * 1')).toBe(7 * DAY);
  });

  it('understands every expression actually scheduled', () => {
    for (const spec of CRON_JOBS) expect(expectedIntervalMs(spec.schedule)).not.toBeNull();
  });

  // Returning null means "I cannot grade this", which the health page renders as
  // no overdue check. Guessing would put a confident red badge on a healthy job,
  // which is the fastest way to teach staff to ignore the page.
  it('declines anything it does not genuinely understand', () => {
    for (const odd of ['', '* * * * *', '0 13 1 * *', '0 13 * 6 *', '15,45 * * * *', '0 9-17 * * *', 'nonsense'])
      expect(expectedIntervalMs(odd)).toBeNull();
  });

  it('rejects a minute step that is not a real cadence', () => {
    expect(expectedIntervalMs('*/0 * * * *')).toBeNull();
    expect(expectedIntervalMs('*/60 * * * *')).toBeNull();
  });
});

describe('how much lateness is allowed', () => {
  // The fast sweeps get their own interval; anything slower gets an hour. A
  // full extra interval would mean a daily money job is not late until it is a
  // whole day late.
  it('is one interval or one hour, whichever is smaller', () => {
    expect(graceMs(15 * MINUTE)).toBe(15 * MINUTE);
    expect(graceMs(HOUR)).toBe(HOUR);
    expect(graceMs(DAY)).toBe(HOUR);
    expect(graceMs(7 * DAY)).toBe(HOUR);
  });
});

describe('grading a job', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const daily: CronJobSpec = {
    job: 'dunning',
    label: 'Dunning',
    schedule: '0 15 * * *',
    importance: 'money',
    consequence: 'x',
  };
  const done = (startedMs: number, ok = true) => ({
    started_at: ago(startedMs),
    finished_at: ago(startedMs - 1000),
    ok,
  });

  // Right after this ships every job is in this state, and it must not be
  // painted as a fault.
  it('says never seen rather than broken when there is no history', () => {
    expect(cronHealth(daily, null, null, now)).toBe('unknown');
  });

  it('is healthy when the last run succeeded recently', () => {
    expect(cronHealth(daily, done(2 * HOUR), ago(2 * HOUR), now)).toBe('ok');
  });

  it('is failing when the last run threw', () => {
    expect(cronHealth(daily, done(2 * HOUR, false), ago(2 * DAY), now)).toBe('failing');
  });

  // The case a last-run timestamp alone cannot catch: it succeeded, and then
  // the scheduler stopped calling it. Nothing is red; nothing has run.
  it('is overdue when it succeeded but has not been seen since', () => {
    expect(cronHealth(daily, done(3 * DAY), ago(3 * DAY), now)).toBe('stale');
  });

  // The boundary for a daily job is 24h + 1h of grace. Half an hour past due is
  // a scheduler running behind; two hours past is a job that missed its slot.
  it('tolerates being a little late without crying wolf', () => {
    expect(cronHealth(daily, done(DAY + 30 * MINUTE), ago(DAY + 30 * MINUTE), now)).toBe('ok');
    expect(cronHealth(daily, done(DAY + 2 * HOUR), ago(DAY + 2 * HOUR), now)).toBe('stale');
  });

  describe('a run that started and never finished', () => {
    it('is simply running while it is still plausible', () => {
      expect(cronHealth(daily, { started_at: ago(5 * MINUTE), finished_at: null, ok: null }, ago(DAY), now)).toBe('running');
    });

    // The failure mode a success-only timestamp cannot distinguish from "never
    // ran": killed past maxDuration, or OOM, with no chance to write an ending.
    it('is failing once no real run could still be going', () => {
      expect(cronHealth(daily, { started_at: ago(3 * DAY), finished_at: null, ok: null }, ago(4 * DAY), now)).toBe('failing');
    });
  });

  // The last run succeeded, but every earlier attempt today failed and the last
  // success is ancient — the row-level view says fine, the history does not.
  it('checks the last SUCCESS, not just the last row', () => {
    expect(cronHealth(daily, done(HOUR), ago(9 * DAY), now)).toBe('stale');
  });
});

describe('the schedule in words', () => {
  it('reads the way somebody would say it', () => {
    expect(scheduleInWords('*/15 * * * *')).toBe('Every 15 minutes');
    expect(scheduleInWords('0 * * * *')).toBe('Hourly');
    expect(scheduleInWords('0 13 * * *')).toBe('Daily at 13:00 UTC');
    expect(scheduleInWords('0 13 * * 1')).toBe('Mondays at 13:00 UTC');
  });

  it('falls back to the raw expression rather than lying', () => {
    expect(scheduleInWords('15,45 * * * *')).toBe('15,45 * * * *');
    expect(scheduleInWords('nope')).toBe('nope');
  });
});

describe('looking a job up', () => {
  it('finds one by name and returns nothing for a stranger', () => {
    expect(cronJob('dunning')?.importance).toBe('money');
    expect(cronJob('not-a-job')).toBeUndefined();
  });
});
