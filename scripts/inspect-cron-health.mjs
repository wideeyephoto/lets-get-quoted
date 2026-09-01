// READ-ONLY health read of public.cron_runs in the database in DATABASE_URL.
//
//   node scripts/inspect-cron-health.mjs            (last 24 hours)
//   node scripts/inspect-cron-health.mjs 60         (last 60 minutes)
//   node scripts/inspect-cron-health.mjs 90 --strict
//
// WHY THIS EXISTS. A flag-gated cron route returns 404 before it reads anything,
// which means a dark worker writes NO cron_runs row at all -- so "zero failures"
// and "never ran" look identical in every summary. This diffs the crons declared
// in vercel.json against the ones that have actually recorded a run, so silence
// is visible rather than inferred.
//
// Every statement here is a SELECT. Nothing in this file writes.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dns from 'node:dns';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(root, fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const at = trimmed.indexOf('=');
        if (at === -1) continue;
        const key = trimmed.slice(0, at).trim();
        const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // A missing env file is not an error; the next one may supply the URL.
    }
  }
}

export async function declaredCrons() {
  const raw = await readFile(resolve(root, 'vercel.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return (parsed.crons ?? []).map((entry) => ({
    job: String(entry.path).replace('/api/cron/', ''),
    schedule: entry.schedule,
  }));
}

/**
 * The LONGEST gap this schedule can leave, in minutes, or null if unreadable.
 *
 * Deliberately coarse and conservative. It exists to answer
 * "could this possibly have fired inside the window?" — anything it cannot parse
 * returns null and is treated as due, because the failure that matters is a dead
 * worker reported as fine, never the reverse.
 */
