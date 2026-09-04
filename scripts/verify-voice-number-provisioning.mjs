// Exercise the AI Voice number provisioning migration on disposable PostgreSQL 17.
// No hosted credentials or provider APIs are used.

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

const MIGRATION = 'migrations/20260903231235_ai_voice_number_provisioning.sql';
const PORT = Number(process.env.LGQ_VOICE_NUMBER_CHECK_PORT || 54383);
const execFileAsync = promisify(execFile);

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

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const platformPackage = process.platform === 'win32'
  ? 'windows-x64'
  : process.platform === 'darwin'
    ? 'darwin-arm64'
    : 'linux-x64';
const pgBin = join(process.cwd(), 'node_modules', '@embedded-postgres', platformPackage, 'native', 'bin');
process.env.PATH = `${pgBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
const dataDir = mkdtempSync(join(tmpdir(), 'lgq-voice-number-pg17-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

function one(result) {
  if (result.rowCount !== 1) throw new Error(`Expected one row, got ${result.rowCount}.`);
  return result.rows[0];
}

async function rejects(action, pattern) {
  try {
    await action();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

const baseSchema = `
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
  call_tracking_number text,
  call_tracking_verified_at timestamptz,
  ai_voice_route_revision bigint not null default 0,
  suspended_at timestamptz
);

create or replace function public.test_guard_ai_voice_route_revision()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $fn$
begin
  if new.call_tracking_number is distinct from old.call_tracking_number then
    new.ai_voice_route_revision := old.ai_voice_route_revision + 1;
    new.call_tracking_verified_at := null;
  else
    new.ai_voice_route_revision := old.ai_voice_route_revision;
  end if;
  return new;
end
$fn$;
create trigger accounts_ai_voice_route_revision_guard
before update of call_tracking_number, ai_voice_route_revision on public.accounts
for each row execute function public.test_guard_ai_voice_route_revision();

