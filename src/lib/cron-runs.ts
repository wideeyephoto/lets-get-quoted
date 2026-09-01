import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { CRON_JOBS, cronHealth, cronSummaryHasFailures, type CronHealth } from '@/lib/cron-jobs';

/**
 * The one shape every scheduled route now has.
 *
 * All fourteen were the same five lines around a single call: check
 * CRON_SECRET, try, await one library function, return its summary as JSON,
 * console.error on failure. That summary went to Vercel's scheduler, which
 * reads the status code and throws the body away — so the most informative
 * thing each job produced was discarded on every run, and the fact that a job
 * had run at all was recorded nowhere.
 *
 * THE ONE RULE HERE: recording a run must never be able to break the run.
 * Every write below is wrapped and swallowed. A heartbeat that can take down
 * dunning is worse than no heartbeat — it converts an observability gap into an
 * outage, in the exact code path that collects money.
 */

export type CronRunRow = {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
};

const COLUMNS = 'id, job, started_at, finished_at, ok, duration_ms, summary, error';

/** Ninety days, per the note in the migration. */
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * One in fifty runs prunes. There is no scheduled job to do it — a cron to
 * watch the crons has an obvious problem — and doing it on every run would add
 * a delete to the hot path of a job that fires every fifteen minutes. At
 * roughly 250 runs a day this trims about five times a day, which is plenty for
 * a ninety-day window.
 */
const PRUNE_ODDS = 50;

async function startRun(admin: SupabaseClient, job: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('cron_runs')
      .insert({ job, started_at: new Date().toISOString() })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id ?? null;
  } catch (error) {
    console.error(`cron_runs start failed for ${job}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function finishRun(
  admin: SupabaseClient,
  runId: string | null,
  patch: { ok: boolean; durationMs: number; summary?: unknown; error?: string | null },
): Promise<void> {
  if (!runId) return;
  try {
    await admin
      .from('cron_runs')
      .update({
        finished_at: new Date().toISOString(),
        ok: patch.ok,
        duration_ms: patch.durationMs,
        // Only objects go in the jsonb column; a job returning a bare number or
        // string is wrapped so the shape stays queryable.
        summary: patch.summary === undefined ? null : asJson(patch.summary),
        error: patch.error ?? null,
      })
      .eq('id', runId);
  } catch (error) {
    console.error('cron_runs finish failed:', error instanceof Error ? error.message : error);
  }
}

function asJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return { value: value as never };
}

async function pruneOldRuns(admin: SupabaseClient): Promise<void> {
  try {
    await admin.from('cron_runs').delete().lt('started_at', new Date(Date.now() - RETENTION_MS).toISOString());
  } catch (error) {
    console.error('cron_runs prune failed:', error instanceof Error ? error.message : error);
  }
}

export function extractLogicalFailureReason(job: string, summary: Record<string, unknown> | null): string {
  if (!summary) return `${job} reported failed work`;

  if (typeof summary.reason === 'string' && summary.reason.trim().length > 0) {
    return `${job} failed: ${summary.reason}`.slice(0, 2000);
  }
  if (typeof summary.error === 'string' && summary.error.trim().length > 0) {
    return `${job} failed: ${summary.error}`.slice(0, 2000);
  }
  if (Array.isArray(summary.errors) && summary.errors.length > 0) {
    const errorList = summary.errors.map(String).join('; ');
    const countPrefix = summary.failed ? `${summary.failed} failed items: ` : '';
    return `${job} logical failure (${countPrefix}${errorList})`.slice(0, 2000);
  }
  if (Array.isArray(summary.failures) && summary.failures.length > 0) {
    return `${job} logical failure: ${JSON.stringify(summary.failures)}`.slice(0, 2000);
  }
  if (typeof summary.failed === 'number' && summary.failed > 0) {
    const candidateInfo = typeof summary.candidates === 'number'
      ? ` (${summary.failed}/${summary.candidates} candidates failed)`
      : ` (${summary.failed} items failed)`;
    return `${job} reported logical failures${candidateInfo}`.slice(0, 2000);
  }
  return `${job} reported failed work: ${JSON.stringify(summary)}`.slice(0, 2000);
}

/**
 * Wrap a scheduled job in the auth check and the heartbeat.
 *
 * Returns a GET handler, so a route file becomes its export plus one call.
 *
 * The 401 path deliberately writes nothing. An unauthenticated request is
 * somebody probing the endpoint, not a run, and recording it would let anyone
 * who knows the URL fill the table and — worse — make a job look like it is
 * firing when the scheduler has stopped calling it.
 */
export function cronRoute(job: string, run: () => Promise<unknown>) {
  return async function GET(request: Request): Promise<NextResponse> {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const runId = await startRun(admin, job);
    const startedMs = Date.now();

    try {
      const summary = await run();
      const summaryJson = asJson(summary);
      const logicalFailure = cronSummaryHasFailures(summaryJson);
      await finishRun(admin, runId, {
        ok: !logicalFailure,
        durationMs: Date.now() - startedMs,
        summary,
        error: null,
      });
      if (Math.floor(Math.random() * PRUNE_ODDS) === 0) await pruneOldRuns(admin);
      if (logicalFailure) {
        return NextResponse.json({ error: `${job} reported failed work`, summary }, { status: 500 });
      }
      return NextResponse.json(summary ?? { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${job} cron failed:`, message);
      await finishRun(admin, runId, { ok: false, durationMs: Date.now() - startedMs, error: message.slice(0, 2000) });
      // Status stays 500 so Vercel's own run history marks it failed too. The
      // body no longer needs to carry detail — it is in cron_runs.error, where
      // somebody can actually find it.
      return NextResponse.json({ error: `${job} run failed` }, { status: 500 });
    }
  };
}