export function maxIntervalMinutes(schedule) {
  const parts = String(schedule || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  if (month !== '*') return 366 * 1440;
  if (dom !== '*') return 31 * 1440;
  if (dow !== '*') return 7 * 1440;

  if (hour === '*') {
    if (minute === '*') return 1;
    const minStep = /^\*\/(\d+)$/.exec(minute);
    if (minStep) {
      const n = Number(minStep[1]);
      return n > 0 && n < 60 ? n : null;
    }
    if (/^\d+$/.test(minute)) return 60;
    return 60;
  }

  const hourStep = /^\*\/(\d+)$/.exec(hour);
  if (hourStep) return Number(hourStep[1]) * 60;

  if (/^\d+$/.test(hour)) {
    return 1440; // fires once a day
  }

  return 1440;
}

/**
 * Grace period beyond one full interval before a job counts as overdue.
 *
 * A whole extra interval is too lax for daily money jobs (a full day late
 * is not "a bit late") and too strict for fast sweeps. One interval or 60 minutes,
 * whichever is smaller: 15-minute sweeps get 15 minutes of slack, and everything
 * slower gets an hour.
 */
export function graceMinutesFor(periodMinutes) {
  if (typeof periodMinutes !== 'number' || !Number.isFinite(periodMinutes) || periodMinutes <= 0) {
    return 60;
  }
  return Math.min(periodMinutes, 60);
}

export const KNOWN_DARK_JOBS = new Set([
  'billing-subscription-projection', // Feature gated by LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED
]);

/**
 * Evaluates the status of a single declared cron job.
 */
export function classifyJobStatus({
  job,
  schedule,
  windowMinutes,
  seenRow,
  everRow,
  now = new Date(),
}) {
  if (seenRow) {
    if (seenRow.failures > 0) {
      return {
        status: 'failing',
        detail: `${seenRow.runs} run(s), ${seenRow.failures} failure(s), last ${new Date(seenRow.last_run).toISOString()}`,
      };
    }
    return {
      status: 'ok',
      detail: `${seenRow.runs} run(s), 0 failure(s), last ${new Date(seenRow.last_run).toISOString()}`,
    };
  }

  if (KNOWN_DARK_JOBS.has(job) && (!everRow || !everRow.last_run)) {
    return {
      status: 'disabled',
      reason: 'flag_gated',
      detail: `${schedule} -- intentionally disabled by feature flag`,
    };
  }

  if (!everRow || !everRow.last_run) {
    return {
      status: 'silent',
      reason: 'never_ran',
      detail: `${schedule} -- never recorded a run`,
    };
  }

  const period = maxIntervalMinutes(schedule);
  if (period === null) {
    return {
      status: 'silent',
      reason: 'unparseable_schedule',
      detail: `${schedule} -- unrecognized schedule cadence`,
    };
  }

  const lastRunDate = new Date(everRow.last_run);
  const elapsedMinutes = (now.getTime() - lastRunDate.getTime()) / 60000;

  // If the scheduled period is within the inspection window, it was due inside the window!
  if (period <= windowMinutes) {
    return {
      status: 'silent',
      reason: 'missed_window',
      detail: `${schedule} -- no run in last ${windowMinutes}min (last ran ${lastRunDate.toISOString()})`,
    };
  }

  // The scheduled period is wider than the inspection window (e.g. daily, weekly).
  // A daily cron outside a 90m window is only 'idle' if it ran within its expected period + grace!
  const grace = graceMinutesFor(period);
  const maxAllowedMinutes = period + grace;

  if (elapsedMinutes > maxAllowedMinutes) {
    const overdueMinutes = Math.round(elapsedMinutes - period);
    return {
      status: 'stale',
      reason: 'overdue',
      detail: `${schedule} -- overdue by ${overdueMinutes}m (last ran ${lastRunDate.toISOString()}; interval ${period}m + ${grace}m grace)`,
    };
  }

  if (everRow.latest_ok === false) {
    return {
      status: 'failing',
      reason: 'last_run_failed',
      detail: `${schedule} -- last run outside window failed: ${everRow.last_error || 'unknown error'}`,
    };
  }

  return {
    status: 'idle',
    reason: 'not_due',
    detail: `${schedule} -- outside this ${windowMinutes}min window; last ran ${lastRunDate.toISOString()}`,
  };
}

export async function runCronInspection({
  windowMinutes = 1440,
  strict = false,
  now = new Date(),
} = {}) {
  await loadEnvFile();

  if (!process.env.DATABASE_URL) {
    if (strict) {
      console.error('DATABASE_URL is not set; failing in --strict mode.');
      process.exitCode = 1;
      return { silent: [], stale: [], failing: [], idle: [], ok: [], error: 'DATABASE_URL missing' };
    }
    console.warn('DATABASE_URL is not set; skipping cron health inspection.');
    return { silent: [], stale: [], failing: [], idle: [], ok: [], skipped: true };
  }

  let client = null;
  if (process.env.DATABASE_URL) {
    try {
      client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
    } catch (connErr) {
      console.warn('Direct postgres connection failed, attempting Supabase REST fallback:', connErr.message);
      client = null;
    }
  }

  let rows = [];
  let everRows = [];
  let successRows = [];

  try {
    const declared = await declaredCrons();
    if (client) {
      const res1 = await client.query(
        `select job,
                count(*)::int as runs,
                count(*) filter (where not ok)::int as failures,
                max(started_at) as last_run
           from public.cron_runs
          where started_at > now() - ($1::int * interval '1 minute')
          group by job`,
        [windowMinutes],
      );
      rows = res1.rows;

      const res2 = await client.query(
        `select distinct on (job)
                job,
                started_at as last_run,
                ok as latest_ok,
                error as last_error
           from public.cron_runs
          order by job, started_at desc`,
      );
      everRows = res2.rows;

      const res3 = await client.query(
        `select job,
                max(started_at) as last_success
           from public.cron_runs
          where ok = true
          group by job`,
      );
      successRows = res3.rows;
    } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const cutoff = new Date(Date.now() - windowMinutes * 60000).toISOString();
      const { data: allRecent } = await supabase.from('cron_runs').select('job, ok, started_at, error').gte('started_at', cutoff);
      const { data: allEver } = await supabase.from('cron_runs').select('job, ok, started_at, error').order('started_at', { ascending: false }).limit(1000);

      const recentByJob = new Map();
      for (const r of allRecent || []) {
        if (!recentByJob.has(r.job)) {
          recentByJob.set(r.job, { job: r.job, runs: 0, failures: 0, last_run: r.started_at });
        }
        const entry = recentByJob.get(r.job);
        entry.runs++;
        if (!r.ok) entry.failures++;
        if (new Date(r.started_at) > new Date(entry.last_run)) entry.last_run = r.started_at;
      }
      rows = Array.from(recentByJob.values());

      const everMap = new Map();
      const successMapRaw = new Map();
      for (const r of allEver || []) {
        if (!everMap.has(r.job)) {
          everMap.set(r.job, { job: r.job, last_run: r.started_at, latest_ok: r.ok, last_error: r.error });
        }
        if (r.ok && !successMapRaw.has(r.job)) {
          successMapRaw.set(r.job, r.started_at);
        }
      }
      everRows = Array.from(everMap.values());
      successRows = Array.from(successMapRaw.entries()).map(([job, last_success]) => ({ job, last_success }));
    } else if (strict) {
      console.error('No database connection available; failing in --strict mode.');
      process.exitCode = 1;
      return { silent: [], stale: [], failing: [], idle: [], ok: [], error: 'Database connection failed' };
    }

    const successMap = new Map(successRows.map((row) => [row.job, row.last_success]));
    const seen = new Map(rows.map((row) => [row.job, row]));
    const ever = new Map(everRows.map((row) => [row.job, { ...row, last_success: successMap.get(row.job) ?? null }]));

    console.log(`cron_runs over the last ${windowMinutes} minute(s)`);
    console.log(`${declared.length} crons declared in vercel.json\n`);

    const silent = [];
    const stale = [];
    const failing = [];
    const idle = [];
    const ok = [];
    const disabled = [];

    for (const { job, schedule } of declared.slice().sort((a, b) => a.job.localeCompare(b.job))) {
      const seenRow = seen.get(job);
      const everRow = ever.get(job);
      const verdict = classifyJobStatus({
        job,
        schedule,
        windowMinutes,
        seenRow,
        everRow,
        now,
      });

      const mark = verdict.status.toUpperCase().padEnd(8);
      console.log(`${mark} ${job.padEnd(34)} ${verdict.detail}`);

      if (verdict.status === 'ok') ok.push({ job, schedule, ...verdict });
      else if (verdict.status === 'idle') idle.push({ job, schedule, ...verdict });
      else if (verdict.status === 'stale') stale.push({ job, schedule, ...verdict });
      else if (verdict.status === 'silent') silent.push({ job, schedule, ...verdict });
      else if (verdict.status === 'failing') failing.push({ job, schedule, ...verdict });
      else if (verdict.status === 'disabled') disabled.push({ job, schedule, ...verdict });
    }

    const undeclared = rows.filter((row) => !declared.some((d) => d.job === row.job));
    if (undeclared.length) {
      console.log('\nRan but not declared in vercel.json:');
      for (const row of undeclared) console.log(`  ${row.job} (${row.runs} runs)`);
    }

    console.log(`\nSummary: ${ok.length} OK, ${idle.length} idle (not due), ${disabled.length} disabled/flag-gated, ${stale.length} stale, ${silent.length} silent, ${failing.length} failing.`);

    if (idle.length) {
      console.log(`${idle.length} not due in this window: ${idle.map((i) => i.job).join(', ')}.`);
    }
    if (disabled.length) {
      console.log(`${disabled.length} disabled / flag-gated: ${disabled.map((d) => d.job).join(', ')}.`);
    }
    if (stale.length) {
      console.log(`${stale.length} STALE (overdue for execution): ${stale.map((s) => s.job).join(', ')}.`);
    }
    if (silent.length) {
      console.log(`${silent.length} SILENT (never ran or missed window): ${silent.map((s) => s.job).join(', ')}.`);
    }

    if (strict && (silent.length > 0 || stale.length > 0 || failing.length > 0)) {
      console.error(`\nCRON HEALTH AUDIT FAILED: ${silent.length} silent, ${stale.length} stale, ${failing.length} failing.`);
      process.exitCode = 1;
    }

    return { silent, stale, failing, idle, ok, disabled, undeclared };
  } finally {
    if (client) await client.end();
  }
}

// Execute if run directly from CLI:
const isDirectRun =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const windowMinutes = Number.parseInt(process.argv[2] ?? '', 10) || 1440;
  const strict = process.argv.includes('--strict');
  runCronInspection({ windowMinutes, strict }).catch((err) => {
    console.error('Fatal inspection error:', err);
    process.exit(1);
  });
}
