/**
 * Verify 20260823235000 against the REAL installed function bodies, and prove
 * that each of its postconditions refuses a migration that breaks what it
 * guards. Changes nothing: every transaction is rolled back.
 *
 * WHY NOT THE FIXTURE HARNESS. `verify-plan-change-projection-patch.mjs` installs
 * two dumped bodies on a bare embedded cluster with `check_function_bodies` off,
 * which is the right shape for a pure source patch. 20260823235000 is not one: it
 * DROPs and CREATEs the binding pair to add an OUT column, its order guards read
 * `billing_subscription_plan_change_operations`, and its section 5 asserts real
 * ACLs. Reproducing all that on a bare cluster would test a stub. Running it
 * against the database it will actually be applied to tests the thing itself --
 * and a source patch's whole risk is that the installed body drifted from what
 * the patch expects, which only the real body can tell you.
 *
 * TWO PHASES.
 *   1. DRY RUN. Strip the file's own begin;/commit;, wrap it, run it, inspect,
 *      ROLLBACK. DDL and CREATE OR REPLACE FUNCTION are transactional, so this
 *      exercises every postcondition against live bodies and leaves no trace.
 *   2. MUTATION. Break one guarded property at a time and require the migration
 *      to refuse itself. A postcondition that passes its own mutant is
 *      decoration -- and an unreachable guard is invisible to every other kind
 *      of test, because killing it changes no behaviour.
 *
 * Needles below use String.raw. A backslash-n in the SQL source written as a
 * plain template literal becomes a real newline, matches nothing, and every
 * mutant then "passes" by never being applied. That failure is silent, so the
 * needle hit count is asserted to be exactly 1 before any mutant runs.
 *
 * Exits 2 when it cannot run, 1 on any failure, 0 when the migration is clean
 * and every guard bit.
 *
 *   node scripts/verify-plan-change-table-agnostic.mjs
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = join(
  REPO, 'migrations', '20260823235000_plan_change_projection_table_agnostic.sql',
);

let Client;
try {
  ({ Client } = await import('pg'));
} catch {
  console.error('pg is not installed.');
  process.exit(2);
}

for (const fileName of ['.env.local', '.env']) {
  try {
    const contents = await readFile(resolve(REPO, fileName), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      const key = trimmed.slice(0, at).trim();
      const value = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch { /* next candidate */ }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set; cannot verify against installed bodies.');
  process.exit(2);
}

let raw;
try {
  raw = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n');
} catch {
  console.error(`Missing ${MIGRATION}`);
  process.exit(2);
}

// Only the file's OWN transaction control. `begin`/`end` inside do $$ ... $$
// blocks are plpgsql and are never at column 0 with a semicolon.
const lines = raw.split('\n');
const body = lines.filter((l) => l !== 'begin;' && l !== 'commit;').join('\n');
if (lines.length - body.split('\n').length !== 2) {
  console.error('Expected exactly one top-level begin; and one commit;.');
  process.exit(2);
}

/**
 * Each mutant breaks ONE property the migration claims to guarantee. The
 * comment on each is the failure it would cause in production if the guard
 * were ever quietly removed.
 */
