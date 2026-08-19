import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PATH = `${join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin')};${process.env.PATH}`;
const dir = mkdtempSync(join(tmpdir(), 'cap-'));
const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const pg = new EmbeddedPostgres({
  databaseDir: dir, user: 'postgres', password: 'postgres', port: 54332,
  persistent: false, onLog: () => {}, onError: () => {},
});

const STUB = `
create role anon; create role authenticated; create role service_role;
create table public.accounts (
  id uuid primary key, created_at timestamptz default now(),
  stripe_connect_id text, plan text default 'free');
create table public.payments (
  id uuid primary key default gen_random_uuid(), account_id uuid,
  amount numeric(12,2), platform_fee numeric(12,2) default 0, status text,
  refunded_amount numeric(12,2) not null default 0, fee_rate numeric(6,4),
  fee_amount numeric(12,2), stripe_payment_intent_id text, stripe_session_id text,
  paid_at timestamptz, created_at timestamptz default now(), job_id uuid,
  client_id uuid, quote_id uuid, description text, kind text, invoice_id uuid,
  payment_plan_id uuid, recurring_plan_id uuid, due_date date,
  installment_seq integer, stripe_checkout_session text, stripe_payment_intent text,
  disputed_at timestamptz, dispute_reason text, dispute_status text,
  stripe_dispute_id text, dispute_due_by timestamptz, failure_code text,
  failure_message text, failed_at timestamptz, dunning_attempts integer default 0,
  charge_attempts integer default 0, next_retry_at timestamptz, dunning_state text,
  stripe_livemode boolean, stripe_account_id text,
  charge_model text not null default 'destination');
create function public.is_owner(p uuid) returns boolean language sql stable as $g$ select false $g$;
`;

const CHAIN = [
  '20260815213142_pricing_entitlements.sql',
  '20260815231620_stripe_event_inbox.sql',
  '20260816041255_stripe_billing_subscription_checkout_operations.sql',
  '20260816054500_base_plan_recurring_consent_evidence.sql',
  '20260816060000_stripe_billing_subscription_event_projection.sql',
  '20260816080000_stripe_connected_payment_event_projection.sql',
  '20260818140000_top_up_receipt_scope.sql',
  '20260818210000_workspace_purchased_capacity.sql',
];

