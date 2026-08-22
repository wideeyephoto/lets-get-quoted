// READ-ONLY health read of public.cron_runs in the database in DATABASE_URL.
//
//   node scripts/inspect-cron-health.mjs            (last 24 hours)
//   node scripts/inspect-cron-health.mjs 60         (last 60 minutes)
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
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const windowMinutes = Number.parseInt(process.argv[2] ?? '', 10) || 1440;

async function loadEnvFile() {
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

async function declaredCrons() {
  const raw = await readFile(resolve(root, 'vercel.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return (parsed.crons ?? []).map((entry) => ({
    job: String(entry.path).replace('/api/cron/', ''),
    schedule: entry.schedule,
  }));
}

await loadEnvFile();
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set; nothing to read.');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const declared = await declaredCrons();
  const { rows } = await client.query(
    `select job,
            count(*)::int as runs,
            count(*) filter (where not ok)::int as failures,
            max(started_at) as last_run
       from public.cron_runs
      where started_at > now() - ($1::int * interval '1 minute')
      group by job`,
    [windowMinutes],
  );
/**
 * The LONGEST gap this schedule can leave, in minutes, or null if unreadable.
 *
 * Deliberately coarse and deliberately conservative. It exists only to answer
 * "could this possibly have fired inside the window?" — anything it cannot parse
 * returns null and is treated as due, because the failure that matters is a dead
 * worker reported as fine, never the reverse.
 */
function maxIntervalMinutes(schedule) {
  const parts = String(schedule || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  if (month !== '*') return 366 * 1440;
  if (dom !== '*') return 31 * 1440;
  if (dow !== '*') return 7 * 1440;
  if (hour === '*') return minute === '*' ? 1 : 60;
  const step = /^\*\/(\d+)$/.exec(hour);
  if (step) return Number(step[1]) * 60;
  // A single hour, or a list of them: the widest gap is still under a day.
  return 1440;
}

  const seen = new Map(rows.map((row) => [row.job, row]));

  console.log(`cron_runs over the last ${windowMinutes} minute(s)`);
  console.log(`${declared.length} crons declared in vercel.json\n`);

  const silent = [];
  const idle = [];
  for (const { job, schedule } of declared.slice().sort((a, b) => a.job.localeCompare(b.job))) {
    const row = seen.get(job);
    if (!row) {
      // A weekly cron is not broken on a Saturday. Reporting it as SILENT beside a
      // genuinely dead every-minute worker is a permanent false alarm, and a report
      // that always shows two problems teaches people to read neither.
      const period = maxIntervalMinutes(schedule);
      if (period !== null && period > windowMinutes) {
        idle.push({ job, schedule });
        console.log(`idle     ${job.padEnd(34)} ${schedule} -- a ${windowMinutes}min window cannot see it`);
        continue;
      }
      silent.push({ job, schedule });
      console.log(`SILENT   ${job.padEnd(34)} ${schedule}`);
      continue;
    }
    const mark = row.failures > 0 ? 'FAILING ' : 'ok      ';
    const detail = `${row.runs} run(s), ${row.failures} failure(s), last ${row.last_run.toISOString()}`;
    console.log(`${mark} ${job.padEnd(34)} ${detail}`);
  }

  const undeclared = rows.filter((row) => !declared.some((d) => d.job === row.job));
  if (undeclared.length) {
    console.log('\nRan but not declared in vercel.json:');
    for (const row of undeclared) console.log(`  ${row.job} (${row.runs} runs)`);
  }

  console.log(`\n${declared.length - silent.length - idle.length} of ${declared.length - idle.length} DUE crons recorded a run.`);
  if (idle.length) {
    console.log(`${idle.length} not due in this window: ${idle.map((i) => i.job).join(', ')}.`);
    console.log('Widen it to reach them: node scripts/inspect-cron-health.mjs 10140');
  }
  if (silent.length) {
    console.log('A SILENT worker is not a passing worker -- it recorded nothing at all,');
    console.log('and its own schedule says it should have.');
  }
} finally {
  await client.end();
}
