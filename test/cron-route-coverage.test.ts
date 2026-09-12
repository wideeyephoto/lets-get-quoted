import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vercel from '../vercel.json';
import { CRON_JOBS, PARKED_CRON_ROUTES } from '@/lib/cron-jobs';

// Four cron routes once existed on disk, wired to cronRoute, in neither
// vercel.json nor CRON_JOBS. Nothing fired them and nothing reported them
// missing, because the health watchdog grades CRON_JOBS and cannot miss what it
// has never heard of. smart-dunning was among them, and the feature catalog
// sells it as automatic failed-payment recovery.
//
// The registry-vs-schedule half is covered by cron-jobs.test.ts. This is the
// half that was absent: the ROUTES have to be in that set too.
function cronRoutesOnDisk(): string[] {
  const base = join(process.cwd(), 'src/app/api/cron');
  return readdirSync(base).filter((entry) => {
    try {
      return statSync(join(base, entry, 'route.ts')).isFile();
    } catch {
      return false;
    }
  });
}

const scheduled = new Set(
  (vercel.crons as { path: string }[]).map((c) => c.path.replace('/api/cron/', '')),
);
const registered = new Set(CRON_JOBS.map((j) => j.job));
const parked = new Set(PARKED_CRON_ROUTES.map((p) => p.job));

describe('cron coverage', () => {
  // The invariant is no longer "everything is scheduled". Two routes were
  // scheduled on 2026-09-12 and unscheduled the same day: smart-dunning writes
  // next_retry_at onto payments the dunning engine had already marked terminal,
  // and activation-autopilot has no table and no dispatcher. Parking them is
  // correct — but parking them SILENTLY is the original bug, so the rule is now
  // that a route is either live and watched, or listed with a reason.
  it('every cron route on disk is either scheduled or explicitly parked', () => {
    const unaccounted = cronRoutesOnDisk().filter((r) => !scheduled.has(r) && !parked.has(r));
    expect(unaccounted, 'cron routes that neither fire nor admit to being parked').toEqual([]);
  });

  it('every scheduled cron route is registered for health monitoring', () => {
    const unwatched = cronRoutesOnDisk()
      .filter((r) => scheduled.has(r))
      .filter((r) => !registered.has(r));
    expect(unwatched, 'cron routes whose silence nothing would report').toEqual([]);
  });

  it('a parked route is not also scheduled', () => {
    expect([...parked].filter((p) => scheduled.has(p)), 'parked yet still firing').toEqual([]);
  });

  it('a parked route is not carried in the health registry', () => {
    // A registered job that never fires reads as overdue forever.
    expect([...parked].filter((p) => registered.has(p)), 'parked yet still graded').toEqual([]);
  });

  it('every parked route gives a substantive reason', () => {
    for (const entry of PARKED_CRON_ROUTES) {
      expect(entry.reason.length, `${entry.job} needs a real reason`).toBeGreaterThan(80);
    }
  });

  it('every parked route still exists on disk', () => {
    const onDisk = new Set(cronRoutesOnDisk());
    expect([...parked].filter((p) => !onDisk.has(p)), 'parked entry for a deleted route').toEqual([]);
  });

  it('nothing is scheduled that has no route to answer it', () => {
    const onDisk = new Set(cronRoutesOnDisk());
    expect([...scheduled].filter((s) => !onDisk.has(s))).toEqual([]);
  });
});
