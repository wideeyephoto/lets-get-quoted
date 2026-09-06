// Exercise the active LGQ dispatch sender registration in a throwaway local
// PostgreSQL 17 cluster. This script never reads a hosted database URL and never
// contacts SignalWire.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const MIGRATION = 'migrations/20260906121036_register_signalwire_dispatch_sender.sql';
const PORT = Number(process.env.LGQ_SMS_DISPATCH_SENDER_CHECK_PORT || 54372);

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

const BASE = `
create table public.sms_sender_numbers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null check (provider in ('twilio', 'signalwire')),
  e164_number text not null check (e164_number ~ '^\\+[1-9][0-9]{7,14}$'),
  provider_number_id text,
  purpose text not null check (purpose in ('lgq_shared', 'lgq_dispatch', 'contractor_dedicated')),
  account_id uuid,
  brand_id text,
  campaign_id text,
  assignment_id text,
  assignment_state text not null check (assignment_state in ('not_started', 'pending', 'assigned', 'failed', 'suspended')),
  inbound_resource_id text,
  inbound_webhook_url text,
  provisioning_status text not null check (provisioning_status in (
    'pending', 'purchased', 'campaign_pending', 'assignment_pending',
    'inbound_pending', 'active', 'suspended', 'release_pending',
    'released', 'failed', 'indeterminate'
  )),
  inbound_ready boolean not null,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  provisioning_application_id uuid,
  provider_brand_state text,
  provider_campaign_state text,
  provider_verified_at timestamptz,
  provider_phone_verified_at timestamptz,
  provider_sms_capable boolean,
  inbound_request_method text,
  inbound_message_handler text,
  constraint sms_sender_numbers_tenant_shape check (
    (purpose = 'contractor_dedicated' and account_id is not null)
    or (purpose in ('lgq_shared', 'lgq_dispatch') and account_id is null)
  ),
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

create unique index sms_sender_numbers_provider_e164_uidx
  on public.sms_sender_numbers(provider, e164_number);
create unique index sms_sender_numbers_provider_resource_uidx
  on public.sms_sender_numbers(provider, provider_number_id)
  where provider_number_id is not null;
`;

const pg = new EmbeddedPostgres({
  databaseDir: join(os.tmpdir(), `lgq-sms-dispatch-sender-${randomUUID()}`),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_dispatch_sender_check');

  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_sms_dispatch_sender_check',
    application_name: 'lgq-sms-dispatch-sender-check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query("set lock_timeout = '5s'");
  await client.query("set log_min_error_statement = 'panic'");
  await client.query(BASE);

  const migration = readFileSync(MIGRATION, 'utf8');
  await client.query(migration);
  await client.query(migration);

  const registered = await client.query(
    `select provider_number_id,purpose,account_id,brand_id,campaign_id,assignment_id,
            assignment_state,inbound_resource_id,inbound_webhook_url,
            provisioning_status,inbound_ready,activated_at,last_verified_at,
            provider_brand_state,provider_campaign_state,provider_verified_at,
            provider_phone_verified_at,provider_sms_capable,inbound_request_method,
            inbound_message_handler,suspended_at,provisioning_application_id
       from public.sms_sender_numbers
      where provider='signalwire' and e164_number='+18103208333'`,
  );
  const sender = registered.rows[0];
  check(
    'exact active dispatch sender registers once and migration replays',
    registered.rowCount === 1
      && sender?.provider_number_id === 'b28fc2e0-3a92-43f0-a817-923defaf9c4c'
      && sender?.purpose === 'lgq_dispatch'
      && sender?.account_id === null
      && sender?.brand_id === '4a09f38f-2de4-48b7-aba5-dac76a398ccf'
      && sender?.campaign_id === '19e7c875-3611-4b40-8429-7dae3b5e6553'
      && sender?.assignment_id === '5d101ac6-955f-40cf-a0b8-18b5b5121a4b'
      && sender?.assignment_state === 'assigned'
      && sender?.inbound_resource_id === '53ae4e4a-d03f-426b-9983-b09ba496fc43'
      && sender?.inbound_webhook_url === 'https://app.letsgetquoted.com/api/sms/inbound'
      && sender?.provisioning_status === 'active'
      && sender?.inbound_ready === true
      && sender?.activated_at !== null
      && sender?.last_verified_at !== null
      && sender?.provider_brand_state === 'complete'
      && sender?.provider_campaign_state === 'complete'
      && sender?.provider_verified_at !== null
      && sender?.provider_phone_verified_at !== null
      && sender?.provider_sms_capable === true
      && sender?.inbound_request_method === 'POST'
      && sender?.inbound_message_handler === 'laml_webhooks'
      && sender?.suspended_at === null
      && sender?.provisioning_application_id === null,
    JSON.stringify(sender ?? null),
  );

  await client.query(
    `update public.sms_sender_numbers
        set purpose='lgq_shared'
      where provider='signalwire' and e164_number='+18103208333'`,
  );
  let collisionCode = null;
  try {
    await client.query(migration);
  } catch (error) {
    collisionCode = error?.code ?? 'unknown';
    await client.query('rollback');
  }
  const collision = await client.query(
    `select purpose from public.sms_sender_numbers
      where provider='signalwire' and e164_number='+18103208333'`,
  );
  check(
    'identity collision aborts without repurposing the existing row',
    collisionCode === '23505' && collision.rows[0]?.purpose === 'lgq_shared',
    JSON.stringify({ collisionCode, purpose: collision.rows[0]?.purpose ?? null }),
  );

  await client.query(
    `update public.sms_sender_numbers
        set purpose='lgq_dispatch', assignment_state='pending',
            provisioning_status='assignment_pending', inbound_ready=false,
            activated_at=null, last_verified_at=null,
            provider_verified_at=null, provider_phone_verified_at=null
      where provider='signalwire' and e164_number='+18103208333'`,
  );
  let incompleteCode = null;
  try {
    await client.query(migration);
  } catch (error) {
    incompleteCode = error?.code ?? 'unknown';
    await client.query('rollback');
  }
  const incomplete = await client.query(
    `select assignment_state,provisioning_status,inbound_ready,activated_at
       from public.sms_sender_numbers
      where provider='signalwire' and e164_number='+18103208333'`,
  );
  check(
    'existing row without complete activation proof is rejected and left unchanged',
    incompleteCode === '55000'
      && incomplete.rows[0]?.assignment_state === 'pending'
      && incomplete.rows[0]?.provisioning_status === 'assignment_pending'
      && incomplete.rows[0]?.inbound_ready === false
      && incomplete.rows[0]?.activated_at === null,
    JSON.stringify({ incompleteCode, row: incomplete.rows[0] ?? null }),
  );
} catch (error) {
  check(
    'active dispatch sender PostgreSQL harness ran to completion',
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
if (checks.length < 3) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
