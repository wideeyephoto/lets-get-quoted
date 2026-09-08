// Disposable PostgreSQL checks. No hosted credentials, carrier calls, or sends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.LGQ_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const account = '11111111-1111-4111-8111-111111111111';
const sender = '22222222-2222-4222-8222-222222222222';
const application = '33333333-3333-4333-8333-333333333333';
const event = '44444444-4444-4444-8444-444444444444';
const token = '55555555-5555-4555-8555-555555555555';
let passed = 0;
async function test(name, work) { await work(); passed++; console.log(`PASS ${name}`); }
async function ready() { return (await db.query('select customer_sms_sender_registered($1,$2) as ready', [sender, account])).rows[0].ready; }
async function stage() { return (await db.query('select * from stage_sms_delivery($1,$2,$3)', [event, token, 'signalwire'])).rows[0].dispatch_status; }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table accounts(id uuid primary key, suspended_at timestamptz);
    create table sms_events(id uuid primary key,account_id uuid,phone_number text,status text,billing_category text,
      sender_number_id uuid,sender_purpose text,provider text,error_reason text,cancelled_at timestamptz,updated_at timestamptz);
    create table sms_delivery_tasks(sms_event_id uuid,task_state text,claim_token uuid,lease_expires_at timestamptz,
      request_started_at timestamptz,available_at timestamptz,created_at timestamptz,last_error_code text,cancelled_at timestamptz,updated_at timestamptz);
    create table sms_delivery_attempts(claim_token uuid,outcome text,error_code text,finished_at timestamptz);
    create table sms_consent(account_id uuid,phone_number text,status text,consented_at timestamptz,opted_out_at timestamptz);
    create table sms_consent_scopes(account_id uuid,phone_number text,consent_scope text);
    create table sms_sender_numbers(id uuid primary key,account_id uuid,provider text,purpose text,
      provisioning_application_id uuid,provisioning_status text,assignment_state text,inbound_ready boolean,
      suspended_at timestamptz,activated_at timestamptz,brand_id text,campaign_id text,provider_number_id text,e164_number text);
    create table messaging_registration_applications(id uuid primary key,account_id uuid,status text,suspended_at timestamptz,
      activated_at timestamptz,provider text,provider_brand_id text,provider_campaign_id text,provider_number_id text,purchased_number text,
      provider_brand_state text,provider_campaign_state text,provider_assignment_state text,provider_verified_at timestamptz,
      provider_phone_verified_at timestamptz,provider_sms_capable boolean,inbound_configured_at timestamptz,
      inbound_request_method text,inbound_message_handler text);
    create table test_keyword_state(opted_out boolean);
    insert into test_keyword_state values(false);
    create function sms_recipient_keyword_opted_out(uuid,text) returns boolean language sql as $$select opted_out from public.test_keyword_state$$;
    insert into accounts values('${account}',null);
    insert into sms_events values('${event}','${account}','+12485550101','queued','customer_message',null,'contractor_dedicated',null,null,null,null);
    insert into sms_delivery_tasks values('${event}','leased','${token}',now()+interval '1 hour',null,now(),now(),null,null,null);
    insert into sms_consent values('${account}','+12485550101','opted_in',now(),null);
    insert into sms_consent_scopes values('${account}','+12485550101','customer'),('${account}','+12485550101','owner'),('${account}','+12485550101','crew');
    insert into sms_sender_numbers values('${sender}','${account}','signalwire','contractor_dedicated','${application}','active','assigned',true,null,now(),'brand','customer-campaign','number','+12485550100');
    insert into messaging_registration_applications values('${application}','${account}','active',null,now(),'signalwire','brand','customer-campaign','number','+12485550100','complete','complete','complete',now(),now(),true,now(),'POST','laml_webhooks');
    grant select on all tables in schema public to service_role;
  `);
  const source = readFileSync(new URL('../migrations/20260906120000_sms_campaign_wide_stop.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('create or replace function public.stage_sms_delivery(');
  assert(start >= 0);
  await db.exec(source.slice(start, source.indexOf('$$;', start) + 3));
  const migration = readFileSync(new URL('../migrations/20260908204510_customer_sms_registered_sender_guard.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await test('matching registered sender is ready after repeated migration', async () => assert.equal(await ready(), true));
  await test('registered customer delivery stages through the actual dispatcher', async () => {
    await db.exec('begin; set local role service_role');
    assert.equal(await stage(), 'ready');
    await db.exec('rollback');
  });
  for (const [name, change] of [
    ['missing application', 'update sms_sender_numbers set provisioning_application_id=null'],
    ['other workspace', `update messaging_registration_applications set account_id='${sender}'`],
    ['unactivated application', "update messaging_registration_applications set status='approved'"],
    ['suspended application', 'update messaging_registration_applications set suspended_at=now()'],
    ['wrong campaign', "update messaging_registration_applications set provider_campaign_id='other'"],
    ['wrong brand', "update messaging_registration_applications set provider_brand_id='other'"],
    ['wrong number', "update messaging_registration_applications set provider_number_id='other'"],
    ['pending assignment', "update messaging_registration_applications set provider_assignment_state='pending'"],
    ['missing provider proof', 'update messaging_registration_applications set provider_verified_at=null'],
    ['not SMS capable', 'update messaging_registration_applications set provider_sms_capable=false'],
    ['unconfigured inbound', 'update messaging_registration_applications set inbound_configured_at=null'],
    ['suspended sender', 'update sms_sender_numbers set suspended_at=now()'],
    ['support campaign', "insert into sms_sender_numbers(id,provider,purpose,campaign_id) values(gen_random_uuid(),'signalwire','lgq_shared','customer-campaign')"],
    ['crew campaign', "insert into sms_sender_numbers(id,provider,purpose,campaign_id) values(gen_random_uuid(),'signalwire','lgq_dispatch','customer-campaign')"],
  ]) await test(`${name} blocks customer delivery before egress`, async () => {
    await db.exec(`begin; ${change}; set local role service_role`);
    assert.equal(await ready(), false);
    assert.equal(await stage(), 'blocked_sender');
    const row = (await db.query('select e.status,e.sender_number_id,t.request_started_at from sms_events e join sms_delivery_tasks t on t.sms_event_id=e.id')).rows[0];
    assert.deepEqual(row, { status: 'queued', sender_number_id: null, request_started_at: null });
    await db.exec('rollback');
  });
  for (const category of ['payment_message', 'verification']) await test(`${category} also requires registration`, async () => {
    await db.exec(`begin; update sms_events set billing_category='${category}'; update sms_sender_numbers set provisioning_application_id=null`);
    assert.equal(await stage(), 'blocked_sender');
    await db.exec('rollback');
  });
  for (const [category, purpose] of [['owner_alert','lgq_shared'],['crew_message','lgq_dispatch']]) await test(`${purpose} retains its own sender path`, async () => {
    await db.exec(`begin; update sms_events set billing_category='${category}',sender_purpose='${purpose}'; update sms_sender_numbers set account_id=null,purpose='${purpose}',provisioning_application_id=null;`);
    assert.equal(await stage(), 'ready');
    await db.exec('rollback');
  });
  await test('STOP still cancels a registered customer delivery', async () => {
    await db.exec('begin; update test_keyword_state set opted_out=true');
    assert.equal(await stage(), 'cancelled');
    await db.exec('rollback');
  });
  for (const role of ['anon','authenticated']) await test(`${role} cannot call either private function`, async () => {
    await db.exec(`begin; set local role ${role}`);
    await assert.rejects(ready, error => error.code === '42501');
    await db.exec('rollback');
    await db.exec(`begin; set local role ${role}`);
    await assert.rejects(stage, error => error.code === '42501');
    await db.exec('rollback');
  });
  console.log(JSON.stringify({ passed, productionRecordsTouched: false, carrierRequests: 0 }));
} catch (error) {
  console.error(JSON.stringify({ passed, error: error.message, code: error.code }));
  process.exitCode = 1;
} finally { await db.close(); }
