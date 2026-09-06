// Execute the Campaign-wide SMS keyword migration against a throwaway local
// PostgreSQL 17 cluster. This script never reads a hosted database URL and never
// opens a carrier connection.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const MIGRATION = 'migrations/20260906120000_sms_campaign_wide_stop.sql';
const PORT = Number(process.env.LGQ_SMS_CAMPAIGN_STOP_CHECK_PORT || 54371);

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

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

function one(result) {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new Error(`Expected one row, received ${result.rowCount}.`);
  }
  return result.rows[0];
}

// Only the dependencies needed to compile and exercise the forward migration.
// The canonical-schema harness separately proves the complete schema ordering.
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
  id uuid primary key,
  suspended_at timestamptz
);

create table public.sms_sender_numbers (
  id uuid primary key,
  provider text not null,
  e164_number text not null,
  provider_number_id text,
  purpose text not null,
  account_id uuid,
  campaign_id text,
  provisioning_status text not null,
  assignment_state text not null,
  inbound_ready boolean not null,
  activated_at timestamptz,
  suspended_at timestamptz
);

create table public.sms_sender_keyword_preferences (
  sender_number_id uuid not null references public.sms_sender_numbers(id),
  phone_number text not null,
  status text not null,
  source text not null,
  opted_out_at timestamptz,
  updated_at timestamptz not null,
  primary key (sender_number_id, phone_number)
);

create table public.sms_consent (
  id uuid primary key,
  account_id uuid not null,
  phone_number text not null,
  status text not null,
  consented_at timestamptz,
  opted_out_at timestamptz
);

create table public.sms_consent_scopes (
  account_id uuid not null,
  phone_number text not null,
  consent_scope text not null,
  primary key (account_id, phone_number, consent_scope)
);

create table public.sms_events (
  id uuid primary key,
  account_id uuid not null,
  phone_number text not null,
  status text not null,
  billing_category text not null,
  sender_number_id uuid,
  provider text,
  sender_purpose text not null,
  error_reason text,
  cancelled_at timestamptz,
  updated_at timestamptz,
  text_usage_kind text,
  text_usage_reservation_id uuid,
  text_usage_finalization_key text,
  text_usage_overage_key text,
  text_usage_state text,
  text_usage_last_error text,
  text_usage_updated_at timestamptz
);

create table public.sms_delivery_tasks (
  sms_event_id uuid primary key,
  task_state text not null,
  claim_token uuid,
  lease_expires_at timestamptz,
  request_started_at timestamptz,
  available_at timestamptz not null,
  created_at timestamptz not null,
  last_error_code text,
  cancelled_at timestamptz,
  updated_at timestamptz
);

create table public.sms_delivery_attempts (
  claim_token uuid primary key,
  outcome text,
  error_code text,
  finished_at timestamptz
);

create table public.usage_reservations (
  id uuid primary key,
  account_id uuid not null,
  resource_code text not null,
  operation_type text not null,
  state text not null,
  idempotency_key text not null
);

create table public.workspace_overage_accrual_events (
  account_id uuid not null,
  idempotency_key text not null,
  resource_code text not null,
  released_at timestamptz,
  primary key (account_id, idempotency_key)
);

create table public.sms_webhook_receipts (
  id uuid primary key,
  webhook_kind text not null,
  processing_state text not null,
  sender_number_id uuid,
  from_number text,
  to_number text,
  disposition text,
  provider text not null,
  account_id uuid
);

create table public.sms_shared_notice_replies (
  webhook_receipt_id uuid primary key,
  egress_result text not null,
  response_body_sha256 text not null
);

create function public.sms_inbound_recipient_lock_key(uuid, text)
returns bigint language sql immutable as $$ select 1::bigint $$;

