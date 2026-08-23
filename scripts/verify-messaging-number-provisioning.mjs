// Execute dedicated-number provisioning against a throwaway PostgreSQL 17.
// The harness creates its own local cluster, mocks the provider at the RPC
// boundary, and never reads a hosted database URL or makes a network request.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const MIGRATION = 'migrations/20260821182357_signalwire_dedicated_number_provisioning.sql';
const HARDENING = 'migrations/20260821195147_signalwire_dedicated_number_hardening.sql';
const ADVERSARIAL_HARDENING = 'migrations/20260821204404_signalwire_dedicated_number_adversarial_hardening.sql';
const PORT = Number(process.env.LGQ_NUMBER_PROVISIONING_CHECK_PORT || 54357);

// Node 24 on some managed Windows sessions reports uv_os_get_passwd ENOMEM
// even though USERNAME/USERPROFILE are present. embedded-postgres asks only
// whether uid is 0; Windows has no root uid, so supply that narrow fact to the
// built-in module when the OS lookup itself is unavailable.
try {
  os.userInfo();
} catch (error) {
  if (!(error && typeof error === 'object' && error.code === 'ERR_SYSTEM_ERROR')) throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null });
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

const BIN = join(process.cwd(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
process.env.PATH = `${BIN}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

function one(result) {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw new Error(`Expected one row, received ${result.rowCount}.`);
  return result.rows[0];
}

function state(error) {
  return error && typeof error === 'object' && typeof error.code === 'string' ? error.code : null;
}

const BASE = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$roles$;

create table public.accounts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  business_name text
);
create function public.is_owner(uuid) returns boolean language sql stable as $$ select false $$;

create table public.messaging_registrations (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','submitted','in_review','approved','action_required','rejected')),
  provider text,
  provider_reference text,
  status_detail text,
  assigned_number text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create unique index messaging_registrations_number_idx on public.messaging_registrations(assigned_number) where assigned_number is not null;

create table public.sms_sender_numbers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null check (provider in ('twilio','signalwire')),
  e164_number text not null check (e164_number ~ '^\\+[1-9][0-9]{7,14}$'),
  provider_number_id text,
  purpose text not null check (purpose in ('lgq_shared','lgq_dispatch','contractor_dedicated')),
  account_id uuid references public.accounts(id) on delete restrict,
  brand_id text,
  campaign_id text,
  assignment_id text,
  assignment_state text not null default 'not_started' check (assignment_state in ('not_started','pending','assigned','failed','suspended')),
  inbound_resource_id text,
  inbound_webhook_url text,
  provisioning_status text not null default 'pending' check (provisioning_status in ('pending','purchased','campaign_pending','assignment_pending','inbound_pending','active','suspended','release_pending','released','failed','indeterminate')),
  inbound_ready boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create unique index sms_sender_numbers_provider_e164_uidx on public.sms_sender_numbers(provider,e164_number);
create unique index sms_sender_numbers_provider_resource_uidx on public.sms_sender_numbers(provider,provider_number_id) where provider_number_id is not null;
`;

const pg = new EmbeddedPostgres({
  databaseDir: join(process.cwd(), '.pg17-number-provisioning-check'),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let control;
let worker;

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function submit(client, accountId, suffix, fingerprintCharacter = 'a') {
  const args = [
    accountId, `application:${suffix}`, fingerprintCharacter.repeat(64), 'Acme Roofing LLC', 'Acme Roofing', 'llc',
    'https://acme.example.com', 'owner@acme.example.com', '+12485550140',
    'Alex Owner', 'Managing Member', 'alex@acme.example.com', '+12485550141',
    'help@acme.example.com', '+12485550142', '1 Main Street', '', 'Royal Oak', 'MI', '48067', '248',
    'Two-way appointment scheduling, estimate updates, and homeowner support.', 500,
    'Homeowners enter their number and accept the SMS disclosure on the quote request form.',
    'https://acme.example.com/request-a-quote',
    ['Acme Roofing: Appointment confirmed. Reply STOP to opt out.', 'Acme Roofing: We are on our way.'],
    'https://acme.example.com/privacy', 'https://acme.example.com/terms', new Date().toISOString(), 'owner-test',
  ];
  return one(await client.query(
    `select * from public.submit_messaging_registration_application(${args.map((_, index) => `$${index + 1}`).join(',')})`,
    args,
  ));
}

async function approveAndCandidate(client, applicationId, number, suffix) {
  const campaign = randomUUID();
  await client.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    applicationId, '6789', `case-${suffix}`, 'ops-test',
  ]);
  await client.query('select public.review_messaging_registration_application($1,$2,$3,$4,$5,$6)', [
    applicationId, 'approved', 'Vetted test business and carrier campaign.', randomUUID(), campaign, 'ops-test',
  ]);
  await client.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [
    applicationId, number, 'MI', 'Royal Oak', `ops-${suffix}`,
  ]);
  return campaign;
}

async function approveV2AndCandidate(client, applicationId, number, suffix) {
  const brand = randomUUID();
  const campaign = randomUUID();
  await client.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    applicationId, '6789', `case-v2-${suffix}`, 'ops-test',
  ]);
  await client.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    applicationId, 'approved', 'Vetted downstream business and carrier campaign.',
    brand, campaign, 'complete', 'complete', 'LOW_VOLUME_MIXED',
    'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  await client.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [
    applicationId, number, 'MI', 'Royal Oak', `ops-v2-${suffix}`,
  ]);
  return { brand, campaign };
}

