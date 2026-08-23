/**
 * Prove the cancellation revert edits what it claims and nothing else.
 *
 * This is the SECOND source patch applied to
 * project_stripe_billing_subscription_event_v1_unchecked in two days, and the
 * risk that matters is not the arithmetic. It is:
 *
 *   - an anchor that has drifted, so the patch silently matches nothing;
 *   - an anchor that matches twice, rewriting a neighbour;
 *   - the revert landing BEFORE the plan-binding check, where it would compare
 *     flex against flex and stop catching a genuinely conflicting paid plan;
 *   - this patch clobbering the plan-change relaxation added the day before,
 *     since both rewrite the whole function body.
 *
 * The fixture is the REAL body dumped from production AFTER the plan-change
 * patch, so what is under test is this edit meeting the exact text it will meet.
 *
 * `check_function_bodies` is off: plpgsql resolves %rowtype at CREATE time and
 * this harness deliberately has none of the billing schema. It tests the TEXT
 * EDIT. It does not prove a cancellation projects end to end.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
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
  console.error('embedded-postgres is not installed; run the PostgreSQL harness setup first.');
  console.error('  npm install --no-save embedded-postgres@17.10.0-beta.17 @embedded-postgres/windows-x64@17.10.0-beta.17');
  process.exit(2);
}

const FIXTURE = join(REPO, 'test-fixtures', 'cancelled-returns-to-flex', 'projector.sql');
if (!existsSync(FIXTURE)) {
  console.error(`Missing fixture ${FIXTURE}.`);
  process.exit(2);
}
const MIGRATION = readFileSync(
  join(REPO, 'migrations', '20260823160000_cancelled_workspace_returns_to_flex.sql'), 'utf8',
);

/** The patch block and the post-condition block, without begin/commit. */
function blocks(sql) {
  const found = [...sql.matchAll(/do \$(patch|check)\$[\s\S]*?end \$\1\$;/g)].map((m) => m[0]);
  if (found.length !== 2) throw new Error(`expected 2 DO blocks, found ${found.length}`);
  return found;
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-cancelflex-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: 54332, persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('harness');
  client = pg.getPgClient('harness');
  await client.connect();
  await client.query('set check_function_bodies = off');
  console.log('HELPER_GUARD=PASS (cluster up)');

  const PROJECTOR = 'project_stripe_billing_subscription_event_v1_unchecked';
  const install = async () => {
    await client.query('drop schema if exists public cascade; create schema public;');
    await client.query(readFileSync(FIXTURE, 'utf8'));
  };
  const body = async () => (await client.query(
    `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`, [PROJECTOR],
  )).rows[0]?.def ?? '';

  const [patchBlock, checkBlock] = blocks(MIGRATION);

  await install();
  const before = await body();
  check('fixture is the real post-plan-change body',
    before.includes('base_plan_plan_change') && before.includes('update public.workspace_entitlements e'));
  check('fixture does not already revert to Flex', !before.includes('RETURNS THE WORKSPACE TO FLEX'));
  check('fixture still writes plan_code unconditionally, which is the bug',
    before.includes('set plan_code = v_plan_code,'));

  await client.query(patchBlock);
  const after = await body();
  check('the revert is installed', after.includes('RETURNS THE WORKSPACE TO FLEX'));
  check('it is gated on canceled only',
    after.includes("if v_entitlement_billing_status = 'canceled' then"));
  check('it does not touch unpaid, paused or past_due',
    !/if v_entitlement_billing_status in \('canceled'/.test(after));
  check('it writes the four columns every re-entry gate reads',
    after.includes("v_plan_code := 'flex';")
      && after.includes("v_billing_interval := 'none';")
      && after.includes("v_entitlement_billing_status := 'free';")
      && after.includes("v_entitlement_state := 'active';"));
  check('it restores the Flex fee and limits, not just the labels',
    after.includes('v_platform_fee_bps := 125;')
      && after.includes('"office_users":1')
      && after.includes('"shared_lgq_texting_number":true'));

  // The ordering that makes it safe.
  check('the revert runs AFTER the plan-binding check',
    after.indexOf('already bound to another paid plan') < after.indexOf('RETURNS THE WORKSPACE TO FLEX'));
  check('the revert runs AFTER the billing_subscriptions writes',
    after.lastIndexOf('update public.billing_subscriptions s') < after.indexOf('RETURNS THE WORKSPACE TO FLEX'));
  check('the revert runs BEFORE the entitlement update it is meant to change',
    after.indexOf('RETURNS THE WORKSPACE TO FLEX') < after.indexOf('update public.workspace_entitlements e'));

  // The previous day's patch must survive.
  check('the plan-change relaxation from 20260823120000 survived',
    after.includes('base_plan_plan_change'));

  await client.query(checkBlock);
  check('the migration post-conditions pass against its own output', true);

  await client.query(patchBlock);
  const twice = await body();
  check('re-running is a no-op', twice === after);

  // A drifted anchor must raise.
  //
  // The drift has to land INSIDE the anchor. A first version appended a comment
  // after the trailing comma, which is where the anchor already ends -- so it
  // still matched once, the patch applied cleanly, and the test passed having
  // proven nothing. Alias the table instead: that is inside the matched text.
  await install();
  await client.query((await body()).replace(
    'update public.workspace_entitlements e',
    'update public.workspace_entitlements as e',
  ));
  let raised = null;
  try { await client.query(patchBlock); } catch (error) { raised = error.message; }
  check('a drifted anchor RAISES rather than patching nothing',
    raised !== null && /matched 0 times|expected exactly 1/.test(raised ?? ''), raised ?? 'no error');
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  try { await client?.end(); } catch { /* closed */ }
  try { await pg.stop(); } catch { /* never started */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 10) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
