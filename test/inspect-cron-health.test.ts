import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore - raw ESM script
import {
  maxIntervalMinutes,
  graceMinutesFor,
  classifyJobStatus,
} from '../scripts/inspect-cron-health.mjs';

const MINUTE = 1;
const HOUR = 60;
const DAY = 1440;
const WEEK = 7 * DAY;

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  crons: { path: string; schedule: string }[];
};

describe('maxIntervalMinutes schedule parser', () => {
  it('correctly computes interval for all cadences', () => {
    expect(maxIntervalMinutes('* * * * *')).toBe(MINUTE);
    expect(maxIntervalMinutes('*/5 * * * *')).toBe(5);
    expect(maxIntervalMinutes('*/15 * * * *')).toBe(15);
    expect(maxIntervalMinutes('0 * * * *')).toBe(HOUR);
    expect(maxIntervalMinutes('17 * * * *')).toBe(HOUR);
    expect(maxIntervalMinutes('37 * * * *')).toBe(HOUR);
    expect(maxIntervalMinutes('0 13 * * *')).toBe(DAY);
    expect(maxIntervalMinutes('43 5 * * *')).toBe(DAY);
    expect(maxIntervalMinutes('0 13 * * 1')).toBe(WEEK);
  });

  it('understands every schedule expression in vercel.json', () => {
    for (const entry of vercel.crons) {
      const interval = maxIntervalMinutes(entry.schedule);
      expect(interval, `Failed for schedule: ${entry.schedule}`).not.toBeNull();
      expect(interval).toBeGreaterThan(0);
    }
  });

  it('rejects invalid or unreadable cron strings', () => {
    expect(maxIntervalMinutes('')).toBeNull();
    expect(maxIntervalMinutes('invalid')).toBeNull();
    expect(maxIntervalMinutes('* * *')).toBeNull();
  });
});

describe('graceMinutesFor calculation', () => {
  it('allocates one interval or 60 minutes, whichever is smaller', () => {
    expect(graceMinutesFor(1)).toBe(1);
    expect(graceMinutesFor(5)).toBe(5);
    expect(graceMinutesFor(15)).toBe(15);
    expect(graceMinutesFor(60)).toBe(60);
    expect(graceMinutesFor(DAY)).toBe(60);
    expect(graceMinutesFor(WEEK)).toBe(60);
  });
});

describe('classifyJobStatus', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  describe('when seen in recent window', () => {
    it('returns ok for zero failures', () => {
      const result = classifyJobStatus({
        job: 'recurring',
        schedule: '0 13 * * *',
        windowMinutes: 90,
        seenRow: { runs: 1, failures: 0, last_run: minutesAgo(30) },
        everRow: { last_run: minutesAgo(30), latest_ok: true },
        now,
      });
      expect(result.status).toBe('ok');
    });

    it('returns failing for non-zero failures', () => {
      const result = classifyJobStatus({
        job: 'recurring',
        schedule: '0 13 * * *',
        windowMinutes: 90,
        seenRow: { runs: 1, failures: 1, last_run: minutesAgo(30) },
        everRow: { last_run: minutesAgo(30), latest_ok: false },
        now,
      });
      expect(result.status).toBe('failing');
    });
  });

  describe('when NOT seen in recent window', () => {
    it('returns silent if job has never recorded a run in history', () => {
      const result = classifyJobStatus({
        job: 'new-job',
        schedule: '0 13 * * *',
        windowMinutes: 90,
        seenRow: null,
        everRow: null,
        now,
      });
      expect(result.status).toBe('silent');
      expect(result.reason).toBe('never_ran');
    });

    it('returns silent if high-frequency job missed its window', () => {
      const result = classifyJobStatus({
        job: 'sms-delivery',
        schedule: '* * * * *', // 1-minute cadence
        windowMinutes: 90,
        seenRow: null,
        everRow: { last_run: minutesAgo(120), latest_ok: true },
        now,
      });
      expect(result.status).toBe('silent');
      expect(result.reason).toBe('missed_window');
    });

    describe('money-collecting daily crons (recurring, dunning, plan-installments)', () => {
      const moneyCrons = [
        { job: 'recurring', schedule: '0 13 * * *' },
        { job: 'dunning', schedule: '0 15 * * *' },
        { job: 'plan-installments', schedule: '0 14 * * *' },
      ];

      it('returns idle (not due) when money cron ran within its 24h + 1h grace window', () => {
        for (const cron of moneyCrons) {
          // Ran 18 hours ago (1080 minutes ago): within 1440 + 60 = 1500m
          const result = classifyJobStatus({
            job: cron.job,
            schedule: cron.schedule,
            windowMinutes: 90,
            seenRow: null,
            everRow: { last_run: minutesAgo(18 * 60), latest_ok: true },
            now,
          });
          expect(result.status, `${cron.job} should be idle`).toBe('idle');
        }
      });

      it('DOES NOT excuse stale money crons as idle — marks them STALE when overdue', () => {
        for (const cron of moneyCrons) {
          // Ran 30 hours ago (1800 minutes ago): exceeded 1440 + 60 = 1500m
          const result = classifyJobStatus({
            job: cron.job,
            schedule: cron.schedule,
            windowMinutes: 90,
            seenRow: null,
            everRow: { last_run: minutesAgo(30 * 60), latest_ok: true },
            now,
          });
          expect(result.status, `${cron.job} must be marked stale, not idle!`).toBe('stale');
          expect(result.reason).toBe('overdue');
        }
      });

      it('marks daily cron as failing if last historical run outside window threw', () => {
        const result = classifyJobStatus({
          job: 'dunning',
          schedule: '0 15 * * *',
          windowMinutes: 90,
          seenRow: null,
          everRow: {
            last_run: minutesAgo(10 * 60),
            latest_ok: false,
            last_error: 'Stripe API connection timeout',
          },
          now,
        });
        expect(result.status).toBe('failing');
        expect(result.reason).toBe('last_run_failed');
      });
    });

    describe('weekly crons (service-reminders)', () => {
      it('returns idle when weekly cron ran 3 days ago', () => {
        const result = classifyJobStatus({
          job: 'service-reminders',
          schedule: '0 13 * * 1', // 7 days
          windowMinutes: 90,
          seenRow: null,
          everRow: { last_run: minutesAgo(3 * 24 * 60), latest_ok: true },
          now,
        });
        expect(result.status).toBe('idle');
      });

      it('returns stale when weekly cron is 9 days overdue', () => {
        const result = classifyJobStatus({
          job: 'service-reminders',
          schedule: '0 13 * * 1',
          windowMinutes: 90,
          seenRow: null,
          everRow: { last_run: minutesAgo(9 * 24 * 60), latest_ok: true },
          now,
        });
        expect(result.status).toBe('stale');
        expect(result.reason).toBe('overdue');
      });
    });
  });
});
