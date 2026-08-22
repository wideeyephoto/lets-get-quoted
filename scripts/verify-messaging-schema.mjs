// Execute the canonical schema top-to-bottom in a fresh disposable PostgreSQL
// 17 database. This catches dependencies that digest parity and FK ordering
// cannot: missing functions, constraints, roles, or migration prerequisites.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const PORT = Number(process.env.LGQ_MESSAGING_SCHEMA_CHECK_PORT || 54359);
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
  console.error('embedded-postgres is not installed; run the PostgreSQL harness setup first.');
  process.exit(2);
}

const bin = join(process.cwd(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

const prelude = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end
$roles$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default pg_catalog.gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
`;

const requiredTables = [
  'sms_events',
  'sms_sender_numbers',
  'sms_delivery_tasks',
  'sms_webhook_receipts',
  'sms_inbound_action_tasks',
  'messaging_registration_applications',
  'messaging_number_provisioning_operations',
  'voice_calls',
  'voice_events',
  'payment_sms_producer_tasks',
  'sms_missed_call_receipts',
  'sms_compliance_reply_results',
  'sms_consent_scopes',
  'workspace_overage_event_settlements',
];
const requiredFunctions = [
  'enqueue_sms_delivery',
  'mark_sms_delivery_request_started_with_usage',
  'rollback_sms_delivery_pre_request_boundary',
  'ingest_sms_inbound_webhook',
  'claim_sms_inbound_action_batch',
  'claim_voice_call_admission',
  'claim_payment_sms_producer_tasks',
  'enqueue_direct_payment_settlement_sms',
  'enqueue_authorized_inbox_message',
  'ingest_sms_missed_call',
  'record_sms_compliance_reply_result',
  'settle_usage_overage_result',
];

const pg = new EmbeddedPostgres({
  databaseDir: join(process.cwd(), '.pg17-messaging-schema-check'),
  user: 'postgres', password: 'postgres', port: PORT, persistent: false,
});
let client;
let concurrentClient;
try {
  await pg.initialise();
  await pg.start();
  const bootstrap = pg.getPgClient('postgres');
  await bootstrap.connect();
  await bootstrap.query(
    `create database lgq_messaging_schema_check
       with template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`,
  );
  await bootstrap.end();
  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_messaging_schema_check', application_name: 'lgq-messaging-schema-check',
  });
  await client.connect();
  await client.query("set statement_timeout = '90s'");
  // A failed multi-statement schema query can be hundreds of thousands of
  // characters. Keep the server log from echoing the whole statement while
  // preserving the exact PostgreSQL error returned to this harness.
  await client.query("set log_min_error_statement = 'panic'");
  await client.query(prelude);
  await client.query(readFileSync(join(process.cwd(), 'schema.sql'), 'utf8'));
  check('schema.sql executes top-to-bottom in a fresh PostgreSQL 17 database', true);
  await client.query(readFileSync(
    join(process.cwd(), 'migrations/20260821210000_sms_durability_followups.sql'),
    'utf8',
  ));
  await client.query(readFileSync(
    join(process.cwd(), 'migrations/20260821210500_sms_purpose_aware_inbound_routing.sql'),
    'utf8',
  ));
  check('SMS durability and purpose-routing follow-ups reapply with explicit postconditions', true);

  const tables = await client.query(
    `select tablename from pg_catalog.pg_tables
      where schemaname='public' and tablename = any($1::text[])`,
    [requiredTables],
  );
  const foundTables = new Set(tables.rows.map((row) => row.tablename));
  check('all messaging and voice runtime tables exist',
    requiredTables.every((name) => foundTables.has(name)),
    requiredTables.filter((name) => !foundTables.has(name)).join(', '));

  const functions = await client.query(
    `select p.proname
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = any($1::text[])`,
    [requiredFunctions],
  );
  const foundFunctions = new Set(functions.rows.map((row) => row.proname));
  check('all critical messaging and voice RPCs exist',
    requiredFunctions.every((name) => foundFunctions.has(name)),
    requiredFunctions.filter((name) => !foundFunctions.has(name)).join(', '));

  concurrentClient = new Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_messaging_schema_check', application_name: 'lgq-messaging-schema-concurrent',
  });
  await concurrentClient.connect();
  await concurrentClient.query("set statement_timeout = '90s'");
  const rejectionCode = async (connection, sql, params = []) => {
    try {
      await connection.query(sql, params);
      return null;
    } catch (error) {
      return error?.code ?? 'unknown';
    }
  };

  // Fixtures shared by the behavioral durability checks below.
  const accountId = randomUUID();
  const jobId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const senderId = randomUUID();
  await client.query(
    `insert into public.accounts(id,business_name,call_textback_enabled)
     values ($1,'Durability Test Co',true)`, [accountId],
  );
  await client.query(
    `insert into public.sites(account_id,company_name)
     values ($1,'Durability Test Co')`, [accountId],
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,e164_number,provider_number_id,purpose,account_id,
       assignment_state,provisioning_status,inbound_ready,activated_at,
       provider_brand_state,provider_campaign_state,provider_verified_at,
       provider_phone_verified_at,provider_sms_capable,inbound_request_method,
       inbound_message_handler
     ) values($1,'signalwire','+12485550999','durability-number',
       'contractor_dedicated',$2,'assigned','active',true,now(),
       'complete','complete',now(),now(),true,'POST','LaML_Webhooks')`,
    [senderId, accountId],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name)
     values ($1,$2,'DURABILITY-JOB','Test Client')`, [jobId, accountId],
  );
  await client.query(
    `insert into public.invoices(id,account_id,job_id,ref,total)
     values ($1,$2,$3,'DURABILITY-INVOICE',100)`,
    [invoiceId, accountId, jobId],
  );
  await client.query(
    `insert into public.payments(
       id,account_id,job_id,invoice_id,kind,amount,status,
       homeowner_phone,sms_consent,charge_model
     ) values ($1,$2,$3,$4,'deposit',100,'requested','+12485550101',true,'destination')`,
    [paymentId, accountId, jobId, invoiceId],
  );

  // Isolate this trigger from unrelated payment-domain projectors in the
  // disposable database, then race two claims against one durable intent.
  const paymentTriggers = await client.query(
    `select t.tgname from pg_catalog.pg_trigger t
      where t.tgrelid='public.payments'::pg_catalog.regclass
        and not t.tgisinternal and t.tgname <> 'payment_sms_transition_outbox'`,
  );
  for (const row of paymentTriggers.rows) {
    const trigger = String(row.tgname).replaceAll('"', '""');
    await client.query(`alter table public.payments disable trigger "${trigger}"`);
  }
  await client.query(`update public.payments set status='failed' where id=$1`, [paymentId]);
  await client.query(`update public.payments set status='failed' where id=$1`, [paymentId]);
  const producerCount = await client.query(
    `select count(*)::int as count from public.payment_sms_producer_tasks
      where payment_id=$1 and event_type='payment_failed'`, [paymentId],
  );
  const producerClaims = await Promise.all([
    client.query('select * from public.claim_payment_sms_producer_tasks(1)'),
    concurrentClient.query('select * from public.claim_payment_sms_producer_tasks(1)'),
  ]);
  const claimedRows = producerClaims.flatMap((result) => result.rows);
  check('payment transition outbox is unique and concurrent claim has one winner',
    producerCount.rows[0]?.count === 1 && claimedRows.length === 1
      && claimedRows[0]?.payment_id === paymentId);
  await client.query(
    `select public.complete_payment_sms_producer_task($1,$2,'skipped',null)`,
    [claimedRows[0].task_id, claimedRows[0].work_claim_token],
  );

  const failedThenPaidId = randomUUID();
  const paidThenRefundedId = randomUUID();
  for (const id of [failedThenPaidId, paidThenRefundedId]) {
    await client.query(
      `insert into public.payments(
         id,account_id,job_id,invoice_id,kind,amount,status,
         homeowner_phone,sms_consent,charge_model
       ) values ($1,$2,$3,$4,'deposit',100,'requested','+12485550101',true,'destination')`,
      [id, accountId, jobId, invoiceId],
    );
  }
  await client.query(`update public.payments set status='failed' where id=$1`, [failedThenPaidId]);
  await client.query(`update public.payments set status='paid' where id=$1`, [failedThenPaidId]);
  const currentPaidClaims = await client.query('select * from public.claim_payment_sms_producer_tasks(10)');
  const currentPaidClaim = currentPaidClaims.rows.find((row) => row.payment_id === failedThenPaidId);
  const failedThenPaidStates = await client.query(
    `select event_type,task_state,outcome from public.payment_sms_producer_tasks
      where payment_id=$1 order by event_type`, [failedThenPaidId],
  );
  check('failed then paid suppresses the obsolete failure before producer egress',
    currentPaidClaim?.event_type === 'payment_paid'
      && failedThenPaidStates.rows.find((row) => row.event_type === 'payment_failed')?.outcome === 'superseded'
      && failedThenPaidStates.rows.find((row) => row.event_type === 'payment_failed')?.task_state === 'completed');
  await client.query(
    `select public.complete_payment_sms_producer_task($1,$2,'skipped',null)`,
    [currentPaidClaim.task_id, currentPaidClaim.work_claim_token],
  );

  await client.query(`update public.payments set status='paid' where id=$1`, [paidThenRefundedId]);
  await client.query(`update public.payments set status='refunded' where id=$1`, [paidThenRefundedId]);
  const currentRefundClaims = await client.query('select * from public.claim_payment_sms_producer_tasks(10)');
  const currentRefundClaim = currentRefundClaims.rows.find((row) => row.payment_id === paidThenRefundedId);
  const paidThenRefundedStates = await client.query(
    `select event_type,task_state,outcome from public.payment_sms_producer_tasks
      where payment_id=$1 order by event_type`, [paidThenRefundedId],
  );
  check('paid then refunded suppresses the obsolete paid notice before producer egress',
    currentRefundClaim?.event_type === 'payment_refunded'
      && paidThenRefundedStates.rows.find((row) => row.event_type === 'payment_paid')?.outcome === 'superseded'
      && paidThenRefundedStates.rows.find((row) => row.event_type === 'payment_paid')?.task_state === 'completed');
  await client.query(
    `select public.complete_payment_sms_producer_task($1,$2,'skipped',null)`,
    [currentRefundClaim.task_id, currentRefundClaim.work_claim_token],
  );

  const missedArgs = [
    'signalwire', 'missed-call-concurrent-1', accountId, '+12485550102',
    'no-answer', 'a'.repeat(64),
  ];
  const missedCalls = await Promise.all([
    client.query(
      'select * from public.ingest_sms_missed_call($1,$2,$3,$4,$5,$6)', missedArgs,
    ),
    concurrentClient.query(
      'select * from public.ingest_sms_missed_call($1,$2,$3,$4,$5,$6)', missedArgs,
    ),
  ]);
  const missedRows = missedCalls.map((result) => result.rows[0]);
  const missedState = await client.query(
    `select
       (select count(*)::int from public.sms_missed_call_receipts
         where provider='signalwire' and provider_call_id='missed-call-concurrent-1') as receipts,
       (select count(*)::int from public.leads
         where account_id=$1 and source::text='missed_call' and phone='+12485550102') as leads,
       (select count(*)::int from public.sms_events
         where idempotency_key='missed-call:signalwire:missed-call-concurrent-1') as events,
       (select count(*)::int from public.sms_delivery_tasks t
          join public.sms_events e on e.id=t.sms_event_id
         where e.idempotency_key='missed-call:signalwire:missed-call-concurrent-1') as tasks`,
    [accountId],
  );
  check('concurrent missed-call callbacks commit exactly one lead and SMS outbox',
    missedRows.filter((row) => row.ingest_disposition === 'accepted').length === 2
      && missedRows.filter((row) => row.duplicate === false).length === 1
      && missedRows.filter((row) => row.duplicate === true).length === 1
      && missedState.rows[0]?.receipts === 1
      && missedState.rows[0]?.leads === 1
      && missedState.rows[0]?.events === 1
      && missedState.rows[0]?.tasks === 1,
    JSON.stringify({ missedRows, state: missedState.rows[0] }));
  const missedMismatchCode = await rejectionCode(
    client,
    'select * from public.ingest_sms_missed_call($1,$2,$3,$4,$5,$6)',
    ['signalwire', 'missed-call-concurrent-1', accountId, '+12485550102',
      'busy', 'b'.repeat(64)],
  );
  const missedStateAfterMismatch = await client.query(
    `select
       (select count(*)::int from public.sms_missed_call_receipts
         where provider='signalwire' and provider_call_id='missed-call-concurrent-1') as receipts,
       (select count(*)::int from public.leads
         where account_id=$1 and source::text='missed_call' and phone='+12485550102') as leads`,
    [accountId],
  );
  check('missed-call key replay rejects changed dial/body evidence without a second lead',
    missedMismatchCode === 'P5123'
      && missedStateAfterMismatch.rows[0]?.receipts === 1
      && missedStateAfterMismatch.rows[0]?.leads === 1,
    JSON.stringify({ missedMismatchCode, state: missedStateAfterMismatch.rows[0] }));

  // Force enqueue_sms_delivery's payload-identity check to fail after the RPC
  // has tentatively inserted its receipt and lead. PostgreSQL must roll all of
  // them back together so the provider's retry can try the whole unit again.
  await client.query(
    `select * from public.enqueue_sms_delivery(
       p_account_id => $1, p_phone_number => '+12485550103',
       p_body => 'conflicting prior payload', p_message_kind => 'missed-call',
       p_billing_category => 'customer_message',
       p_sender_purpose => 'contractor_dedicated', p_context => 'automation',
       p_event_type => 'missed_call',
       p_idempotency_key => 'missed-call:signalwire:missed-call-rollback'
     )`, [accountId],
  );
  let rollbackCode = null;
  try {
    await client.query(
      'select * from public.ingest_sms_missed_call($1,$2,$3,$4,$5,$6)',
      ['signalwire', 'missed-call-rollback', accountId, '+12485550103',
        'no-answer', 'b'.repeat(64)],
    );
  } catch (error) {
    rollbackCode = error?.code ?? 'unknown';
  }
  const rolledBack = await client.query(
    `select
       (select count(*)::int from public.sms_missed_call_receipts
         where provider_call_id='missed-call-rollback') as receipts,
       (select count(*)::int from public.leads
         where account_id=$1 and source::text='missed_call' and phone='+12485550103') as leads`,
    [accountId],
  );
  check('missed-call enqueue failure rolls back both receipt and lead',
    rollbackCode !== null && rolledBack.rows[0]?.receipts === 0
      && rolledBack.rows[0]?.leads === 0,
    JSON.stringify({ rollbackCode, state: rolledBack.rows[0] }));

  const inboundPhone = '+12485550107';
  const subcontractorPhone = '+12485550127';
  const ownerPhone = '+12485550137';
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values
       ($1,$2,'opted_in','crew_added',now()),
       ($1,$3,'opted_in','subcontractor_added',now()),
       ($1,$4,'opted_in','owner_alerts',now())`,
    [accountId, inboundPhone, subcontractorPhone, ownerPhone],
  );
  const crewScopeCode = await rejectionCode(
    client,
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Must not queue','manual-reply:crew-scope',false)`,
    [accountId, inboundPhone],
  );
  const subcontractorScopeCode = await rejectionCode(
    client,
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Must not queue','manual-reply:subcontractor-scope',false)`,
    [accountId, subcontractorPhone],
  );
  const ownerScopeCode = await rejectionCode(
    client,
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Must not queue','manual-reply:owner-scope',false)`,
    [accountId, ownerPhone],
  );
  const customerNoThreadPhone = '+12485550117';
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values($1,$2,'opted_in','payment_request',now())`,
    [accountId, customerNoThreadPhone],
  );
  const unknownThreadCode = await rejectionCode(
    client,
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Must not queue','manual-reply:unknown-thread',true)`,
    [accountId, customerNoThreadPhone],
  );
  const scopeBeforeInbound = await client.query(
    `select phone_number,consent_scope from public.sms_consent_scopes
      where account_id=$1 and phone_number=any($2::text[])
      order by phone_number,consent_scope`,
    [accountId, [inboundPhone, subcontractorPhone, ownerPhone, customerNoThreadPhone]],
  );
  const upgradedSubcontractor = (await client.query(
    `select public.ensure_sms_consent_baseline_scope(
       $1,$2,'portal_link_request') as ready`,
    [accountId, subcontractorPhone],
  )).rows[0];
  const upgradedOwner = (await client.query(
    `select public.ensure_sms_consent_baseline_scope(
       $1,$2,'missed_call_text_back') as ready`,
    [accountId, ownerPhone],
  )).rows[0];
  const optedOutBaselinePhone = '+12485550147';
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values($1,$2,'opted_out','crew_added',now()-interval '1 day',now())`,
    [accountId, optedOutBaselinePhone],
  );
  const stoppedUpgrade = (await client.query(
    `select public.ensure_sms_consent_baseline_scope(
       $1,$2,'portal_link_request') as ready`,
    [accountId, optedOutBaselinePhone],
  )).rows[0];
  const scopeAfterSolicitation = await client.query(
    `select phone_number,consent_scope,evidence_source
       from public.sms_consent_scopes
      where account_id=$1 and phone_number=any($2::text[])
      order by phone_number,consent_scope`,
    [accountId, [subcontractorPhone, ownerPhone, optedOutBaselinePhone]],
  );
  const inboundReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-inbound-1','durability-inbound-1',$1,
       'application/json','https://example.test/api/sms/inbound',$2,
       '+12485550999','HELLO',array[]::text[],'other')`,
    ['d'.repeat(64), inboundPhone],
  )).rows[0];
  const authorizedReply = (await client.query(
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Now this is a real thread','manual-reply:known-thread',true)`,
    [accountId, inboundPhone],
  )).rows[0];
  const scopeAfterInbound = await client.query(
    `select consent_scope,evidence_source from public.sms_consent_scopes
      where account_id=$1 and phone_number=$2 order by consent_scope`,
    [accountId, inboundPhone],
  );
  const unauthorizedEventCount = await client.query(
    `select count(*)::int as count from public.sms_events
      where account_id=$1 and idempotency_key in (
        'manual-reply:crew-scope','manual-reply:subcontractor-scope',
        'manual-reply:owner-scope','manual-reply:unknown-thread'
      )`, [accountId],
  );
  check('manual inbox authorization requires customer scope and exact thread evidence',
    crewScopeCode === 'P5112'
      && subcontractorScopeCode === 'P5112'
      && ownerScopeCode === 'P5112'
      && unknownThreadCode === 'P5110'
      && inboundReceipt?.ingress_disposition === 'routed'
      && authorizedReply?.task_state === 'queued'
      && scopeBeforeInbound.rows.some((row) => row.phone_number === inboundPhone
        && row.consent_scope === 'crew')
      && !scopeBeforeInbound.rows.some((row) => row.phone_number === inboundPhone
        && row.consent_scope === 'customer')
      && scopeBeforeInbound.rows.some((row) => row.phone_number === customerNoThreadPhone
        && row.consent_scope === 'customer')
      && scopeBeforeInbound.rows.some((row) => row.phone_number === subcontractorPhone
        && row.consent_scope === 'crew')
      && scopeBeforeInbound.rows.some((row) => row.phone_number === ownerPhone
        && row.consent_scope === 'owner')
      && !scopeBeforeInbound.rows.some((row) => row.phone_number === ownerPhone
        && row.consent_scope === 'customer')
      && upgradedSubcontractor?.ready === true
      && upgradedOwner?.ready === true
      && stoppedUpgrade?.ready === false
      && scopeAfterSolicitation.rows.some((row) => row.phone_number === subcontractorPhone
        && row.consent_scope === 'customer'
        && row.evidence_source === 'portal_link_request')
      && scopeAfterSolicitation.rows.some((row) => row.phone_number === ownerPhone
        && row.consent_scope === 'customer'
        && row.evidence_source === 'missed_call_text_back')
      && !scopeAfterSolicitation.rows.some((row) => row.phone_number === optedOutBaselinePhone
        && row.consent_scope === 'customer')
      && scopeAfterInbound.rows.some((row) => row.consent_scope === 'customer'
        && row.evidence_source === 'authenticated_inbound')
      && unauthorizedEventCount.rows[0]?.count === 0,
    JSON.stringify({
      crewScopeCode, subcontractorScopeCode, ownerScopeCode, unknownThreadCode,
      before: scopeBeforeInbound.rows,
      afterSolicitation: scopeAfterSolicitation.rows,
      after: scopeAfterInbound.rows, unauthorized: unauthorizedEventCount.rows[0],
    }));

  const egressCrewPhone = '+12485550157';
  const scopeBlockedEventId = randomUUID();
  const scopeBlockedToken = randomUUID();
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values($1,$2,'opted_in','crew_added',now())`, [accountId, egressCrewPhone],
  );
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,body,context,idempotency_key,
       message_kind,billing_category,sender_purpose,queued_at,updated_at
     ) values($1,$2,'scope_blocked',$3,'queued','Must not leave','customer',
       'scope-blocked-event','scope-blocked','customer_message',
       'contractor_dedicated',now(),now())`,
    [scopeBlockedEventId, accountId, egressCrewPhone],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(
       sms_event_id,task_state,claim_token,lease_expires_at,attempt_count,available_at
     ) values($1,'leased',$2,now()+interval '1 minute',1,now())`,
    [scopeBlockedEventId, scopeBlockedToken],
  );
  await client.query(
    `insert into public.sms_delivery_attempts(
       sms_event_id,claim_token,attempt_number,leased_at,lease_expires_at
     ) values($1,$2,1,now(),now()+interval '1 minute')`,
    [scopeBlockedEventId, scopeBlockedToken],
  );
  const scopeBlockedStage = (await client.query(
    `select * from public.stage_sms_delivery($1,$2,'signalwire')`,
    [scopeBlockedEventId, scopeBlockedToken],
  )).rows[0];
  const scopeBlockedState = (await client.query(
    `select e.status,e.error_reason,t.task_state,t.last_error_code,a.outcome
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
       join public.sms_delivery_attempts a on a.sms_event_id=e.id
      where e.id=$1`, [scopeBlockedEventId],
  )).rows[0];
  check('final egress boundary cancels customer traffic on crew-only evidence',
    scopeBlockedStage?.dispatch_status === 'cancelled'
      && scopeBlockedState?.status === 'cancelled'
      && scopeBlockedState?.error_reason === 'sms_consent_scope_not_current'
      && scopeBlockedState?.task_state === 'cancelled'
      && scopeBlockedState?.last_error_code === 'sms_consent_scope_not_current'
      && scopeBlockedState?.outcome === 'cancelled',
    JSON.stringify({ scopeBlockedStage, scopeBlockedState }));

  let storedInboundOutcome = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const claim = (await client.query(
      'select * from public.claim_sms_inbound_action($1)', [inboundReceipt.webhook_receipt_id],
    )).rows[0];
    if (attempt === 1) {
      storedInboundOutcome = (await client.query(
        'select public.apply_sms_inbound_action($1,$2) as outcome',
        [claim.task_id, claim.work_claim_token],
      )).rows[0]?.outcome;
    }
    await client.query(
      `select public.fail_sms_inbound_action($1,$2,'forced_egress_failure')`,
      [claim.task_id, claim.work_claim_token],
    );
    if (attempt < 8) {
      await client.query(
        `update public.sms_inbound_action_tasks
            set next_attempt_at=now()-interval '1 second'
          where id=$1`, [claim.task_id],
      );
    }
  }
  const exhaustedInbound = (await client.query(
    'select * from public.claim_sms_inbound_action($1)', [inboundReceipt.webhook_receipt_id],
  )).rows[0];
  const exhaustedInboundState = (await client.query(
    `select task_state,attempt_count,effect_applied_at,outcome,last_error,dead_lettered_at
       from public.sms_inbound_action_tasks where webhook_receipt_id=$1`,
    [inboundReceipt.webhook_receipt_id],
  )).rows[0];
  check('inbound action exhausts at eight while preserving the applied outcome',
    exhaustedInbound?.claim_status === 'exhausted'
      && exhaustedInboundState?.task_state === 'dead_letter'
      && exhaustedInboundState?.attempt_count === 8
      && exhaustedInboundState?.effect_applied_at !== null
      && JSON.stringify(exhaustedInboundState?.outcome) === JSON.stringify(storedInboundOutcome)
      && exhaustedInboundState?.dead_lettered_at !== null,
    JSON.stringify(exhaustedInboundState));

  const stopReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-stop-1','durability-stop-1',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       '+12485550108','+12485550999','STOP',array[]::text[],'stop')`,
    ['e'.repeat(64)],
  )).rows[0];
  const complianceFirst = (await client.query(
    `select public.record_sms_compliance_reply_result($1,'stop','twiml',$2) as ok`,
    [stopReceipt.webhook_receipt_id, 'f'.repeat(64)],
  )).rows[0];
  const complianceReplay = (await client.query(
    `select public.record_sms_compliance_reply_result($1,'stop','twiml',$2) as ok`,
    [stopReceipt.webhook_receipt_id, 'f'.repeat(64)],
  )).rows[0];
  const complianceChangedProposal = (await client.query(
    `select public.record_sms_compliance_reply_result($1,'stop','suppressed',$2) as ok`,
    [stopReceipt.webhook_receipt_id, '0'.repeat(64)],
  )).rows[0];
  const complianceRows = (await client.query(
    `select count(*)::int as count from public.sms_compliance_reply_results
      where webhook_receipt_id=$1`, [stopReceipt.webhook_receipt_id],
  )).rows[0];
  check('compliance TwiML emits only for the first receipt-keyed winner',
    complianceFirst?.ok === true && complianceReplay?.ok === false
      && complianceChangedProposal?.ok === false && complianceRows?.count === 1,
    JSON.stringify({ complianceFirst, complianceReplay, complianceChangedProposal }));

  const concurrentComplianceReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-stop-concurrent','durability-stop-concurrent',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       '+12485550138','+12485550999','STOP',array[]::text[],'stop')`,
    ['9'.repeat(64)],
  )).rows[0];
  const concurrentCompliance = await Promise.all([
    client.query(
      `select public.record_sms_compliance_reply_result($1,'stop','twiml',$2) as ok`,
      [concurrentComplianceReceipt.webhook_receipt_id, '8'.repeat(64)],
    ),
    concurrentClient.query(
      `select public.record_sms_compliance_reply_result($1,'stop','suppressed',$2) as ok`,
      [concurrentComplianceReceipt.webhook_receipt_id, '7'.repeat(64)],
    ),
  ]);
  const concurrentComplianceResults = concurrentCompliance
    .map((result) => result.rows[0]?.ok)
    .sort((left, right) => Number(left) - Number(right));
  check('concurrent compliance duplicates elect exactly one synchronous response',
    concurrentComplianceResults.length === 2
      && concurrentComplianceResults[0] === false
      && concurrentComplianceResults[1] === true,
    JSON.stringify(concurrentComplianceResults));

  const freshStopState = (await client.query(
    `select c.status,c.source,
            (select count(*)::int from public.sms_consent_scopes s
              where s.account_id=c.account_id and s.phone_number=c.phone_number) as scopes
       from public.sms_consent c
      where c.account_id=$1 and c.phone_number='+12485550108'`, [accountId],
  )).rows[0];

  const freshStartPhone = '+12485550118';
  const freshStartReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-start-1','durability-start-1',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550999','START',array[]::text[],'start')`,
    ['1'.repeat(64), freshStartPhone],
  )).rows[0];
  const freshStartAuthCode = await rejectionCode(
    client,
    `select * from public.enqueue_authorized_inbox_message(
       $1,$2,'Must not queue','manual-reply:fresh-start',false)`,
    [accountId, freshStartPhone],
  );
  const freshStartState = (await client.query(
    `select c.status,c.source,
            (select count(*)::int from public.sms_consent_scopes s
              where s.account_id=c.account_id and s.phone_number=c.phone_number) as scopes
       from public.sms_consent c
      where c.account_id=$1 and c.phone_number=$2`, [accountId, freshStartPhone],
  )).rows[0];

  const helpPhone = '+12485550128';
  const helpReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-help-1','durability-help-1',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550999','HELP',array[]::text[],'help')`,
    ['2'.repeat(64), helpPhone],
  )).rows[0];
  const helpState = (await client.query(
    `select
       (select count(*)::int from public.sms_consent c
         where c.account_id=$1 and c.phone_number=$2) as consent_rows,
       (select count(*)::int from public.sms_consent_scopes s
         where s.account_id=$1 and s.phone_number=$2) as scope_rows`,
    [accountId, helpPhone],
  )).rows[0];

  const priorCustomerPhone = customerNoThreadPhone;
  const priorStopReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-prior-stop','durability-prior-stop',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550999','STOP',array[]::text[],'stop')`,
    ['3'.repeat(64), priorCustomerPhone],
  )).rows[0];
  const priorStoppedState = (await client.query(
    `select c.status,count(*)::int as scopes
       from public.sms_consent c
       join public.sms_consent_scopes s
         on s.account_id=c.account_id and s.phone_number=c.phone_number
        and s.consent_scope='customer'
      where c.account_id=$1 and c.phone_number=$2
      group by c.status`, [accountId, priorCustomerPhone],
  )).rows[0];
  const priorStartReceipt = (await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','durability-prior-start','durability-prior-start',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550999','START',array[]::text[],'start')`,
    ['4'.repeat(64), priorCustomerPhone],
  )).rows[0];
  const priorStartedState = (await client.query(
    `select c.status,c.source,count(*)::int as scopes
       from public.sms_consent c
       join public.sms_consent_scopes s
         on s.account_id=c.account_id and s.phone_number=c.phone_number
        and s.consent_scope='customer'
      where c.account_id=$1 and c.phone_number=$2
      group by c.status,c.source`, [accountId, priorCustomerPhone],
  )).rows[0];
  check('keywords never invent audience scope and START restores only prior scope',
    freshStopState?.status === 'opted_out'
      && freshStopState?.source === 'inbound_stop'
      && freshStopState?.scopes === 0
      && freshStartReceipt?.ingress_disposition === 'keyword_start'
      && freshStartState?.status === 'opted_in'
      && freshStartState?.source === 'inbound_start'
      && freshStartState?.scopes === 0
      && freshStartAuthCode === 'P5112'
      && helpReceipt?.ingress_disposition === 'keyword_help'
      && helpState?.consent_rows === 0
      && helpState?.scope_rows === 0
      && priorStopReceipt?.ingress_disposition === 'keyword_stop'
      && priorStoppedState?.status === 'opted_out'
      && priorStoppedState?.scopes === 1
      && priorStartReceipt?.ingress_disposition === 'keyword_start'
      && priorStartedState?.status === 'opted_in'
      && priorStartedState?.source === 'inbound_start'
      && priorStartedState?.scopes === 1,
    JSON.stringify({
      freshStopState, freshStartState, freshStartAuthCode, helpState,
      priorStoppedState, priorStartedState,
    }));

  const directPaymentId = randomUUID();
  const billingEventId = randomUUID();
  const directSmsEventId = randomUUID();
  await client.query(
    `insert into public.payments(
       id,account_id,job_id,invoice_id,kind,amount,status,
       homeowner_phone,sms_consent,charge_model,stripe_account_id,
       fee_basis_amount,fee_plan_code,fee_catalog_version,fee_rate_bps,fee_rate,
               platform_fee,reconciliation_status
     ) values ($1,$2,$3,$4,'final',100,'requested','+12485550104',true,'direct',
               'acct_Durability123',100,'flex','test-v1',0,0,0,'pending')`,
    [directPaymentId, accountId, jobId, invoiceId],
  );
  await client.query(
    `insert into public.billing_events(
       id,provider_event_id,event_type,account_id,livemode,payload
     ) values ($1,'evt-durability-direct','payment_intent.succeeded',$2,false,'{}')`,
    [billingEventId, accountId],
  );
  await client.query(
    `insert into public.sms_events(
       id,account_id,payment_id,event_type,phone_number,status,provider,body,
       error_reason,context,indeterminate_at,updated_at
     ) values ($1,$2,$3,'payment_paid','+12485550104','indeterminate','signalwire',
               'Direct payment accepted','sms_provider_result_unknown','payment',now(),now())`,
    [directSmsEventId, accountId, directPaymentId],
  );
  await client.query(
    `insert into public.billing_direct_payment_settlement_tasks(
       payment_id,billing_event_id,account_id,job_id,invoice_id,settled_at,
       task_state,attempt_count,feed_status,sms_status,sms_event_id,
       last_error_code,dead_lettered_at
     ) values ($1,$2,$3,$4,$5,now(),'dead_letter',1,'recorded','indeterminate',$6,
               'sms_provider_result_unknown',now())`,
    [directPaymentId, billingEventId, accountId, jobId, invoiceId, directSmsEventId],
  );
  await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','direct-accepted-provider-id','queued',null,
       'direct-accepted-provider-id:queued:-',$1,'application/json',
       'https://example.test/api/sms/status'
     )`, ['c'.repeat(64)],
  );
  const directReview = await client.query(
    `select r.id from public.sms_operator_review_items r
      join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
     where w.provider_event_id='direct-accepted-provider-id'`,
  );
  await client.query(
    `select public.reconcile_sms_unmatched_status($1,$2,$3,$4)`,
    [directReview.rows[0]?.id, directSmsEventId,
      'Matched exact provider acceptance record.', 'operator@example.com'],
  );
  const directState = await client.query(
    `select e.status,e.provider_id,t.task_state,t.sms_status,r.review_state
       from public.sms_events e
       join public.billing_direct_payment_settlement_tasks t on t.sms_event_id=e.id
       join public.sms_webhook_receipts w on w.sms_event_id=e.id
       join public.sms_operator_review_items r on r.webhook_receipt_id=w.id
      where e.id=$1`, [directSmsEventId],
  );
  check('specialized queued callback resolves acceptance without retry or delivery claim',
    directState.rows[0]?.status === 'sent'
      && directState.rows[0]?.provider_id === 'direct-accepted-provider-id'
      && directState.rows[0]?.task_state === 'completed'
      && directState.rows[0]?.sms_status === 'sent'
      && directState.rows[0]?.review_state === 'resolved',
    JSON.stringify(directState.rows[0]));

  const queuedDirectPaymentId = randomUUID();
  const queuedDirectBillingEventId = randomUUID();
  const queuedDirectTaskId = randomUUID();
  const queuedDirectClaimToken = randomUUID();
  const queuedDirectSettledAt = '2026-08-21T18:30:00.000Z';
  const queuedDirectPhone = '+12485550114';
  await client.query(
    `insert into public.payments(
       id,account_id,job_id,invoice_id,kind,amount,status,paid_at,
       homeowner_phone,sms_consent,charge_model,stripe_account_id,
       fee_basis_amount,fee_plan_code,fee_catalog_version,fee_rate_bps,fee_rate,
       platform_fee,reconciliation_status
     ) values ($1,$2,$3,$4,'final',100,'paid',$5,$6,true,'direct',
               'acct_DurabilityQueued',100,'flex','test-v1',0,0,0,'pending')`,
    [queuedDirectPaymentId, accountId, jobId, invoiceId,
      queuedDirectSettledAt, queuedDirectPhone],
  );
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values($1,$2,'opted_in','payment_request',now())`,
    [accountId, queuedDirectPhone],
  );
  await client.query(
    `insert into public.billing_events(
       id,provider_event_id,event_type,account_id,livemode,payload
     ) values ($1,'evt-durability-direct-queued','payment_intent.succeeded',$2,false,'{}')`,
    [queuedDirectBillingEventId, accountId],
  );
  await client.query(
    `insert into public.billing_direct_payment_settlement_tasks(
       id,payment_id,billing_event_id,account_id,job_id,invoice_id,settled_at,
       task_state,claim_token,lease_expires_at,attempt_count,feed_status,sms_status
     ) values ($1,$2,$3,$4,$5,$6,$7,'leased',$8,now()+interval '5 minutes',
               1,'recorded','pending')`,
    [queuedDirectTaskId, queuedDirectPaymentId, queuedDirectBillingEventId,
      accountId, jobId, invoiceId, queuedDirectSettledAt, queuedDirectClaimToken],
  );
  await client.query(
    `insert into public.billing_direct_payment_settlement_attempts(
       task_id,claim_token,attempt_number,lease_expires_at
     ) values($1,$2,1,now()+interval '5 minutes')`,
    [queuedDirectTaskId, queuedDirectClaimToken],
  );
  const queuedDirectResult = (await client.query(
    `select * from public.enqueue_direct_payment_settlement_sms($1,$2,$3,$4)`,
    [queuedDirectTaskId, queuedDirectClaimToken, queuedDirectPhone,
      'Your payment was received. Reply STOP to opt out or HELP for help.'],
  )).rows[0];
  const queuedDirectState = (await client.query(
    `select t.task_state,t.sms_status,t.sms_event_id,t.completed_at,
            a.outcome_status,a.sms_status as attempt_sms_status,
            e.status as event_status,e.provider,e.provider_id,e.idempotency_key,
            d.task_state as delivery_state
       from public.billing_direct_payment_settlement_tasks t
       join public.billing_direct_payment_settlement_attempts a on a.task_id=t.id
       join public.sms_events e on e.id=t.sms_event_id
       join public.sms_delivery_tasks d on d.sms_event_id=e.id
      where t.id=$1`, [queuedDirectTaskId],
  )).rows[0];
  check('direct-payment settlement atomically hands SMS to generic durable delivery',
    queuedDirectResult?.dispatch_status === 'queued'
      && queuedDirectResult?.sms_event_id === queuedDirectState?.sms_event_id
      && queuedDirectState?.task_state === 'completed'
      && queuedDirectState?.sms_status === 'queued'
      && queuedDirectState?.outcome_status === 'completed'
      && queuedDirectState?.attempt_sms_status === 'queued'
      && queuedDirectState?.event_status === 'queued'
      && queuedDirectState?.provider == null
      && queuedDirectState?.provider_id == null
      && queuedDirectState?.delivery_state === 'queued'
      && queuedDirectState?.idempotency_key
        === `payment:${queuedDirectPaymentId}:payment_paid`,
    JSON.stringify({ queuedDirectResult, queuedDirectState }));

  const deferralEventId = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider,body,context,
       idempotency_key,message_kind,billing_category,sender_purpose,queued_at,updated_at
     ) values($1,$2,'deferral_budget','+12485550109','queued','signalwire',
       'Deferral budget','automation','deferral-budget-event','deferral-test',
       'customer_message','contractor_dedicated',now(),now())`,
    [deferralEventId, accountId],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(sms_event_id,task_state,attempt_count,available_at)
     values($1,'queued',0,now())`, [deferralEventId],
  );
  for (let lease = 1; lease <= 10; lease += 1) {
    const token = randomUUID();
    await client.query(
      `update public.sms_delivery_tasks
          set task_state='leased',claim_token=$2,lease_expires_at=now()+interval '1 minute',
              attempt_count=attempt_count+1
        where sms_event_id=$1`, [deferralEventId, token],
    );
    await client.query(
      `insert into public.sms_delivery_attempts(
         sms_event_id,claim_token,attempt_number,leased_at,lease_expires_at
       ) values($1,$2,1,now(),now()+interval '1 minute')`,
      [deferralEventId, token],
    );
    await client.query(
      `select public.defer_sms_delivery($1,$2,'sender_not_ready',5)`,
      [deferralEventId, token],
    );
  }
  const deferredBudget = (await client.query(
    `select t.task_state,t.attempt_count,t.lease_sequence,
            count(a.id)::int as attempts,min(a.attempt_number)::int as min_sequence,
            max(a.attempt_number)::int as max_sequence,
            count(*) filter(where a.outcome='deferred')::int as deferrals
       from public.sms_delivery_tasks t
       join public.sms_delivery_attempts a on a.sms_event_id=t.sms_event_id
      where t.sms_event_id=$1
      group by t.task_state,t.attempt_count,t.lease_sequence`, [deferralEventId],
  )).rows[0];
  const finalToken = randomUUID();
  await client.query(
    `update public.sms_delivery_tasks
        set task_state='leased',claim_token=$2,lease_expires_at=now()+interval '1 minute',
            attempt_count=attempt_count+1
      where sms_event_id=$1`, [deferralEventId, finalToken],
  );
  await client.query(
    `insert into public.sms_delivery_attempts(
       sms_event_id,claim_token,attempt_number,leased_at,lease_expires_at
     ) values($1,$2,1,now(),now()+interval '1 minute')`,
    [deferralEventId, finalToken],
  );
  await client.query(
    `select * from public.fail_sms_delivery($1,$2,'provider_http_400',false)`,
    [deferralEventId, finalToken],
  );
  const rejectedBudget = (await client.query(
    `select t.task_state,t.attempt_count,t.lease_sequence,
            max(a.attempt_number)::int as max_sequence,
            max(a.outcome) filter(where a.claim_token=$2)::text as final_outcome
       from public.sms_delivery_tasks t
       join public.sms_delivery_attempts a on a.sms_event_id=t.sms_event_id
      where t.sms_event_id=$1
      group by t.task_state,t.attempt_count,t.lease_sequence`,
    [deferralEventId, finalToken],
  )).rows[0];
  check('policy deferrals preserve provider-attempt budget and append-only lease evidence',
    deferredBudget?.task_state === 'queued'
      && deferredBudget?.attempt_count === 0
      && deferredBudget?.lease_sequence === 10
      && deferredBudget?.attempts === 10
      && deferredBudget?.min_sequence === 1
      && deferredBudget?.max_sequence === 10
      && deferredBudget?.deferrals === 10
      && rejectedBudget?.task_state === 'failed'
      && rejectedBudget?.attempt_count === 1
      && rejectedBudget?.lease_sequence === 11
      && rejectedBudget?.max_sequence === 11
      && rejectedBudget?.final_outcome === 'terminal_failure',
    JSON.stringify({ deferredBudget, rejectedBudget }));

  const lotId = randomUUID();
  const protectedReservationId = randomUUID();
  const ordinaryReservationId = randomUUID();
  const protectedEventId = randomUUID();
  await client.query(
    `insert into public.usage_credit_lots(
       id,account_id,resource_code,source_type,idempotency_key,granted_units,
       reserved_units,available_from
     ) values ($1,$2,'text_segments','promotion','durability-lot',2,2,
               now()-interval '3 days')`,
    [lotId, accountId],
  );
  await client.query(
    `insert into public.usage_reservations(
       id,account_id,resource_code,units,operation_type,idempotency_key,state,
       expires_at,created_at
     ) values
       ($1,$3,'text_segments',1,'text_send','protected-reservation','reserved',
        now()-interval '1 day',now()-interval '2 days'),
       ($2,$3,'text_segments',1,'text_send','ordinary-reservation','reserved',
        now()-interval '1 day',now()-interval '2 days')`,
    [protectedReservationId, ordinaryReservationId, accountId],
  );
  await client.query(
    `insert into public.usage_reservation_allocations(
       account_id,reservation_id,credit_lot_id,units
     ) values ($1,$2,$4,1),($1,$3,$4,1)`,
    [accountId, protectedReservationId, ordinaryReservationId, lotId],
  );
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider,body,context,
       idempotency_key,message_kind,billing_category,sender_purpose,queued_at,
       indeterminate_at,text_usage_kind,text_usage_reservation_id,
       text_usage_finalization_key,text_usage_state,text_usage_updated_at,updated_at
     ) values ($1,$2,'reservation_test','+12485550105','indeterminate','signalwire',
       'Reservation test','automation','reservation-test-event','reservation-test',
       'customer_message','contractor_dedicated',now()-interval '2 days',
       now()-interval '1 day','reservation',$3,'protected-reservation:commit','held',
       now()-interval '1 day',now())`,
    [protectedEventId, accountId, protectedReservationId],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(
       sms_event_id,task_state,attempt_count,request_started_at,last_error_code,
       indeterminate_at
     ) values ($1,'indeterminate',1,now()-interval '1 day',
               'provider_response_unknown',now()-interval '1 day')`,
    [protectedEventId],
  );
  const expired = await client.query(
    'select public.expire_usage_reservations(50) as count',
  );
  const committed = await client.query(
    `select public.commit_usage_reservation($1,'protected-reservation:commit') as ok`,
    [protectedReservationId],
  );
  const reservationState = await client.query(
    `select
       (select state from public.usage_reservations where id=$1) as protected_state,
       (select state from public.usage_reservations where id=$2) as ordinary_state,
       (select reserved_units from public.usage_credit_lots where id=$3) as reserved_units,
       (select consumed_units from public.usage_credit_lots where id=$3) as consumed_units`,
    [protectedReservationId, ordinaryReservationId, lotId],
  );
  check('provider-started reservation survives expiry and commits while ordinary hold expires',
    expired.rows[0]?.count === 1 && committed.rows[0]?.ok === true
      && reservationState.rows[0]?.protected_state === 'committed'
      && reservationState.rows[0]?.ordinary_state === 'expired'
      && Number(reservationState.rows[0]?.reserved_units) === 0
      && Number(reservationState.rows[0]?.consumed_units) === 1,
    JSON.stringify(reservationState.rows[0]));

  const staleLotId = randomUUID();
  const staleReservationId = randomUUID();
  const staleEventId = randomUUID();
  const staleClaimToken = randomUUID();
  await client.query(
    `insert into public.usage_credit_lots(
       id,account_id,resource_code,source_type,idempotency_key,granted_units,
       reserved_units,available_from
     ) values ($1,$2,'text_segments','promotion','stale-boundary-lot',1,1,
               now()-interval '3 days')`,
    [staleLotId, accountId],
  );
  await client.query(
    `insert into public.usage_reservations(
       id,account_id,resource_code,units,operation_type,idempotency_key,state,
       expires_at,created_at
     ) values ($1,$2,'text_segments',1,'text_send','stale-boundary','reserved',
               now()-interval '1 day',now()-interval '2 days')`,
    [staleReservationId, accountId],
  );
  await client.query(
    `insert into public.usage_reservation_allocations(
       account_id,reservation_id,credit_lot_id,units
     ) values ($1,$2,$3,1)`,
    [accountId, staleReservationId, staleLotId],
  );
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider,body,context,
       idempotency_key,message_kind,billing_category,sender_purpose,queued_at,
       text_usage_kind,text_usage_reservation_id,text_usage_finalization_key,
       text_usage_state,text_usage_updated_at,updated_at
     ) values ($1,$2,'stale_boundary','+12485550106','queued','signalwire',
       'Stale boundary','automation','stale-boundary-event','stale-boundary',
       'customer_message','contractor_dedicated',now()-interval '2 days',
       'reservation',$3,'stale-boundary:commit','held',now()-interval '1 day',now())`,
    [staleEventId, accountId, staleReservationId],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(
       sms_event_id,task_state,claim_token,lease_expires_at,attempt_count,available_at
     ) values ($1,'leased',$2,now()+interval '1 minute',1,now()-interval '2 days')`,
    [staleEventId, staleClaimToken],
  );
  let boundaryCode = null;
  try {
    await client.query(
      `update public.sms_delivery_tasks set request_started_at=now() where sms_event_id=$1`,
      [staleEventId],
    );
  } catch (error) {
    boundaryCode = error?.code ?? 'unknown';
  }
  const boundaryExpiry = await client.query(
    'select public.expire_usage_reservations(50) as count',
  );
  const boundaryState = await client.query(
    `select t.request_started_at,r.state
       from public.sms_delivery_tasks t
       join public.usage_reservations r on r.id=$2
      where t.sms_event_id=$1`,
    [staleEventId, staleReservationId],
  );
  check('expired pre-request reservation cannot cross the provider boundary',
    boundaryCode === 'P5104' && boundaryExpiry.rows[0]?.count === 1
      && boundaryState.rows[0]?.request_started_at === null
      && boundaryState.rows[0]?.state === 'expired',
    JSON.stringify({ boundaryCode, state: boundaryState.rows[0] }));

  const overagePeriodStart = '2026-08-01T00:00:00.000Z';
  const overagePeriodEnd = '2026-09-01T00:00:00.000Z';
  const fullCapKey = 'ai-voice:v1:full-cap-result';
  const zeroUseKey = 'ai-voice:v1:zero-use-result';
  await client.query(
    `insert into public.workspace_overage_accruals(
       account_id,period_start,period_end,resource_code,units,millicents
     ) values($1,$2,$3,'ai_voice_minutes',120,4200000)`,
    [accountId, overagePeriodStart, overagePeriodEnd],
  );
  await client.query(
    `insert into public.workspace_overage_accrual_events(
       account_id,idempotency_key,period_start,period_end,resource_code,
       units,millicents,accrued_millicents,cap_millicents
     ) values
       ($1,$2,$4,$5,'ai_voice_minutes',60,2100000,2100000,5000000),
       ($1,$3,$4,$5,'ai_voice_minutes',60,2100000,4200000,5000000)`,
    [accountId, fullCapKey, zeroUseKey, overagePeriodStart, overagePeriodEnd],
  );
  const fullCapSettlement = (await client.query(
    `select * from public.settle_usage_overage_result($1,$2,60)`,
    [accountId, fullCapKey],
  )).rows[0];
  const fullCapReplay = (await client.query(
    `select * from public.settle_usage_overage_result($1,$2,60)`,
    [accountId, fullCapKey],
  )).rows[0];
  const settlementMismatchCode = await rejectionCode(
    client,
    `select * from public.settle_usage_overage_result($1,$2,59)`,
    [accountId, fullCapKey],
  );
  const zeroUseSettlement = (await client.query(
    `select * from public.settle_usage_overage_result($1,$2,0)`,
    [accountId, zeroUseKey],
  )).rows[0];
  const absentSettlement = (await client.query(
    `select * from public.settle_usage_overage_result($1,'ai-voice:v1:absent-result',1)`,
    [accountId],
  )).rows[0];
  const overageState = (await client.query(
    `select
       (select units from public.workspace_overage_accrual_events
         where account_id=$1 and idempotency_key=$2) as zero_units,
       (select millicents from public.workspace_overage_accrual_events
         where account_id=$1 and idempotency_key=$2) as zero_millicents,
       (select units from public.workspace_overage_accruals
         where account_id=$1 and period_start=$3 and resource_code='ai_voice_minutes') as total_units,
       (select millicents from public.workspace_overage_accruals
         where account_id=$1 and period_start=$3 and resource_code='ai_voice_minutes') as total_millicents,
       (select count(*)::int from public.workspace_overage_event_settlements
         where account_id=$1) as result_rows`,
    [accountId, zeroUseKey, overagePeriodStart],
  )).rows[0];
  check('overage settlement distinguishes zero refund, exact replay, absence, and full refund',
    fullCapSettlement?.settled === true
      && Number(fullCapSettlement?.refunded_millicents) === 0
      && fullCapSettlement?.replayed === false
      && fullCapReplay?.settled === true
      && Number(fullCapReplay?.refunded_millicents) === 0
      && fullCapReplay?.replayed === true
      && settlementMismatchCode === 'P5125'
      && zeroUseSettlement?.settled === true
      && Number(zeroUseSettlement?.refunded_millicents) === 2100000
      && absentSettlement?.settled === false
      && Number(overageState?.zero_units) === 0
      && Number(overageState?.zero_millicents) === 0
      && Number(overageState?.total_units) === 60
      && Number(overageState?.total_millicents) === 2100000
      && overageState?.result_rows === 2,
    JSON.stringify({
      fullCapSettlement, fullCapReplay, settlementMismatchCode,
      zeroUseSettlement, absentSettlement, overageState,
    }));

  const missingAggregateKey = 'ai-voice:v1:missing-aggregate';
  const missingAggregatePeriod = '2026-10-01T00:00:00.000Z';
  await client.query(
    `insert into public.workspace_overage_accrual_events(
       account_id,idempotency_key,period_start,period_end,resource_code,
       units,millicents,accrued_millicents,cap_millicents
     ) values($1,$2,$3,$3::timestamptz+interval '1 month','ai_voice_missing',
              10,1000,1000,5000000)`,
    [accountId, missingAggregateKey, missingAggregatePeriod],
  );
  const missingAggregateCode = await rejectionCode(
    client,
    `select * from public.settle_usage_overage_result($1,$2,0)`,
    [accountId, missingAggregateKey],
  );
  const missingAggregateState = (await client.query(
    `select e.units,e.millicents,e.settled_at,
            (select count(*)::int from public.workspace_overage_event_settlements s
              where s.account_id=e.account_id and s.idempotency_key=e.idempotency_key)
              as result_rows
       from public.workspace_overage_accrual_events e
      where e.account_id=$1 and e.idempotency_key=$2`,
    [accountId, missingAggregateKey],
  )).rows[0];

  const underfundedKey = 'ai-voice:v1:underfunded-aggregate';
  const underfundedPeriod = '2026-11-01T00:00:00.000Z';
  await client.query(
    `insert into public.workspace_overage_accruals(
       account_id,period_start,period_end,resource_code,units,millicents
     ) values($1,$2,$2::timestamptz+interval '1 month','ai_voice_underfunded',1,1)`,
    [accountId, underfundedPeriod],
  );
  await client.query(
    `insert into public.workspace_overage_accrual_events(
       account_id,idempotency_key,period_start,period_end,resource_code,
       units,millicents,accrued_millicents,cap_millicents
     ) values($1,$2,$3,$3::timestamptz+interval '1 month','ai_voice_underfunded',
              10,1000,1000,5000000)`,
    [accountId, underfundedKey, underfundedPeriod],
  );
  const underfundedCode = await rejectionCode(
    client,
    `select * from public.settle_usage_overage_result($1,$2,0)`,
    [accountId, underfundedKey],
  );
  const underfundedState = (await client.query(
    `select e.units as event_units,e.millicents as event_millicents,e.settled_at,
            a.units as aggregate_units,a.millicents as aggregate_millicents,
            (select count(*)::int from public.workspace_overage_event_settlements s
              where s.account_id=e.account_id and s.idempotency_key=e.idempotency_key)
              as result_rows
       from public.workspace_overage_accrual_events e
       join public.workspace_overage_accruals a
         on a.account_id=e.account_id and a.period_start=e.period_start
        and a.resource_code=e.resource_code
      where e.account_id=$1 and e.idempotency_key=$2`,
    [accountId, underfundedKey],
  )).rows[0];
  check('overage settlement refuses missing or underfunded aggregate evidence atomically',
    missingAggregateCode === '55000'
      && Number(missingAggregateState?.units) === 10
      && Number(missingAggregateState?.millicents) === 1000
      && missingAggregateState?.settled_at == null
      && missingAggregateState?.result_rows === 0
      && underfundedCode === '55000'
      && Number(underfundedState?.event_units) === 10
      && Number(underfundedState?.event_millicents) === 1000
      && underfundedState?.settled_at == null
      && Number(underfundedState?.aggregate_units) === 1
      && Number(underfundedState?.aggregate_millicents) === 1
      && underfundedState?.result_rows === 0,
    JSON.stringify({
      missingAggregateCode, missingAggregateState,
      underfundedCode, underfundedState,
    }));

  const closeRaceKey = 'ai-voice:v1:close-race';
  const closeRacePeriod = '2026-12-01T00:00:00.000Z';
  const closeRaceEnd = '2027-01-01T00:00:00.000Z';
  await client.query(
    `insert into public.workspace_overage_accruals(
       account_id,period_start,period_end,resource_code,units,millicents
     ) values($1,$2,$3,'ai_voice_close_race',10,1000)`,
    [accountId, closeRacePeriod, closeRaceEnd],
  );
  await client.query(
    `insert into public.workspace_overage_accrual_events(
       account_id,idempotency_key,period_start,period_end,resource_code,
       units,millicents,accrued_millicents,cap_millicents
     ) values($1,$2,$3,$4,'ai_voice_close_race',10,1000,1000,5000000)`,
    [accountId, closeRaceKey, closeRacePeriod, closeRaceEnd],
  );
  await client.query('begin');
  await client.query(
    `select 1 from public.workspace_overage_accruals
      where account_id=$1 and period_start=$2 and resource_code='ai_voice_close_race'
      for update`,
    [accountId, closeRacePeriod],
  );
  const racingSettlement = concurrentClient.query(
    `select * from public.settle_usage_overage_result($1,$2,0)`,
    [accountId, closeRaceKey],
  ).then(() => null, (error) => error?.code ?? 'unknown');
  let observedAggregateWait = false;
  for (let attempt = 0; attempt < 50 && !observedAggregateWait; attempt += 1) {
    const activity = (await client.query(
      `select wait_event_type from pg_catalog.pg_stat_activity
        where application_name='lgq-messaging-schema-concurrent'
          and state='active'`,
    )).rows[0];
    observedAggregateWait = activity?.wait_event_type === 'Lock';
    if (!observedAggregateWait) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  await client.query(
    `select public.close_overage_period($1,$2,$3)`,
    [accountId, closeRacePeriod, closeRaceEnd],
  );
  await client.query('commit');
  const closeRaceCode = await racingSettlement;
  const closeRaceState = (await client.query(
    `select e.units,e.millicents,e.settled_at,
            a.units as aggregate_units,a.millicents as aggregate_millicents,
            s.total_millicents,
            (select count(*)::int from public.workspace_overage_event_settlements r
              where r.account_id=e.account_id and r.idempotency_key=e.idempotency_key)
              as result_rows
       from public.workspace_overage_accrual_events e
       join public.workspace_overage_accruals a
         on a.account_id=e.account_id and a.period_start=e.period_start
        and a.resource_code=e.resource_code
       join public.workspace_overage_settlements s
         on s.account_id=e.account_id and s.period_start=e.period_start
      where e.account_id=$1 and e.idempotency_key=$2`,
    [accountId, closeRaceKey],
  )).rows[0];
  check('period close and event refund serialize on the aggregate row',
    observedAggregateWait
      && closeRaceCode === '55000'
      && Number(closeRaceState?.units) === 10
      && Number(closeRaceState?.millicents) === 1000
      && closeRaceState?.settled_at == null
      && Number(closeRaceState?.aggregate_units) === 10
      && Number(closeRaceState?.aggregate_millicents) === 1000
      && Number(closeRaceState?.total_millicents) === 1000
      && closeRaceState?.result_rows === 0,
    JSON.stringify({ observedAggregateWait, closeRaceCode, closeRaceState }));

  const followupSecurity = (await client.query(
    `select
       has_table_privilege('authenticated','public.sms_compliance_reply_results','select')
         as auth_compliance_read,
       has_table_privilege('authenticated','public.workspace_overage_event_settlements','select')
         as auth_settlement_read,
       has_table_privilege('authenticated','public.sms_consent_scopes','select')
         as auth_scope_read,
       has_table_privilege('authenticated','public.sms_consent_scopes','insert')
         as auth_scope_insert,
       has_table_privilege('service_role','public.sms_compliance_reply_results','select')
         as service_compliance_read,
       has_table_privilege('service_role','public.workspace_overage_event_settlements','select')
         as service_settlement_read,
       has_table_privilege('service_role','public.sms_consent_scopes','select')
         as service_scope_read,
       has_function_privilege('authenticated',
         'public.record_sms_compliance_reply_result(uuid,text,text,text)','execute')
         as auth_compliance_exec,
       has_function_privilege('authenticated',
         'public.settle_usage_overage_result(uuid,text,bigint)','execute')
         as auth_settlement_exec,
       has_function_privilege('service_role',
         'public.record_sms_compliance_reply_result(uuid,text,text,text)','execute')
         as service_compliance_exec,
       has_function_privilege('service_role',
         'public.settle_usage_overage_result(uuid,text,bigint)','execute')
         as service_settlement_exec,
       has_function_privilege('authenticated',
         'public.establish_sms_consent_scope_from_source()','execute')
         as auth_scope_trigger_exec,
       has_function_privilege('authenticated',
         'public.ensure_sms_consent_baseline_scope(uuid,text,text)','execute')
         as auth_scope_baseline_exec,
       has_function_privilege('service_role',
         'public.ensure_sms_consent_baseline_scope(uuid,text,text)','execute')
         as service_scope_baseline_exec,
       has_function_privilege('authenticated',
         'public.enqueue_direct_payment_settlement_sms(uuid,uuid,text,text)','execute')
         as auth_direct_enqueue_exec,
       has_function_privilege('service_role',
         'public.enqueue_direct_payment_settlement_sms(uuid,uuid,text,text)','execute')
         as service_direct_enqueue_exec,
       (select relforcerowsecurity from pg_catalog.pg_class
         where oid='public.sms_compliance_reply_results'::regclass) as compliance_force_rls,
       (select relforcerowsecurity from pg_catalog.pg_class
         where oid='public.workspace_overage_event_settlements'::regclass) as settlement_force_rls,
       (select relforcerowsecurity from pg_catalog.pg_class
         where oid='public.sms_consent_scopes'::regclass) as scope_force_rls`,
  )).rows[0];
  check('new evidence ledgers are forced-RLS and service-role-only',
    followupSecurity?.auth_compliance_read === false
      && followupSecurity?.auth_settlement_read === false
      && followupSecurity?.auth_scope_read === true
      && followupSecurity?.auth_scope_insert === false
      && followupSecurity?.service_compliance_read === true
      && followupSecurity?.service_settlement_read === true
      && followupSecurity?.service_scope_read === true
      && followupSecurity?.auth_compliance_exec === false
      && followupSecurity?.auth_settlement_exec === false
      && followupSecurity?.service_compliance_exec === true
      && followupSecurity?.service_settlement_exec === true
      && followupSecurity?.auth_direct_enqueue_exec === false
      && followupSecurity?.service_direct_enqueue_exec === true
      && followupSecurity?.auth_scope_trigger_exec === false
      && followupSecurity?.auth_scope_baseline_exec === false
      && followupSecurity?.service_scope_baseline_exec === true
      && followupSecurity?.compliance_force_rls === true
      && followupSecurity?.settlement_force_rls === true
      && followupSecurity?.scope_force_rls === true,
    JSON.stringify(followupSecurity));
} catch (error) {
  check('fresh schema harness ran to completion', false,
    error instanceof Error
      ? JSON.stringify({
          message: error.message,
          code: error.code ?? null,
          position: error.position ?? null,
          where: error.where ?? null,
          detail: error.detail ?? null,
        })
      : String(error));
} finally {
  try { await concurrentClient?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 3) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