/**
 * The newest run of every job, and the newest SUCCESSFUL run of every job.
 *
 * Two questions, not one, and the difference is the whole point: "what happened
 * last time" versus "when did this last actually work". A job that has failed
 * its last four runs has a recent row and a stale success, and reporting only
 * the first shows a red badge without saying how long it has been broken.
 *
 * Queried per job rather than as one recent slice reduced in memory. The slice
 * approach is tempting — one round trip instead of twenty-eight — but it is
 * wrong at exactly the wrong moment: the fourteen jobs together write roughly
 * 250 rows a day, so any fixed window big enough to be cheap is smaller than a
 * WEEKLY job's cadence, and service-reminders would report "never seen" between
 * every run. A monitoring page that invents an outage is worse than none.
 *
 * Each latest run is queried in parallel. In steady state (where jobs succeed),
 * `started_at` from the latest run directly provides `lastSuccessAt`, avoiding
 * 14 redundant secondary queries on every page load. The second query for
 * `ok = true` is dispatched only for jobs whose latest run failed or produced no row.
 */
export async function loadCronStatus(
  admin: SupabaseClient,
  jobs: string[],
): Promise<{ last: Map<string, CronRunRow>; lastSuccessAt: Map<string, string>; failedJobs: string[] }> {
  const last = new Map<string, CronRunRow>();
  const lastSuccessAt = new Map<string, string>();
  const failedJobs: string[] = [];
  if (!jobs.length) return { last, lastSuccessAt, failedJobs };

  const lastResults = await Promise.all(
    jobs.map(async (job) => {
      const res = await admin
        .from('cron_runs')
        .select(COLUMNS)
        .eq('job', job)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) console.error(`loadCronStatus (${job} last) failed:`, res.error);
      return {
        job,
        failed: Boolean(res.error),
        row: (res.data as CronRunRow | null) ?? null,
      };
    }),
  );

  const needsSuccessLookup: string[] = [];

  for (const item of lastResults) {
    if (item.failed) failedJobs.push(item.job);
    if (item.row) {
      last.set(item.job, item.row);
      if (item.row.ok) {
        lastSuccessAt.set(item.job, item.row.started_at);
      } else {
        needsSuccessLookup.push(item.job);
      }
    }
  }

  if (needsSuccessLookup.length > 0) {
    const successResults = await Promise.all(
      needsSuccessLookup.map(async (job) => {
        const res = await admin
          .from('cron_runs')
          .select('started_at')
          .eq('job', job)
          .eq('ok', true)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (res.error) console.error(`loadCronStatus (${job} success) failed:`, res.error);
        return {
          job,
          failed: Boolean(res.error),
          successAt: (res.data as { started_at: string } | null)?.started_at ?? null,
        };
      }),
    );

    for (const item of successResults) {
      if (item.failed && !failedJobs.includes(item.job)) failedJobs.push(item.job);
      if (item.successAt) lastSuccessAt.set(item.job, item.successAt);
    }
  }

  return { last, lastSuccessAt, failedJobs };
}

export type CronTrouble = {
  job: string;
  label: string;
  health: CronHealth;
  consequence: string;
  /** When it was last known to work, or null if it never has. */
  lastSuccessAt: string | null;
  error: string | null;
};

/**
 * The jobs that are failing or overdue, for the Command Center.
 *
 * Deliberately excludes 'unknown'. A job that has never reported is the normal
 * state for the first day or two after the heartbeat ships and for the whole
 * week before a weekly job first fires — putting it on the home page as an
 * alert would train everyone to dismiss this card before it ever meant
 * anything. The health page shows it; the alert does not.
 */
export async function getCronTrouble(
  admin: SupabaseClient,
  now = new Date(),
  onUnavailable?: (failedJobs: string[]) => void,
): Promise<CronTrouble[]> {
  const { last, lastSuccessAt, failedJobs } = await loadCronStatus(admin, CRON_JOBS.map((j) => j.job));
  if (failedJobs.length) onUnavailable?.(failedJobs);
  const trouble: CronTrouble[] = [];
  for (const spec of CRON_JOBS) {
    const run = last.get(spec.job) ?? null;
    const successAt = lastSuccessAt.get(spec.job) ?? null;
    const health = cronHealth(spec, run, successAt, now);
    if (health !== 'failing' && health !== 'stale') continue;
    trouble.push({
      job: spec.job,
      label: spec.label,
      health,
      consequence: spec.consequence,
      lastSuccessAt: successAt,
      error: run?.error ?? null,
    });
  }
  // Money first — a stalled digest and a stalled dunning run are not the same
  // problem, and the card only shows a handful of rows.
  const rank = { money: 0, customer: 1, housekeeping: 2 };
  return trouble.sort((a, b) => {
    const specA = CRON_JOBS.find((j) => j.job === a.job)!;
    const specB = CRON_JOBS.find((j) => j.job === b.job)!;
    return rank[specA.importance] - rank[specB.importance];
  });
}

/** Recent runs of one job, for the detail strip under its row. */
export async function listCronRuns(admin: SupabaseClient, job: string, limit = 20): Promise<{ runs: CronRunRow[]; available: boolean }> {
  const { data, error } = await admin
    .from('cron_runs')
    .select(COLUMNS)
    .eq('job', job)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listCronRuns failed:', error);
    return { runs: [], available: false };
  }
  return { runs: (data ?? []) as CronRunRow[], available: true };
}
