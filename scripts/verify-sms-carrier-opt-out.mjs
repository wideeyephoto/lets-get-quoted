// Real PostgreSQL verification; all inputs are synthetic and no hosted URL or
// carrier credentials are read. The existing Campaign functions run unchanged.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

try { os.userInfo(); } catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
if (process.platform === 'win32') {
  process.env.PATH = `${join(process.cwd(), 'node_modules/@embedded-postgres/windows-x64/native/bin')};${process.env.PATH}`;
}
const port = Number(process.env.LGQ_SMS_CARRIER_CHECK_PORT || 54378);
const pg = new EmbeddedPostgres({ databaseDir: join(os.tmpdir(), `lgq-sms-carrier-${randomUUID()}`), user: 'postgres', password: 'postgres', port, persistent: false });
let client;
let concurrent;
let passed = 0;
function check(name) { passed++; console.log(`PASS ${name}`); }
const account = randomUUID();
const sender = randomUUID();
const sibling = randomUUID();
const differentCampaign = randomUUID();
const differentProvider = randomUUID();
const noCampaign = randomUUID();
const phone = '+12485550999';

// Focused dependencies; canonical schema execution is separately checked by
// test:pg17:messaging-schema, including actual RLS and receipt constraints.
const base = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.sms_sender_numbers (
  id uuid primary key, provider text not null, campaign_id text,
  e164_number text not null, account_id uuid
);
create table public.sms_sender_keyword_preferences (
  sender_number_id uuid references public.sms_sender_numbers(id), phone_number text,
  status text not null, source text check (source in ('inbound_stop','inbound_start')),
  opted_out_at timestamptz, updated_at timestamptz not null,
  primary key(sender_number_id, phone_number)
);
create table public.sms_events (
  id uuid primary key, account_id uuid not null, sender_number_id uuid,
  phone_number text not null, provider text, provider_id text, send_started_at timestamptz
);
create table public.sms_webhook_receipts (
  id uuid primary key, webhook_kind text not null, provider text not null,
  provider_error_code text, provider_status text, sms_event_id uuid,
  account_id uuid, sender_number_id uuid, provider_event_id text
);
create table public.sms_operator_review_items (
  id uuid primary key default gen_random_uuid(), webhook_receipt_id uuid unique,
  reason text, severity text, provider text, account_id uuid, sender_number_id uuid,
  sms_event_id uuid, provider_event_id text, provider_status text, provider_error_code text,
  resolution_note text, review_state text default 'open', resolved_at timestamptz
);
`;

async function event(senderId = sender, recipient = phone, historical = false) {
  const id = randomUUID();
  await client.query(`insert into sms_events(id,account_id,sender_number_id,phone_number,provider,provider_id,send_started_at)
    select $1::uuid,$2,id,$3,provider,($1::uuid)::text,case when $4 then null else clock_timestamp() end
    from sms_sender_numbers where id=$5`, [id, account, recipient, historical, senderId]);
  return id;
}
async function receipt(eventId, code = '21610', status = 'undelivered', unmatched = false) {
  const id = randomUUID();
  await client.query(`insert into sms_webhook_receipts(id,webhook_kind,provider,provider_error_code,provider_status,
    sms_event_id,account_id,sender_number_id,provider_event_id)
    select $1,'status',provider,$2,$3,case when $4 then null else id end,account_id,sender_number_id,provider_id
    from sms_events where id=$5`, [id, code, status, unmatched, eventId]);
  return id;
}
async function disposition(id, connection = client) {
  return (await connection.query('select apply_sms_carrier_opt_out_receipt($1) as result', [id])).rows[0].result;
}
async function stopped(senderId = sender, recipient = phone) {
  return (await client.query('select sms_recipient_keyword_opted_out($1,$2) as result', [senderId, recipient])).rows[0].result;
}
async function start(senderId = sender, recipient = phone) {
  await client.query(`insert into sms_sender_keyword_preferences(sender_number_id,phone_number,status,source,opted_out_at,updated_at)
    values($1,$2,'opted_in','inbound_start',null,clock_timestamp())
    on conflict(sender_number_id,phone_number) do update set status=excluded.status,source=excluded.source,
      opted_out_at=null,updated_at=excluded.updated_at`, [senderId, recipient]);
}

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_carrier_check');
  client = pg.getPgClient('lgq_sms_carrier_check');
  await client.connect();
  await client.query("set statement_timeout='15s'; set lock_timeout='5s'; set log_min_error_statement='panic'");
  await client.query(base);
  const campaign = readFileSync('migrations/20260906120000_sms_campaign_wide_stop.sql', 'utf8');
  // Load the real table, projection trigger, and effective suppression reader.
  const nextFunction = campaign.indexOf('create or replace function public.sms_account_recipient_opted_out');
  assert.ok(nextFunction > 0);
  await client.query(campaign.slice(0, nextFunction) + '\ncommit;');
  const migration = readFileSync('migrations/20260914134735_sms_carrier_opt_out_projection.sql', 'utf8');
  await client.query(migration);
  await client.query(migration);
  check('migration applies twice');
  for (const [id, provider, campaignId] of [[sender,'signalwire',' CAMPAIGN-A '],[sibling,'signalwire','campaign-a'],[differentCampaign,'signalwire','campaign-b'],[differentProvider,'twilio','campaign-a'],[noCampaign,'signalwire',null]]) {
    await client.query('insert into sms_sender_numbers values($1,$2,$3,$4,$5)', [id,provider,campaignId,'+12485550111',account]);
  }
  const firstEvent = await event();
  const scope = (await client.query('select * from sms_events where id=$1',[firstEvent])).rows[0];
  assert.equal(scope.sender_campaign_id_at_send,'campaign-a');
  assert.equal(scope.sender_e164_at_send,'+12485550111');
  assert.equal(scope.sender_account_id_at_send,account);
  assert.equal(scope.sender_scope_recorded_at.toISOString(),scope.send_started_at.toISOString());
  check('actual request boundary captures normalized sender scope');

  const firstReceipt = await receipt(firstEvent);
  assert.equal(await disposition(firstReceipt),'applied');
  assert.equal(await stopped(),true);
  assert.equal(await stopped(sibling),true);
  assert.equal(await stopped(differentCampaign),false);
  assert.equal(await stopped(differentProvider),false);
  assert.equal(await stopped(sender,'+12485550888'),false);
  check('21610 suppresses the exact provider/Campaign and recipient only');

  await start(sibling);
  assert.equal(await stopped(),false);
  assert.equal(await disposition(firstReceipt),'applied');
  assert.equal(await stopped(),false);
  assert.equal((await client.query('select count(*)::int as n from sms_campaign_keyword_preferences')).rows[0].n,1);
  check('replayed receipt cannot undo a later START');

  const lateEvent = await event();
  await start(sibling);
  const lateReceipt = await receipt(lateEvent);
  assert.equal(await disposition(lateReceipt),'ignored_newer_preference');
  assert.equal(await stopped(),false);
  check('first late callback also preserves a later START across Campaign numbers');

  const newReceipt = await receipt(await event());
  assert.equal(await disposition(newReceipt),'applied');
  assert.equal(await stopped(),true);
  check('new send after START may establish a new carrier opt-out');

  for (const code of ['30003','30004','30006','30007']) {
    const recipient = `+12485550${code.slice(-3)}`;
    assert.equal(await disposition(await receipt(await event(sender,recipient),code)),null);
    assert.equal(await stopped(sender,recipient),false);
  }
  assert.equal(await disposition(await receipt(await event(sender,'+12485550777'),'21610','delivered')),null);
  check('ambiguous carrier failures and successful statuses do not withdraw consent');

  const historical = await receipt(await event(sender,'+12485550666',true));
  assert.equal(await disposition(historical),'review_unbound_sender');
  assert.equal(await stopped(sender,'+12485550666'),false);
  assert.equal((await client.query('select review_state from sms_operator_review_items where webhook_receipt_id=$1',[historical])).rows[0].review_state,'open');
  check('historical sends without scope enter operator review without guessing');

  const reassignedEvent = await event(differentCampaign);
  await client.query("update sms_sender_numbers set campaign_id='campaign-c' where id=$1",[differentCampaign]);
  assert.equal(await disposition(await receipt(reassignedEvent)),'review_unbound_sender');
  assert.equal(await stopped(differentCampaign),false);
  check('reassigned sender cannot suppress its new Campaign');

  assert.equal(await disposition(await receipt(await event(noCampaign))),'applied');
  assert.equal(await stopped(noCampaign),true);
  check('sender without Campaign metadata retains exact-number suppression');

  const pendingEvent = await event(sender,'+12485550555');
  const pending = await receipt(pendingEvent,'21610','failed',true);
  assert.equal(await disposition(pending),null);
  await client.query('update sms_webhook_receipts set sms_event_id=$1 where id=$2',[pendingEvent,pending]);
  assert.equal(await disposition(pending),'applied');
  assert.equal(await stopped(sender,'+12485550555'),true);
  check('later receipt reconciliation atomically projects suppression');

  const rollbackEvent = await event(sender,'+12485550444');
  const rollbackReceipt = randomUUID();
  await client.query(`create function reject_test_projection() returns trigger language plpgsql as $$ begin raise exception 'injected projection failure'; end $$;
    create trigger reject_test_projection before insert or update on sms_campaign_keyword_preferences for each row execute function reject_test_projection()`);
  await assert.rejects(client.query(`insert into sms_webhook_receipts(id,webhook_kind,provider,provider_error_code,provider_status,sms_event_id,account_id,sender_number_id,provider_event_id)
    values($1,'status','signalwire','21610','failed',$2::uuid,$3,$4,($2::uuid)::text)`,[rollbackReceipt,rollbackEvent,account,sender]),/injected projection failure/);
  assert.equal((await client.query('select count(*)::int as n from sms_webhook_receipts where id=$1',[rollbackReceipt])).rows[0].n,0);
  assert.equal((await client.query('select count(*)::int as n from sms_sender_keyword_preferences where phone_number=$1',['+12485550444'])).rows[0].n,0);
  await client.query('drop trigger reject_test_projection on sms_campaign_keyword_preferences; drop function reject_test_projection()');
  check('projection failure rolls back both receipt and sender preference');

  const concurrentEvent = await event(sender,'+12485550333');
  const concurrentReceipt = await receipt(concurrentEvent,'21610','failed',true);
  concurrent = pg.getPgClient('lgq_sms_carrier_check');
  await concurrent.connect();
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtextextended('sms-campaign-consent:signalwire:campaign-a:+12485550333',20260906))");
  // Binding waits behind the same Campaign lock that protects keyword decisions.
  const projection = concurrent.query('update sms_webhook_receipts set sms_event_id=$1 where id=$2',[concurrentEvent,concurrentReceipt]);
  await start(sibling,'+12485550333');
  await client.query('commit');
  await projection;
  assert.equal(await disposition(concurrentReceipt),'ignored_newer_preference');
  assert.equal(await stopped(sender,'+12485550333'),false);
  check('concurrent callback respects committed START under the Campaign lock');

  for (const role of ['anon','authenticated']) {
    await client.query(`set role ${role}`);
    await assert.rejects(client.query('select apply_sms_carrier_opt_out_receipt($1)',[firstReceipt]),error => error.code==='42501');
    await client.query('reset role');
  }
  await client.query('set role service_role');
  assert.equal(await disposition(firstReceipt),'applied');
  await client.query('reset role');
  const config = (await client.query("select prosecdef,proconfig from pg_proc where oid='public.apply_sms_carrier_opt_out_receipt(uuid)'::regprocedure")).rows[0];
  assert.equal(config.prosecdef,true);
  assert.ok(config.proconfig.includes('search_path=pg_catalog, pg_temp'));
  assert.ok(config.proconfig.includes('TimeZone=UTC'));
  check('receipt RPC is service-only with fixed search path and UTC');
  console.log(`${passed} PostgreSQL carrier opt-out checks passed.`);
} finally {
  await concurrent?.end();
  await client?.end();
  try { await pg.stop(); } catch (error) {
    // Windows may briefly retain a directory handle after pg_ctl stops. Only
    // ignore this known cleanup race; startup/shutdown failures still fail CI.
    if (process.platform !== 'win32' || error?.code !== 'EBUSY') throw error;
    console.warn('PostgreSQL stopped; temporary directory cleanup deferred by a Windows file lock.');
  }
}