create function public.mark_sms_delivery_request_started(uuid, uuid)
returns boolean language sql as $$ select true $$;
`;

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const SENDER_A = '00000000-0000-4000-8000-000000000011';
const SENDER_B = '00000000-0000-4000-8000-000000000012';
const SENDER_WITHOUT_CAMPAIGN = '00000000-0000-4000-8000-000000000013';
const RECIPIENT = '+12485550999';

const pg = new EmbeddedPostgres({
  databaseDir: join(os.tmpdir(), `lgq-sms-campaign-stop-${randomUUID()}`),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_campaign_stop_check');

  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_sms_campaign_stop_check',
    application_name: 'lgq-sms-campaign-stop-check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query("set lock_timeout = '5s'");
  await client.query("set log_min_error_statement = 'panic'");
  await client.query(BASE);

  const migration = readFileSync(MIGRATION, 'utf8');
  await client.query(migration);
  await client.query(migration);
  check('migration applies twice', true);

  await client.query('insert into public.accounts(id) values ($1)', [ACCOUNT_ID]);
  await client.query(
    `insert into public.sms_sender_numbers (
       id, provider, e164_number, purpose, account_id, campaign_id,
       provisioning_status, assignment_state, inbound_ready, activated_at
     ) values
       ($1, 'signalwire', '+12485550111', 'lgq_dispatch', null,
        ' CAMPAIGN-A ', 'active', 'assigned', true, pg_catalog.now()),
       ($2, 'signalwire', '+12485550112', 'lgq_dispatch', null,
        'campaign-a', 'active', 'assigned', true, pg_catalog.now()),
       ($3, 'signalwire', '+12485550113', 'contractor_dedicated', $4,
        null, 'active', 'assigned', true, pg_catalog.now())`,
    [SENDER_A, SENDER_B, SENDER_WITHOUT_CAMPAIGN, ACCOUNT_ID],
  );

  await client.query(
    `insert into public.sms_sender_keyword_preferences (
       sender_number_id, phone_number, status, source, opted_out_at, updated_at
     ) values ($1, $2, 'opted_out', 'inbound_stop', pg_catalog.now(), pg_catalog.now())`,
    [SENDER_A, RECIPIENT],
  );
  const crossNumberStop = one(await client.query(
    `select
       public.sms_recipient_keyword_opted_out($1, $3) as sender_a_stopped,
       public.sms_recipient_keyword_opted_out($2, $3) as sender_b_stopped,
       (select status from public.sms_campaign_keyword_preferences
         where provider = 'signalwire'
           and campaign_id = 'campaign-a'
           and phone_number = $3) as campaign_status`,
    [SENDER_A, SENDER_B, RECIPIENT],
  ));
  check(
    'STOP on sender A suppresses sender B in the same canonical Campaign',
    crossNumberStop.sender_a_stopped === true
      && crossNumberStop.sender_b_stopped === true
      && crossNumberStop.campaign_status === 'opted_out',
    JSON.stringify(crossNumberStop),
  );

  await client.query(
    `update public.sms_sender_keyword_preferences
        set status = 'opted_in', source = 'inbound_start',
            opted_out_at = null, updated_at = pg_catalog.now()
      where sender_number_id = $1 and phone_number = $2`,
    [SENDER_A, RECIPIENT],
  );
  const validStart = one(await client.query(
    `select
       public.sms_recipient_keyword_opted_out($1, $3) as sender_a_stopped,
       public.sms_recipient_keyword_opted_out($2, $3) as sender_b_stopped,
       (select status from public.sms_campaign_keyword_preferences
         where provider = 'signalwire'
           and campaign_id = 'campaign-a'
           and phone_number = $3) as campaign_status`,
    [SENDER_A, SENDER_B, RECIPIENT],
  ));
  check(
    'valid START restores the Campaign across both numbers',
    validStart.sender_a_stopped === false
      && validStart.sender_b_stopped === false
      && validStart.campaign_status === 'opted_in',
    JSON.stringify(validStart),
  );

  // This is the exact state written by ambiguous dispatch START: source records
  // the received keyword, while status deliberately remains opted_out.
  await client.query(
    `update public.sms_sender_keyword_preferences
        set status = 'opted_out', source = 'inbound_start',
            opted_out_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where sender_number_id = $1 and phone_number = $2`,
    [SENDER_A, RECIPIENT],
  );
  const ambiguousStart = one(await client.query(
    `select
       public.sms_recipient_keyword_opted_out($1, $3) as sender_a_stopped,
       public.sms_recipient_keyword_opted_out($2, $3) as sender_b_stopped,
       (select status from public.sms_campaign_keyword_preferences
         where provider = 'signalwire'
           and campaign_id = 'campaign-a'
           and phone_number = $3) as campaign_status`,
    [SENDER_A, SENDER_B, RECIPIENT],
  ));
  check(
    'ambiguous START remains Campaign-wide opted out',
    ambiguousStart.sender_a_stopped === true
      && ambiguousStart.sender_b_stopped === true
      && ambiguousStart.campaign_status === 'opted_out',
    JSON.stringify(ambiguousStart),
  );

  await client.query(
    `update public.sms_sender_numbers
        set campaign_id = 'campaign-b'
      where id = $1`,
    [SENDER_A],
  );
  const reassigned = one(await client.query(
    `select
       public.sms_recipient_keyword_opted_out($1, $3) as reassigned_sender_stopped,
       public.sms_recipient_keyword_opted_out($2, $3) as old_campaign_sender_stopped`,
    [SENDER_A, SENDER_B, RECIPIENT],
  ));
  check(
    'Campaign reassignment ignores the number stale exact preference',
    reassigned.reassigned_sender_stopped === false
      && reassigned.old_campaign_sender_stopped === true,
    JSON.stringify(reassigned),
  );

  await client.query(
    `insert into public.sms_sender_keyword_preferences (
       sender_number_id, phone_number, status, source, opted_out_at, updated_at
     ) values ($1, $2, 'opted_out', 'inbound_stop', pg_catalog.now(), pg_catalog.now())`,
    [SENDER_WITHOUT_CAMPAIGN, RECIPIENT],
  );
  const noCampaignStop = one(await client.query(
    'select public.sms_recipient_keyword_opted_out($1, $2) as stopped',
    [SENDER_WITHOUT_CAMPAIGN, RECIPIENT],
  ));
  await client.query(
    `update public.sms_sender_keyword_preferences
        set status = 'opted_in', source = 'inbound_start',
            opted_out_at = null, updated_at = pg_catalog.now()
      where sender_number_id = $1 and phone_number = $2`,
    [SENDER_WITHOUT_CAMPAIGN, RECIPIENT],
  );
  const noCampaignStart = one(await client.query(
    'select public.sms_recipient_keyword_opted_out($1, $2) as stopped',
    [SENDER_WITHOUT_CAMPAIGN, RECIPIENT],
  ));
  check(
    'Campaign-null sender retains exact-number STOP and START authority',
    noCampaignStop.stopped === true && noCampaignStart.stopped === false,
    JSON.stringify({ stop: noCampaignStop.stopped, start: noCampaignStart.stopped }),
  );

  const security = one(await client.query(
    `select
       c.relrowsecurity as rls,
       c.relforcerowsecurity as force_rls,
       pg_catalog.has_table_privilege(
         'authenticated', 'public.sms_campaign_keyword_preferences', 'select'
       ) as browser_select,
       pg_catalog.has_function_privilege(
         'authenticated', 'public.sms_recipient_keyword_opted_out(uuid,text)', 'execute'
       ) as browser_execute,
       pg_catalog.has_function_privilege(
         'service_role', 'public.sms_recipient_keyword_opted_out(uuid,text)', 'execute'
       ) as service_execute
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'sms_campaign_keyword_preferences'`,
  ));
  check(
    'Campaign preference and helper remain service-role-only',
    security.rls === true
      && security.force_rls === true
      && security.browser_select === false
      && security.browser_execute === false
      && security.service_execute === true,
    JSON.stringify(security),
  );
} catch (error) {
  check(
    'Campaign-wide STOP PostgreSQL harness ran to completion',
    false,
    error instanceof Error
      ? JSON.stringify({
          message: error.message,
          code: error.code ?? null,
          position: error.position ?? null,
          where: error.where ?? null,
          detail: error.detail ?? null,
        })
      : String(error),
  );
} finally {
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 7) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