const MUTANTS = [
  [
    // anon would hold EXECUTE on the unchecked binding: the default ACL grants
    // it by name on every new function, and both were just recreated.
    'drop the anon revoke on the unchecked binding',
    `revoke all on function public.resolve_stripe_billing_subscription_projection_binding_v1_unche(
  uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;`,
    '',
  ],
  [
    // An already-paid renewal invoice would activate an unpaid upgrade.
    'unbind activation from the proration invoice',
    String.raw`    || E'        and v_invoice_id is not distinct from v_plan_change.proration_invoice_id\n'`,
    '',
  ],
  [
    // A change Stripe never invoiced would provision with no payment at all.
    'let a NULL proration invoice activate',
    String.raw`    || E'        and v_plan_change.proration_invoice_id is not null\n'`,
    '',
  ],
  [
    // 2b relaxed the null-Session refusal contract-wide. Without this the
    // checkout rail keeps that latitude, and the activation UPDATE then writes
    // provider_object_id = null over a live paid row's Checkout Session id.
    'let a checkout operation activate with no Checkout Session',
    String.raw`    || E'     or (v_operation_source = ''checkout'' and v_checkout_session_id is null)\n'`,
    '',
  ],
  [
    // A plan change could present someone else's Checkout Session as its own.
    'let a plan change carry a Checkout Session',
    String.raw`    || E'     or (v_operation_source = ''plan_change'' and v_checkout_session_id is not null)\n'`,
    '',
  ],
  [
    // The breadcrumb would be labelled at one write site and not the other, so
    // which ledger drove the subscription would depend on the code path.
    'label only one of the two breadcrumb sites',
    String.raw`    || E'               ''operation_source'', v_operation_source,\n'`,
    '',
  ],
  [
    // Activating from 'submitted' means activating on LGQ having ASKED for the
    // change rather than on Stripe having applied and the customer having paid.
    // Targets the patch line only -- a mutant that also edits the postcondition
    // checking it proves nothing.
    'activate a plan change straight out of submitted',
    String.raw`    || E'       or (v_operation_source = ''plan_change'' and v_operation.state = ''provider_accepted'')\n'`,
    String.raw`    || E'       or (v_operation_source = ''plan_change'' and v_operation.state = ''submitted'')\n'`,
  ],
  [
    // One operation id in both ledgers would let the caller choose which set of
    // invariants applies to it.
    'drop the two-ledger ambiguity refusal from the binding',
    `      raise exception 'Stripe Billing operation id resolves in two ledgers'
        using errcode = '22000';`,
    '      null;',
  ],
  [
    // 20260823120000's escape queries the checkout table, where a plan-change
    // operation cannot exist under this design. Leaving it is leaving dead code
    // that reads as a working relaxation.
    'leave the dead entitlement subquery in place',
    String.raw`  v_after := E'    if v_entitlement.plan_code not in (''flex'', v_plan_code)\n'
    || E'       and v_operation.purpose is distinct from ''base_plan_plan_change'' then\n';`,
    '  v_after := v_before;',
  ],
  [
    // The installed body drifting away from an anchor is the failure mode a
    // source patch dies of. It must be loud.
    'drift one anchor so it matches nothing',
    String.raw`  v_before := E'  v_operation public.billing_subscription_checkout_operations%rowtype;\n';`,
    String.raw`  v_before := E'  v_operation public.billing_subscription_checkout_operationsZ%rowtype;\n';`,
  ],
  [
    // Relaxing the Checkout expiry demand for the plan-change ledger must not
    // relax it for checkouts.
    'keep the checkout rail but stop requiring a Checkout expiry',
    `         or v_operation.checkout_expires_at is null
       )`,
    '       )',
  ],
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = (sql, params) => client.query(sql, params);

let failures = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

try {
  // ---- Phase 1: the migration itself, against the installed bodies. --------
  await q('begin');
  let ran = false;
  try {
    await q("set local lock_timeout = '5s'");
    await q("set local statement_timeout = '120s'");
    await q(body);
    ran = true;
  } catch (e) {
    check(false, 'migration runs against the installed bodies', `${e.code}: ${e.message}`);
  }
  if (ran) {
    check(true, 'migration runs against the installed bodies, postconditions included');

    const one = async (sql, params) => (await q(sql, params)).rows[0];
    const sig = await one(
      `select pg_get_function_result(p.oid) as result
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.proname = $1`,
      ['resolve_stripe_billing_subscription_projection_binding'],
    );
    check(
      Boolean(sig?.result?.includes('operation_purpose text')),
      'the binding wrapper exposes operation_purpose to its TypeScript caller',
    );

    const acl = await q(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and p.proname like 'resolve_stripe_billing_subscription_projection_binding%'`,
    );
    check(acl.rows.length === 2, 'both binding functions exist', `found ${acl.rows.length}`);
    check(
      acl.rows.every((r) => r.anon === false && r.authed === false),
      'neither binding function is reachable by anon or authenticated',
    );

    const shape = await one(
      `select (length(d) - length(replace(d, 'v_operation_source', '')))
                / length('v_operation_source') as source_refs,
              (length(d) - length(replace(d, 'returning * into v_plan_change', '')))
                / length('returning * into v_plan_change') as writebacks
         from (select replace(pg_get_functiondef(p.oid), E'\r\n', E'\n') as d
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prokind = 'f'
                  and p.proname = 'project_stripe_billing_subscription_event_v1_unchecked') s`,
    );
    check(
      Number(shape.writebacks) === 3,
      'all three operation write-backs are forked to the plan-change ledger',
      `found ${shape.writebacks}`,
    );
    check(
      Number(shape.source_refs) >= 12,
      'every state comparison is forked on the operation source',
      `${shape.source_refs} references`,
    );
  }
  await q('rollback');
  console.log('  (rolled back — database unchanged)\n');

  // ---- Phase 2: every guard must kill its mutant. --------------------------
  for (const [name, find, replace] of MUTANTS) {
    const hits = body.split(find).length - 1;
    if (hits !== 1) {
      check(false, `mutant target is unique: ${name}`, `matched ${hits}x, expected 1`);
      continue;
    }
    await q('begin');
    let lived = false;
    try {
      await q("set local lock_timeout = '5s'");
      await q(body.replace(find, replace));
      lived = true;
    } catch {
      // Refused, which is the point.
    }
    await q('rollback');
    check(!lived, `refused: ${name}`);
  }
} finally {
  await client.end();
}

console.log(
  failures === 0
    ? '\nAll checks passed. The migration is clean against the installed bodies and every postcondition bites.'
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
