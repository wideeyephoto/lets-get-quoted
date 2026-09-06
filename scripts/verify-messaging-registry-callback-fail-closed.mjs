// Reproduce and then close the platform-sender registry callback rollback bug
// against a disposable PostgreSQL 17 cluster. This script never reads a hosted
// database URL and never calls SignalWire.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const HISTORICAL = 'migrations/20260825133000_reconcile_shared_sender_and_registry_matching.sql';
const MIGRATION = 'migrations/20260906131500_messaging_registry_callback_fail_closed.sql';
const PORT = Number(process.env.LGQ_REGISTRY_CALLBACK_FAIL_CLOSED_CHECK_PORT || 54379);

try {
  os.userInfo();
} catch (error) {
  if (!(error && typeof error === 'object' && error.code === 'ERR_SYSTEM_ERROR')) throw error;
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'windows-user',
    homedir: process.env.USERPROFILE || '',
    shell: null,
  });
  syncBuiltinESMExports();
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. Run:\n'
    + '  npm install --no-save --package-lock=false embedded-postgres@17.10.0-beta.17 '
    + '@embedded-postgres/windows-x64@17.10.0-beta.17',
  );
  process.exit(2);
}

if (process.platform === 'win32') {
  const bin = join(
    process.cwd(),
    'node_modules',
    '@embedded-postgres',
    'windows-x64',
    'native',
    'bin',
  );
  process.env.PATH = `${bin};${process.env.PATH}`;
}

const BASE = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create table public.accounts (
  id uuid primary key default pg_catalog.gen_random_uuid()
);

create table public.messaging_registration_applications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid references public.accounts(id),
  assignment_order_id text,
  purchased_number text,
  assignment_id text,
  created_at timestamptz not null default pg_catalog.now()
);

create table public.sms_sender_numbers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null check (provider in ('twilio', 'signalwire')),
  e164_number text not null,
  provider_number_id text,
  purpose text not null check (purpose in ('lgq_shared', 'lgq_dispatch', 'contractor_dedicated')),
  account_id uuid references public.accounts(id),
  brand_id text,
  campaign_id text,
  assignment_id text,
  assignment_state text not null default 'not_started'
    check (assignment_state in ('not_started', 'pending', 'assigned', 'failed', 'suspended')),
  inbound_resource_id text,
  inbound_webhook_url text,
  provisioning_status text not null default 'pending'
    check (provisioning_status in (
      'pending', 'purchased', 'campaign_pending', 'assignment_pending',
      'inbound_pending', 'active', 'suspended', 'release_pending',
      'released', 'failed', 'indeterminate'
    )),
  inbound_ready boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_verified_at timestamptz,
  provider_brand_state text,
  provider_campaign_state text,
  provider_verified_at timestamptz,
  provider_phone_verified_at timestamptz,
  provider_sms_capable boolean,
  inbound_request_method text,
  inbound_message_handler text,
  provisioning_application_id uuid references public.messaging_registration_applications(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sms_sender_numbers_provider_e164_unique unique (provider, e164_number),
  constraint sms_sender_numbers_activation_shape check (
    provisioning_status <> 'active'
    or (
      assignment_state = 'assigned'
      and inbound_ready
      and activated_at is not null
      and suspended_at is null
      and provider_brand_state is not distinct from 'complete'
      and provider_campaign_state is not distinct from 'complete'
      and provider_verified_at is not null
      and provider_phone_verified_at is not null
      and provider_sms_capable is true
      and inbound_request_method is not distinct from 'POST'
      and pg_catalog.lower(coalesce(inbound_message_handler, '')) = 'laml_webhooks'
    )
  )
);