create table public.jobs (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade
);
create table public.leads (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade
);
create table public.sms_sender_numbers (
  id uuid primary key,
  provider text not null default 'signalwire',
  provisioning_status text not null default 'active',
  provider_number_id text,
  e164_number text,
  purpose text
);
create table public.messaging_registration_applications (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null default 'signalwire',
  provider_number_id text,
  purchased_number text
);
create table public.messaging_number_provisioning_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_type text not null,
  idempotency_key text not null unique,
  request_fingerprint text not null,
  request_payload jsonb not null,
  state text not null default 'pending',
  provider_object_id text,
  provider_result jsonb
);
create table public.voice_call_admissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  provider_call_id text not null,
  reservation_id uuid,
  reserved_minutes integer not null default 0,
  admission_state text not null,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  dialed_number text,
  route_revision bigint,
  caller_number text,
  caller_kind text,
  admitted_at timestamptz not null default pg_catalog.now(),
  unique (provider, provider_call_id),
  constraint voice_call_admissions_number_binding_shape check (
    (sender_number_id is null and dialed_number is null and route_revision is null)
    or (sender_number_id is not null and dialed_number is not null and route_revision is not null)
  )
);
create table public.voice_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null,
  provider_call_id text not null
);
create table public.voice_tool_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  target_job_id uuid references public.jobs(id) on delete set null,
  target_lead_id uuid references public.leads(id) on delete set null
);
`;

let client;
let fatal;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice_number_check');
  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_voice_number_check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query(baseSchema);
  const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
  await client.query(sql);
  await client.query(sql);
  check('migration applies twice on PostgreSQL 17', true);

  const accountId = randomUUID();
  const number = '+18103192943';
  const providerId = randomUUID();
  await client.query('insert into public.accounts(id) values($1)', [accountId]);

  check(
    'candidate and price evidence fails closed without a spend policy',
    await rejects(
      () => client.query(
        `select * from public.record_voice_number_candidate_observation(
           'signalwire',$1,true,$2,$3::jsonb,50::bigint,1::bigint,
           'signalwire_dashboard','owner@example.com')`,
        [number, '0'.repeat(64), JSON.stringify({
          provider: 'signalwire', number, voice_capable: true,
        })],
      ),
      /no rows|strict|query returned no rows/i,
    ),
  );

  const policy = one(await client.query(
    `select * from public.set_voice_number_spend_policy(
       'signalwire',50,500,true,'ops@example.com')`,
  ));
  const freshFingerprint = () => (
    randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
  );
  const preparePurchaseClaim = async ({
    accountId: purchaseAccountId = randomUUID(),
    requestNumber,
  }) => {
    const currentPurchasePolicy = one(await client.query(
      `select monthly_unit_price_cents,aggregate_monthly_ceiling_cents,revision
         from public.voice_number_spend_policies where provider='signalwire'`,
    ));
    const unitPrice = Number(currentPurchasePolicy.monthly_unit_price_cents);
    const spendCeiling = Number(currentPurchasePolicy.aggregate_monthly_ceiling_cents);
    await client.query('insert into public.accounts(id) values($1)', [purchaseAccountId]);
    const candidate = one(await client.query(
      `select * from public.record_voice_number_candidate_observation(
         'signalwire',$1,true,$2,$3::jsonb,$4::bigint,$5::bigint,
         'signalwire_dashboard','owner@example.com')`,
      [requestNumber, freshFingerprint(), JSON.stringify({
        provider: 'signalwire', number: requestNumber, voice_capable: true,
      }), unitPrice, currentPurchasePolicy.revision],
    ));
    const purchaseAuthorization = one(await client.query(
      `select * from public.authorize_voice_number_purchase(
         $1,'signalwire',$2,$3,$4::bigint,$5::bigint,$6::bigint,$7,'owner@example.com')`,
      [purchaseAccountId, requestNumber, candidate.observation_id, unitPrice, spendCeiling,
        currentPurchasePolicy.revision, `voice-confirm-${randomUUID()}`],
    ));
    return {
      accountId: purchaseAccountId,
      authorizationId: purchaseAuthorization.authorization_id,
      payload: {
        number: requestNumber,
        currency: 'USD',
        monthly_price_cents: String(unitPrice),
        monthly_spend_ceiling_cents: String(spendCeiling),
        spend_policy_revision: String(currentPurchasePolicy.revision),
      },
      requestNumber,
    };
  };
  const createIndeterminatePurchase = async ({
    accountId: purchaseAccountId = randomUUID(),
    requestNumber,
    observedProviderId = randomUUID(),
    observedNumber = requestNumber,
  }) => {
    const currentPurchasePolicy = one(await client.query(
      `select monthly_unit_price_cents,aggregate_monthly_ceiling_cents,revision
         from public.voice_number_spend_policies where provider='signalwire'`,
    ));
    const unitPrice = Number(currentPurchasePolicy.monthly_unit_price_cents);
    const spendCeiling = Number(currentPurchasePolicy.aggregate_monthly_ceiling_cents);
    await client.query('insert into public.accounts(id) values($1)', [purchaseAccountId]);
    const candidate = one(await client.query(
      `select * from public.record_voice_number_candidate_observation(
         'signalwire',$1,true,$2,$3::jsonb,$4::bigint,$5::bigint,
         'signalwire_dashboard','owner@example.com')`,
      [requestNumber, freshFingerprint(), JSON.stringify({
        provider: 'signalwire', number: requestNumber, voice_capable: true,
      }), unitPrice, currentPurchasePolicy.revision],
    ));
    const purchaseAuthorization = one(await client.query(
      `select * from public.authorize_voice_number_purchase(
         $1,'signalwire',$2,$3,$4::bigint,$5::bigint,$6::bigint,$7,'owner@example.com')`,
      [purchaseAccountId, requestNumber, candidate.observation_id, unitPrice, spendCeiling,
        currentPurchasePolicy.revision,
        `voice-confirm-${randomUUID()}`],
    ));
    const operation = one(await client.query(
      `select * from public.claim_voice_number_operation(
         $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
      [purchaseAccountId, `voice-purchase-${randomUUID()}`, freshFingerprint(),
        JSON.stringify({
          number: requestNumber,
          currency: 'USD',
          monthly_price_cents: String(unitPrice),
          monthly_spend_ceiling_cents: String(spendCeiling),
          spend_policy_revision: String(currentPurchasePolicy.revision),
        }), purchaseAuthorization.authorization_id],
    ));
    await client.query('select public.begin_voice_number_operation($1,$2)',
      [operation.operation_id, operation.claim_token]);
    await client.query(
      `select public.mark_voice_number_operation_indeterminate(
         $1,$2,'provider_response_ambiguous','Captured provider response for reconciliation',
         $3,$4::jsonb
       )`,
      [operation.operation_id, operation.claim_token, observedProviderId, JSON.stringify({
        provider: 'signalwire', id: observedProviderId,
        number: observedNumber, voice_capable: false,
      })],
    );
    return { ...operation, accountId: purchaseAccountId, observedProviderId, observedNumber };
  };
  const observation = one(await client.query(
    `select * from public.record_voice_number_candidate_observation(
       'signalwire',$1,true,$2,$3::jsonb,50::bigint,$4::bigint,
       'signalwire_dashboard','owner@example.com')`,
    [number, '1'.repeat(64), JSON.stringify({
      provider: 'signalwire', number, voice_capable: true,
      region: 'MI', city: 'Flint', capabilities: { voice: true },
    }), policy.revision],
  ));
  check('candidate availability and dashboard price are durably bound',
    observation.observation_id
      && observation.price_evidence_source === 'signalwire_dashboard'
      && Number(observation.monthly_unit_price_cents) === 50);
  const confirmationKey = `voice-confirm-${randomUUID()}`;
  const authorization = one(await client.query(
    `select * from public.authorize_voice_number_purchase(
       $1,'signalwire',$2,$3,50::bigint,500::bigint,$4::bigint,$5,'owner@example.com')`,
    [accountId, number, observation.observation_id, policy.revision, confirmationKey],
  ));
  check('exact-price authorization is recorded with a bounded expiry',
    authorization.authorization_id && authorization.expires_at);

  const purchasePayload = {
    number,
    currency: 'USD',
    monthly_price_cents: '50',
    monthly_spend_ceiling_cents: '500',
    spend_policy_revision: String(policy.revision),
  };
  const purchase = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
    [accountId, `voice-purchase-${randomUUID()}`, 'a'.repeat(64),
      JSON.stringify(purchasePayload), authorization.authorization_id],
  ));
  const authState = one(await client.query(
    'select state,consumed_operation_id from public.voice_number_purchase_authorizations where id=$1',
    [authorization.authorization_id],
  ));
  check('purchase claim atomically consumes its one-time authorization',
    purchase.claim_status === 'claimed'
      && authState.state === 'consumed'
      && authState.consumed_operation_id === purchase.operation_id);

  await client.query('select public.begin_voice_number_operation($1,$2)',
    [purchase.operation_id, purchase.claim_token]);
  await client.query(
    'select public.complete_voice_number_operation($1,$2,$3,$4::jsonb)',
    [purchase.operation_id, purchase.claim_token, providerId, JSON.stringify({
      provider: 'signalwire', id: providerId, number, voice_capable: true,
    })],
  );
  const inventory = one(await client.query(
    'select * from public.voice_number_inventory where account_id=$1', [accountId],
  ));
  check('purchase completion creates voice-only purchased inventory',
    inventory.lifecycle_state === 'purchased'
      && inventory.e164_number === number
      && inventory.voice_capable === true);

  const recoveredPurchaseAccountId = randomUUID();
  const recoveredPurchaseNumber = '+18103192948';
  const recoveredPurchaseProviderId = randomUUID();
  await client.query('insert into public.accounts(id) values($1)', [recoveredPurchaseAccountId]);
  const recoveredPurchaseObservation = one(await client.query(
    `select * from public.record_voice_number_candidate_observation(
       'signalwire',$1,true,$2,$3::jsonb,50::bigint,$4::bigint,
       'signalwire_dashboard','owner@example.com')`,
    [recoveredPurchaseNumber, '9'.repeat(64), JSON.stringify({
      provider: 'signalwire', number: recoveredPurchaseNumber, voice_capable: true,
    }), policy.revision],
  ));
  const recoveredPurchaseAuthorization = one(await client.query(
    `select * from public.authorize_voice_number_purchase(
       $1,'signalwire',$2,$3,50::bigint,500::bigint,$4::bigint,$5,'owner@example.com')`,
    [recoveredPurchaseAccountId, recoveredPurchaseNumber,
      recoveredPurchaseObservation.observation_id, policy.revision,
      `voice-confirm-${randomUUID()}`],
  ));
  const recoveredPurchase = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
    [recoveredPurchaseAccountId, `voice-purchase-${randomUUID()}`, '9'.repeat(64),
      JSON.stringify({
        number: recoveredPurchaseNumber,
        currency: 'USD',
        monthly_price_cents: '50',
        monthly_spend_ceiling_cents: '500',
        spend_policy_revision: String(policy.revision),
      }), recoveredPurchaseAuthorization.authorization_id],
  ));
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [recoveredPurchase.operation_id, recoveredPurchase.claim_token]);
  await client.query(
    `select public.mark_voice_number_operation_indeterminate(
       $1,$2,'provider_response_ambiguous','Captured before voice capability was refreshed',
       $3,$4::jsonb
     )`,
    [recoveredPurchase.operation_id, recoveredPurchase.claim_token,
      recoveredPurchaseProviderId, JSON.stringify({
        provider: 'signalwire', id: recoveredPurchaseProviderId,
        number: recoveredPurchaseNumber, voice_capable: false,
      })],
  );
  await client.query(
    `select public.resolve_voice_number_operation(
       $1,'succeeded',$2,$3::jsonb,null,null,'retained','same_as_expected',
       $4::jsonb,'ops@example.com')`,
    [recoveredPurchase.operation_id, recoveredPurchaseProviderId, JSON.stringify({
      provider: 'signalwire', id: recoveredPurchaseProviderId,
      number: recoveredPurchaseNumber, voice_capable: true,
    }), JSON.stringify({
      provider: 'signalwire',
      operation_id: recoveredPurchase.operation_id,
      expected_number: recoveredPurchaseNumber,
      expected_provider_object_id: recoveredPurchaseProviderId,
      observed_provider_object_id: recoveredPurchaseProviderId,
      observed_number: recoveredPurchaseNumber,
      expected_disposition: 'retained',
      observed_disposition: 'same_as_expected',
      cleanup_confirmed: true,
    })],
  );
  const recoveredPurchaseInventory = one(await client.query(
    `select lifecycle_state,voice_capable,provider_number_id,e164_number
       from public.voice_number_inventory where account_id=$1`,
    [recoveredPurchaseAccountId],
  ));
  check('purchase reconciliation uses a fresh exact voice-capable result for a captured identity',
    recoveredPurchaseInventory.lifecycle_state === 'purchased'
      && recoveredPurchaseInventory.voice_capable === true
      && recoveredPurchaseInventory.provider_number_id === recoveredPurchaseProviderId
      && recoveredPurchaseInventory.e164_number === recoveredPurchaseNumber);

  // The carrier can return unrelated response A while also allocating the
  // paid requested number B. Keep immutable A evidence, but authorize B only
  // through a distinct expected cleanup anchor. This also exercises crash
  // replay after carrier DELETE but before B's durable finalization.
  const splitEvidenceRequestNumber = '+18103192953';
  const splitEvidenceObservedNumber = '+18103192954';
  const splitEvidenceObservedId = randomUUID();
  const splitEvidenceExpectedId = randomUUID();
  const splitEvidencePurchase = await createIndeterminatePurchase({
    requestNumber: splitEvidenceRequestNumber,
    observedProviderId: splitEvidenceObservedId,
    observedNumber: splitEvidenceObservedNumber,
  });
  const splitObservedKey = `voice-cleanup-observed-${randomUUID()}`;
  const splitObserved = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'observed',$2,$3,$4,'ops@example.com','Clean captured wrong-response purchase identity'
     )`,
    [splitEvidencePurchase.operation_id, splitEvidenceObservedId,
      splitEvidenceObservedNumber, splitObservedKey],
  ));
  await client.query(
    `select public.finalize_voice_number_identity_cleanup(
       $1,$2,'released',$3::jsonb,'ops@example.com'
     )`,
    [splitObserved.reservation_id, splitObserved.lease_token, JSON.stringify({
      provider: 'signalwire',
      provider_number_id: splitEvidenceObservedId,
      number: splitEvidenceObservedNumber,
      disposition: 'released',
      cleanup_confirmed: true,
    })],
  );
  const splitExpectedKey = `voice-cleanup-expected-${randomUUID()}`;
  const splitExpected = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'ops@example.com','Clean exact requested purchase identity'
     )`,
    [splitEvidencePurchase.operation_id, splitEvidenceExpectedId,
      splitEvidenceRequestNumber, splitExpectedKey],
  ));
  const splitExpectedBusy = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'second-worker@example.com','Clean exact requested purchase identity'
     )`,
    [splitEvidencePurchase.operation_id, splitEvidenceExpectedId,
      splitEvidenceRequestNumber, splitExpectedKey],
  ));
  const splitPurchaseAnchorsBeforeReplay = (await client.query(
    'select * from public.enumerate_purchase_voice_number_cleanup_anchors($1,10)',
    [splitEvidencePurchase.operation_id],
  )).rows;
  await client.query(
    `update public.voice_number_identity_cleanup_reservations
        set reserved_at=pg_catalog.clock_timestamp() - interval '6 minutes',
            lease_expires_at=pg_catalog.clock_timestamp() - interval '1 minute'
      where id=$1`,
    [splitExpected.reservation_id],
  );
  const splitExpectedReclaimed = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'recovery@example.com','Clean exact requested purchase identity'
     )`,
    [splitEvidencePurchase.operation_id, splitEvidenceExpectedId,
      splitEvidenceRequestNumber, splitExpectedKey],
  ));
  await client.query(
    `select public.finalize_voice_number_identity_cleanup(
       $1,$2,'confirmed_absent',$3::jsonb,'recovery@example.com'
     )`,
    [splitExpectedReclaimed.reservation_id, splitExpectedReclaimed.lease_token,
      JSON.stringify({
        provider: 'signalwire',
        provider_number_id: splitEvidenceExpectedId,
        number: splitEvidenceRequestNumber,
        disposition: 'confirmed_absent',
        cleanup_confirmed: true,
      })],
  );
  const splitPurchaseAnchorsAfterReplay = (await client.query(
    'select * from public.enumerate_purchase_voice_number_cleanup_anchors($1,10)',
    [splitEvidencePurchase.operation_id],
  )).rows;
  await client.query(
    `select public.resolve_voice_number_operation(
       $1,'failed',$2,null,'provider_identity_absent','No paid resource remains',
       'confirmed_absent','released',$3::jsonb,'ops@example.com'
     )`,
    [splitEvidencePurchase.operation_id, splitEvidenceExpectedId, JSON.stringify({
      provider: 'signalwire',
      operation_id: splitEvidencePurchase.operation_id,
      expected_number: splitEvidenceRequestNumber,
      expected_provider_object_id: splitEvidenceExpectedId,
      observed_provider_object_id: splitEvidenceObservedId,
      observed_number: splitEvidenceObservedNumber,
      expected_disposition: 'confirmed_absent',
      observed_disposition: 'released',
      cleanup_confirmed: true,
    })],
  );
  const splitEvidenceState = one(await client.query(
    `select state,reconciliation_evidence,expected_identity_disposition,observed_identity_disposition
       from public.voice_number_provisioning_operations where id=$1`,
    [splitEvidencePurchase.operation_id],
  ));
  check('wrong-response A and allocated requested B retain separate crash-safe cleanup evidence',
    splitExpected.reserve_status === 'reserved'
      && splitExpectedBusy.reserve_status === 'busy'
      && splitExpectedBusy.lease_token === null
      && splitExpectedBusy.lease_expires_at.getTime() === splitExpected.lease_expires_at.getTime()
      && splitPurchaseAnchorsBeforeReplay.length === 1
      && splitPurchaseAnchorsBeforeReplay[0].reservation_state === 'reserved'
      && splitExpectedReclaimed.reserve_status === 'reclaimed'
      && splitExpectedReclaimed.lease_token !== splitExpected.lease_token
      && splitPurchaseAnchorsAfterReplay.length === 1
      && splitPurchaseAnchorsAfterReplay[0].reservation_state === 'confirmed_absent'
      && splitEvidenceState.state === 'failed'
      && splitEvidenceState.reconciliation_evidence.expected_provider_object_id
        === splitEvidenceExpectedId
      && splitEvidenceState.expected_identity_disposition === 'confirmed_absent'
      && splitEvidenceState.observed_identity_disposition === 'released');

  const expectedBudgetNumber = '+18103192965';
  const expectedBudgetPurchase = await createIndeterminatePurchase({
    requestNumber: expectedBudgetNumber,
    observedProviderId: randomUUID(),
    observedNumber: '+18103192966',
  });
  const expectedBudgetRows = [];
  for (let index = 0; index < 10; index += 1) {
    const identity = randomUUID();
    const key = `voice-cleanup-expected-${randomUUID()}`;
    const reservation = one(await client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'expected',$2,$3,$4,'ops@example.com','Clean exact requested purchase identity'
       )`,
      [expectedBudgetPurchase.operation_id, identity, expectedBudgetNumber, key],
    ));
    await client.query(
      `select public.finalize_voice_number_identity_cleanup(
         $1,$2,'confirmed_absent',$3::jsonb,'ops@example.com'
       )`,
      [reservation.reservation_id, reservation.lease_token, JSON.stringify({
        provider: 'signalwire', provider_number_id: identity,
        number: expectedBudgetNumber, disposition: 'confirmed_absent',
        cleanup_confirmed: true,
      })],
    );
    expectedBudgetRows.push({ identity, key, reservation });
  }
  const expectedBudgetReplay = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'replay@example.com','Clean exact requested purchase identity'
     )`,
    [expectedBudgetPurchase.operation_id, expectedBudgetRows[0].identity,
      expectedBudgetNumber, expectedBudgetRows[0].key],
  ));
  const eleventhExpectedBlocked = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'expected',$2,$3,$4,'ops@example.com','Clean exact requested purchase identity'
       )`,
      [expectedBudgetPurchase.operation_id, randomUUID(), expectedBudgetNumber,
        `voice-cleanup-expected-${randomUUID()}`],
    ),
    /purchase cleanup anchor safety limit reached/i,
  );
  check('ten terminal expected purchase anchors consume their lifetime budget permanently',
    expectedBudgetReplay.reserve_status === 'finalized'
      && expectedBudgetReplay.final_disposition === 'confirmed_absent'
      && eleventhExpectedBlocked);

  const absentPurchaseAccountId = randomUUID();
  const absentPurchaseNumber = '+18103192949';
  const absentPurchaseObservedId = randomUUID();
  const absentPurchaseDiscoveredIdB = randomUUID();
  const absentPurchaseDiscoveredIdC = randomUUID();
  await client.query('insert into public.accounts(id) values($1)', [absentPurchaseAccountId]);
  const absentPurchaseObservation = one(await client.query(
    `select * from public.record_voice_number_candidate_observation(
       'signalwire',$1,true,$2,$3::jsonb,50::bigint,$4::bigint,
       'signalwire_dashboard','owner@example.com')`,
    [absentPurchaseNumber, '8'.repeat(64), JSON.stringify({
      provider: 'signalwire', number: absentPurchaseNumber, voice_capable: true,
    }), policy.revision],
  ));
  const absentPurchaseAuthorization = one(await client.query(
    `select * from public.authorize_voice_number_purchase(
       $1,'signalwire',$2,$3,50::bigint,500::bigint,$4::bigint,$5,'owner@example.com')`,
    [absentPurchaseAccountId, absentPurchaseNumber,
      absentPurchaseObservation.observation_id, policy.revision,
      `voice-confirm-${randomUUID()}`],
  ));
  const absentPurchase = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
    [absentPurchaseAccountId, `voice-purchase-${randomUUID()}`, '8'.repeat(64),
      JSON.stringify({
        number: absentPurchaseNumber,
        currency: 'USD',
        monthly_price_cents: '50',
        monthly_spend_ceiling_cents: '500',
        spend_policy_revision: String(policy.revision),
      }), absentPurchaseAuthorization.authorization_id],
  ));
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [absentPurchase.operation_id, absentPurchase.claim_token]);
  await client.query(
    `select public.mark_voice_number_operation_indeterminate(
       $1,$2,'provider_response_ambiguous','Captured identity moved before reconciliation',
       $3,$4::jsonb
     )`,
    [absentPurchase.operation_id, absentPurchase.claim_token,
      absentPurchaseObservedId, JSON.stringify({
        provider: 'signalwire', id: absentPurchaseObservedId,
        number: absentPurchaseNumber, voice_capable: false,
      })],
  );
  const absentPurchaseAnchorKey = `voice-cleanup-observed-${randomUUID()}`;
  const absentPurchaseAnchor = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'observed',$2,$3,$4,'ops@example.com','Confirm captured purchase identity absence'
     )`,
    [absentPurchase.operation_id, absentPurchaseObservedId,
      absentPurchaseNumber, absentPurchaseAnchorKey],
  ));
  const absentPurchaseDiscoveredB = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'discovered',$2,$3,$4,'ops@example.com','Clean moved purchase identity'
     )`,
    [absentPurchase.operation_id, absentPurchaseDiscoveredIdB, absentPurchaseNumber,
      `voice-cleanup-discovered-${randomUUID()}`],
  ));
  const absentPurchaseDiscoveredC = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'discovered',$2,$3,$4,'ops@example.com','Clean moved purchase identity'
     )`,
    [absentPurchase.operation_id, absentPurchaseDiscoveredIdC, absentPurchaseNumber,
      `voice-cleanup-discovered-${randomUUID()}`],
  ));
  const absentPurchaseDiscoveredCleanups = [
    { row: absentPurchaseDiscoveredB, id: absentPurchaseDiscoveredIdB, disposition: 'released' },
    { row: absentPurchaseDiscoveredC, id: absentPurchaseDiscoveredIdC, disposition: 'confirmed_absent' },
  ];
  for (let index = 0; index < 8; index += 1) {
    const identity = randomUUID();
    const reservation = one(await client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'discovered',$2,$3,$4,'other-worker@example.com','Clean moved purchase identity'
       )`,
      [absentPurchase.operation_id, identity, absentPurchaseNumber,
        `voice-cleanup-discovered-${randomUUID()}`],
    ));
    absentPurchaseDiscoveredCleanups.push({
      row: reservation, id: identity, disposition: 'confirmed_absent',
    });
  }
  const overLimitDiscoveredIdentityBlocked = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'discovered',$2,$3,$4,'other-worker@example.com','Clean moved purchase identity'
       )`,
      [absentPurchase.operation_id, randomUUID(), absentPurchaseNumber,
        `voice-cleanup-discovered-${randomUUID()}`],
    ),
    /pending discovered cleanup reservation limit reached/i,
  );
  // Simulate a worker that already deleted discovered resource B at SignalWire
  // and died before finalizing its durable reservation. A retry must recover B
  // (and every other pending discovered identity) without direct table SELECT.
  const pendingAbsentPurchaseCleanups = (await client.query(
    `select * from public.enumerate_pending_voice_number_identity_cleanups($1,$2,10)
      order by provider_number_id`,
    [absentPurchase.operation_id, absentPurchaseAnchor.reservation_id],
  )).rows;
  const anchorFinalizeBlockedAfterConcurrentDiscovery = await rejects(
    () => client.query(
      `select public.finalize_voice_number_identity_cleanup(
         $1,$2,'confirmed_absent',$3::jsonb,'ops@example.com'
       )`,
      [absentPurchaseAnchor.reservation_id, absentPurchaseAnchor.lease_token,
        JSON.stringify({
          provider: 'signalwire',
          provider_number_id: absentPurchaseObservedId,
          number: absentPurchaseNumber,
          disposition: 'confirmed_absent',
          cleanup_confirmed: true,
        })],
    ),
    /anchor cannot finalize while discovered cleanup remains reserved/i,
  );
  check('crash after discovered carrier DELETE is resumable through bounded exact-operation enumeration',
    pendingAbsentPurchaseCleanups.length === 10
      && overLimitDiscoveredIdentityBlocked
      && anchorFinalizeBlockedAfterConcurrentDiscovery
      && pendingAbsentPurchaseCleanups.every((row) => (
        row.identity_kind === 'discovered'
          && row.e164_number === absentPurchaseNumber
          && absentPurchaseDiscoveredCleanups
            .some((cleanup) => cleanup.id === row.provider_number_id)
      )));
  for (const cleanup of [
    ...absentPurchaseDiscoveredCleanups,
    { row: absentPurchaseAnchor, id: absentPurchaseObservedId, disposition: 'confirmed_absent' },
  ]) {
    await client.query(
      `select public.finalize_voice_number_identity_cleanup(
         $1,$2,$3,$4::jsonb,'recovery@example.com'
       )`,
      [cleanup.row.reservation_id, cleanup.row.lease_token, cleanup.disposition,
        JSON.stringify({
          provider: 'signalwire',
          provider_number_id: cleanup.id,
          number: absentPurchaseNumber,
          disposition: cleanup.disposition,
          cleanup_confirmed: true,
        })],
    );
  }
  const finalizedCleanupReplayAtBudget = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'observed',$2,$3,$4,'replay@example.com','Confirm captured purchase identity absence'
     )`,
    [absentPurchase.operation_id, absentPurchaseObservedId,
      absentPurchaseNumber, absentPurchaseAnchorKey],
  ));
  const terminalizedCleanupBudgetRemainsClosed = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'expected',$2,$3,$4,'other-worker@example.com','Clean exact requested purchase identity'
       )`,
      [absentPurchase.operation_id, randomUUID(), absentPurchaseNumber,
        `voice-cleanup-expected-${randomUUID()}`],
    ),
    /cleanup identity lifetime safety limit reached/i,
  );
  check('terminal cleanup rows never release the bounded identity budget',
    finalizedCleanupReplayAtBudget.reserve_status === 'finalized'
      && finalizedCleanupReplayAtBudget.final_disposition === 'confirmed_absent'
      && terminalizedCleanupBudgetRemainsClosed);
  await client.query(
    `select public.resolve_voice_number_operation(
       $1,'failed',$2,null,'provider_identity_absent','No paid voice-capable resource remains',
       'confirmed_absent','confirmed_absent',$3::jsonb,'ops@example.com'
     )`,
    [absentPurchase.operation_id, absentPurchaseObservedId, JSON.stringify({
      provider: 'signalwire',
      operation_id: absentPurchase.operation_id,
      expected_number: absentPurchaseNumber,
      expected_provider_object_id: absentPurchaseObservedId,
      observed_provider_object_id: absentPurchaseObservedId,
      observed_number: absentPurchaseNumber,
      expected_disposition: 'confirmed_absent',
      observed_disposition: 'confirmed_absent',
      cleanup_confirmed: true,
    })],
  );
  const absentPurchaseResolution = one(await client.query(
    `select o.state,pg_catalog.count(r.id)::integer as cleanup_count,
            pg_catalog.count(r.id) filter (where r.state='reserved')::integer as open_count
       from public.voice_number_provisioning_operations o
       left join public.voice_number_identity_cleanup_reservations r on r.operation_id=o.id
      where o.id=$1 group by o.state`,
    [absentPurchase.operation_id],
  ));
  check('purchase absence reconciliation cleans every moved same-number provider identity',
    absentPurchaseResolution.state === 'failed'
      && Number(absentPurchaseResolution.cleanup_count) === 11
      && Number(absentPurchaseResolution.open_count) === 0);

  const operationCountBeforeIdentityAttacks = Number(one(await client.query(
    'select pg_catalog.count(*)::integer as count from public.voice_number_provisioning_operations',
  )).count);
  const wrongProviderId = randomUUID();
  check(
    'configure claim rejects a mismatched provider resource before provider work',
    await rejects(
      () => client.query(
        `select * from public.claim_voice_number_operation(
           $1,'configure_voice',$2,$3,$4::jsonb,null,null,null)`,
        [accountId, `voice-wrong-provider-${randomUUID()}`, 'd'.repeat(64), JSON.stringify({
          provider: 'signalwire', voice_number_id: inventory.id,
          provider_number_id: wrongProviderId, number,
        })],
      ),
      /provider identity does not match/i,
    ),
  );
  check(
    'release claim rejects a mismatched E.164 identity before provider work',
    await rejects(
      () => client.query(
        `select * from public.claim_voice_number_operation(
           $1,'release_number',$2,$3,$4::jsonb,null,null,null)`,
        [accountId, `voice-wrong-number-${randomUUID()}`, 'e'.repeat(64), JSON.stringify({
          provider: 'signalwire', voice_number_id: inventory.id,
          provider_number_id: providerId, number: '+18103192952',
        })],
      ),
      /provider identity does not match/i,
    ),
  );
  const operationCountAfterIdentityAttacks = Number(one(await client.query(
    'select pg_catalog.count(*)::integer as count from public.voice_number_provisioning_operations',
  )).count);
  check('rejected identity attacks create no provider operation',
    operationCountAfterIdentityAttacks === operationCountBeforeIdentityAttacks);

  const callUrl = 'https://app.letsgetquoted.com/api/voice/ai';
  const statusUrl = 'https://app.letsgetquoted.com/api/voice/provider-status';
  const configurePayload = {
    voice_number_id: inventory.id,
    provider: 'signalwire',
    provider_number_id: providerId,
    number,
    call_handler: 'laml_webhooks',
    call_request_method: 'POST',
    call_request_url: callUrl,
    call_status_callback_method: 'POST',
    call_status_callback_url: statusUrl,
  };
  const configure = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'configure_voice',$2,$3,$4::jsonb,null,null,null)`,
    [accountId, `voice-configure-${randomUUID()}`, 'b'.repeat(64), JSON.stringify(configurePayload)],
  ));
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [configure.operation_id, configure.claim_token]);
  await client.query(
    'select public.complete_voice_number_operation($1,$2,$3,$4::jsonb)',
    [configure.operation_id, configure.claim_token, providerId, JSON.stringify({
      provider: 'signalwire', id: providerId, number, voice_capable: true,
      call_handler: 'laml_webhooks', call_request_method: 'POST', call_request_url: callUrl,
      call_status_callback_method: 'POST', call_status_callback_url: statusUrl,
    })],
  );
  const active = one(await client.query(
    `select i.lifecycle_state,i.call_status_callback_method,a.call_tracking_number,
            a.ai_voice_route_revision
       from public.voice_number_inventory i
       join public.accounts a on a.id=i.account_id
      where i.id=$1`,
    [inventory.id],
  ));
  check('exact production POST configuration activates and binds the number',
    active.lifecycle_state === 'active'
      && active.call_status_callback_method === 'POST'
      && active.call_tracking_number === number
      && Number(active.ai_voice_route_revision) === 1);

  const admission = one(await client.query(
    `select * from public.claim_voice_call_admission_v2(
       $1,$2,$3,2,$4,'owner')`,
    [accountId, `call-${randomUUID()}`, number, '+18103042061'],
  ));
  const bound = one(await client.query(
    'select sender_number_id,voice_number_id from public.voice_call_admissions where id=$1',
    [admission.admission_id],
  ));
  check('new voice admission binds only dedicated voice inventory',
    admission.claim_status === 'claimed'
      && bound.sender_number_id === null
      && bound.voice_number_id === inventory.id);

  await client.query(
    `update public.voice_number_inventory
        set provider_verified_at=pg_catalog.clock_timestamp()-interval '7 hours',
            last_provider_sync_at=pg_catalog.clock_timestamp()-interval '7 hours'
      where id=$1`,
    [inventory.id],
  );
  const staleAdmission = one(await client.query(
    `select * from public.claim_voice_call_admission_v2(
       $1,$2,$3,2,$4,'owner')`,
    [accountId, `call-${randomUUID()}`, number, '+18103042061'],
  ));
  check('provider proof older than six hours cannot admit a call',
    staleAdmission.claim_status === 'number_not_ready' && staleAdmission.admission_id === null);
  await client.query(
    `update public.voice_number_inventory
        set provider_verified_at=pg_catalog.clock_timestamp()+interval '6 minutes',
            last_provider_sync_at=pg_catalog.clock_timestamp()+interval '6 minutes'
      where id=$1`,
    [inventory.id],
  );
  const futureAdmission = one(await client.query(
    `select * from public.claim_voice_call_admission_v2(
       $1,$2,$3,2,$4,'owner')`,
    [accountId, `call-${randomUUID()}`, number, '+18103042061'],
  ));
  check('provider proof beyond the five-minute clock-skew cap cannot admit a call',
    futureAdmission.claim_status === 'number_not_ready' && futureAdmission.admission_id === null);
  await client.query(
    `update public.voice_number_inventory
        set provider_verified_at=pg_catalog.clock_timestamp(),
            last_provider_sync_at=pg_catalog.clock_timestamp()
      where id=$1`,
    [inventory.id],
  );
  const proofBeforeReadError = one(await client.query(
    `select provider_verified_at,provider_readiness_state,lifecycle_state
       from public.voice_number_inventory where id=$1`,
    [inventory.id],
  ));
  const checkAttempt = one(await client.query(
    `select * from public.record_voice_number_provider_check_attempt(
       $1,$2,'read_error','provider_read_timeout'
     )`,
    [accountId, inventory.id],
  ));
  const proofAfterReadError = one(await client.query(
    `select provider_verified_at,provider_readiness_state,lifecycle_state,
            last_provider_check_attempt_at,last_provider_check_error_code
       from public.voice_number_inventory where id=$1`,
    [inventory.id],
  ));
  check('provider check failures rotate telemetry without forging or clearing readiness proof',
    checkAttempt.last_provider_check_error_code === 'provider_read_timeout'
      && proofAfterReadError.last_provider_check_attempt_at
      && proofAfterReadError.provider_verified_at.getTime()
        === proofBeforeReadError.provider_verified_at.getTime()
      && proofAfterReadError.provider_readiness_state === 'ready'
      && proofAfterReadError.lifecycle_state === 'active');

  const releasePayload = {
    voice_number_id: inventory.id,
    provider: 'signalwire',
    provider_number_id: providerId,
    number,
  };
  const smsReferenceId = randomUUID();
  check('cross-rail assignment trigger rejects SMS reuse of a live voice identity',
    await rejects(
      () => client.query(
        `insert into public.sms_sender_numbers(
           id,provider,provisioning_status,provider_number_id,e164_number,purpose
         ) values($1,'signalwire','active',$2,$3,'shared')`,
        [smsReferenceId, providerId, number],
      ),
      /already owned by the live AI Voice rail/i,
    ));
  const reverseAccountId = randomUUID();
  const reverseSmsId = randomUUID();
  const reverseProviderId = randomUUID();
  const reverseNumber = '+18103192947';
  await client.query('insert into public.accounts(id) values($1)', [reverseAccountId]);
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [reverseSmsId, reverseProviderId, reverseNumber],
  );
  check('cross-rail assignment trigger rejects voice import of a live SMS identity',
    await rejects(
      () => client.query(
        `insert into public.voice_number_inventory(
           account_id,provider_number_id,e164_number,lifecycle_state,voice_capable
         ) values($1,$2,$3,'purchased',true)`,
        [reverseAccountId, reverseProviderId, reverseNumber],
      ),
      /already owned by the live SMS rail/i,
    ));
  await client.query('delete from public.sms_sender_numbers where id=$1', [reverseSmsId]);
  await client.query(
    'alter table public.sms_sender_numbers disable trigger sms_sender_numbers_voice_cleanup_reservation_guard',
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [smsReferenceId, providerId, number],
  );
  await client.query(
    'alter table public.sms_sender_numbers enable trigger sms_sender_numbers_voice_cleanup_reservation_guard',
  );
  check(
    'release is denied while any live SMS rail references the provider identity',
    await rejects(
      () => client.query(
        `select * from public.claim_voice_number_operation(
           $1,'release_number',$2,$3,$4::jsonb,null,null,null)`,
        [accountId, `voice-release-blocked-${randomUUID()}`, '7'.repeat(64),
          JSON.stringify(releasePayload)],
      ),
      /SMS still references/i,
    ),
  );
  await client.query('delete from public.sms_sender_numbers where id=$1', [smsReferenceId]);
  const release = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'release_number',$2,$3,$4::jsonb,null,null,null)`,
    [accountId, `voice-release-${randomUUID()}`, 'c'.repeat(64), JSON.stringify(releasePayload)],
  ));
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [release.operation_id, release.claim_token]);
  await client.query(
    'select public.reject_voice_number_operation($1,$2,$3,$4)',
    [release.operation_id, release.claim_token, 'signalwire_http_404', 'Provider returned 404.'],
  );
  const uncertain = one(await client.query(
    `select o.state,i.lifecycle_state
       from public.voice_number_provisioning_operations o
       join public.voice_number_inventory i on i.id=o.inventory_id
      where o.id=$1`,
    [release.operation_id],
  ));
  check('release DELETE 404 is durable and requires confirmed absence',
    uncertain.state === 'indeterminate'
      && uncertain.lifecycle_state === 'release_indeterminate');

  const gateMessagingAccountId = randomUUID();
  const gateMessagingApplicationId = randomUUID();
  const inFlightMessagingOperationId = randomUUID();
  const inFlightMessagingNumber = '+18103192955';
  await client.query('insert into public.accounts(id) values($1)', [gateMessagingAccountId]);
  await client.query(
    `insert into public.messaging_registration_applications(id,account_id,provider)
     values($1,$2,'signalwire')`,
    [gateMessagingApplicationId, gateMessagingAccountId],
  );
  await client.query(
    `insert into public.messaging_number_provisioning_operations(
       id,application_id,account_id,operation_type,idempotency_key,
       request_fingerprint,request_payload,state
     ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
    [inFlightMessagingOperationId, gateMessagingApplicationId, gateMessagingAccountId,
      `messaging-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify({ number: inFlightMessagingNumber })],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='request_started' where id=$1`,
    [inFlightMessagingOperationId],
  );
  const cleanupBlockedByInFlightMessaging = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'expected',$2,$3,$4,'ops@example.com','Confirm exact release absence before resolution'
       )`,
      [release.operation_id, providerId, number, `voice-cleanup-${randomUUID()}`],
    ),
    /purchase response is in flight/i,
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='indeterminate' where id=$1`,
    [inFlightMessagingOperationId],
  );

  const cleanupKey = `voice-cleanup-${randomUUID()}`;
  const cleanupReservation = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'ops@example.com','Confirm exact release absence before resolution'
     )`,
    [release.operation_id, providerId, number, cleanupKey],
  ));
  const cleanupLeaseReplay = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'other-worker@example.com','Confirm exact release absence before resolution'
     )`,
    [release.operation_id, providerId, number, cleanupKey],
  ));
  const secondMessagingOperationId = randomUUID();
  await client.query(
    `insert into public.messaging_number_provisioning_operations(
       id,application_id,account_id,operation_type,idempotency_key,
       request_fingerprint,request_payload,state
     ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
    [secondMessagingOperationId, gateMessagingApplicationId, gateMessagingAccountId,
      `messaging-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify({ number: '+18103192956' })],
  );
  const messagingBeginBlockedByCleanup = await rejects(
    () => client.query(
      `update public.messaging_number_provisioning_operations
          set state='request_started' where id=$1`,
      [secondMessagingOperationId],
    ),
    /cleanup is active/i,
  );
  const pendingReleaseDiscoveries = (await client.query(
    'select * from public.enumerate_pending_voice_number_identity_cleanups($1,$2,10)',
    [release.operation_id, cleanupReservation.reservation_id],
  )).rows;
  const cleanupFinalized = one(await client.query(
    `select public.finalize_voice_number_identity_cleanup(
       $1,$2,'confirmed_absent',$3::jsonb,'ops@example.com'
     ) as finalized`,
    [cleanupReservation.reservation_id, cleanupReservation.lease_token, JSON.stringify({
      provider: 'signalwire',
      provider_number_id: providerId,
      number,
      disposition: 'confirmed_absent',
      cleanup_confirmed: true,
    })],
  ));
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='request_started' where id=$1`,
    [secondMessagingOperationId],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='indeterminate' where id=$1`,
    [secondMessagingOperationId],
  );
  const cleanupReplay = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'recovery@example.com','Confirm exact release absence before resolution'
     )`,
    [release.operation_id, providerId, number, cleanupKey],
  ));
  const cleanupActorAudit = one(await client.query(
    `select authorized_by,finalized_by
       from public.voice_number_identity_cleanup_reservations where id=$1`,
    [cleanupReservation.reservation_id],
  ));
  check('exact cleanup reservation is finalized before release reconciliation',
    cleanupReservation.reserve_status === 'reserved'
      && cleanupLeaseReplay.reserve_status === 'busy'
      && cleanupLeaseReplay.lease_token === null
      && pendingReleaseDiscoveries.length === 0
      && cleanupFinalized.finalized === true
      && cleanupReplay.reserve_status === 'finalized'
      && cleanupReplay.final_disposition === 'confirmed_absent'
      && cleanupReplay.finalized_at
      && cleanupActorAudit.authorized_by === 'ops@example.com'
      && cleanupActorAudit.finalized_by === 'ops@example.com');
  check('provider-wide gate orders in-flight purchase quarantine against exclusive cleanup',
    cleanupBlockedByInFlightMessaging
      && messagingBeginBlockedByCleanup
      && cleanupLeaseReplay.reserve_status === 'busy'
      && cleanupLeaseReplay.lease_token === null);

  const retainedAfterTerminalCleanupBlocked = await rejects(
    () => client.query(
      `select public.resolve_voice_number_operation(
         $1,'failed',null,null,'provider_release_not_applied','Stale retained read',
         'retained','not_observed',$2::jsonb,'ops@example.com')`,
      [release.operation_id, JSON.stringify({
        provider: 'signalwire',
        operation_id: release.operation_id,
        expected_number: number,
        cleanup_confirmed: true,
        expected_provider_object_id: providerId,
        observed_provider_object_id: null,
        observed_number: null,
        expected_disposition: 'retained',
        observed_disposition: 'not_observed',
      })],
    ),
    /retained provider identity contradicts terminal exact cleanup evidence/i,
  );
  check('stale retained reconciliation cannot import an identity after terminal cleanup',
    retainedAfterTerminalCleanupBlocked);

  await client.query(
    `select public.resolve_voice_number_operation(
       $1,'succeeded',$2,$3::jsonb,null,null,'confirmed_absent','not_observed',
       $4::jsonb,'ops@example.com')`,
    [release.operation_id, providerId, JSON.stringify({
      provider: 'signalwire', id: providerId, number, released: true,
    }), JSON.stringify({
      provider: 'signalwire',
      operation_id: release.operation_id,
      expected_number: number,
      cleanup_confirmed: true,
      expected_provider_object_id: providerId,
      observed_provider_object_id: null,
      observed_number: null,
      expected_disposition: 'confirmed_absent',
      observed_disposition: 'not_observed',
    })],
  );
  const released = one(await client.query(
    `select i.lifecycle_state,a.call_tracking_number,a.ai_voice_route_revision
       from public.voice_number_inventory i
       join public.accounts a on a.id=i.account_id
      where i.id=$1`,
    [inventory.id],
  ));
  check('confirmed release clears only the exact account binding',
    released.lifecycle_state === 'released'
      && released.call_tracking_number === null
      && Number(released.ai_voice_route_revision) === 2);

  const laterSmsOwnerId = randomUUID();
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [laterSmsOwnerId, providerId, number],
  );
  const finalizedReplayAfterReassignment = one(await client.query(
    `select * from public.reserve_voice_number_identity_cleanup(
       $1,'expected',$2,$3,$4,'late-owner@example.com',
       'Confirm exact release absence before resolution'
     )`,
    [release.operation_id, providerId, number, cleanupKey],
  ));
  check('finalized cleanup evidence replays after a later legitimate rail assignment',
    finalizedReplayAfterReassignment.reserve_status === 'finalized'
      && finalizedReplayAfterReassignment.final_disposition === 'confirmed_absent'
      && finalizedReplayAfterReassignment.finalized_at);
  await client.query('delete from public.sms_sender_numbers where id=$1', [laterSmsOwnerId]);

  const staleAccountId = randomUUID();
  const staleNumber = '+18103192944';
  await client.query('insert into public.accounts(id) values($1)', [staleAccountId]);
  const currentPolicy = one(await client.query(
    `select * from public.set_voice_number_spend_policy(
       'signalwire',50,500,true,'ops@example.com')`,
  ));
  const staleObservation = one(await client.query(
    `select * from public.record_voice_number_candidate_observation(
       'signalwire',$1,true,$2,$3::jsonb,50::bigint,$4::bigint,
       'signalwire_dashboard','owner@example.com')`,
    [staleNumber, '2'.repeat(64), JSON.stringify({
      provider: 'signalwire', number: staleNumber, voice_capable: true,
    }), currentPolicy.revision],
  ));
  const staleAuthorization = one(await client.query(
    `select * from public.authorize_voice_number_purchase(
       $1,'signalwire',$2,$3,50::bigint,500::bigint,$4::bigint,$5,'owner@example.com')`,
    [staleAccountId, staleNumber, staleObservation.observation_id,
      currentPolicy.revision, `voice-confirm-${randomUUID()}`],
  ));
  const stalePayload = {
    number: staleNumber,
    currency: 'USD',
    monthly_price_cents: '50',
    monthly_spend_ceiling_cents: '500',
    spend_policy_revision: String(currentPolicy.revision),
  };
  const stalePurchase = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
    [staleAccountId, `voice-purchase-${randomUUID()}`, '3'.repeat(64),
      JSON.stringify(stalePayload), staleAuthorization.authorization_id],
  ));
  await client.query(
    `select * from public.set_voice_number_spend_policy(
       'signalwire',55,500,true,'ops@example.com')`,
  );
  const staleBegin = one(await client.query(
    'select public.begin_voice_number_operation($1,$2) as begun',
    [stalePurchase.operation_id, stalePurchase.claim_token],
  ));
  const stalePurchaseState = one(await client.query(
    'select state,error_code from public.voice_number_provisioning_operations where id=$1',
    [stalePurchase.operation_id],
  ));
  check('begin revalidates spend policy after a reclaimed purchase claim',
    staleBegin.begun === false
      && stalePurchaseState.state === 'cancelled'
      && stalePurchaseState.error_code === 'purchase_policy_changed');

  const exhaustedAccountId = randomUUID();
  const exhaustedInventoryId = randomUUID();
  const exhaustedProviderId = randomUUID();
  const exhaustedNumber = '+18103192945';
  const exhaustedOperationId = randomUUID();
  const exhaustedClaimToken = randomUUID();
  const exhaustedKey = `voice-configure-${randomUUID()}`;
  const exhaustedPayload = {
    voice_number_id: exhaustedInventoryId,
    provider: 'signalwire',
    provider_number_id: exhaustedProviderId,
    number: exhaustedNumber,
    call_handler: 'laml_webhooks',
    call_request_method: 'POST',
    call_request_url: callUrl,
    call_status_callback_method: 'POST',
    call_status_callback_url: statusUrl,
  };
  await client.query('insert into public.accounts(id) values($1)', [exhaustedAccountId]);
  await client.query(
    `insert into public.voice_number_inventory(
       id,account_id,provider_number_id,e164_number,lifecycle_state,voice_capable
     ) values($1,$2,$3,$4,'purchased',true)`,
    [exhaustedInventoryId, exhaustedAccountId, exhaustedProviderId, exhaustedNumber],
  );
  await client.query(
    `insert into public.voice_number_provisioning_operations(
       id,account_id,operation_type,inventory_id,idempotency_key,
       request_fingerprint,request_payload,state,attempt_count,claim_token,lease_expires_at
     ) values($1,$2,'configure_voice',$3,$4,$5,$6::jsonb,'claimed',5,$7,
       pg_catalog.clock_timestamp()-interval '1 minute')`,
    [exhaustedOperationId, exhaustedAccountId, exhaustedInventoryId, exhaustedKey,
      '4'.repeat(64), JSON.stringify(exhaustedPayload), exhaustedClaimToken],
  );
  await client.query(
    `insert into public.voice_number_provisioning_attempts(
       operation_id,attempt_number,claim_token,claimed_at
     ) values($1,5,$2,pg_catalog.clock_timestamp()-interval '6 minutes')`,
    [exhaustedOperationId, exhaustedClaimToken],
  );
  const exhausted = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'configure_voice',$2,$3,$4::jsonb,null,null,null)`,
    [exhaustedAccountId, exhaustedKey, '4'.repeat(64), JSON.stringify(exhaustedPayload)],
  ));
  const exhaustedAttempt = one(await client.query(
    `select outcome,error_code from public.voice_number_provisioning_attempts
      where operation_id=$1 and attempt_number=5`,
    [exhaustedOperationId],
  ));
  check('the fifth pre-request lease expiry persists terminal state without rollback',
    exhausted.claim_status === 'terminal'
      && exhausted.operation_state === 'failed'
      && exhaustedAttempt.outcome === 'lease_expired');

  const retryAccountId = randomUUID();
  const retryInventoryId = randomUUID();
  const retryProviderId = randomUUID();
  const retryNumber = '+18103192946';
  const retryPayload = {
    voice_number_id: retryInventoryId,
    provider: 'signalwire',
    provider_number_id: retryProviderId,
    number: retryNumber,
    call_handler: 'laml_webhooks',
    call_request_method: 'POST',
    call_request_url: callUrl,
    call_status_callback_method: 'POST',
    call_status_callback_url: statusUrl,
  };
  const retryFingerprint = '5'.repeat(64);
  await client.query('insert into public.accounts(id) values($1)', [retryAccountId]);
  await client.query(
    `insert into public.voice_number_inventory(
       id,account_id,provider_number_id,e164_number,lifecycle_state,voice_capable
     ) values($1,$2,$3,$4,'purchased',true)`,
    [retryInventoryId, retryAccountId, retryProviderId, retryNumber],
  );
  const failedConfigure = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'configure_voice',$2,$3,$4::jsonb,null,null,null)`,
    [retryAccountId, `voice-configure-${randomUUID()}`, retryFingerprint,
      JSON.stringify(retryPayload)],
  ));
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [failedConfigure.operation_id, failedConfigure.claim_token]);
  await client.query('select public.reject_voice_number_operation($1,$2,$3,$4)',
    [failedConfigure.operation_id, failedConfigure.claim_token,
      'provider_rejected', 'Definitive provider failure.']);
  const recoveryHmac = '6'.repeat(64);
  const retryAuthorization = one(await client.query(
    `select * from public.authorize_voice_number_operation_retry(
       $1,$2,'owner@example.com','Reviewed explicit retry after MFA')`,
    [failedConfigure.operation_id, recoveryHmac],
  ));
  check('retry claim rejects any token other than the exact operator-authorized HMAC',
    await rejects(
      () => client.query(
        `select * from public.claim_voice_number_operation(
           $1,'configure_voice',$2,$3,$4::jsonb,null,$5,$6)`,
        [retryAccountId, `voice-configure-retry-${randomUUID()}`, retryFingerprint,
          JSON.stringify(retryPayload), retryAuthorization.retry_authorization_id,
          '7'.repeat(64)],
      ),
      /fresh exact operator recovery authorization/i,
    ));
  const retriedConfigure = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'configure_voice',$2,$3,$4::jsonb,null,$5,$6)`,
    [retryAccountId,
      `voice-configure-${retryInventoryId}:retry:${retryAuthorization.retry_generation}`,
      retryFingerprint, JSON.stringify(retryPayload),
      retryAuthorization.retry_authorization_id, recoveryHmac],
  ));
  const retryAuthorizationState = one(await client.query(
    `select state,consumed_operation_id
       from public.voice_number_operation_retry_authorizations where id=$1`,
    [retryAuthorization.retry_authorization_id],
  ));
  check('operator retry authorization is exact, bounded-generation, and one-time',
    retriedConfigure.claim_status === 'claimed'
      && Number(retryAuthorization.retry_generation) === 1
      && retryAuthorizationState.state === 'consumed'
      && retryAuthorizationState.consumed_operation_id === retriedConfigure.operation_id);
  await client.query('select public.begin_voice_number_operation($1,$2)',
    [retriedConfigure.operation_id, retriedConfigure.claim_token]);
  await client.query(
    `update public.voice_number_provisioning_operations
        set lease_expires_at=pg_catalog.clock_timestamp()-interval '1 minute'
      where id=$1`,
    [retriedConfigure.operation_id],
  );
  const recoveredRows = (await client.query(
    'select * from public.recover_stale_voice_number_operations(100)',
  )).rows;
  const recoveredRetry = recoveredRows.find((row) => row.operation_id === retriedConfigure.operation_id);
  check('a serverless death after provider request is swept into reconciliation',
    recoveredRetry?.recovery_status === 'needs_reconciliation'
      && recoveredRetry.operation_state === 'indeterminate');

  const wrongConfigureObservedNumber = '+18103192957';
  await client.query(
    `select public.record_voice_number_reconciliation_observation(
       $1,$2,$3::jsonb,'ops@example.com'
     )`,
    [retriedConfigure.operation_id, retryProviderId, JSON.stringify({
      provider: 'signalwire', id: retryProviderId,
      number: wrongConfigureObservedNumber, voice_capable: true,
    })],
  );
  const nonPurchaseObservedCleanupBlocked = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'observed',$2,$3,$4,'ops@example.com','Do not clean mismatched configure response'
       )`,
      [retriedConfigure.operation_id, retryProviderId, wrongConfigureObservedNumber,
        `voice-cleanup-observed-${randomUUID()}`],
    ),
    /exact purchase-response evidence/i,
  );
  const sameIdWrongNumberResolutionBlocked = await rejects(
    () => client.query(
      `select public.resolve_voice_number_operation(
         $1,'failed',null,null,'provider_configuration_absent','Wrong E.164 response',
         'retained','same_as_expected',$2::jsonb,'ops@example.com')`,
      [retriedConfigure.operation_id, JSON.stringify({
        provider: 'signalwire',
        operation_id: retriedConfigure.operation_id,
        expected_number: retryNumber,
        expected_provider_object_id: retryProviderId,
        observed_provider_object_id: retryProviderId,
        observed_number: wrongConfigureObservedNumber,
        expected_disposition: 'retained',
        observed_disposition: 'same_as_expected',
        cleanup_confirmed: true,
      })],
    ),
    /does not clean up every observed provider identity/i,
  );
  const quarantinedConfigureEvidence = one(await client.query(
    `select observed_provider_object_id,observed_provider_result,
            (select pg_catalog.count(*)::integer
               from public.voice_number_identity_cleanup_reservations r
              where r.operation_id=o.id) as cleanup_count
       from public.voice_number_provisioning_operations o where id=$1`,
    [retriedConfigure.operation_id],
  ));
  check('configure same-ID wrong-E.164 response stays quarantined with zero destructive authority',
    nonPurchaseObservedCleanupBlocked
      && sameIdWrongNumberResolutionBlocked
      && quarantinedConfigureEvidence.observed_provider_object_id === retryProviderId
      && quarantinedConfigureEvidence.observed_provider_result.number === wrongConfigureObservedNumber
      && Number(quarantinedConfigureEvidence.cleanup_count) === 0);

  const messagingConflictNumber = '+18103192958';
  const messagingConflictAccountA = randomUUID();
  const messagingConflictAccountB = randomUUID();
  const messagingConflictApplicationA = randomUUID();
  const messagingConflictApplicationB = randomUUID();
  const messagingConflictOperationA = randomUUID();
  await client.query('insert into public.accounts(id) values($1),($2)',
    [messagingConflictAccountA, messagingConflictAccountB]);
  await client.query(
    `insert into public.messaging_registration_applications(id,account_id,provider)
     values($1,$2,'signalwire'),($3,$4,'signalwire')`,
    [messagingConflictApplicationA, messagingConflictAccountA,
      messagingConflictApplicationB, messagingConflictAccountB],
  );
  await client.query(
    `insert into public.messaging_number_provisioning_operations(
       id,application_id,account_id,operation_type,idempotency_key,
       request_fingerprint,request_payload,state
     ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
    [messagingConflictOperationA, messagingConflictApplicationA, messagingConflictAccountA,
      `messaging-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify({ number: messagingConflictNumber })],
  );
  const duplicateMessagingRequestBlocked = await rejects(
    () => client.query(
      `insert into public.messaging_number_provisioning_operations(
         id,application_id,account_id,operation_type,idempotency_key,
         request_fingerprint,request_payload,state
       ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
      [randomUUID(), messagingConflictApplicationB, messagingConflictAccountB,
        `messaging-purchase-${randomUUID()}`, freshFingerprint(),
        JSON.stringify({ number: messagingConflictNumber })],
    ),
    /another unresolved messaging operation/i,
  );
  check('same-rail unresolved messaging purchase identity is globally isolated',
    duplicateMessagingRequestBlocked);

  const messagingLifecycleAccount = randomUUID();
  const messagingLifecycleApplication = randomUUID();
  const messagingLifecycleOperation = randomUUID();
  await client.query('insert into public.accounts(id) values($1)', [messagingLifecycleAccount]);
  await client.query(
    `insert into public.messaging_registration_applications(id,account_id,provider)
     values($1,$2,'signalwire')`,
    [messagingLifecycleApplication, messagingLifecycleAccount],
  );
  await client.query(
    `insert into public.messaging_number_provisioning_operations(
       id,application_id,account_id,operation_type,idempotency_key,
       request_fingerprint,request_payload,state
     ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
    [messagingLifecycleOperation, messagingLifecycleApplication, messagingLifecycleAccount,
      `messaging-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify({ number: '+18103192971' })],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations set state='claimed' where id=$1`,
    [messagingLifecycleOperation],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations set state='cancelled' where id=$1`,
    [messagingLifecycleOperation],
  );
  const messagingLifecycleState = one(await client.query(
    `select state from public.messaging_number_provisioning_operations where id=$1`,
    [messagingLifecycleOperation],
  ));
  check('ordinary messaging insert, claim, and pre-request cancellation remain valid',
    messagingLifecycleState.state === 'cancelled');

  const sharedWrongResponseId = randomUUID();
  const sharedWrongResponseNumber = '+18103192962';
  const crossRailVoice = await createIndeterminatePurchase({
    requestNumber: '+18103192960',
    observedProviderId: sharedWrongResponseId,
    observedNumber: sharedWrongResponseNumber,
  });
  const crossRailMessagingAccount = randomUUID();
  const crossRailMessagingApplication = randomUUID();
  const crossRailMessagingOperation = randomUUID();
  await client.query('insert into public.accounts(id) values($1)', [crossRailMessagingAccount]);
  await client.query(
    `insert into public.messaging_registration_applications(id,account_id,provider)
     values($1,$2,'signalwire')`,
    [crossRailMessagingApplication, crossRailMessagingAccount],
  );
  await client.query(
    `insert into public.messaging_number_provisioning_operations(
       id,application_id,account_id,operation_type,idempotency_key,
       request_fingerprint,request_payload,state
     ) values($1,$2,$3,'purchase_number',$4,$5,$6::jsonb,'pending')`,
    [crossRailMessagingOperation, crossRailMessagingApplication, crossRailMessagingAccount,
      `messaging-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify({ number: '+18103192963' })],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='request_started' where id=$1`,
    [crossRailMessagingOperation],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set state='indeterminate' where id=$1`,
    [crossRailMessagingOperation],
  );
  await client.query(
    `update public.messaging_number_provisioning_operations
        set provider_object_id=$2,provider_result=$3::jsonb where id=$1`,
    [crossRailMessagingOperation, sharedWrongResponseId, JSON.stringify({
      id: sharedWrongResponseId, number: sharedWrongResponseNumber,
    })],
  );
  const messagingCapturedConflict = one(await client.query(
    `select state,provider_object_id,provider_result
       from public.messaging_number_provisioning_operations where id=$1`,
    [crossRailMessagingOperation],
  ));
  const conflictingMessagingProjectionBlocked = await rejects(
    () => client.query(
      `update public.messaging_number_provisioning_operations
          set state='succeeded' where id=$1`,
      [crossRailMessagingOperation],
    ),
    /conflicts with AI Voice ownership or cleanup evidence/i,
  );
  const crossRailVoiceCleanupBlocked = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'observed',$2,$3,$4,'ops@example.com','Clean captured wrong-response purchase identity'
       )`,
      [crossRailVoice.operation_id, sharedWrongResponseId, sharedWrongResponseNumber,
        `voice-cleanup-observed-${randomUUID()}`],
    ),
    /unresolved messaging operation/i,
  );
  const sameVoiceWrongResponse = await createIndeterminatePurchase({
    requestNumber: '+18103192961',
    observedProviderId: sharedWrongResponseId,
    observedNumber: sharedWrongResponseNumber,
  });
  const sameVoiceCleanupBlocked = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'observed',$2,$3,$4,'ops@example.com','Clean captured wrong-response purchase identity'
       )`,
      [sameVoiceWrongResponse.operation_id, sharedWrongResponseId, sharedWrongResponseNumber,
        `voice-cleanup-observed-${randomUUID()}`],
    ),
    /another unresolved SignalWire operation|unresolved messaging operation/i,
  );
  check('wrong-response evidence is durably quarantined across Voice and messaging rails',
    messagingCapturedConflict.state === 'indeterminate'
      && messagingCapturedConflict.provider_object_id === sharedWrongResponseId
      && messagingCapturedConflict.provider_result.number === sharedWrongResponseNumber
      && conflictingMessagingProjectionBlocked
      && crossRailVoiceCleanupBlocked
      && sameVoiceCleanupBlocked);

  const lockOrderSmsAccount = randomUUID();
  const lockOrderSmsId = randomUUID();
  const lockOrderIdentityId = randomUUID();
  const lockOrderIdentityNumber = '+18103192967';
  await client.query('insert into public.accounts(id) values($1)', [lockOrderSmsAccount]);
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [lockOrderSmsId, lockOrderIdentityId, lockOrderIdentityNumber],
  );
  const lockOrderPurchase = await createIndeterminatePurchase({
    requestNumber: '+18103192968',
    observedProviderId: lockOrderIdentityId,
    observedNumber: lockOrderIdentityNumber,
  });
  const racePurchase = await createIndeterminatePurchase({
    requestNumber: '+18103192964',
    observedProviderId: randomUUID(),
  });
  const raceKey = `voice-cleanup-observed-${randomUUID()}`;
  const { Client: RaceClient } = await import('pg');
  const raceClient = new RaceClient({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_voice_number_check',
  });
  await raceClient.connect();
  await raceClient.query("set statement_timeout = '15s'");
  await client.query('begin');
  await client.query('select pg_catalog.pg_advisory_xact_lock(1280265031,2108)');
  await raceClient.query('begin');
  const blockedAssignment = raceClient.query(
    `update public.sms_sender_numbers set e164_number=e164_number where id=$1`,
    [lockOrderSmsId],
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  const ownershipProbeRejectedWithoutDeadlock = await rejects(
    () => client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'observed',$2,$3,$4,'lock-order@example.com','Concurrent ownership probe'
       )`,
      [lockOrderPurchase.operation_id, lockOrderIdentityId, lockOrderIdentityNumber,
        `voice-cleanup-observed-${randomUUID()}`],
    ),
    /still referenced by the SMS rail/i,
  );
  await client.query('rollback');
  const assignmentRejectedAfterLockRelease = await rejects(
    () => blockedAssignment,
    /reserved by an unresolved AI Voice operation/i,
  );
  await raceClient.query('rollback');
  await client.query('delete from public.sms_sender_numbers where id=$1', [lockOrderSmsId]);

  const lockOrderPolicy = one(await client.query(
    `select monthly_unit_price_cents from public.voice_number_spend_policies
      where provider='signalwire'`,
  ));
  await client.query(
    `select * from public.set_voice_number_spend_policy(
       'signalwire',$1::bigint,50000::bigint,true,'lock-order@example.com')`,
    [lockOrderPolicy.monthly_unit_price_cents],
  );

  const claimProbe = await preparePurchaseClaim({ requestNumber: '+18103192969' });
  const claimProbeSmsId = randomUUID();
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [claimProbeSmsId, randomUUID(), claimProbe.requestNumber],
  );
  await client.query('begin');
  await client.query('select pg_catalog.pg_advisory_xact_lock(1280265031,2108)');
  await raceClient.query('begin');
  const blockedClaimAssignment = raceClient.query(
    `update public.sms_sender_numbers set e164_number=e164_number where id=$1`,
    [claimProbeSmsId],
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  const claimRejectedWithoutDeadlock = await rejects(
    () => client.query(
      `select * from public.claim_voice_number_operation(
         $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
      [claimProbe.accountId, `voice-purchase-${randomUUID()}`, freshFingerprint(),
        JSON.stringify(claimProbe.payload), claimProbe.authorizationId],
    ),
    /live SMS rail/i,
  );
  await client.query('rollback');
  let claimAssignmentCompleted = false;
  try {
    await blockedClaimAssignment;
    claimAssignmentCompleted = true;
  } catch {}
  await raceClient.query('rollback');
  await client.query('delete from public.sms_sender_numbers where id=$1', [claimProbeSmsId]);

  const beginProbe = await preparePurchaseClaim({ requestNumber: '+18103192970' });
  const beginProbeOperation = one(await client.query(
    `select * from public.claim_voice_number_operation(
       $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
    [beginProbe.accountId, `voice-purchase-${randomUUID()}`, freshFingerprint(),
      JSON.stringify(beginProbe.payload), beginProbe.authorizationId],
  ));
  const beginProbeSmsId = randomUUID();
  await client.query(
    'alter table public.sms_sender_numbers disable trigger sms_sender_numbers_voice_cleanup_reservation_guard',
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,provisioning_status,provider_number_id,e164_number,purpose
     ) values($1,'signalwire','active',$2,$3,'shared')`,
    [beginProbeSmsId, randomUUID(), beginProbe.requestNumber],
  );
  await client.query(
    'alter table public.sms_sender_numbers enable trigger sms_sender_numbers_voice_cleanup_reservation_guard',
  );
  await client.query('begin');
  await client.query('select pg_catalog.pg_advisory_xact_lock(1280265031,2108)');
  await raceClient.query('begin');
  const blockedBeginAssignment = raceClient.query(
    `update public.sms_sender_numbers set e164_number=e164_number where id=$1`,
    [beginProbeSmsId],
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  const beginProbeResult = one(await client.query(
    'select public.begin_voice_number_operation($1,$2) as begun',
    [beginProbeOperation.operation_id, beginProbeOperation.claim_token],
  ));
  await client.query('commit');
  let beginAssignmentCompleted = false;
  try {
    await blockedBeginAssignment;
    beginAssignmentCompleted = true;
  } catch {}
  await raceClient.query('rollback');
  const beginProbeState = one(await client.query(
    `select state,error_code from public.voice_number_provisioning_operations where id=$1`,
    [beginProbeOperation.operation_id],
  ));
  await client.query('delete from public.sms_sender_numbers where id=$1', [beginProbeSmsId]);

  const concurrentCleanupPurchase = await createIndeterminatePurchase({
    requestNumber: '+18103192972',
    observedProviderId: randomUUID(),
  });
  const concurrentBeginProbe = await preparePurchaseClaim({ requestNumber: '+18103192973' });
  const concurrentCleanupKey = `voice-cleanup-observed-${randomUUID()}`;
  const [concurrentBeginResult, concurrentCleanupResult] = await Promise.allSettled([
    (async () => {
      const operation = one(await raceClient.query(
        `select * from public.claim_voice_number_operation(
           $1,'purchase_number',$2,$3,$4::jsonb,$5,null,null)`,
        [concurrentBeginProbe.accountId, `voice-purchase-${randomUUID()}`, freshFingerprint(),
          JSON.stringify(concurrentBeginProbe.payload), concurrentBeginProbe.authorizationId],
      ));
      const begun = one(await raceClient.query(
        'select public.begin_voice_number_operation($1,$2) as begun',
        [operation.operation_id, operation.claim_token],
      ));
      return { operation, begun: begun.begun };
    })(),
    client.query(
      `select * from public.reserve_voice_number_identity_cleanup(
         $1,'observed',$2,$3,$4,'concurrency@example.com',
         'Concurrent provider-wide purchase versus cleanup gate'
       )`,
      [concurrentCleanupPurchase.operation_id, concurrentCleanupPurchase.observedProviderId,
        concurrentCleanupPurchase.observedNumber, concurrentCleanupKey],
    ),
  ]);
  const concurrentBegin = concurrentBeginResult.status === 'fulfilled'
    ? concurrentBeginResult.value
    : null;
  const concurrentCleanup = concurrentCleanupResult.status === 'fulfilled'
    ? one(concurrentCleanupResult.value)
    : null;
  const concurrentCleanupError = concurrentCleanupResult.status === 'rejected'
    ? String(concurrentCleanupResult.reason instanceof Error
      ? concurrentCleanupResult.reason.message
      : concurrentCleanupResult.reason)
    : '';
  const concurrentBeginState = concurrentBegin
    ? one(await client.query(
      `select state,error_code from public.voice_number_provisioning_operations where id=$1`,
      [concurrentBegin.operation.operation_id],
    ))
    : null;
  const concurrentGateSerialized = Boolean(concurrentBegin) && (
    (
      concurrentCleanup?.reserve_status === 'reserved'
      && concurrentBegin?.begun === false
      && concurrentBeginState?.state === 'cancelled'
      && concurrentBeginState?.error_code === 'provider_identity_cleanup_active'
    )
    || (
      concurrentCleanup === null
      && concurrentBegin?.begun === true
      && /purchase response is in flight/i.test(concurrentCleanupError)
      && concurrentBeginState?.state === 'request_started'
    )
  );
  if (concurrentCleanup?.reserve_status === 'reserved') {
    await client.query(
      `select public.finalize_voice_number_identity_cleanup(
         $1,$2,'confirmed_absent',$3::jsonb,'concurrency@example.com'
       )`,
      [concurrentCleanup.reservation_id, concurrentCleanup.lease_token, JSON.stringify({
        provider: 'signalwire',
        provider_number_id: concurrentCleanupPurchase.observedProviderId,
        number: concurrentCleanupPurchase.observedNumber,
        disposition: 'confirmed_absent',
        cleanup_confirmed: true,
      })],
    );
  }
  if (concurrentBegin?.begun === true) {
    await client.query(
      `select public.mark_voice_number_operation_indeterminate(
         $1,$2,'concurrency_probe','No provider request was issued by the database gate test',null,null
       )`,
      [concurrentBegin.operation.operation_id, concurrentBegin.operation.claim_token],
    );
  }

  const raceArgs = [racePurchase.operation_id, racePurchase.observedProviderId,
    racePurchase.observedNumber, raceKey];
  const raceSql = `select * from public.reserve_voice_number_identity_cleanup(
    $1,'observed',$2,$3,$4,'race-worker@example.com','Concurrent exact cleanup lease')`;
  const raceResults = await Promise.all([
    client.query(raceSql, raceArgs),
    raceClient.query(raceSql, raceArgs),
  ]);
  await raceClient.end();
  const raceRows = raceResults.map(one);
  const raceOwner = raceRows.find((row) => row.reserve_status === 'reserved');
  const raceBusy = raceRows.find((row) => row.reserve_status === 'busy');
  if (raceOwner) {
    await client.query(
      `select public.finalize_voice_number_identity_cleanup(
         $1,$2,'confirmed_absent',$3::jsonb,'race-worker@example.com'
       )`,
      [raceOwner.reservation_id, raceOwner.lease_token, JSON.stringify({
        provider: 'signalwire',
        provider_number_id: racePurchase.observedProviderId,
        number: racePurchase.observedNumber,
        disposition: 'confirmed_absent',
        cleanup_confirmed: true,
      })],
    );
  }
  check('two database workers receive exactly one actionable cleanup lease',
    Boolean(raceOwner?.lease_token)
      && raceBusy?.lease_token === null
      && raceBusy?.reservation_id === raceOwner?.reservation_id);
  check('cleanup ownership probes avoid tuple-to-provider lock inversion',
    ownershipProbeRejectedWithoutDeadlock && assignmentRejectedAfterLockRelease);
  check('purchase claim ownership probes avoid tuple-to-provider lock inversion',
    claimRejectedWithoutDeadlock && claimAssignmentCompleted);
  check('purchase begin ownership probes avoid tuple-to-provider lock inversion',
    beginProbeResult.begun === false
      && beginProbeState.state === 'cancelled'
      && beginProbeState.error_code === 'sms_rail_already_references_number'
      && beginAssignmentCompleted);
  check('concurrent Voice claim/begin and cleanup reserve serialize at the provider-wide gate',
    concurrentGateSerialized);

  const privileges = one(await client.query(`
    select
      pg_catalog.has_function_privilege(
        'service_role','public.claim_voice_number_operation(uuid,text,text,text,jsonb,uuid,uuid,text)','EXECUTE'
      ) as service_rpc,
      pg_catalog.has_function_privilege(
        'authenticated','public.claim_voice_number_operation(uuid,text,text,text,jsonb,uuid,uuid,text)','EXECUTE'
      ) as authenticated_rpc,
      pg_catalog.has_table_privilege(
        'service_role','public.voice_number_inventory','SELECT'
      ) as service_read,
      pg_catalog.has_table_privilege(
        'service_role','public.voice_number_inventory','UPDATE'
      ) as service_update,
      pg_catalog.has_function_privilege(
        'service_role','public.reserve_voice_number_identity_cleanup(uuid,text,text,text,text,text,text)','EXECUTE'
      ) as service_cleanup_reserve,
      pg_catalog.has_function_privilege(
        'service_role','public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)','EXECUTE'
      ) as service_cleanup_enumerate,
      pg_catalog.has_function_privilege(
        'service_role','public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)','EXECUTE'
      ) as service_purchase_cleanup_enumerate,
      pg_catalog.has_function_privilege(
        'service_role','public.finalize_voice_number_identity_cleanup(uuid,uuid,text,jsonb,text)','EXECUTE'
      ) as service_cleanup_finalize,
      pg_catalog.has_function_privilege(
        'service_role','public.record_voice_number_reconciliation_observation(uuid,text,jsonb,text)','EXECUTE'
      ) as service_observe,
      pg_catalog.has_function_privilege(
        'authenticated','public.reserve_voice_number_identity_cleanup(uuid,text,text,text,text,text,text)','EXECUTE'
      ) as authenticated_cleanup,
      pg_catalog.has_function_privilege(
        'authenticated','public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)','EXECUTE'
      ) as authenticated_cleanup_enumerate,
      pg_catalog.has_function_privilege(
        'authenticated','public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)','EXECUTE'
      ) as authenticated_purchase_cleanup_enumerate,
      pg_catalog.has_table_privilege(
        'service_role','public.voice_number_identity_cleanup_reservations','SELECT'
      ) as service_cleanup_read,
      pg_catalog.has_table_privilege(
        'service_role','public.voice_provider_terminal_call_tombstones','SELECT'
      ) as service_tombstone_read
  `));
  check('inventory is service-read and RPC-write only',
    privileges.service_rpc && !privileges.authenticated_rpc
      && privileges.service_read && !privileges.service_update
      && privileges.service_cleanup_reserve && privileges.service_cleanup_enumerate
      && privileges.service_purchase_cleanup_enumerate
      && privileges.service_cleanup_finalize && privileges.service_observe
      && !privileges.authenticated_cleanup && !privileges.authenticated_cleanup_enumerate
      && !privileges.authenticated_purchase_cleanup_enumerate
      && !privileges.service_cleanup_read && !privileges.service_tombstone_read);
} catch (error) {
  fatal = error;
  console.error(error);
} finally {
  try { await client?.end(); } catch {}
  try {
    await execFileAsync(join(pgBin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'), [
      'stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '8',
    ], { windowsHide: true, timeout: 10_000 });
  } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (fatal || failed.length) process.exitCode = 1;
