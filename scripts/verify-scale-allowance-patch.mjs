/**
 * Prove the Scale allowance patch edits what it claims and nothing else.
 *
 * WHY A HARNESS FOR FOUR NUMBERS. This is a SOURCE patch: it reads two live
 * function definitions, replaces text inside them, and re-executes the result.
 * The failure modes are not arithmetic. They are: an edit that matches nothing
 * because the body drifted, an edit that matches twice and rewrites a
 * neighbour, and a patch that quietly catches Solo or Growth on the way past --
 * those three plans share every line of the grant table.
 *
 * So the stubs here carry the REAL grant-table text, verbatim from production,
 * inside functions with the real names and signatures. What is being tested is
 * the patch mechanism against the exact strings it will meet.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
]) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. To run this check:\n\n'
    + '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n',
  );
  process.exit(2);
}

const PATCH = readFileSync(
  join(REPO, 'migrations', '20260820100000_scale_gets_the_allowance_it_is_sold.sql'), 'utf8',
).replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

/** The grant table exactly as production holds it. */
const GRANT_TABLE = (planCol) => `
        select * from (values
          ('text_segments'::text, case ${planCol}
            when 'solo' then 500 when 'growth' then 1500 when 'scale' then 1500 end),
          ('marketing_email_sends'::text, case ${planCol}
            when 'solo' then 500 when 'growth' then 2500 when 'scale' then 2500 end),
          ('ai_intake_threads'::text, case ${planCol}
            when 'solo' then 250 when 'growth' then 500 when 'scale' then 500 end),
          ('ai_writing_drafts'::text, case ${planCol}
            when 'solo' then 50 when 'growth' then 250 when 'scale' then 250 end)
        ) as resources(resource_code, units)`;

const PROJECTOR = (planCol = 'v_plan_code') => `
create or replace function public.project_stripe_billing_subscription_event_v1_unchecked(
  p_billing_event_id uuid, p_claim_token uuid, p_projection jsonb)
returns text language plpgsql as $f$
declare
  ${planCol === 'v_plan_code' ? 'v_plan_code text := \'scale\';' : ''}
  v_row record;
  v_total bigint := 0;
begin
  for v_row in ${GRANT_TABLE(planCol)}
  loop
    v_total := v_total + coalesce(v_row.units, 0);
  end loop;
  return v_total::text;
end
$f$;`;

const RESET = `
create or replace function public.apply_paid_plan_monthly_allowance_reset(p_account_id uuid)
returns text language plpgsql as $f$
declare
  v_subscription record;
  v_row record;
  v_total bigint := 0;
begin
  select 'scale'::text as plan_code into v_subscription;
  for v_row in ${GRANT_TABLE('v_subscription.plan_code')}
  loop
    v_total := v_total + coalesce(v_row.units, 0);
  end loop;
  return v_total::text;
end
$f$;`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-scale-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_SCALE_PORT || 54364),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_scale');
  c = pg.getPgClient('lgq_scale');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql) => {
    try { await q(sql); return null; } catch (e) { return e.message ?? String(e); }
  };

  await q(PROJECTOR());
  await q(RESET);

  // Sum before: 1500 + 2500 + 500 + 250 = 4750, on both.
  const before = Number((await q(
    `select public.apply_paid_plan_monthly_allowance_reset(null) as t`)).rows[0].t);
  ck('a Scale workspace starts on Growth-sized allowances', before === 4_750, before);

  await q(PATCH);
  ck('the patch applies, post-conditions and all', true);

  // 3000 + 5000 + 1000 + 500 = 9500.
  const reset = Number((await q(
    `select public.apply_paid_plan_monthly_allowance_reset(null) as t`)).rows[0].t);
  ck('THE MONTHLY RESET NOW GRANTS SCALE ITS PUBLISHED ALLOWANCE', reset === 9_500, reset);

  const projected = Number((await q(
    `select public.project_stripe_billing_subscription_event_v1_unchecked(null, null, null) as t`,
  )).rows[0].t);
  ck('...and so does the grant on activation', projected === 9_500, projected);
  ck('...which is exactly double what it was', reset === before * 2 && projected === before * 2);

  // -------------------------------------------------------------------
  // Solo and Growth share every line. They must come through untouched.
  // -------------------------------------------------------------------
  const def = (await q(`select pg_get_functiondef(
    'public.apply_paid_plan_monthly_allowance_reset(uuid)'::regprocedure) as d`)).rows[0].d;
  ck('Solo is untouched',
    def.includes("when 'solo' then 500 when 'growth' then 1500")
    && def.includes("when 'solo' then 50 when 'growth' then 250"), null);
  ck('Growth is untouched',
    def.includes("when 'growth' then 1500 when 'scale' then 3000")
    && def.includes("when 'growth' then 2500 when 'scale' then 5000")
    && def.includes("when 'growth' then 500 when 'scale' then 1000")
    && def.includes("when 'growth' then 250 when 'scale' then 500"), null);
  ck('no Growth-sized Scale value survives',
    !def.includes("when 'scale' then 1500") && !def.includes("when 'scale' then 2500"), null);
  ck('the four resource codes all survived',
    ['text_segments', 'marketing_email_sends', 'ai_intake_threads', 'ai_writing_drafts']
      .every((r) => def.includes(r)), null);

  // -------------------------------------------------------------------
  // Idempotent, because a partial run has to be repeatable.
  // -------------------------------------------------------------------
  await q(PATCH);
  ck('re-running the patch changes nothing',
    Number((await q(`select public.apply_paid_plan_monthly_allowance_reset(null) as t`))
      .rows[0].t) === 9_500);

  // -------------------------------------------------------------------
  // A drifted body must REFUSE, not half-apply. This is the assertion the
  // whole source-patch idiom rests on.
  // -------------------------------------------------------------------
  await q(`drop function public.apply_paid_plan_monthly_allowance_reset(uuid)`);
  await q(`drop function public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)`);
  await q(PROJECTOR());
  await q(RESET.replace(
    "when 'solo' then 250 when 'growth' then 500 when 'scale' then 500 end",
    "when 'solo' then 250 when 'growth' then 500 when 'scale' then 501 end"));
  const drifted = await fails(PATCH);
  ck('a drifted grant table refuses rather than half-patching',
    /grant table drifted/.test(drifted ?? ''), drifted);

  // The migration opens with `begin;`, so its raise leaves this session in an
  // aborted transaction. Every later statement would be ignored -- which would
  // make the assertion below pass for the wrong reason, or fail for one.
  await q('rollback');

  const untouched = Number((await q(
    `select public.apply_paid_plan_monthly_allowance_reset(null) as t`)).rows[0].t);
  ck('...and the refusal left the function exactly as it was',
    untouched === 1_500 + 2_500 + 501 + 250, untouched);

  await c.end();
} catch (error) {
  ck('harness ran to completion', false, error.message ?? String(error));
} finally {
  try { await pg.stop(); } catch { /* already down */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* leave it */ }
}

let failed = 0;
for (const { n, ok, d } of R) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok || d == null ? '' : `\n       ${typeof d === 'string' ? d : JSON.stringify(d)}`}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
