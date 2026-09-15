// Exercise the SMS Campaign-purpose boundary against a disposable PostgreSQL
// 17 cluster. This script never reads a hosted database URL or calls a carrier.

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const MIGRATION = 'migrations/20260906130000_sms_campaign_purpose_boundary.sql';
const PORT = Number(process.env.LGQ_SMS_PURPOSE_BOUNDARY_CHECK_PORT || 54378);

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

create table public.crew (id uuid primary key);

create table public.sms_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null,
  phone_number text not null,
  body text not null,
  message_kind text not null,
  billing_category text,
  sender_purpose text,
  context text not null,
  event_type text not null,
  idempotency_key text not null unique,
  crew_id uuid,
  sender_number_id uuid
);

create or replace function public.enqueue_sms_delivery(
  p_account_id uuid,
  p_phone_number text,
  p_body text,
  p_message_kind text,
  p_billing_category text,
  p_sender_purpose text,
  p_context text,
  p_event_type text,
  p_idempotency_key text,
  p_payment_id uuid default null,
  p_crew_id uuid default null,
  p_sender_number_id uuid default null,
  p_available_at timestamptz default null
)
returns table (sms_event_id uuid, task_state text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $function$
begin
  if p_sender_purpose is null or p_sender_purpose not in (
    'lgq_shared', 'lgq_dispatch', 'contractor_dedicated'
  ) then
    raise exception 'SMS sender purpose is invalid'
      using errcode = '22023';
  end if;
  return query
  insert into public.sms_events (
    account_id, phone_number, body, message_kind, billing_category,
    sender_purpose, context, event_type, idempotency_key, crew_id,
    sender_number_id
  ) values (
    p_account_id, p_phone_number, p_body, p_message_kind, p_billing_category,
    p_sender_purpose, p_context, p_event_type, p_idempotency_key, p_crew_id,
    p_sender_number_id
  )
  returning id, 'queued'::text, true;
end
$function$;

revoke all on function public.enqueue_sms_delivery(
  uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_sms_delivery(
  uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz
) to service_role;

create or replace function public.apply_owner_field_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_intent text,
  p_params jsonb,
  p_transcript text,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $function$
declare
  v_crew public.crew%rowtype;
  v_task record;
begin
  select (p_params->>'sender_number_id')::uuid as sender_number_id
    into v_task;
  if coalesce((p_params->>'crew')::boolean, false) then
    select p_task_id into v_crew.id;
  end if;

  perform public.enqueue_sms_delivery(
    p_account_id => p_claim_token,
    p_phone_number => '+12485550100',
    p_body => p_confirmation_text,
    p_message_kind => case when v_crew.id is not null then 'crew-field-confirm' else 'owner-field-confirm' end,
    p_billing_category => case when v_crew.id is not null then 'crew_message' else 'owner_alert' end,
    p_sender_purpose => 'lgq_shared',
    p_context => case when v_crew.id is not null then 'subcontractor' else 'owner' end,
    p_event_type => case when v_crew.id is not null then 'crew_field_confirm' else 'owner_field_confirm' end,
    p_idempotency_key => 'field-confirm:' || p_task_id::text,
    p_payment_id => null::uuid,
    p_crew_id => v_crew.id,
    p_sender_number_id => v_task.sender_number_id
  );

  return pg_catalog.jsonb_build_object('crew_id', v_crew.id);
end
$function$;

revoke all on function public.apply_owner_field_action(
  uuid,uuid,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.apply_owner_field_action(
  uuid,uuid,text,jsonb,text,text
) to service_role;
`;

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_TASK = '00000000-0000-4000-8000-000000000011';
const CREW_TASK = '00000000-0000-4000-8000-000000000012';
const SHARED_SENDER = '00000000-0000-4000-8000-000000000021';

const pg = new EmbeddedPostgres({
  databaseDir: join(os.tmpdir(), `lgq-sms-purpose-boundary-${randomUUID()}`),
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

async function expectSqlState(client, name, state, sql, params = []) {
  try {
    await client.query(sql, params);
    check(name, false, 'statement unexpectedly succeeded');
  } catch (error) {
    check(name, error?.code === state, `SQLSTATE ${error?.code ?? 'unknown'}`);
  }
}

let client;
let fatalError = null;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_purpose_boundary_check');

  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_sms_purpose_boundary_check',
    application_name: 'lgq-sms-purpose-boundary-check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query("set lock_timeout = '5s'");
  await client.query(BASE);

  // JavaScript template fixtures use LF even on Windows. Match that encoding
  // when loading SQL whose exact function-text guards compare line endings.
  const migration = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');
  await client.query(migration);
  await client.query(migration);
  check('migration applies twice', true);

  await client.query(
    `select public.enqueue_sms_delivery(
      $1, '+12485550100', 'Owner alert', 'owner-alert', 'owner_alert',
      'lgq_shared', 'owner', 'owner_alert', 'owner-valid'
    )`,
    [ACCOUNT_ID],
  );
  await client.query(
    `select public.enqueue_sms_delivery(
      $1, '+12485550101', 'Crew alert', 'crew-alert', 'crew_message',
      'lgq_dispatch', 'crew', 'crew_alert', 'crew-valid', null, $2
    )`,
    [ACCOUNT_ID, CREW_TASK],
  );
  check('valid owner/shared and crew/dispatch pairs enqueue', true);

  await expectSqlState(
    client,
    'owner alert cannot enter dispatch Campaign',
    '22023',
    `select public.enqueue_sms_delivery(
      $1, '+12485550102', 'Wrong owner lane', 'owner-alert', 'owner_alert',
      'lgq_dispatch', 'owner', 'owner_alert', 'owner-wrong'
    )`,
    [ACCOUNT_ID],
  );
  await expectSqlState(
    client,
    'crew message cannot escape dispatch Campaign',
    '22023',
    `select public.enqueue_sms_delivery(
      $1, '+12485550103', 'Wrong crew lane', 'crew-alert', 'crew_message',
      'lgq_shared', 'crew', 'crew_alert', 'crew-wrong', null, $2
    )`,
    [ACCOUNT_ID, CREW_TASK],
  );

  await expectSqlState(
    client,
    'table constraint blocks direct mismatched inserts',
    '23514',
    `insert into public.sms_events (
       account_id, phone_number, body, message_kind, billing_category,
       sender_purpose, context, event_type, idempotency_key
     ) values ($1, '+12485550104', 'Direct mismatch', 'direct-mismatch',
       'owner_alert', 'lgq_dispatch', 'owner', 'direct_mismatch', 'direct-wrong')`,
    [ACCOUNT_ID],
  );

  await client.query(
    `select public.apply_owner_field_action(
      $1, $2, 'append_internal_note',
      pg_catalog.jsonb_build_object(
        'sender_number_id', $3::text,
        'crew', false
      ),
      'owner note', 'Owner saved'
    )`,
    [OWNER_TASK, ACCOUNT_ID, SHARED_SENDER],
  );
  await client.query(
    `select public.apply_owner_field_action(
      $1, $2, 'no_action',
      pg_catalog.jsonb_build_object(
        'sender_number_id', $3::text,
        'crew', true
      ),
      'crew note', 'Crew saved'
    )`,
    [CREW_TASK, ACCOUNT_ID, SHARED_SENDER],
  );
  const fieldPairs = await client.query(
    `select billing_category, sender_purpose, sender_number_id
       from public.sms_events
      where idempotency_key like 'field-confirm:%'
      order by billing_category`,
  );
  check(
    'field confirmations choose shared for owner and dispatch for crew',
    JSON.stringify(fieldPairs.rows) === JSON.stringify([
      { billing_category: 'crew_message', sender_purpose: 'lgq_dispatch', sender_number_id: null },
      { billing_category: 'owner_alert', sender_purpose: 'lgq_shared', sender_number_id: SHARED_SENDER },
    ]),
    JSON.stringify(fieldPairs.rows),
  );

  const privilege = await client.query(
    `select
       pg_catalog.has_function_privilege(
         'service_role',
         'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
         'execute'
       ) as service_exec,
       pg_catalog.has_function_privilege(
         'authenticated',
         'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
         'execute'
       ) as authenticated_exec`,
  );
  check(
    'enqueue remains service-role only',
    privilege.rows[0]?.service_exec === true && privilege.rows[0]?.authenticated_exec === false,
    JSON.stringify(privilege.rows[0]),
  );
} catch (error) {
  console.error(error);
  fatalError = error;
} finally {
  if (client) await client.end().catch(() => undefined);
  await pg.stop().catch(() => undefined);
}

if (fatalError || checks.some((item) => !item.ok)) process.exit(1);
