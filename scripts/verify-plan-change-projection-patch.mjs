/**
 * Prove the plan-change projection patch edits what it claims and nothing else.
 *
 * WHY A HARNESS FOR TWO CLAUSES. This is a SOURCE patch: it reads two live
 * function definitions, replaces text inside them, and re-executes the result.
 * The arithmetic is not the risk. The risks are an edit that matches nothing
 * because the installed body drifted, an edit that matches twice and quietly
 * rewrites a neighbour, and a patch that appears to apply while leaving the
 * anti-forgery clauses damaged.
 *
 * So the fixtures here are the REAL function bodies, dumped verbatim from
 * production, under their REAL names -- including the one PostgreSQL truncated
 * to 63 characters. What is under test is the patch mechanism against the exact
 * strings it will meet.
 *
 * `check_function_bodies` is turned OFF so the two functions install on a bare
 * cluster with none of the billing schema present -- plpgsql resolves its
 * `%rowtype` declarations at CREATE time, so without this every fixture fails on
 * a missing relation. That is deliberate and it is also the honest boundary of
 * this file: it tests the PATCH, not the projection. Whether a plan change
 * actually projects end to end needs the full billing schema and is NOT claimed
 * here.
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
  console.error('  (cd node_modules/@embedded-postgres/windows-x64 && node scripts/hydrate-symlinks.js)');
  process.exit(2);
}

const FIXTURES = join(REPO, 'test-fixtures', 'plan-change-projection');
const BINDING_FIXTURE = join(FIXTURES, 'binding.sql');
const PROJECTOR_FIXTURE = join(FIXTURES, 'projector.sql');
for (const f of [BINDING_FIXTURE, PROJECTOR_FIXTURE]) {
  if (!existsSync(f)) {
    console.error(`Missing fixture ${f}. Re-dump it from production with scripts/dump-billing-fixtures.mjs.`);
    process.exit(2);
  }
}

const MIGRATION = readFileSync(
  join(REPO, 'migrations', '20260823120000_plan_change_projection_binding.sql'), 'utf8',
);

/** The two DO blocks that patch functions, without the table DDL or commit. */
function patchBlocksOnly(sql) {
  const blocks = [...sql.matchAll(/do \$\$[\s\S]*?end \$\$;/g)].map((m) => m[0]);
  // 1 binding, 2 projector, 3 post-conditions.
  if (blocks.length !== 3) throw new Error(`expected 3 DO blocks in the migration, found ${blocks.length}`);
  return blocks;
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-planchange-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: 54331, persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('harness');
  client = pg.getPgClient('harness');
  await client.connect();
  console.log('HELPER_GUARD=PASS (cluster up)');

  // plpgsql resolves %rowtype at CREATE time, so the real bodies cannot install
  // without the billing schema. This harness is about the text edit, not the
  // semantics, so the validator is turned off rather than stubbing 20 tables.
  await client.query('set check_function_bodies = off');

  const install = async () => {
    await client.query('drop schema if exists public cascade; create schema public;');
    await client.query(readFileSync(BINDING_FIXTURE, 'utf8'));
    await client.query(readFileSync(PROJECTOR_FIXTURE, 'utf8'));
  };
  const bodyOf = async (proname) => (await client.query(
    `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`, [proname],
  )).rows[0]?.def ?? '';

  const BINDING = 'resolve_stripe_billing_subscription_projection_binding_v1_unche';
  const PROJECTOR = 'project_stripe_billing_subscription_event_v1_unchecked';
  const [bindingBlock, projectorBlock] = patchBlocksOnly(MIGRATION);

  // --- the fixtures are the real thing -----------------------------------
  await install();
  const before = { binding: await bodyOf(BINDING), projector: await bodyOf(PROJECTOR) };
  check('fixtures install under their real (63-char truncated) names',
    before.binding.length > 0 && before.projector.length > 0);
  check('the unpatched bodies are the ones that refuse a plan change',
    before.binding.includes('v_subscription.provider_price_id is distinct from p_provider_price_id')
      && before.projector.includes("v_entitlement.plan_code not in ('flex', v_plan_code) then"));
  check('neither fixture already mentions the new purpose',
    !before.binding.includes('base_plan_plan_change') && !before.projector.includes('base_plan_plan_change'));

  // --- the patch applies --------------------------------------------------
  await client.query(bindingBlock);
  await client.query(projectorBlock);
  const after = { binding: await bodyOf(BINDING), projector: await bodyOf(PROJECTOR) };
  check('binding took the patch', after.binding.includes('base_plan_plan_change'));
  check('projector took the patch', after.projector.includes('base_plan_plan_change'));

  // --- and did not damage the guards that must never move -----------------
  check('binding still pins the operation price (the anti-forgery clause)',
    after.binding.includes('v_operation.stripe_price_id is distinct from p_provider_price_id'));
  check('binding still refuses a foreign workspace',
    after.binding.includes('v_subscription.account_id is distinct from p_account_id'));
  check('binding still refuses a foreign Stripe customer',
    after.binding.includes('v_subscription.provider_customer_id is distinct from p_provider_customer_id'));
  check('the price clause is now conditional, not deleted',
    after.binding.includes('v_subscription.provider_price_id is distinct from p_provider_price_id')
      && after.binding.includes("and v_operation.purpose is distinct from 'base_plan_plan_change'"));
  check('projector still refuses a paid-to-paid move with no plan-change operation',
    after.projector.includes("v_entitlement.plan_code not in ('flex', v_plan_code)")
      && after.projector.includes("and o.purpose = 'base_plan_plan_change'"));

  // --- re-running changes nothing ----------------------------------------
  await client.query(bindingBlock);
  await client.query(projectorBlock);
  const twice = { binding: await bodyOf(BINDING), projector: await bodyOf(PROJECTOR) };
  check('re-running the patch is a no-op, not a second edit',
    twice.binding === after.binding && twice.projector === after.projector);

  // --- a DRIFTED body must raise, never silently do nothing ---------------
  // This is the failure the exactly-once assertion exists for, and the only way
  // to know it works is to make the body drift on purpose.
  await install();
  await client.query(
    (await bodyOf(BINDING)).replace(
      'or v_subscription.provider_price_id is distinct from p_provider_price_id',
      'or v_subscription.provider_price_id is distinct from p_provider_price_id -- drifted',
    ),
  );
  let raised = null;
  try { await client.query(bindingBlock); } catch (error) { raised = error.message; }
  check('a drifted binding body RAISES rather than patching nothing',
    raised !== null && /matched 0 times|expected exactly 1/.test(raised ?? ''), raised ?? 'no error raised');

  // --- a body containing the clause TWICE must also raise -----------------
  await install();
  // The duplicate must be the EXACT needle, indentation and all. A first draft
  // of this injected a near-miss with different leading whitespace, so the
  // needle still matched once, the patch applied cleanly and the test passed
  // while proving nothing.
  const NEEDLE = '    or v_subscription.provider_price_id is distinct from p_provider_price_id\n  ) then';
  const original = (await bodyOf(BINDING)).replace(/\r\n/g, '\n');
  if (!original.includes(NEEDLE)) throw new Error('needle absent from fixture; the duplicate test would be vacuous');
  const doubled = original.replace(NEEDLE, `${NEEDLE}\n${NEEDLE}`);
  let raisedTwice = null;
  try {
    await client.query(doubled);
    await client.query(bindingBlock);
  } catch (error) { raisedTwice = error.message; }
  check('a body matching TWICE raises rather than rewriting a neighbour',
    raisedTwice !== null, raisedTwice ?? 'no error raised');
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* never started */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 10) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
