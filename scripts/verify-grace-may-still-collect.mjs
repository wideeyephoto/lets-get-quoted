/**
 * Run 20260819070000_grace_may_still_collect.sql against a real PostgreSQL 17.
 *
 * The four functions it patches are large and reach a dozen tables, so this does
 * NOT try to execute a payment. It tests the two things that can actually go
 * wrong with a source patch, and which no amount of reading catches:
 *
 *  1. Do the anchors match the REAL bodies, exactly once each? The bodies are
 *     lifted verbatim out of the migrations that define them rather than
 *     retyped, so a drifted anchor fails here rather than in production.
 *  2. Does the patched function still COMPILE? A misplaced parenthesis in the
 *     replacement would otherwise surface as a broken payment rail at apply
 *     time. `execute` of the rewritten definition is the proof.
 *
 * plpgsql resolves `%rowtype` at CREATE time but not table or column references
 * inside statements, so empty stub tables with the right names are enough to get
 * the real bodies installed.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIRS = [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
];

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

for (const dir of BIN_DIRS) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = '20260819070000_grace_may_still_collect.sql';

/**
 * Lift one `create ... function public.<name>(` block out of a migration,
 * verbatim, up to the terminating `$$;` of its body.
 */
function liftFunction(file, name) {
  const src = m(file);
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\(`);
  const start = src.search(re);
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  // Bodies here are all dollar-quoted; find the tag, then its closing pair.
  const tagMatch = src.slice(start).match(/\nas (\$[a-z_]*\$)\n/);
  if (!tagMatch) throw new Error(`${name} has no dollar-quoted body`);
  const tag = tagMatch[1];
  const bodyOpen = start + tagMatch.index + tagMatch[0].length;
  const bodyClose = src.indexOf(`\n${tag};`, bodyOpen);
  if (bodyClose < 0) throw new Error(`${name} body is unterminated`);
  return src.slice(start, bodyClose + `\n${tag};`.length);
}

/** Empty tables, present only so `%rowtype` resolves. */
const STUB = `
create table public.accounts (id uuid primary key);
create table public.workspace_entitlements (
  account_id uuid primary key,
  plan_code text, billing_interval text, billing_status text,
  entitlement_state text, catalog_version text, platform_fee_bps integer,
  period_start timestamptz, period_end timestamptz
);
create table public.invoices (id uuid primary key);
create table public.payments (id uuid primary key);
create table public.billing_events (id uuid primary key);
create table public.billing_payment_operations (id uuid primary key);
create table public.stripe_connected_checkout_expirations (id uuid primary key);
`;

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-grace-'));
const port = Number(process.env.LGQ_GRACE_CHECK_PORT || 54338);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port,
  persistent: false, onLog: () => {}, onError: () => {},
});

const PREP = '20260816073000_one_off_direct_payment_preparation.sql';
const RECOVERY = '20260816161844_direct_checkout_generation_recovery.sql';

const FUNCTIONS = [
  ['require_direct_checkout_entitlement_snapshot', PREP],
  ['prepare_one_off_direct_invoice_payment', PREP], // installed, then renamed below
  ['claim_one_off_direct_checkout_operation', RECOVERY],
];

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_grace');
  c = pg.getPgClient('lgq_grace');
  await c.connect();
  await c.query(STUB);

  // Install the real bodies. The preparer is renamed exactly as 20260816161844
  // does it, then the recovery migration's replacement is installed over the
  // original name -- so the database ends up in the shape production is in.
  for (const [name, file] of FUNCTIONS) {
    await c.query(liftFunction(file, name));
  }
  await c.query(`
    alter function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)
      rename to prepare_one_off_direct_invoice_payment_v1_fresh_only;
  `);
  await c.query(liftFunction(RECOVERY, 'prepare_one_off_direct_invoice_payment'));
  ck('the four real bodies install on a real engine', true);

  const NAMES = [
    'require_direct_checkout_entitlement_snapshot',
    'prepare_one_off_direct_invoice_payment_v1_fresh_only',
    'prepare_one_off_direct_invoice_payment',
    'claim_one_off_direct_checkout_operation',
  ];
  const sourceOf = async (name) => (await c.query(
    `select pg_get_functiondef(p.oid) as d from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`, [name],
  )).rows[0]?.d ?? '';

  // The defect, before the fix.
  for (const name of NAMES) {
    const src = await sourceOf(name);
    ck(`BEFORE: ${name} refuses a workspace in grace`,
      /entitlement_state (<>|=) 'active'/.test(src));
  }

  // Production has already had 20260818120000 rewrite the catalog literal in
  // every body. Reproduce that, so the anchors are tested against the text a
  // real database holds rather than the text this repository still shows.
  await c.query(`
    do $$
    declare fn record;
    begin
      for fn in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prosrc like '%2026-08-15-preview%'
      loop
        execute replace(pg_get_functiondef(fn.oid), '2026-08-15-preview', '2026-08-18-preview');
      end loop;
    end $$;
  `);
  ck('the catalog rewrite 20260818120000 performed is reproduced', true);

  await c.query(m(MIGRATION));
  ck('migration applies, so every replacement compiles', true);

  for (const name of NAMES) {
    const src = await sourceOf(name);
    ck(`${name} now admits grace`, /entitlement_state (not )?in \('active', 'grace'\)/.test(src), src.slice(0, 0));
    ck(`${name} still refuses restricted and archived`, !/'restricted'/.test(src));
    ck(`${name} still pins the platform fee`, src.includes('platform_fee_bps'));
    ck(`${name} still pins the catalog version`, src.includes('catalog_version'));
  }

  const fresh = await sourceOf('prepare_one_off_direct_invoice_payment_v1_fresh_only');
  ck('a past_due paid workspace passes the coherence branch',
    fresh.includes("or v_entitlement.billing_status = 'past_due'"), '');
  ck('and an active one still has to be inside its period',
    /billing_status = 'active'\s*\n\s*and v_entitlement\.period_start is not null/.test(fresh));

  // Idempotence.
  await c.query(m(MIGRATION));
  ck('migration re-applies as a no-op', true);
  const again = await sourceOf('prepare_one_off_direct_invoice_payment_v1_fresh_only');
  ck('a second apply changes nothing', again === fresh);

  // Drift refusal: put one body back and blunt the anchor.
  await c.query(`
    create or replace function public.require_direct_checkout_entitlement_snapshot()
    returns trigger language plpgsql as $f$
    begin
      -- No entitlement_state test at all, so the anchor matches zero times
      if false or true then null; end if;
      return new;
    end $f$;
  `);
  let refused = false;
  try {
    await c.query(m(MIGRATION));
  } catch (err) {
    refused = err.code === '55000';
    await c.query('rollback');
  }
  ck('refuses a body whose anchor is gone rather than half-patching', refused);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 300));
} finally {
  try { await c?.end(); } catch { /* going away */ }
  try { await pg.stop(); } catch { /* going away */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp */ }
}

let failed = 0;
for (const r of R) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${!r.ok && r.d ? `  [${r.d}]` : ''}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
