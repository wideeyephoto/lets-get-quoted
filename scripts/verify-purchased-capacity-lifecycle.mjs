/**
 * Run 20260819020000_purchased_capacity_lifecycle.sql against a real PostgreSQL 17.
 *
 * The state machine this RPC drives is enforced by a trigger with four legal
 * edges, a terminal state, nine immutable columns and a per-statement CHECK tying
 * canceled_at to status. Every one of those is a runtime behaviour: source
 * assertions can confirm the SQL mentions them and cannot confirm it obeys them.
 *
 * Not part of the default suite -- see scripts/verify-storage-usage-migration.mjs
 * for the one npm command it needs. Exits 2 when it cannot run.
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

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-capacity-'));
const port = Number(process.env.LGQ_CAPACITY_CHECK_PORT || 54333);
const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

// Only what the two migrations under test actually touch.
const STUB = `
create role anon; create role authenticated; create role service_role;
create table public.accounts (id uuid primary key);
create table public.billing_events (id uuid primary key default gen_random_uuid());
create table public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id),
  feature_limits jsonb not null default '{}'::jsonb);
create function public.is_owner(p uuid) returns boolean language sql stable as $g$ select false $g$;
`;

const A = '11111111-1111-4111-8111-111111111111';
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port,
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_capacity_check');
  c = pg.getPgClient('lgq_capacity_check');
  await c.connect();

  await c.query(STUB);
  await c.query(m('20260818210000_workspace_purchased_capacity.sql'));
  await c.query(m('20260819020000_purchased_capacity_lifecycle.sql'));
  ck('lifecycle migration applies on a real engine', true);
  await c.query(m('20260819020000_purchased_capacity_lifecycle.sql'));
  ck('lifecycle migration re-applies as a no-op', true);

  await c.query('insert into public.accounts (id) values ($1)', [A]);
  await c.query(
    `insert into public.workspace_entitlements (account_id, feature_limits)
     values ($1, '{"crew_users": 2}'::jsonb)`,
    [A],
  );

  const seed = async (sub) => c.query(
    `insert into public.workspace_purchased_capacity
       (account_id, top_up_id, resource_code, units, unit_amount_cents,
        catalog_version, livemode, stripe_subscription_id, status)
     values ($1, 'crew_user', 'crew_users', 1, 500,
             '2026-08-18-preview', false, $2, 'active')`,
    [A, sub],
  );
  const apply = async (sub, status, periodEnd = null) => (await c.query(
    'select public.apply_purchased_capacity_provider_state($1,$2,$3,$4) as r',
    [false, sub, status, periodEnd],
  )).rows[0].r;
  const row = async (sub) => (await c.query(
    'select * from public.workspace_purchased_capacity where stripe_subscription_id = $1',
    [sub],
  )).rows[0];
  const units = async () => (await c.query(
    "select public.workspace_purchased_capacity_units($1,'crew_users') as u", [A],
  )).rows[0].u;

  ck('an unknown subscription is reported, not invented',
    (await apply('sub_NOTHINGhere00001', 'canceled')) === 'not_found');

  await seed('sub_LIFEcycle0000001');
  ck('a purchased seat starts countable', (await units()) === '1', `u=${await units()}`);

  ck('active -> past_due is applied', (await apply('sub_LIFEcycle0000001', 'past_due')) === 'past_due');
  ck('past_due still counts, mirroring the base plan grace',
    (await units()) === '1', `u=${await units()}`);

  ck('past_due -> active recovers', (await apply('sub_LIFEcycle0000001', 'active')) === 'active');

  // The self-edge must be legal and must still refresh the period.
  const period = '2026-09-19T00:00:00.000Z';
  ck('an unchanged status is a legal no-op',
    (await apply('sub_LIFEcycle0000001', 'active', period)) === 'unchanged');
  const refreshed = await row('sub_LIFEcycle0000001');
  ck('the self-edge still refreshed the billing period',
    refreshed.current_period_end !== null, `end=${refreshed.current_period_end}`);
  ck('the self-edge left canceled_at null', refreshed.canceled_at === null);

  // Cancellation: status and canceled_at in one statement, or the CHECK fires.
  ck('active -> canceled is applied', (await apply('sub_LIFEcycle0000001', 'canceled')) === 'canceled');
  const canceled = await row('sub_LIFEcycle0000001');
  ck('cancelling stamped canceled_at in the same statement', canceled.canceled_at !== null);
  ck('a canceled seat stops counting', (await units()) === '0', `u=${await units()}`);

  // Idempotence: a second sweep sees the same cancellation.
  ck('a repeated cancellation is terminal, not an error',
    (await apply('sub_LIFEcycle0000001', 'canceled')) === 'already_canceled');
  const again = await row('sub_LIFEcycle0000001');
  ck('the original cancellation time was not rewritten',
    String(again.canceled_at) === String(canceled.canceled_at),
    `${again.canceled_at} vs ${canceled.canceled_at}`);

  // canceled is terminal in BOTH directions the trigger forbids.
  ck('a canceled row cannot be revived to active',
    (await apply('sub_LIFEcycle0000001', 'active')) === 'already_canceled');
  ck('a canceled row cannot be revived to past_due',
    (await apply('sub_LIFEcycle0000001', 'past_due')) === 'already_canceled');
  ck('the revival attempts did not resurrect the seat', (await units()) === '0');

  // Stripe's vocabulary must never reach the database.
  let refused = false;
  try { await apply('sub_LIFEcycle0000001', 'unpaid'); } catch (e) { refused = e.code === '22023'; }
  ck('a status outside the ledger vocabulary is refused', refused);
  let nullRefused = false;
  try { await apply('sub_LIFEcycle0000001', null); } catch (e) { nullRefused = e.code === '22023'; }
  ck('a null status is refused', nullRefused);

  // The sweep's work list.
  await seed('sub_LIFEcycle0000002');
  const pending = await c.query(
    'select * from public.purchased_capacity_pending_reconciliation($1,$2)', [false, 100],
  );
  const subs = pending.rows.map((r) => r.stripe_subscription_id);
  ck('the work list excludes canceled rows',
    subs.includes('sub_LIFEcycle0000002') && !subs.includes('sub_LIFEcycle0000001'),
    JSON.stringify(subs));

  const other = await c.query(
    'select * from public.purchased_capacity_pending_reconciliation($1,$2)', [true, 100],
  );
  ck('the work list is scoped to one mode', other.rowCount === 0, `rows=${other.rowCount}`);

  // Identity must survive every path above.
  const untouched = await row('sub_LIFEcycle0000001');
  ck('identity columns were never rewritten',
    untouched.account_id === A && untouched.units === '1'
    && untouched.unit_amount_cents === '500' && untouched.livemode === false,
    JSON.stringify(untouched));
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
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
