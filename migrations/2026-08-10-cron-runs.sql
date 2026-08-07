-- A heartbeat for the scheduled jobs.
--
-- Fourteen crons are scheduled in vercel.json — including dunning, recurring
-- and plan-installments, which are the three that collect money — and until now
-- none of them recorded that they had run. Each route checked CRON_SECRET,
-- called one library function, and returned a JSON summary to a caller
-- (Vercel's scheduler) that reads the status code and discards the body. There
-- is no APM in this codebase either. So a job that stopped firing, or started
-- throwing on every invocation, was invisible: recurring charges would quietly
-- stop being collected and every screen in the console would look healthy.
--
-- The distinction that makes this worth a table rather than a "last_run_at"
-- column: a row is written when a job STARTS, and updated when it finishes. A
-- job that is killed mid-run — a Vercel timeout past maxDuration, an OOM —
-- leaves a started row that never finishes, and that is the failure mode a
-- success-only timestamp cannot show. It looks identical to "never ran" and it
-- is a completely different problem.
create table if not exists cron_runs (
  id            uuid primary key default gen_random_uuid(),
  -- Matches the route segment under /api/cron, e.g. 'dunning'. Deliberately
  -- not a foreign key to anything: the set of jobs lives in vercel.json and in
  -- lib/cron-jobs.ts, and a job removed from the schedule must not take its
  -- own history with it.
  job           text not null,
  started_at    timestamptz not null default now(),
  -- Null means still running, or killed before it could finish. Those two are
  -- told apart by age, on the health page.
  finished_at   timestamptz,
  ok            boolean,
  duration_ms   integer,
  -- Whatever the job returned — the same summary that used to go only into an
  -- HTTP response body nobody read. Shapes differ per job by design; this is
  -- evidence, not a schema.
  summary       jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

-- The health page's only query shape: newest run per job.
create index if not exists cron_runs_job_started_idx on cron_runs (job, started_at desc);
-- Finding the last SUCCESS is a separate question from finding the last run,
-- and it is the one that decides whether a job is overdue.
create index if not exists cron_runs_job_ok_idx on cron_runs (job, started_at desc) where ok;

-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client can read or write it.
alter table cron_runs enable row level security;

-- Retention. The two 15-minute jobs alone write ~192 rows a day, and the whole
-- schedule is roughly 250/day — call it 90k a year, which is small but grows
-- without bound and has no reason to. Ninety days is longer than any question
-- anyone asks of a heartbeat ("is it running, when did it last work, what did
-- it say when it broke") and short enough that the table stays trivial.
--
-- Deleted by the sweep in lib/cron-runs.ts rather than by a pg_cron job,
-- because pg_cron is not enabled on this project and adding a scheduled job to
-- watch the scheduled jobs has an obvious problem.
create index if not exists cron_runs_started_idx on cron_runs (started_at);
