import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vercel from '../vercel.json';
import { CRON_JOBS } from '@/lib/cron-jobs';

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

describe('cron coverage', () => {
  it('every cron route on disk is scheduled in vercel.json', () => {
    const orphans = cronRoutesOnDisk().filter((r) => !scheduled.has(r));
    expect(orphans, 'cron routes that exist but never fire').toEqual([]);
  });

  it('every cron route on disk is registered for health monitoring', () => {
    const unwatched = cronRoutesOnDisk().filter((r) => !registered.has(r));
    expect(unwatched, 'cron routes whose silence nothing would report').toEqual([]);
  });

  it('nothing is scheduled that has no route to answer it', () => {
    const onDisk = new Set(cronRoutesOnDisk());
    expect([...scheduled].filter((s) => !onDisk.has(s))).toEqual([]);
  });
});
