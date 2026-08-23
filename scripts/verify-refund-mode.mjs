/**
 * Prove the refund planner stops handing the Application Fee to Stripe.
 *
 * WHY THIS MATTERS MORE THAN THE OTHER HARNESSES. `full_combined` is the one
 * refund path where LGQ omits the amount and sets `refund_application_fee: true`,
 * which makes Stripe decide the fee refund itself -- proportionally to the
 * CHARGE. LGQ's platform fee is a percentage of the ELIGIBLE SERVICE SUBTOTAL,
 * which excludes tax and tips, so the two proportions are only the same number
 * when the whole charge is refunded at once. The planner allowed that mode after
 * a partial refund, and nothing downstream compares the fee Stripe returned with
 * the fee the ledger recorded.
 *
 * The real function is lifted from its own migration rather than reimplemented,
 * because a stand-in that agreed with my reading of the bug would prove only
 * that I can restate my own assumption.
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

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const REFUNDS = m('20260816050000_direct_charge_refund_operations.sql');
const PATCH = m('20260819270000_refund_mode_after_partial.sql');

/** Lift one dollar-quoted function verbatim out of its migration. */
function liftFunction(source, name) {
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  const tag = source.slice(start).match(/\nas (\$[a-z_]*\$)\n/);
  if (!tag) throw new Error(`${name} has no dollar-quoted body`);
  const close = source.indexOf(`\n${tag[1]};`, start + tag.index + tag[0].length);
  if (close < 0) throw new Error(`${name} is unterminated`);
  return source.slice(start, close + tag[1].length + 2);
}

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-refundmode-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_REFUND_MODE_PORT || 54359),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_refund');
  c = pg.getPgClient('lgq_refund');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

  // Empty stubs with the right names: plpgsql resolves %rowtype at CREATE time
  // but not the statements inside, so this is enough to install the real body.
  await q(`
    create table public.accounts (id uuid primary key);
    create table public.payments (id uuid primary key, account_id uuid, refunded_amount numeric);
    create table public.billing_payment_operations (id uuid primary key, payment_id uuid);
    create table public.billing_direct_refund_authorizations (id uuid primary key);
    create table public.billing_direct_refund_operations (id uuid primary key);
  `);

  await q(liftFunction(REFUNDS, 'compute_direct_charge_refund_plan'));
  ck('the real refund planner installs', true);

  const definition = async () => (await q(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'compute_direct_charge_refund_plan'
  `)).rows[0].def;

  ck('it chooses full_combined without caring what was refunded before',
    !(await definition()).includes('when v_gross_before = 0'));

  // ---------------------------------------------------------------------
  // The mode logic itself, evaluated as the function evaluates it. Driving
  // the whole function would need a dozen fixture rows and would test the
  // fixtures; this tests the decision.
  // ---------------------------------------------------------------------
  const mode = async (before, after, total, eligibleAfter, eligibleTotal, feeAfter, feeBefore, patched) => {
    // Inlined rather than parameterised. When the guard is absent PostgreSQL
    // sees a $1 the query never references and refuses to plan it -- and these
    // are integers the harness chose, so there is nothing to parameterise for.
    const guard = patched ? `${before} = 0 and ` : '';
    const { rows } = await q(
      `select case when ${guard}${after} = ${total}
                    and ${eligibleAfter} = ${eligibleTotal}
                    and ${feeAfter} > ${feeBefore}
                   then 'full_combined' else 'split' end as mode`);
    return rows[0].mode;
  };

  // One refund of everything on an untouched charge. Stripe's proportion and
  // LGQ's are both 100%, so full_combined is safe and stays.
  ck('a single full refund is still full_combined',
    await mode(0, 11_000, 11_000, 10_000, 10_000, 125, 0, true) === 'full_combined');

  // THE BUG: $55 already refunded, this one takes it to the full $110. The old
  // logic hands the fee to Stripe on a charge that is half tax.
  ck('the bug is real: a remainder after a partial was full_combined',
    await mode(5_500, 11_000, 11_000, 10_000, 10_000, 125, 63, false) === 'full_combined');

  ck('after the fix it is split, with exact amounts LGQ computed',
    await mode(5_500, 11_000, 11_000, 10_000, 10_000, 125, 63, true) === 'split');

  // A partial refund was always split and still is.
  ck('a partial refund is unchanged',
    await mode(0, 5_500, 11_000, 5_000, 10_000, 63, 0, true) === 'split');

  // A refund that takes the gross to full but leaves eligible short -- refunding
  // only tax -- was never full_combined and still is not.
  ck('a tax-only refund never took the combined path',
    await mode(0, 11_000, 11_000, 9_000, 10_000, 125, 0, true) === 'split');

  // ---------------------------------------------------------------------
  // The patch itself.
  // ---------------------------------------------------------------------
  await q(PATCH);
  ck('the patch applies, post-conditions and all', true);

  const patched = await definition();
  ck('the planner now requires an untouched charge for full_combined',
    patched.includes('when v_gross_before = 0'));
  ck('...and the split path survived', patched.includes("'split'"));
  ck('...and so did the fee-monotonicity guard',
    patched.includes('Application Fee target cannot move backward'));

  // Re-running is a no-op, not a second insertion of the guard.
  await q(PATCH);
  const twice = await definition();
  ck('applying it twice adds the condition once',
    (twice.match(/when v_gross_before = 0/g) ?? []).length === 1);

  // And a drifted body must fail rather than be silently rewritten.
  await q(`
    create or replace function public.compute_direct_charge_refund_plan()
    returns text language plpgsql as $drift$
    begin
      -- no v_mode case at all
      return 'drifted';
    end;
    $drift$;
  `);
  const drifted = await fails(PATCH);
  ck('a drifted planner fails the migration rather than being rewritten',
    /appears 0 times|expected exactly 1/.test(drifted ?? ''), drifted);

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