const A = '11111111-1111-4111-8111-111111111111';
let c;

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('p');
  c = pg.getPgClient('p');
  await c.connect();

  await c.query(STUB);
  for (const f of CHAIN) await c.query(m(f));
  ck('prerequisite chain applies', true);

  // The REAL projector, taken verbatim out of its own migration rather than
  // retyped — the patch under test operates on this exact text.
  const src = m('20260818160000_top_up_projection_shape.sql');
  const s = src.indexOf('create or replace function public.project_stripe_platform_top_up_event(');
  const e = src.indexOf('\n$$;', s);
  if (s < 0 || e < 0) throw new Error('could not extract the projector function');
  await c.query(src.slice(s, e + 4));
  ck('real projector function created from its migration', true);

  await c.query(m('20260819010000_top_up_capacity_grant.sql'));
  ck('capacity grant migration applies', true);
  await c.query(m('20260819010000_top_up_capacity_grant.sql'));
  ck('capacity grant migration re-applies as a no-op', true);

  await c.query('insert into public.accounts (id) values ($1)', [A]);

  const mkEvent = async (evt, sess) => (await c.query(
    `insert into public.billing_events (
       provider_event_id, event_type, event_scope, livemode, payload,
       processing_status, processing_started_at, projection_claim_token,
       projection_lease_expires_at)
     values ($1, 'checkout.session.completed', 'platform_top_up', false,
       jsonb_build_object('data_object', jsonb_build_object('id', $2::text, 'object', 'checkout.session')),
       'processing', now(), gen_random_uuid(), now() + interval '5 min')
     returning id, projection_claim_token`.replace(
      'projection_lease_expires_at)',
      'projection_lease_expires_at, provider_created_at, payload_sha256)',
    ).replace(
      "now() + interval '5 min')",
      "now() + interval '5 min', now(), md5($1::text) || md5($2::text))",
    ),
    [evt, sess],
  )).rows[0];

  const proj = (sess, sub) => ({
    outcome: 'capacity_granted', checkout_session_id: sess, account_id: A,
    resource_code: 'storage_gb', units: 100, catalog_version: '2026-08-18-preview',
    top_up_id: 'storage_100gb', idempotency_key: 'k1',
    stripe_subscription_id: sub, unit_amount_cents: 1500,
  });

  const call = (ev, payload) => c.query(
    'select * from public.project_stripe_platform_top_up_event($1,$2,$3)',
    [ev.id, ev.projection_claim_token, JSON.stringify(payload)],
  );

  const ev1 = await mkEvent('evt_cap_test_0001', 'cs_test_capacity0001');
  const r1 = await call(ev1, proj('cs_test_capacity0001', 'sub_CAPtest00000001'));
  ck('a paid capacity purchase is granted',
    r1.rows[0].projection_result === 'top_up_capacity_granted' && r1.rows[0].applied === true,
    JSON.stringify(r1.rows[0]));

  const led = await c.query('select * from public.workspace_purchased_capacity where account_id=$1', [A]);
  ck('the capacity ledger has exactly one row', led.rowCount === 1, `rows=${led.rowCount}`);
  ck('the row is active, bound to the subscription and the event',
    led.rows[0]?.status === 'active'
    && led.rows[0]?.stripe_subscription_id === 'sub_CAPtest00000001'
    && led.rows[0]?.billing_event_id === ev1.id
    && led.rows[0]?.livemode === false,
    JSON.stringify(led.rows[0]));

  const units = await c.query("select public.workspace_purchased_capacity_units($1,'storage_gb') as u", [A]);
  ck('the purchased units are now countable', units.rows[0].u === '100', `u=${units.rows[0].u}`);

  // A redelivered receipt naming the SAME subscription must replay.
  const ev2 = await mkEvent('evt_cap_test_0002', 'cs_test_capacity0002');
  const r2 = await call(ev2, proj('cs_test_capacity0002', 'sub_CAPtest00000001'));
  ck('a redelivered receipt replays instead of double-granting',
    r2.rows[0].projection_result === 'top_up_capacity_already_granted' && r2.rows[0].applied === false,
    JSON.stringify(r2.rows[0]));
  const led2 = await c.query('select count(*)::int n from public.workspace_purchased_capacity where account_id=$1', [A]);
  ck('still exactly one capacity row after the replay', led2.rows[0].n === 1, `n=${led2.rows[0].n}`);

  // Missing subscription: refuse, never grant capacity nobody can cancel.
  const ev3 = await mkEvent('evt_cap_test_0003', 'cs_test_capacity0003');
  const bad = proj('cs_test_capacity0003', 'sub_CAPtest00000003');
  delete bad.stripe_subscription_id;
  let refused = false;
  try { await call(ev3, bad); } catch (err) { refused = err.code === '22023'; }
  ck('a capacity grant with no subscription is refused', refused);

  // A price the catalog does not carry must be refused by the ledger binding.
  const ev5 = await mkEvent('evt_cap_test_0005', 'cs_test_capacity0005');
  const wrongPrice = proj('cs_test_capacity0005', 'sub_CAPtest00000005');
  wrongPrice.unit_amount_cents = 9900;
  let bound = false;
  try { await call(ev5, wrongPrice); } catch (err) { bound = err.code === '23514'; }
  ck('a price the catalog does not publish is refused', bound);

  // The credit path cannot be EXERCISED here: this harness deliberately skips
  // the constraint half of 20260818160000, so the database does not admit
  // top_up_credits_granted. What can be checked is that patching did not remove
  // it, which is the failure mode that matters — a source patch that lands its
  // new branch and drops an old one.
  const def = (await c.query(
    `select pg_get_functiondef(
       'public.project_stripe_platform_top_up_event(uuid,uuid,jsonb)'::regprocedure) as d`,
  )).rows[0].d;
  ck('the usage-credit path survived the patch',
    def.includes('public.grant_usage_credits(') && def.includes('top_up_credits_already_granted'));
  ck('the claim lock and Session binding survived the patch',
    def.includes('for update') && def.includes('names a different Checkout Session'));
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
} finally {
  try { await c?.end(); } catch { /* going away */ }
  try { await pg.stop(); } catch { /* going away */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}

let failed = 0;
for (const r of R) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${!r.ok && r.d ? `  [${r.d}]` : ''}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