async function claim(client, applicationId, type, key, payload) {
  return one(await client.query(
    'select * from public.claim_messaging_number_operation($1,$2,$3,$4,$5)',
    [applicationId, type, key, fingerprint(payload), payload],
  ));
}

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_number_check');
  const { Client } = await import('pg');
  const options = { host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'lgq_number_check' };
  control = new Client({ ...options, application_name: 'lgq-number-check-control' });
  worker = new Client({ ...options, application_name: 'lgq-number-check-worker' });
  await Promise.all([control.connect(), worker.connect()]);
  for (const client of [control, worker]) {
    await client.query("set statement_timeout = '15s'");
    await client.query("set lock_timeout = '5s'");
  }

  await control.query(BASE);
  const migration = readFileSync(MIGRATION, 'utf8');
  await control.query(migration);
  await control.query(migration);
  check('migration applies twice on PostgreSQL 17', true);

  const firstAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [firstAccount, 'First Test']);
  const first = await submit(control, firstAccount, randomUUID());
  const replay = await submit(control, firstAccount, 'replay');
  check('same application fingerprint is idempotent', replay.application_id === first.application_id && replay.created === false);

  let approvalWithoutVerificationCode = null;
  try {
    await control.query('select public.review_messaging_registration_application($1,$2,$3,$4,$5,$6)', [
      first.application_id, 'approved', 'Vetted test business and carrier campaign.', randomUUID(), randomUUID(), 'ops-test',
    ]);
  } catch (error) {
    approvalWithoutVerificationCode = state(error);
  }
  const beforeVerification = one(await control.query('select status from public.messaging_registration_applications where id=$1', [first.application_id]));
  check('approval fails closed without current-revision tax verification', approvalWithoutVerificationCode === '55000' && beforeVerification.status === 'submitted', String(approvalWithoutVerificationCode));

  let fullEinReferenceCode = null;
  try {
    await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
      first.application_id, '6789', 'EIN 12-3456789', 'ops-test',
    ]);
  } catch (error) {
    fullEinReferenceCode = state(error);
  }
  check('verification reference rejects a full EIN', fullEinReferenceCode === '22023', String(fullEinReferenceCode));

  await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    first.application_id, '6789', 'case-first', 'ops-test',
  ]);
  const restrictedVerification = one(await control.query(`select application_revision,ein_last_four,verification_reference
    from public.messaging_compliance_verifications where application_id=$1`, [first.application_id]));
  const publicVerificationEvent = one(await control.query(`select detail,metadata::text as metadata
    from public.messaging_registration_events where application_id=$1 and event_type='compliance_verified' order by created_at desc limit 1`, [first.application_id]));
  check(
    'restricted verification retains only last four and public event leaks neither suffix nor reference',
    restrictedVerification.application_revision === 1
      && restrictedVerification.ein_last_four === '6789'
      && restrictedVerification.verification_reference === 'case-first'
      && !publicVerificationEvent.detail.includes('6789')
      && !publicVerificationEvent.metadata.includes('6789')
      && !publicVerificationEvent.detail.includes('case-first')
      && !publicVerificationEvent.metadata.includes('case-first'),
  );

  await control.query('select public.review_messaging_registration_application($1,$2,$3,$4,$5,$6)', [
    first.application_id, 'action_required', 'Update and resubmit the registration evidence.', '', '', 'ops-test',
  ]);
  const revised = await submit(control, firstAccount, 'revision-two', 'b');
  let staleVerificationApprovalCode = null;
  try {
    await control.query('select public.review_messaging_registration_application($1,$2,$3,$4,$5,$6)', [
      first.application_id, 'approved', 'Vetted test business and carrier campaign.', randomUUID(), randomUUID(), 'ops-test',
    ]);
  } catch (error) {
    staleVerificationApprovalCode = state(error);
  }
  check(
    'resubmission invalidates stale EIN evidence until the current revision is verified',
    revised.application_id === first.application_id
      && one(await control.query('select revision from public.messaging_registration_applications where id=$1', [first.application_id])).revision === 2
      && staleVerificationApprovalCode === '55000',
    String(staleVerificationApprovalCode),
  );

  await approveAndCandidate(control, first.application_id, '+12485550141', 'uncertain');
  const uncertainPayload = { number: '+12485550141' };
  const uncertain = await claim(control, first.application_id, 'purchase_number', `messaging:${first.application_id}:purchase:+12485550141`, uncertainPayload);
  const concurrent = await claim(worker, first.application_id, 'purchase_number', `messaging:${first.application_id}:purchase:+12485550141`, uncertainPayload);
  check('one leased operation cannot be claimed twice', uncertain.claim_status === 'claimed' && concurrent.claim_status === 'in_progress');
  await control.query('select public.begin_messaging_number_operation($1,$2)', [uncertain.operation_id, uncertain.claim_token]);
  await control.query("update public.messaging_number_provisioning_operations set lease_expires_at=pg_catalog.now()-interval '1 second' where id=$1", [uncertain.operation_id]);
  const quarantined = await claim(control, first.application_id, 'purchase_number', `messaging:${first.application_id}:purchase:+12485550141`, uncertainPayload);
  check('expired post-request lease becomes indeterminate', quarantined.claim_status === 'indeterminate');
  let blockedCandidateCode = null;
  try {
    await control.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [first.application_id, '+12485550149', 'MI', 'Royal Oak', 'ops-test']);
  } catch (error) {
    blockedCandidateCode = state(error);
  }
  check('indeterminate purchase blocks selecting or buying another number', blockedCandidateCode === '55000', String(blockedCandidateCode));

  const collisionAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [collisionAccount, 'Collision Test']);
  const collisionApplication = await submit(control, collisionAccount, randomUUID());
  const collisionNumber = '+12485550143';
  await approveAndCandidate(control, collisionApplication.application_id, collisionNumber, 'collision');
  const existingSharedProviderId = randomUUID();
  await control.query(`insert into public.sms_sender_numbers(
    provider,e164_number,provider_number_id,purpose,account_id,assignment_state,
    provisioning_status,inbound_ready
  ) values ('signalwire',$1,$2,'lgq_shared',null,'assigned','active',true)`, [collisionNumber, existingSharedProviderId]);
  const collisionPayload = { number: collisionNumber };
  const collisionPurchase = await claim(
    control,
    collisionApplication.application_id,
    'purchase_number',
    `messaging:${collisionApplication.application_id}:purchase:${collisionNumber}`,
    collisionPayload,
  );
  await control.query('select public.begin_messaging_number_operation($1,$2)', [collisionPurchase.operation_id, collisionPurchase.claim_token]);
  const attemptedProviderId = randomUUID();
  let collisionCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [
      collisionPurchase.operation_id,
      collisionPurchase.claim_token,
      attemptedProviderId,
      { id: attemptedProviderId, number: collisionNumber, capabilities: ['sms'] },
    ]);
  } catch (error) {
    collisionCode = state(error);
  }
  const collisionSender = one(await control.query(`select purpose,account_id,provider_number_id,provisioning_application_id
    from public.sms_sender_numbers where provider='signalwire' and e164_number=$1`, [collisionNumber]));
  const collisionApp = one(await control.query('select status,provider_number_id,purchased_number from public.messaging_registration_applications where id=$1', [collisionApplication.application_id]));
  const collisionOperation = one(await control.query('select state from public.messaging_number_provisioning_operations where id=$1', [collisionPurchase.operation_id]));
  check(
    'purchase completion never rebinds an existing shared sender',
    collisionCode === '23505'
      && collisionSender.purpose === 'lgq_shared'
      && collisionSender.account_id === null
      && collisionSender.provider_number_id === existingSharedProviderId
      && collisionSender.provisioning_application_id === null
      && collisionApp.status === 'approved'
      && collisionApp.provider_number_id === null
      && collisionApp.purchased_number === null
      && collisionOperation.state === 'request_started',
    String(collisionCode),
  );

  const accountId = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [accountId, 'Lifecycle Test']);
  const application = await submit(control, accountId, randomUUID());
  const number = '+12485550142';
  const campaign = await approveAndCandidate(control, application.application_id, number, 'lifecycle');

  const purchasePayload = { number };
  const purchaseKey = `messaging:${application.application_id}:purchase:${number}`;
  const purchase = await claim(control, application.application_id, 'purchase_number', purchaseKey, purchasePayload);
  await control.query('select public.begin_messaging_number_operation($1,$2)', [purchase.operation_id, purchase.claim_token]);
  const providerNumberId = randomUUID();
  await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [
    purchase.operation_id, purchase.claim_token, providerNumberId,
    { id: providerNumberId, number, name: 'Lifecycle Test', capabilities: ['sms', 'mms'] },
  ]);
  const purchaseReplay = await claim(control, application.application_id, 'purchase_number', purchaseKey, purchasePayload);
  check('completed purchase replays without re-entering its old stage', purchaseReplay.claim_status === 'replay' && purchaseReplay.provider_object_id === providerNumberId);

  const inbound = 'https://app.example.com/api/sms/inbound';
  const configurePayload = { provider_number_id: providerNumberId, number, inbound_url: inbound, message_handler: 'laml_webhooks' };
  const configure = await claim(control, application.application_id, 'configure_inbound', `messaging:${application.application_id}:configure:${providerNumberId}`, configurePayload);
  await control.query('select public.begin_messaging_number_operation($1,$2)', [configure.operation_id, configure.claim_token]);
  let wrongInboundUrlCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [
      configure.operation_id, configure.claim_token, providerNumberId,
      { id: providerNumberId, number, message_handler: 'laml_webhooks', message_request_url: 'https://wrong.example.com/api/sms/inbound' },
    ]);
  } catch (error) {
    wrongInboundUrlCode = state(error);
  }
  let wrongInboundHandlerCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [
      configure.operation_id, configure.claim_token, providerNumberId,
      { id: providerNumberId, number, message_handler: 'relay_context', message_request_url: inbound },
    ]);
  } catch (error) {
    wrongInboundHandlerCode = state(error);
  }
  const senderBeforeInbound = one(await control.query(`select s.inbound_ready,s.inbound_webhook_url,a.inbound_configured_at
    from public.sms_sender_numbers s join public.messaging_registration_applications a on a.id=s.provisioning_application_id
    where a.id=$1`, [application.application_id]));
  check(
    'inbound completion requires the exact URL and normalized LaML handler',
    wrongInboundUrlCode === '22000'
      && wrongInboundHandlerCode === '22000'
      && senderBeforeInbound.inbound_ready === false
      && senderBeforeInbound.inbound_webhook_url === null
      && senderBeforeInbound.inbound_configured_at === null,
    `${wrongInboundUrlCode}/${wrongInboundHandlerCode}`,
  );
  await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [
    configure.operation_id, configure.claim_token, providerNumberId,
    { id: providerNumberId, number, message_handler: 'laml_webhooks', message_request_url: inbound },
  ]);
  const senderAfterInbound = one(await control.query('select inbound_ready, provisioning_status from public.sms_sender_numbers where account_id=$1', [accountId]));
  check('purchase and inbound completion project canonical sender inventory', senderAfterInbound.inbound_ready && senderAfterInbound.provisioning_status === 'assignment_pending');

  let earlyCode = null;
  try {
    await claim(control, application.application_id, 'assign_campaign', `messaging:${application.application_id}:assign:${campaign}:${number}`, { campaign_id: campaign, number, status_callback_url: null });
  } catch (error) {
    earlyCode = state(error);
  }
  check('campaign assignment is blocked for one hour after purchase', earlyCode === '55000', String(earlyCode));
  await control.query("update public.messaging_registration_applications set purchased_at=pg_catalog.now()-interval '2 hours' where id=$1", [application.application_id]);

  const assignPayload = { campaign_id: campaign, number, status_callback_url: null };
  const assign = await claim(control, application.application_id, 'assign_campaign', `messaging:${application.application_id}:assign:${campaign}:${number}`, assignPayload);
  await control.query('select public.begin_messaging_number_operation($1,$2)', [assign.operation_id, assign.claim_token]);
  const orderId = randomUUID();
  await control.query('select public.complete_messaging_number_operation($1,$2,$3,$4)', [assign.operation_id, assign.claim_token, orderId, { id: orderId, state: 'processed', status_callback_url: null }]);
  const beforeIndividual = one(await control.query('select status, provider_assignment_state from public.messaging_registration_applications where id=$1', [application.application_id]));
  check('order-level processed does not activate the application', beforeIndividual.status === 'provisioning' && beforeIndividual.provider_assignment_state === 'processed');

  const assignmentId = randomUUID();
  await control.query('select public.record_messaging_number_assignment_state($1,$2,$3,$4)', [application.application_id, assignmentId, 'complete', 'ops-test']);
  const active = one(await control.query(`select a.status, s.assignment_state, s.provisioning_status, s.inbound_ready
    from public.messaging_registration_applications a join public.sms_sender_numbers s on s.provisioning_application_id=a.id where a.id=$1`, [application.application_id]));
  check('only individual complete activates the dedicated sender', active.status === 'active' && active.assignment_state === 'assigned' && active.provisioning_status === 'active' && active.inbound_ready);

  let appendOnlyCode = null;
  try {
    await control.query("update public.messaging_registration_events set detail='tampered' where application_id=$1", [application.application_id]);
  } catch (error) {
    appendOnlyCode = state(error);
  }
  check('registration event history is append-only', appendOnlyCode === '55000', String(appendOnlyCode));

  let ownerComplianceReadCode = null;
  try {
    await control.query('set role authenticated');
    await control.query('select * from public.messaging_compliance_verifications limit 1');
  } catch (error) {
    ownerComplianceReadCode = state(error);
  } finally {
    await control.query('reset role');
  }
  check('authenticated owners cannot read restricted compliance rows', ownerComplianceReadCode === '42501', String(ownerComplianceReadCode));

  const privileges = one(await control.query(`select
    pg_catalog.has_table_privilege('authenticated','public.messaging_registration_applications','select') as owner_select,
    pg_catalog.has_table_privilege('authenticated','public.messaging_registration_applications','insert') as owner_insert,
    pg_catalog.has_table_privilege('authenticated','public.messaging_compliance_verifications','select') as owner_compliance_select,
    pg_catalog.has_table_privilege('service_role','public.messaging_compliance_verifications','select') as service_compliance_select,
    pg_catalog.has_table_privilege('service_role','public.messaging_compliance_verifications','update') as service_compliance_update,
    pg_catalog.has_function_privilege('service_role','public.record_messaging_compliance_verification(uuid,text,text,text)','execute') as service_verify,
    pg_catalog.has_function_privilege('authenticated','public.record_messaging_compliance_verification(uuid,text,text,text)','execute') as owner_verify,
    pg_catalog.has_function_privilege('service_role','public.claim_messaging_number_operation(uuid,text,text,text,jsonb)','execute') as service_claim,
    pg_catalog.has_function_privilege('authenticated','public.claim_messaging_number_operation(uuid,text,text,text,jsonb)','execute') as owner_claim`));
  check(
    'owners are read-only while compliance storage and mutation RPC remain service-only',
    privileges.owner_select
      && !privileges.owner_insert
      && !privileges.owner_compliance_select
      && privileges.service_compliance_select
      && !privileges.service_compliance_update
      && privileges.service_verify
      && !privileges.owner_verify
      && privileges.service_claim
      && !privileges.owner_claim,
  );

  const hardening = readFileSync(HARDENING, 'utf8');
  await control.query(hardening);
  await control.query(hardening);
  check('hardening migration applies twice on PostgreSQL 17', true);

  const hardenedAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [hardenedAccount, 'Hardened Test']);
  const hardened = await submit(control, hardenedAccount, randomUUID());
  const hardenedBrand = randomUUID();
  const hardenedCampaign = randomUUID();
  await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    hardened.application_id, '6789', 'case-hardened', 'ops-test',
  ]);
  let mismatchedBindingCode = null;
  try {
    await control.query(`select public.review_messaging_registration_application_v2(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    )`, [
      hardened.application_id, 'approved', 'Vetted downstream business and carrier campaign.',
      hardenedBrand, hardenedCampaign, 'complete', 'complete', 'LOW_VOLUME_MIXED',
      'Wrong Legal Name', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
    ]);
  } catch (error) {
    mismatchedBindingCode = state(error);
  }
  await control.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    hardened.application_id, 'approved', 'Vetted downstream business and carrier campaign.',
    hardenedBrand, hardenedCampaign, 'complete', 'complete', 'LOW_VOLUME_MIXED',
    'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  check('approval rejects a carrier campaign snapshot bound to another legal business', mismatchedBindingCode === '55000', String(mismatchedBindingCode));

  const hardenedNumber = '+12485550150';
  await control.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [
    hardened.application_id, hardenedNumber, 'MI', 'Royal Oak', 'ops-test',
  ]);
  const hardenedPurchasePayload = {
    number: hardenedNumber,
    monthly_price_cents: 50,
    monthly_spend_ceiling_cents: 100000,
  };
  let missingPriceCode = null;
  try {
    await control.query('select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)', [
      hardened.application_id, 'purchase_number', `messaging:${hardened.application_id}:missing-price`,
      fingerprint({ number: hardenedNumber }), { number: hardenedNumber },
    ]);
  } catch (error) {
    missingPriceCode = state(error);
  }
  const hardenedPurchase = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      hardened.application_id, 'purchase_number', `messaging:${hardened.application_id}:purchase:${hardenedNumber}`,
      fingerprint(hardenedPurchasePayload), hardenedPurchasePayload,
    ],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [hardenedPurchase.operation_id, hardenedPurchase.claim_token]);
  const hardenedProviderNumber = randomUUID();
  let missingSmsCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
      hardenedPurchase.operation_id, hardenedPurchase.claim_token, hardenedProviderNumber,
      { id: hardenedProviderNumber, number: hardenedNumber, capabilities: ['voice'] },
    ]);
  } catch (error) {
    missingSmsCode = state(error);
  }
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    hardenedPurchase.operation_id, hardenedPurchase.claim_token, hardenedProviderNumber,
    { id: hardenedProviderNumber, number: hardenedNumber, capabilities: ['voice', 'sms'] },
  ]);
  check('purchase requires both configured price evidence and provider-confirmed SMS capability', missingPriceCode === '22023' && missingSmsCode === '22000', `${missingPriceCode}/${missingSmsCode}`);

  const hardenedInbound = 'https://app.example.com/api/sms/inbound';
  const hardenedConfigurePayload = {
    provider_number_id: hardenedProviderNumber,
    number: hardenedNumber,
    inbound_url: hardenedInbound,
    message_handler: 'laml_webhooks',
    message_request_method: 'POST',
  };
  const hardenedConfigure = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      hardened.application_id, 'configure_inbound', `messaging:${hardened.application_id}:configure:${hardenedProviderNumber}`,
      fingerprint(hardenedConfigurePayload), hardenedConfigurePayload,
    ],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [hardenedConfigure.operation_id, hardenedConfigure.claim_token]);
  let missingPostCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
      hardenedConfigure.operation_id, hardenedConfigure.claim_token, hardenedProviderNumber,
      { id: hardenedProviderNumber, number: hardenedNumber, message_handler: 'laml_webhooks', message_request_url: hardenedInbound, message_request_method: 'GET' },
    ]);
  } catch (error) {
    missingPostCode = state(error);
  }
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    hardenedConfigure.operation_id, hardenedConfigure.claim_token, hardenedProviderNumber,
    { id: hardenedProviderNumber, number: hardenedNumber, message_handler: 'laml_webhooks', message_request_url: hardenedInbound, message_request_method: 'POST' },
  ]);
  const hardenedInboundProjection = one(await control.query(`select a.inbound_request_method,s.inbound_request_method as sender_method,s.inbound_ready
    from public.messaging_registration_applications a join public.sms_sender_numbers s on s.provisioning_application_id=a.id
    where a.id=$1`, [hardened.application_id]));
  check(
    'inbound readiness requires and records POST on both application and sender inventory',
    missingPostCode === '22000'
      && hardenedInboundProjection.inbound_request_method === 'POST'
      && hardenedInboundProjection.sender_method === 'POST'
      && hardenedInboundProjection.inbound_ready,
    String(missingPostCode),
  );

  await control.query("update public.messaging_registration_applications set purchased_at=pg_catalog.now()-interval '2 hours' where id=$1", [hardened.application_id]);
  const assignPayloadV2 = { campaign_id: hardenedCampaign, number: hardenedNumber, status_callback_url: null };
  const hardenedAssign = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      hardened.application_id, 'assign_campaign', `messaging:${hardened.application_id}:assign:${hardenedCampaign}:${hardenedNumber}`,
      fingerprint(assignPayloadV2), assignPayloadV2,
    ],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [hardenedAssign.operation_id, hardenedAssign.claim_token]);
  const hardenedOrder = randomUUID();
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    hardenedAssign.operation_id, hardenedAssign.claim_token, hardenedOrder,
    { id: hardenedOrder, state: 'processed', status_callback_url: null },
  ]);
  let wrongProviderNumberCode = null;
  try {
    await control.query('select public.record_messaging_number_assignment_state_v2($1,$2,$3,$4,$5)', [
      hardened.application_id, randomUUID(), 'complete', randomUUID(), 'ops-test',
    ]);
  } catch (error) {
    wrongProviderNumberCode = state(error);
  }
  await control.query('select public.record_messaging_number_assignment_state_v2($1,$2,$3,$4,$5)', [
    hardened.application_id, randomUUID(), 'complete', hardenedProviderNumber, 'ops-test',
  ]);
  const hardenedActive = one(await control.query(`select a.status,s.provisioning_status
    from public.messaging_registration_applications a join public.sms_sender_numbers s on s.provisioning_application_id=a.id
    where a.id=$1`, [hardened.application_id]));
  check(
    'individual assignment activation compares the exact provider phone resource',
    wrongProviderNumberCode === '55000' && hardenedActive.status === 'active' && hardenedActive.provisioning_status === 'active',
    String(wrongProviderNumberCode),
  );

  const recoveryAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [recoveryAccount, 'Recovery Test']);
  const recovery = await submit(control, recoveryAccount, randomUUID());
  const recoveryBrand = randomUUID();
  const recoveryCampaign = randomUUID();
  await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    recovery.application_id, '6789', 'case-recovery', 'ops-test',
  ]);
  await control.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    recovery.application_id, 'approved', 'Vetted downstream business and carrier campaign.',
    recoveryBrand, recoveryCampaign, 'complete', 'complete', 'LOW_VOLUME_MIXED',
    'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  const recoveryNumber = '+12485550151';
  await control.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [
    recovery.application_id, recoveryNumber, 'MI', 'Royal Oak', 'ops-test',
  ]);
  const recoveryPayload = { number: recoveryNumber, monthly_price_cents: 50, monthly_spend_ceiling_cents: 100000 };
  const recoveryClaim = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      recovery.application_id, 'purchase_number', `messaging:${recovery.application_id}:purchase:${recoveryNumber}`,
      fingerprint(recoveryPayload), recoveryPayload,
    ],
  ));

  const budgetAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [budgetAccount, 'Budget Test']);
  const budget = await submit(control, budgetAccount, randomUUID());
  const budgetBrand = randomUUID();
  const budgetCampaign = randomUUID();
  await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
    budget.application_id, '6789', 'case-budget', 'ops-test',
  ]);
  await control.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    budget.application_id, 'approved', 'Vetted downstream business and carrier campaign.',
    budgetBrand, budgetCampaign, 'complete', 'complete', 'LOW_VOLUME_MIXED',
    'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  const budgetNumber = '+12485550152';
  await control.query('select public.record_messaging_number_candidate($1,$2,$3,$4,$5)', [
    budget.application_id, budgetNumber, 'MI', 'Royal Oak', 'ops-test',
  ]);
  const budgetPayload = { number: budgetNumber, monthly_price_cents: 50, monthly_spend_ceiling_cents: 150 };
  let budgetCeilingCode = null;
  try {
    await control.query('select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)', [
      budget.application_id, 'purchase_number', `messaging:${budget.application_id}:purchase:${budgetNumber}`,
      fingerprint(budgetPayload), budgetPayload,
    ]);
  } catch (error) {
    budgetCeilingCode = state(error);
  }
  check(
    'aggregate spend ceiling counts an unresolved purchase as a monthly reservation',
    budgetCeilingCode === '54000',
    String(budgetCeilingCode),
  );

  await control.query('select public.begin_messaging_number_operation($1,$2)', [recoveryClaim.operation_id, recoveryClaim.claim_token]);
  const recoveryProviderNumber = randomUUID();
  const recoveryResult = { id: recoveryProviderNumber, number: recoveryNumber, capabilities: ['sms'] };
  await control.query('select public.mark_messaging_number_operation_indeterminate_v2($1,$2,$3,$4,$5,$6)', [
    recoveryClaim.operation_id, recoveryClaim.claim_token, 'db_projection_failed', 'Provider returned success before projection failed.',
    recoveryProviderNumber, recoveryResult,
  ]);
  const preserved = one(await control.query('select state,provider_object_id,provider_result from public.messaging_number_provisioning_operations where id=$1', [recoveryClaim.operation_id]));
  await control.query('select public.resolve_messaging_number_operation_v2($1,$2,$3,$4,$5)', [
    recoveryClaim.operation_id, 'confirmed_succeeded', recoveryProviderNumber, recoveryResult, 'ops-test',
  ]);
  const recovered = one(await control.query('select status,provider_number_id,purchased_number from public.messaging_registration_applications where id=$1', [recovery.application_id]));
  check(
    'indeterminate recovery preserves and imports exact provider success without a second operation',
    preserved.state === 'indeterminate'
      && preserved.provider_object_id === recoveryProviderNumber
      && preserved.provider_result.id === recoveryProviderNumber
      && recovered.status === 'provisioning'
      && recovered.provider_number_id === recoveryProviderNumber
      && recovered.purchased_number === recoveryNumber,
  );

  const hardenedPrivileges = one(await control.query(`select
    pg_catalog.has_function_privilege('service_role','public.claim_messaging_number_operation(uuid,text,text,text,jsonb)','execute') as old_claim,
    pg_catalog.has_function_privilege('service_role','public.claim_messaging_number_operation_v2(uuid,text,text,text,jsonb)','execute') as new_claim,
    pg_catalog.has_function_privilege('service_role','public.record_messaging_number_assignment_state(uuid,text,text,text)','execute') as old_activation,
    pg_catalog.has_function_privilege('service_role','public.record_messaging_number_assignment_state_v2(uuid,text,text,text,text)','execute') as new_activation`));
  check('service role can call only the hardened claim and activation RPCs', !hardenedPrivileges.old_claim && hardenedPrivileges.new_claim && !hardenedPrivileges.old_activation && hardenedPrivileges.new_activation);

  const adversarialHardening = readFileSync(ADVERSARIAL_HARDENING, 'utf8');
  await control.query(adversarialHardening);
  await control.query(adversarialHardening);
  check('adversarial hardening migration applies twice on PostgreSQL 17', true);

  const legacyQuarantine = one(await control.query(`select
      a.status,
      a.provider_phone_verified_at,
      a.provider_sms_capable,
      a.inbound_message_handler,
      s.provisioning_status,
      s.assignment_state,
      s.suspended_at
    from public.messaging_registration_applications a
    join public.sms_sender_numbers s on s.provisioning_application_id=a.id
    where a.id=$1`, [application.application_id]));
  const activationConstraints = one(await control.query(`select
      pg_catalog.bool_and(c.convalidated) filter (
        where c.conname in (
          'messaging_registration_application_verified_activation_shape',
          'sms_sender_numbers_activation_shape'
        )
      ) as all_validated,
      pg_catalog.count(*) filter (
        where c.conname in (
          'messaging_registration_application_verified_activation_shape',
          'sms_sender_numbers_activation_shape'
        )
      )::integer as constraint_count
    from pg_catalog.pg_constraint c`));
  check(
    'legacy active application and sender are quarantined before validated final-proof constraints',
    legacyQuarantine.status === 'suspended'
      && legacyQuarantine.provider_phone_verified_at === null
      && legacyQuarantine.provider_sms_capable === null
      && legacyQuarantine.inbound_message_handler === null
      && legacyQuarantine.provisioning_status === 'suspended'
      && legacyQuarantine.assignment_state === 'suspended'
      && legacyQuarantine.suspended_at !== null
      && activationConstraints.constraint_count === 2
      && activationConstraints.all_validated,
  );

  let invalidLegacyReactivateCode = null;
  try {
    await control.query("update public.messaging_registration_applications set status='active' where id=$1", [application.application_id]);
  } catch (error) {
    invalidLegacyReactivateCode = state(error);
  }
  let invalidSenderReactivateCode = null;
  try {
    await control.query("update public.sms_sender_numbers set provisioning_status='active',assignment_state='assigned',suspended_at=null where provisioning_application_id=$1", [application.application_id]);
  } catch (error) {
    invalidSenderReactivateCode = state(error);
  }
  check(
    'validated constraints reject reactivation without campaign, SMS, handler, and POST proof',
    invalidLegacyReactivateCode === '23514' && invalidSenderReactivateCode === '23514',
    `${invalidLegacyReactivateCode}/${invalidSenderReactivateCode}`,
  );

  const complianceBeforeRewrite = one(await control.query(
    'select ein_last_four from public.messaging_compliance_verifications where application_id=$1',
    [budget.application_id],
  ));
  let approvedComplianceRewriteCode = null;
  try {
    await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
      budget.application_id, '9999', 'case-illegal-rewrite', 'ops-test',
    ]);
  } catch (error) {
    approvedComplianceRewriteCode = state(error);
  }
  const complianceAfterRewrite = one(await control.query(
    'select ein_last_four from public.messaging_compliance_verifications where application_id=$1',
    [budget.application_id],
  ));
  check(
    'approved compliance evidence is immutable and cannot stale the carrier binding',
    approvedComplianceRewriteCode === '55000'
      && complianceBeforeRewrite.ein_last_four === '6789'
      && complianceAfterRewrite.ein_last_four === '6789',
    String(approvedComplianceRewriteCode),
  );

  let approvedBindingReplacementCode = null;
  let approvedReviewDowngradeCode = null;
  try {
    await control.query(`select public.review_messaging_registration_application_v2(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    )`, [
      budget.application_id, 'approved', 'Attempted carrier binding replacement.',
      randomUUID(), randomUUID(), 'complete', 'complete', 'LOW_VOLUME_MIXED',
      'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
    ]);
  } catch (error) {
    approvedBindingReplacementCode = state(error);
  }
  try {
    await control.query(`select public.review_messaging_registration_application_v2(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    )`, [
      budget.application_id, 'action_required', 'Attempted review-path downgrade.',
      null, null, null, null, null, null, null, null, null, null, 'ops-test',
    ]);
  } catch (error) {
    approvedReviewDowngradeCode = state(error);
  }
  const bindingAfterReviewAttempts = one(await control.query(
    'select status,provider_brand_id,provider_campaign_id,provider_brand_state,provider_campaign_state from public.messaging_registration_applications where id=$1',
    [budget.application_id],
  ));
  check(
    'review RPC cannot replace or downgrade an approved carrier binding',
    approvedBindingReplacementCode === '55000'
      && approvedReviewDowngradeCode === '55000'
      && bindingAfterReviewAttempts.status === 'approved'
      && bindingAfterReviewAttempts.provider_brand_id === budgetBrand
      && bindingAfterReviewAttempts.provider_campaign_id === budgetCampaign
      && bindingAfterReviewAttempts.provider_brand_state === 'complete'
      && bindingAfterReviewAttempts.provider_campaign_state === 'complete',
    `${approvedBindingReplacementCode}/${approvedReviewDowngradeCode}`,
  );

  await control.query(`select public.record_messaging_campaign_verification_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )`, [
    budget.application_id, budgetBrand, budgetCampaign,
    'complete', 'failed', 'LOW_VOLUME_MIXED', null, null, null, null,
    new Date().toISOString(), 'ops-test',
  ]);
  const downgradedUnpurchased = one(await control.query(
    'select status,provider_brand_id,provider_campaign_id,provider_number_id from public.messaging_registration_applications where id=$1',
    [budget.application_id],
  ));
  let downgradedComplianceRewriteCode = null;
  try {
    await control.query('select public.record_messaging_compliance_verification($1,$2,$3,$4)', [
      budget.application_id, '9998', 'case-downgraded-rewrite', 'ops-test',
    ]);
  } catch (error) {
    downgradedComplianceRewriteCode = state(error);
  }
  const complianceAfterDowngradedRewrite = one(await control.query(
    'select ein_last_four from public.messaging_compliance_verifications where application_id=$1',
    [budget.application_id],
  ));
  check(
    'action-required downgrade cannot rewrite compliance while an approved carrier binding remains',
    downgradedUnpurchased.status === 'action_required'
      && downgradedUnpurchased.provider_brand_id === budgetBrand
      && downgradedUnpurchased.provider_campaign_id === budgetCampaign
      && downgradedUnpurchased.provider_number_id === null
      && downgradedComplianceRewriteCode === '55000'
      && complianceAfterDowngradedRewrite.ein_last_four === '6789',
    String(downgradedComplianceRewriteCode),
  );

  let boundResubmissionCode = null;
  try {
    await submit(control, budgetAccount, randomUUID(), 'c');
  } catch (error) {
    boundResubmissionCode = state(error);
  }
  const boundAfterResubmission = one(await control.query(
    'select status,revision,provider_brand_id,provider_campaign_id from public.messaging_registration_applications where id=$1',
    [budget.application_id],
  ));
  check(
    'carrier-downgraded bound application cannot resubmit into a stale submitted dead state',
    boundResubmissionCode === '55000'
      && boundAfterResubmission.status === 'action_required'
      && Number(boundAfterResubmission.revision) === 1
      && boundAfterResubmission.provider_brand_id === budgetBrand
      && boundAfterResubmission.provider_campaign_id === budgetCampaign,
    String(boundResubmissionCode),
  );

  const editableActionAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [editableActionAccount, 'Editable Action Test']);
  const editableAction = await submit(control, editableActionAccount, randomUUID());
  await control.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    editableAction.application_id, 'action_required', 'Please correct the preapproval application.',
    null, null, null, null, null, null, null, null, null, null, 'ops-test',
  ]);
  await submit(control, editableActionAccount, randomUUID(), 'b');

  const editableRejectedAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [editableRejectedAccount, 'Editable Rejected Test']);
  const editableRejected = await submit(control, editableRejectedAccount, randomUUID());
  await control.query(`select public.review_messaging_registration_application_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
  )`, [
    editableRejected.application_id, 'rejected', 'Please submit a corrected preapproval application.',
    null, null, null, null, null, null, null, null, null, null, 'ops-test',
  ]);
  await submit(control, editableRejectedAccount, randomUUID(), 'b');
  const editableRows = await control.query(`select status,revision,provider_brand_id,provider_campaign_id,provider_number_id
    from public.messaging_registration_applications where id=any($1::uuid[]) order by id`, [
    [editableAction.application_id, editableRejected.application_id],
  ]);
  check(
    'unbound preapproval action-required and rejected applications remain editable',
    editableRows.rowCount === 2
      && editableRows.rows.every((row) => row.status === 'submitted'
        && Number(row.revision) === 2
        && row.provider_brand_id === null
        && row.provider_campaign_id === null
        && row.provider_number_id === null),
  );

  await control.query(`select public.record_messaging_campaign_verification_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )`, [
    budget.application_id, budgetBrand, budgetCampaign,
    'complete', 'complete', 'LOW_VOLUME_MIXED',
    'Acme Roofing LLC', 'Acme Roofing', 'acme.example.com', '6789',
    new Date().toISOString(), 'ops-test',
  ]);
  const restoredPrePurchase = one(await control.query(`select
      a.status,a.status_detail,r.status as registration_status,r.status_detail as registration_detail
    from public.messaging_registration_applications a
    join public.messaging_registrations r on r.account_id=a.account_id
    where a.id=$1`, [budget.application_id]));
  check(
    'fresh exact campaign proof restores only the carrier-downgraded pre-purchase application',
    restoredPrePurchase.status === 'approved'
      && restoredPrePurchase.status_detail === null
      && restoredPrePurchase.registration_status === 'in_review'
      && restoredPrePurchase.registration_detail === null,
  );

  const initialPolicy = one(await control.query(
    'select * from public.set_messaging_number_spend_policy($1,$2,$3,$4)',
    ['signalwire', 50, 100000, 'ops-policy-test'],
  ));
  const legacySpendSnapshots = one(await control.query(`select
      pg_catalog.count(*)::integer as purchase_count,
      pg_catalog.count(*) filter (
        where monthly_unit_price_cents=50
          and aggregate_monthly_ceiling_cents=100000
          and spend_policy_revision=$1
      )::integer as priced_count
    from public.messaging_number_provisioning_operations
    where operation_type='purchase_number'`, [initialPolicy.revision]));
  check(
    'service policy explicitly backfills every legacy purchase operation with an authoritative snapshot',
    initialPolicy.provider === 'signalwire'
      && initialPolicy.currency === 'USD'
      && initialPolicy.monthly_unit_price_cents === '50'
      && initialPolicy.aggregate_monthly_ceiling_cents === '100000'
      && legacySpendSnapshots.purchase_count > 0
      && legacySpendSnapshots.priced_count === legacySpendSnapshots.purchase_count,
  );

  const finalAccount = randomUUID();
  await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [finalAccount, 'Final Proof Test']);
  const finalApplication = await submit(control, finalAccount, randomUUID());
  const finalNumber = '+12485550153';
  const finalBinding = await approveV2AndCandidate(control, finalApplication.application_id, finalNumber, 'final-proof');
  const finalPurchasePayload = {
    number: finalNumber,
    monthly_price_cents: 50,
    monthly_spend_ceiling_cents: 100000,
  };
  const finalPurchaseKey = `messaging:${finalApplication.application_id}:purchase:${finalNumber}`;
  const finalPurchase = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [finalApplication.application_id, 'purchase_number', finalPurchaseKey, fingerprint(finalPurchasePayload), finalPurchasePayload],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [finalPurchase.operation_id, finalPurchase.claim_token]);
  const finalProviderNumber = randomUUID();
  let mismatchedCompletionIdentityCode = null;
  try {
    await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
      finalPurchase.operation_id, finalPurchase.claim_token, randomUUID(),
      { id: finalProviderNumber, number: finalNumber, capabilities: ['voice'] },
    ]);
  } catch (error) {
    mismatchedCompletionIdentityCode = state(error);
  }
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    finalPurchase.operation_id, finalPurchase.claim_token, finalProviderNumber,
    { id: finalProviderNumber, number: finalNumber, capabilities: ['voice'] },
  ]);
  const voiceOnlyPurchase = one(await control.query(`select
      a.status,a.provider_number_id,a.provider_sms_capable,
      o.state,o.provider_object_id,o.provider_result->>'id' as result_id,
      o.monthly_unit_price_cents,o.spend_policy_revision
    from public.messaging_registration_applications a
    join public.messaging_number_provisioning_operations o on o.application_id=a.id and o.operation_type='purchase_number'
    where a.id=$1`, [finalApplication.application_id]));
  check(
    'purchase accepts a pre-assignment voice-only phone but binds the exact durable provider object',
    mismatchedCompletionIdentityCode === '22000'
      && voiceOnlyPurchase.status === 'provisioning'
      && voiceOnlyPurchase.provider_number_id === finalProviderNumber
      && voiceOnlyPurchase.provider_sms_capable === null
      && voiceOnlyPurchase.state === 'succeeded'
      && voiceOnlyPurchase.provider_object_id === finalProviderNumber
      && voiceOnlyPurchase.result_id === finalProviderNumber
      && voiceOnlyPurchase.monthly_unit_price_cents === '50'
      && voiceOnlyPurchase.spend_policy_revision === initialPolicy.revision,
    String(mismatchedCompletionIdentityCode),
  );

  const revisedPolicy = one(await control.query(
    'select * from public.set_messaging_number_spend_policy($1,$2,$3,$4)',
    ['signalwire', 75, 100000, 'ops-policy-revision-test'],
  ));
  const oldPolicyReplay = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [finalApplication.application_id, 'purchase_number', finalPurchaseKey, fingerprint(finalPurchasePayload), finalPurchasePayload],
  ));
  check(
    'completed purchase remains replayable under its immutable snapshot after policy changes',
    Number(revisedPolicy.revision) === Number(initialPolicy.revision) + 1
      && oldPolicyReplay.claim_status === 'replay',
  );

  const finalInbound = 'https://app.example.com/api/sms/inbound';
  const finalConfigurePayload = {
    provider_number_id: finalProviderNumber,
    number: finalNumber,
    inbound_url: finalInbound,
    message_handler: 'laml_webhooks',
    message_request_method: 'POST',
  };
  const finalConfigure = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      finalApplication.application_id, 'configure_inbound',
      `messaging:${finalApplication.application_id}:configure:${finalProviderNumber}`,
      fingerprint(finalConfigurePayload), finalConfigurePayload,
    ],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [finalConfigure.operation_id, finalConfigure.claim_token]);
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    finalConfigure.operation_id, finalConfigure.claim_token, finalProviderNumber,
    {
      id: finalProviderNumber, number: finalNumber, message_handler: 'laml_webhooks',
      message_request_url: finalInbound, message_request_method: 'POST',
    },
  ]);
  await control.query("update public.messaging_registration_applications set purchased_at=pg_catalog.now()-interval '2 hours' where id=$1", [finalApplication.application_id]);
  await control.query(`select public.record_messaging_campaign_verification_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )`, [
    finalApplication.application_id, finalBinding.brand, finalBinding.campaign,
    'complete', 'complete', 'LOW_VOLUME_MIXED', 'Acme Roofing LLC', 'Acme Roofing',
    'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  const finalAssignPayload = { campaign_id: finalBinding.campaign, number: finalNumber, status_callback_url: null };
  const finalAssign = one(await control.query(
    'select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)',
    [
      finalApplication.application_id, 'assign_campaign',
      `messaging:${finalApplication.application_id}:assign:${finalBinding.campaign}:${finalNumber}`,
      fingerprint(finalAssignPayload), finalAssignPayload,
    ],
  ));
  await control.query('select public.begin_messaging_number_operation($1,$2)', [finalAssign.operation_id, finalAssign.claim_token]);
  const finalOrder = randomUUID();
  await control.query('select public.complete_messaging_number_operation_v2($1,$2,$3,$4)', [
    finalAssign.operation_id, finalAssign.claim_token, finalOrder,
    { id: finalOrder, state: 'processed', status_callback_url: null },
  ]);
  await control.query(`select public.record_messaging_campaign_verification_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )`, [
    finalApplication.application_id, finalBinding.brand, finalBinding.campaign,
    'complete', 'complete', 'LOW_VOLUME_MIXED', 'Acme Roofing LLC', 'Acme Roofing',
    'acme.example.com', '6789', new Date().toISOString(), 'ops-test',
  ]);
  const finalAssignment = randomUUID();
  let missingFinalSmsCode = null;
  try {
    await control.query('select public.record_messaging_number_assignment_state_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
      finalApplication.application_id, finalAssignment, 'complete', finalProviderNumber,
      finalNumber, false, 'laml_webhooks', finalInbound, 'POST', new Date().toISOString(), 'ops-test',
    ]);
  } catch (error) {
    missingFinalSmsCode = state(error);
  }
  await control.query('select public.record_messaging_number_assignment_state_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
    finalApplication.application_id, finalAssignment, 'complete', finalProviderNumber,
    finalNumber, true, 'laml_webhooks', finalInbound, 'POST', new Date().toISOString(), 'ops-test',
  ]);
  const finalActive = one(await control.query(`select
      a.status,a.provider_sms_capable,a.provider_phone_verified_at,a.inbound_message_handler,
      s.provisioning_status,s.provider_sms_capable as sender_sms_capable,
      s.provider_phone_verified_at as sender_phone_verified_at,s.inbound_message_handler as sender_handler
    from public.messaging_registration_applications a
    join public.sms_sender_numbers s on s.provisioning_application_id=a.id
    where a.id=$1`, [finalApplication.application_id]));
  check(
    'only final live SMS phone and exact POST handler proof activates application and sender',
    missingFinalSmsCode === '55000'
      && finalActive.status === 'active'
      && finalActive.provider_sms_capable
      && finalActive.provider_phone_verified_at !== null
      && finalActive.inbound_message_handler === 'laml_webhooks'
      && finalActive.provisioning_status === 'active'
      && finalActive.sender_sms_capable
      && finalActive.sender_phone_verified_at !== null
      && finalActive.sender_handler === 'laml_webhooks',
    String(missingFinalSmsCode),
  );

  await control.query(`select public.record_messaging_campaign_verification_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  )`, [
    finalApplication.application_id, finalBinding.brand, finalBinding.campaign,
    'complete', 'failed', 'LOW_VOLUME_MIXED', null, null, null, null,
    new Date().toISOString(), 'ops-test',
  ]);
  const downgraded = one(await control.query(`select
      a.status,a.provider_brand_state,a.provider_campaign_state,a.suspended_at,
      s.provisioning_status,s.assignment_state,s.provider_campaign_state as sender_campaign_state,s.suspended_at as sender_suspended_at
    from public.messaging_registration_applications a
    join public.sms_sender_numbers s on s.provisioning_application_id=a.id
    where a.id=$1`, [finalApplication.application_id]));
  check(
    'carrier campaign downgrade is persisted and immediately suspends active application and sender',
    downgraded.status === 'suspended'
      && downgraded.provider_brand_state === 'complete'
      && downgraded.provider_campaign_state === 'failed'
      && downgraded.suspended_at !== null
      && downgraded.provisioning_status === 'suspended'
      && downgraded.assignment_state === 'suspended'
      && downgraded.sender_campaign_state === 'failed'
      && downgraded.sender_suspended_at !== null,
  );

  const spendBeforeRace = one(await control.query(`select coalesce(pg_catalog.sum(o.monthly_unit_price_cents),0) as total
    from public.messaging_number_provisioning_operations o
    join public.messaging_registration_applications a on a.id=o.application_id
    where a.provider='signalwire' and o.operation_type='purchase_number'
      and (
        (o.state in ('pending','claimed','request_started','indeterminate') and a.provider_number_id is null)
        or (o.state='succeeded' and a.provider_number_id is not null)
      )`));
  const raceCeiling = Number(spendBeforeRace.total) + 75;
  const racePolicy = one(await control.query(
    'select * from public.set_messaging_number_spend_policy($1,$2,$3,$4)',
    ['signalwire', 75, raceCeiling, 'ops-race-policy-test'],
  ));
  const raceApplications = [];
  for (const [suffix, raceNumber] of [['a', '+12485550154'], ['b', '+12485550155']]) {
    const raceAccount = randomUUID();
    await control.query('insert into public.accounts(id,business_name) values ($1,$2)', [raceAccount, `Race ${suffix}`]);
    const raceApplication = await submit(control, raceAccount, randomUUID());
    await approveV2AndCandidate(control, raceApplication.application_id, raceNumber, `race-${suffix}`);
    raceApplications.push({ applicationId: raceApplication.application_id, number: raceNumber });
  }
  const wrongPolicyPayload = { number: raceApplications[0].number, monthly_price_cents: 50, monthly_spend_ceiling_cents: raceCeiling };
  let wrongPolicyCode = null;
  try {
    await control.query('select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)', [
      raceApplications[0].applicationId, 'purchase_number', `messaging:${raceApplications[0].applicationId}:wrong-policy`,
      fingerprint(wrongPolicyPayload), wrongPolicyPayload,
    ]);
  } catch (error) {
    wrongPolicyCode = state(error);
  }
  const raceClaims = await Promise.allSettled(raceApplications.map((entry, index) => {
    const payload = { number: entry.number, monthly_price_cents: 75, monthly_spend_ceiling_cents: raceCeiling };
    const client = index === 0 ? control : worker;
    return client.query('select * from public.claim_messaging_number_operation_v2($1,$2,$3,$4,$5)', [
      entry.applicationId, 'purchase_number', `messaging:${entry.applicationId}:race`, fingerprint(payload), payload,
    ]);
  }));
  const raceSuccesses = raceClaims.filter((result) => result.status === 'fulfilled').length;
  const raceCeilingFailures = raceClaims.filter((result) => result.status === 'rejected' && state(result.reason) === '54000').length;
  const spendAfterRace = one(await control.query(`select coalesce(pg_catalog.sum(o.monthly_unit_price_cents),0) as total
    from public.messaging_number_provisioning_operations o
    join public.messaging_registration_applications a on a.id=o.application_id
    where a.provider='signalwire' and o.operation_type='purchase_number'
      and (
        (o.state in ('pending','claimed','request_started','indeterminate') and a.provider_number_id is null)
        or (o.state='succeeded' and a.provider_number_id is not null)
      )`));
  check(
    'authoritative mixed-price sum and advisory lock allow exactly one concurrent reservation',
    wrongPolicyCode === '22023'
      && racePolicy.monthly_unit_price_cents === '75'
      && raceSuccesses === 1
      && raceCeilingFailures === 1
      && Number(spendAfterRace.total) === raceCeiling,
    `${wrongPolicyCode}/${raceSuccesses}/${raceCeilingFailures}/${spendAfterRace.total}`,
  );

  const lockDefinitions = one(await control.query(`select
      pg_catalog.pg_get_functiondef('public.complete_messaging_number_operation(uuid,uuid,text,jsonb)'::regprocedure) as completion,
      pg_catalog.pg_get_functiondef('public.resolve_messaging_number_operation_v2(uuid,text,text,jsonb,text)'::regprocedure) as recovery`));
  const appThenOperation = (definition) => /select \* into strict v_application[\s\S]+?from public\.messaging_registration_applications[\s\S]+?for update;[\s\S]+?select \* into strict v_operation[\s\S]+?from public\.messaging_number_provisioning_operations[\s\S]+?for update;/i.test(definition);
  check(
    'completion and recovery acquire application before operation',
    appThenOperation(lockDefinitions.completion) && appThenOperation(lockDefinitions.recovery),
  );

  const finalPrivileges = one(await control.query(`select
      pg_catalog.has_table_privilege('service_role','public.messaging_number_spend_policies','select') as service_policy_read,
      pg_catalog.has_table_privilege('service_role','public.messaging_number_spend_policies','update') as service_policy_update,
      pg_catalog.has_table_privilege('authenticated','public.messaging_number_spend_policies','select') as owner_policy_read,
      pg_catalog.has_function_privilege('service_role','public.set_messaging_number_spend_policy(text,bigint,bigint,text)','execute') as service_policy_set,
      pg_catalog.has_function_privilege('authenticated','public.set_messaging_number_spend_policy(text,bigint,bigint,text)','execute') as owner_policy_set,
      pg_catalog.has_function_privilege('service_role','public.record_messaging_number_assignment_state_v2(uuid,text,text,text,text)','execute') as old_activation,
      pg_catalog.has_function_privilege('service_role','public.record_messaging_number_assignment_state_v3(uuid,text,text,text,text,boolean,text,text,text,timestamptz,text)','execute') as final_activation,
      pg_catalog.has_function_privilege('authenticated','public.record_messaging_number_assignment_state_v3(uuid,text,text,text,text,boolean,text,text,text,timestamptz,text)','execute') as owner_final_activation`));
  check(
    'spend policy and final activation retain least-privilege service-only contracts',
    finalPrivileges.service_policy_read
      && !finalPrivileges.service_policy_update
      && !finalPrivileges.owner_policy_read
      && finalPrivileges.service_policy_set
      && !finalPrivileges.owner_policy_set
      && !finalPrivileges.old_activation
      && finalPrivileges.final_activation
      && !finalPrivileges.owner_final_activation,
  );
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const client of [worker, control]) {
    try { await client?.end(); } catch { /* already closed */ }
  }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 19) {
  console.error('The harness did not run every check; a short run is not a pass.');
  process.exit(2);
}
process.exit(failed.length === 0 ? 0 : 1);