create table public.messaging_registry_callbacks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  receipt_key text not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  raw_body text not null,
  content_type text,
  request_method text not null check (request_method in ('POST', 'PUT', 'GET')),
  request_path text not null,
  request_headers jsonb not null default '{}'::jsonb,
  signature_header_name text,
  signature_header_value text,
  parsed jsonb,
  provider_order_id text,
  provider_assignment_id text,
  provider_campaign_id text,
  provider_phone_number text,
  provider_state text,
  normalized_state text check (
    normalized_state is null
    or normalized_state in ('complete', 'failed', 'pending', 'unknown')
  ),
  failure_code text,
  failure_detail text,
  application_id uuid references public.messaging_registration_applications(id),
  account_id uuid references public.accounts(id),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'unmatched', 'review', 'ignored', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  constraint messaging_registry_callbacks_receipt_unique unique (provider, receipt_key),
  constraint messaging_registry_callbacks_processing_shape check (
    (processing_status = 'received' and processed_at is null)
    or (processing_status <> 'received' and processed_at is not null)
  )
);
`;

const CALLBACK_SQL = `
select * from public.ingest_messaging_registry_callback(
  $1, $2, $3, 'application/json', 'POST',
  '/api/sms/registry/callback/[redacted]', '{}'::jsonb,
  null, null, $4::jsonb,
  $5, $6, $7, $8, $9, $10, $11, $12
)`;

function callbackParams({
  receipt,
  digest,
  body,
  orderId = null,
  assignmentId = null,
  campaignId = null,
  phone = null,
  providerState,
  normalizedState,
  failureCode = null,
  failureDetail = null,
}) {
  return [
    receipt,
    digest,
    body,
    body,
    orderId,
    assignmentId,
    campaignId,
    phone,
    providerState,
    normalizedState,
    failureCode,
    failureDetail,
  ];
}

const pg = new EmbeddedPostgres({
  databaseDir: join(os.tmpdir(), `lgq-registry-callback-fail-closed-${randomUUID()}`),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

async function sqlState(client, sql, params) {
  try {
    await client.query(sql, params);
    return null;
  } catch (error) {
    return error?.code ?? 'unknown';
  }
}

let client;
let fatalError = null;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_registry_callback_fail_closed_check');

  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_registry_callback_fail_closed_check',
    application_name: 'lgq-registry-callback-fail-closed-check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query("set lock_timeout = '5s'");
  await client.query(BASE);

  // Reproduce the exact historical definition before applying the fix.
  await client.query(readFileSync(HISTORICAL, 'utf8'));
  const failedBeforeFix = callbackParams({
    receipt: 'historical-failed',
    digest: 'a'.repeat(64),
    body: '{"state":"failed","event":"historical"}',
    phone: '+19479412323',
    providerState: 'failed',
    normalizedState: 'failed',
    failureCode: 'carrier_rejected',
    failureDetail: 'Historical failure reproduction',
  });
  const historicalCode = await sqlState(client, CALLBACK_SQL, failedBeforeFix);
  const historicalState = (await client.query(
    `select assignment_state, provisioning_status, inbound_ready, suspended_at,
            (select count(*)::int from public.messaging_registry_callbacks
              where receipt_key = 'historical-failed') as callback_count
       from public.sms_sender_numbers
      where provider = 'signalwire' and e164_number = '+19479412323'`,
  )).rows[0];
  check(
    'historical function reproduces rollback and leaves sender active',
    historicalCode === '23514'
      && historicalState?.assignment_state === 'assigned'
      && historicalState?.provisioning_status === 'active'
      && historicalState?.inbound_ready === true
      && historicalState?.suspended_at == null
      && historicalState?.callback_count === 0,
    JSON.stringify({ historicalCode, historicalState }),
  );

  const migration = readFileSync(MIGRATION, 'utf8');
  await client.query(migration);
  await client.query(migration);
  check('migration applies twice', true);

  const failedAfterFix = callbackParams({
    receipt: 'fixed-failed',
    digest: 'b'.repeat(64),
    body: '{"state":"failed","event":"fixed"}',
    phone: '+19479412323',
    providerState: 'failed',
    normalizedState: 'failed',
    failureCode: 'carrier_rejected',
    failureDetail: 'Carrier rejected assignment',
  });
  const fixedResult = await client.query(CALLBACK_SQL, failedAfterFix);
  const fixedState = (await client.query(
    `select assignment_state, provisioning_status, inbound_ready, suspended_at,
            last_verified_at, updated_at,
            (select count(*)::int from public.messaging_registry_callbacks
              where receipt_key = 'fixed-failed') as callback_count,
            (select processing_status from public.messaging_registry_callbacks
              where receipt_key = 'fixed-failed') as processing_status,
            (select processed_at from public.messaging_registry_callbacks
              where receipt_key = 'fixed-failed') as processed_at
       from public.sms_sender_numbers
      where provider = 'signalwire' and e164_number = '+19479412323'`,
  )).rows[0];
  const eligibleAfterFailure = Number((await client.query(
    `select count(*)::int as count
       from public.sms_sender_numbers
      where provider = 'signalwire'
        and e164_number = '+19479412323'
        and provisioning_status = 'active'
        and assignment_state = 'assigned'
        and inbound_ready
        and suspended_at is null`,
  )).rows[0]?.count ?? -1);
  check(
    'failed callback atomically quarantines sender, makes it unselectable, and records receipt',
    fixedResult.rows[0]?.inserted === true
      && fixedResult.rows[0]?.disposition === 'processed'
      && fixedState?.assignment_state === 'failed'
      && fixedState?.provisioning_status === 'failed'
      && fixedState?.inbound_ready === true
      && fixedState?.suspended_at != null
      && fixedState?.last_verified_at != null
      && fixedState?.callback_count === 1
      && fixedState?.processing_status === 'processed'
      && fixedState?.processed_at != null
      && eligibleAfterFailure === 0,
    JSON.stringify({ result: fixedResult.rows[0], fixedState, eligibleAfterFailure }),
  );

  const fixedCallbackId = fixedResult.rows[0]?.callback_id;
  const fixedUpdatedAt = fixedState?.updated_at?.toISOString?.() ?? String(fixedState?.updated_at);
  const replay = await client.query(CALLBACK_SQL, failedAfterFix);
  const replayState = (await client.query(
    `select updated_at,
            (select count(*)::int from public.messaging_registry_callbacks
              where receipt_key = 'fixed-failed') as callback_count
       from public.sms_sender_numbers
      where provider = 'signalwire' and e164_number = '+19479412323'`,
  )).rows[0];
  check(
    'byte-identical replay returns original receipt without remutating sender',
    replay.rows[0]?.callback_id === fixedCallbackId
      && replay.rows[0]?.inserted === false
      && replay.rows[0]?.disposition === 'processed'
      && replayState?.callback_count === 1
      && (replayState?.updated_at?.toISOString?.() ?? String(replayState?.updated_at)) === fixedUpdatedAt,
    JSON.stringify({ replay: replay.rows[0], replayState }),
  );

  const collision = [...failedAfterFix];
  collision[1] = 'c'.repeat(64);
  collision[2] = '{"state":"failed","event":"different-bytes"}';
  collision[3] = collision[2];
  const collisionCode = await sqlState(client, CALLBACK_SQL, collision);
  check('same receipt key with different bytes remains rejected', collisionCode === '23505', `SQLSTATE ${collisionCode}`);

  await client.query(
    `insert into public.sms_sender_numbers (
       provider, e164_number, provider_number_id, purpose, campaign_id,
       assignment_id, assignment_state, provisioning_status, inbound_ready,
       activated_at, provider_brand_state, provider_campaign_state,
       provider_verified_at, provider_phone_verified_at, provider_sms_capable,
       inbound_request_method, inbound_message_handler
     ) values (
       'signalwire', '+18103208333', 'dispatch-resource', 'lgq_dispatch',
       'dispatch-campaign', 'dispatch-assignment', 'assigned', 'active', true,
       pg_catalog.now(), 'complete', 'complete', pg_catalog.now(),
       pg_catalog.now(), true, 'POST', 'laml_webhooks'
     )`,
  );
  const completeParams = callbackParams({
    receipt: 'fixed-complete',
    digest: 'd'.repeat(64),
    body: '{"state":"completed"}',
    assignmentId: 'dispatch-assignment',
    campaignId: 'dispatch-campaign',
    phone: '+18103208333',
    providerState: 'completed',
    normalizedState: 'complete',
  });
  const completeResult = await client.query(CALLBACK_SQL, completeParams);
  const completeState = (await client.query(
    `select assignment_state, provisioning_status, inbound_ready, suspended_at,
            last_verified_at,
            (select count(*)::int from public.messaging_registry_callbacks
              where receipt_key = 'fixed-complete') as callback_count
       from public.sms_sender_numbers
      where provider = 'signalwire' and e164_number = '+18103208333'`,
  )).rows[0];
  check(
    'complete callback preserves an active sender and records receipt',
    completeResult.rows[0]?.inserted === true
      && completeResult.rows[0]?.disposition === 'processed'
      && completeState?.assignment_state === 'assigned'
      && completeState?.provisioning_status === 'active'
      && completeState?.inbound_ready === true
      && completeState?.suspended_at == null
      && completeState?.last_verified_at != null
      && completeState?.callback_count === 1,
    JSON.stringify({ result: completeResult.rows[0], completeState }),
  );

  await client.query(
    `insert into public.sms_sender_numbers (
       provider, e164_number, provider_number_id, purpose, campaign_id,
       assignment_id, assignment_state, provisioning_status, inbound_ready,
       activated_at, provider_brand_state, provider_campaign_state,
       provider_verified_at, provider_phone_verified_at, provider_sms_capable,
       inbound_request_method, inbound_message_handler
     ) values
       ('signalwire', '+18105550101', 'multi-resource-1', 'lgq_dispatch',
        'multi-campaign', 'multi-assignment-1', 'assigned', 'active', true,
        pg_catalog.now(), 'complete', 'complete', pg_catalog.now(),
        pg_catalog.now(), true, 'POST', 'laml_webhooks'),
       ('signalwire', '+18105550102', 'multi-resource-2', 'lgq_dispatch',
        'multi-campaign', 'multi-assignment-2', 'assigned', 'active', true,
        pg_catalog.now(), 'complete', 'complete', pg_catalog.now(),
        pg_catalog.now(), true, 'POST', 'laml_webhooks')`,
  );

  const ambiguousCampaign = await client.query(CALLBACK_SQL, callbackParams({
    receipt: 'ambiguous-campaign-failed',
    digest: 'e'.repeat(64),
    body: '{"campaign_id":"multi-campaign","state":"failed"}',
    campaignId: 'multi-campaign',
    providerState: 'failed',
    normalizedState: 'failed',
    failureCode: 'carrier_rejected',
    failureDetail: 'Campaign-only callback is ambiguous',
  }));
  const afterAmbiguous = await client.query(
    `select e164_number, assignment_state, provisioning_status, suspended_at
       from public.sms_sender_numbers
      where campaign_id = 'multi-campaign'
      order by e164_number`,
  );
  check(
    'Campaign-only callback with multiple platform numbers is stored unmatched without mutation',
    ambiguousCampaign.rows[0]?.inserted === true
      && ambiguousCampaign.rows[0]?.disposition === 'unmatched'
      && afterAmbiguous.rows.length === 2
      && afterAmbiguous.rows.every((row) => row.assignment_state === 'assigned'
        && row.provisioning_status === 'active'
        && row.suspended_at == null),
    JSON.stringify({ result: ambiguousCampaign.rows[0], senders: afterAmbiguous.rows }),
  );

  const conflictingIdentifiers = await client.query(CALLBACK_SQL, callbackParams({
    receipt: 'conflicting-identifiers-failed',
    digest: 'f'.repeat(64),
    body: '{"phone":"+18105550101","assignment_id":"multi-assignment-2","state":"failed"}',
    assignmentId: 'multi-assignment-2',
    campaignId: 'multi-campaign',
    phone: '+18105550101',
    providerState: 'failed',
    normalizedState: 'failed',
    failureCode: 'carrier_rejected',
    failureDetail: 'Supplied identifiers conflict',
  }));
  const afterConflict = await client.query(
    `select e164_number, assignment_state, provisioning_status, suspended_at
       from public.sms_sender_numbers
      where campaign_id = 'multi-campaign'
      order by e164_number`,
  );
  check(
    'conflicting exact identifiers are stored unmatched without Campaign fallback',
    conflictingIdentifiers.rows[0]?.inserted === true
      && conflictingIdentifiers.rows[0]?.disposition === 'unmatched'
      && afterConflict.rows.every((row) => row.assignment_state === 'assigned'
        && row.provisioning_status === 'active'
        && row.suspended_at == null),
    JSON.stringify({ result: conflictingIdentifiers.rows[0], senders: afterConflict.rows }),
  );

  const exactIdentifiers = await client.query(CALLBACK_SQL, callbackParams({
    receipt: 'exact-identifiers-failed',
    digest: '1'.repeat(64),
    body: '{"phone":"+18105550101","assignment_id":"multi-assignment-1","state":"failed"}',
    assignmentId: 'multi-assignment-1',
    campaignId: 'multi-campaign',
    phone: '+18105550101',
    providerState: 'failed',
    normalizedState: 'failed',
    failureCode: 'carrier_rejected',
    failureDetail: 'Exact assignment failed',
  }));
  const afterExact = await client.query(
    `select e164_number, assignment_state, provisioning_status, suspended_at
       from public.sms_sender_numbers
      where campaign_id = 'multi-campaign'
      order by e164_number`,
  );
  check(
    'consistent exact identifiers quarantine only their sender',
    exactIdentifiers.rows[0]?.inserted === true
      && exactIdentifiers.rows[0]?.disposition === 'processed'
      && afterExact.rows[0]?.e164_number === '+18105550101'
      && afterExact.rows[0]?.assignment_state === 'failed'
      && afterExact.rows[0]?.provisioning_status === 'failed'
      && afterExact.rows[0]?.suspended_at != null
      && afterExact.rows[1]?.e164_number === '+18105550102'
      && afterExact.rows[1]?.assignment_state === 'assigned'
      && afterExact.rows[1]?.provisioning_status === 'active'
      && afterExact.rows[1]?.suspended_at == null,
    JSON.stringify({ result: exactIdentifiers.rows[0], senders: afterExact.rows }),
  );

  const privilege = (await client.query(
    `select
       pg_catalog.has_function_privilege(
         'service_role',
         'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
         'execute'
       ) as service_exec,
       pg_catalog.has_function_privilege(
         'authenticated',
         'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
         'execute'
       ) as authenticated_exec,
       pg_catalog.has_function_privilege(
         'anon',
         'public.ingest_messaging_registry_callback(text,text,text,text,text,text,jsonb,text,text,jsonb,text,text,text,text,text,text,text,text)',
         'execute'
       ) as anon_exec,
       p.prosecdef,
       p.proconfig
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'ingest_messaging_registry_callback'`,
  )).rows[0];
  check(
    'callback RPC remains hardened and service-role only',
    privilege?.service_exec === true
      && privilege?.authenticated_exec === false
      && privilege?.anon_exec === false
      && privilege?.prosecdef === true
      && privilege?.proconfig?.includes('search_path=pg_catalog, pg_temp')
      && privilege?.proconfig?.includes('TimeZone=UTC'),
    JSON.stringify(privilege),
  );
} catch (error) {
  console.error(error);
  fatalError = error;
} finally {
  if (client) await client.end().catch(() => undefined);
  await pg.stop().catch(() => undefined);
}

if (fatalError || checks.some((item) => !item.ok)) process.exit(1);
