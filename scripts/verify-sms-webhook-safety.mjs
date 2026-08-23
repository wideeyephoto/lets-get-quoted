// Execute both SMS foundation migrations against a disposable PostgreSQL 17
// cluster. No hosted database URL is read and no external service is called.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const PORT = Number(process.env.LGQ_SMS_WEBHOOK_CHECK_PORT || 54356);

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
  console.error('embedded-postgres is not installed; run the SMS foundation harness setup first.');
  process.exit(2);
}

const bin = join(process.cwd(), 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}
function one(result) {
  if (result.rowCount !== 1) throw new Error(`Expected one row, got ${result.rowCount}.`);
  return result.rows[0];
}

const base = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$roles$;
create table public.accounts (id uuid primary key default pg_catalog.gen_random_uuid());
create table public.payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);
create table public.crew (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);
create function public.is_owner(uuid) returns boolean language sql stable as $$ select false $$;
create table public.sms_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  event_type text not null,
  phone_number text not null,
  status text not null default 'pending',
  provider_id text,
  body text not null,
  error_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  sent_at timestamptz,
  context text not null default 'payment',
  crew_id uuid references public.crew(id) on delete cascade,
  test_marker text,
  constraint sms_events_status_check check (status in ('pending','sent','failed','opted_out','indeterminate')),
  constraint sms_events_context_check check (context in ('payment','crew','subcontractor')),
  constraint sms_events_event_type_allowed check (event_type in (
    'payment_requested','payment_paid','payment_failed','payment_refunded',
    'crew_assigned','crew_scheduled','sub_offer','sub_offer_covered','sub_offer_won','sub_offer_cancelled'
  )),
  constraint sms_events_target_check check (
    (context = 'payment' and payment_id is not null)
    or (context in ('crew','subcontractor') and crew_id is not null)
  ),
  unique (payment_id, event_type)
);
create table public.sms_consent (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  status text not null check (status in ('opted_in','opted_out')),
  source text not null,
  consented_at timestamptz,
  opted_out_at timestamptz,
  disclosure_version text,
  updated_at timestamptz not null default pg_catalog.now(),
  unique (account_id, phone_number)
);
create table public.sms_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  provider_id text,
  read_at timestamptz,
  media_urls text[],
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.sms_events enable row level security;
create policy sms_event_all on public.sms_events for all using (true) with check (true);
`;

const pg = new EmbeddedPostgres({
  databaseDir: join(process.cwd(), '.pg17-sms-webhook-check'),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
let concurrentClient;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_webhook_check');
  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_sms_webhook_check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query(base);
  await client.query(readFileSync('migrations/20260821180506_sms_delivery_foundation.sql', 'utf8'));
  const webhookMigration = readFileSync('migrations/20260821182355_sms_webhook_safety.sql', 'utf8');
  await client.query(webhookMigration);
  await client.query(webhookMigration);
  const autoStatusMigration = readFileSync(
    'migrations/20260821191700_sms_status_auto_reconciliation.sql', 'utf8',
  );
  await client.query(autoStatusMigration);
  await client.query(autoStatusMigration);
  concurrentClient = new Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_sms_webhook_check',
  });
  await concurrentClient.connect();
  await concurrentClient.query("set statement_timeout = '15s'");
  const rejectionCode = async (connection, sql, params = []) => {
    try {
      await connection.query(sql, params);
      return null;
    } catch (error) {
      return error?.code ?? 'unknown';
    }
  };
  check('callback migration applies twice', true);

  const accountA = randomUUID();
  const accountB = randomUUID();
  await client.query('insert into public.accounts(id) values ($1),($2)', [accountA, accountB]);
  const dedicatedSender = randomUUID();
  const sharedSender = randomUUID();
  await client.query(
    `insert into public.sms_sender_numbers (
       id, provider, e164_number, provider_number_id, purpose, account_id,
       assignment_state, provisioning_status, inbound_ready, activated_at
     ) values
       ($1,'signalwire','+12485550140','pn_dedicated','contractor_dedicated',$3,'assigned','active',true,now()),
       ($2,'signalwire','+12485550141','pn_shared','lgq_shared',null,'assigned','active',true,now())`,
    [dedicatedSender, sharedSender, accountA],
  );
  const contact = '+12485550111';
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values ($1,$3,'opted_in','test',now()),($2,$3,'opted_in','test',now())`,
    [accountA, accountB, contact],
  );

  const inboundArgs = [
    'signalwire', 'msg-inbound-1', 'msg-inbound-1', 'a'.repeat(64),
    'application/json', 'https://example.test/api/sms/inbound', contact,
    '+12485550140', 'A safe dedicated reply', [], 'other',
  ];
  const routed = one(await client.query(
    'select * from public.ingest_sms_inbound_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    inboundArgs,
  ));
  const duplicate = one(await client.query(
    'select * from public.ingest_sms_inbound_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    inboundArgs,
  ));
  const messageCount = one(await client.query(
    `select count(*)::int as count from public.sms_messages
      where provider='signalwire' and provider_id='msg-inbound-1'`,
  ));
  check('dedicated inbound is routed once',
    routed.ingress_disposition === 'routed'
      && routed.routed_account_id === accountA
      && duplicate.ingress_disposition === 'duplicate'
      && messageCount.count === 1);
  const mismatchedInboundCode = await rejectionCode(
    client,
    'select * from public.ingest_sms_inbound_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    inboundArgs.map((value, index) => index === 3 ? '9'.repeat(64) : value),
  );
  const messageCountAfterMismatch = one(await client.query(
    `select count(*)::int as count from public.sms_messages
      where provider='signalwire' and provider_id='msg-inbound-1'`,
  ));
  check('inbound receipt-key replay rejects different signed bytes without a second effect',
    mismatchedInboundCode === 'P5120' && messageCountAfterMismatch.count === 1,
    mismatchedInboundCode ?? 'accepted');

  const reviewArgs = [
    'signalwire', 'inbound', 'invalid-provider-event', 'invalid-receipt-key',
    '8'.repeat(64), 'application/json',
    'https://example.test/api/sms/inbound', 'invalid_payload',
    contact, '+12485550140', 'invalid body', null, null,
  ];
  const firstReview = one(await client.query(
    'select * from public.record_sms_webhook_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    reviewArgs,
  ));
  const duplicateReview = one(await client.query(
    'select * from public.record_sms_webhook_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    reviewArgs,
  ));
  const mismatchedReviewCode = await rejectionCode(
    client,
    'select * from public.record_sms_webhook_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    reviewArgs.map((value, index) => index === 4 ? '7'.repeat(64) : value),
  );
  const reviewCountAfterMismatch = one(await client.query(
    `select count(*)::int as count from public.sms_operator_review_items r
      join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
     where w.receipt_key='invalid-receipt-key'`,
  ));
  check('review receipt replay is exact and mismatch-safe',
    firstReview.review_disposition === 'review'
      && duplicateReview.review_disposition === 'duplicate'
      && mismatchedReviewCode === 'P5121'
      && reviewCountAfterMismatch.count === 1,
    mismatchedReviewCode ?? 'accepted');

  const shared = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-shared','msg-shared',$1,'application/json',
       'https://example.test/api/sms/inbound',$2,'+12485550141','Who gets this?',array[]::text[],'other'
     )`,
    ['b'.repeat(64), contact],
  ));
  const sharedReview = one(await client.query(
    `select reason from public.sms_operator_review_items r
      join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
     where w.provider_event_id='msg-shared'`,
  ));
  check('shared reply is quarantined without a tenant',
    shared.ingress_disposition === 'review'
      && shared.routed_account_id === null
      && sharedReview.reason === 'shared_destination_unroutable');

  const stop = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-stop','msg-stop',$1,'application/x-www-form-urlencoded',
       'https://example.test/api/sms/inbound',$2,'+12485550140','STOP',array[]::text[],'stop'
     )`,
    ['c'.repeat(64), contact],
  ));
  const stopReplay = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-stop','msg-stop',$1,'application/x-www-form-urlencoded',
       'https://example.test/api/sms/inbound',$2,'+12485550140','STOP',array[]::text[],'stop'
     )`,
    ['c'.repeat(64), contact],
  ));
  const consents = await client.query(
    'select account_id,status from public.sms_consent where phone_number=$1 order by account_id',
    [contact],
  );
  const preference = one(await client.query(
    `select status from public.sms_sender_keyword_preferences
      where sender_number_id=$1 and phone_number=$2`,
    [dedicatedSender, contact],
  ));
  check('dedicated STOP is scoped to its account and sender',
    stop.ingress_disposition === 'keyword_stop'
      && stopReplay.ingress_disposition === 'duplicate'
      && consents.rows.find((row) => row.account_id === accountA)?.status === 'opted_out'
      && consents.rows.find((row) => row.account_id === accountB)?.status === 'opted_in'
      && preference.status === 'opted_out');

  const start = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-start','msg-start',$1,'application/x-www-form-urlencoded',
       'https://example.test/api/sms/inbound',$2,'+12485550140','START',array[]::text[],'start'
     )`,
    ['f'.repeat(64), contact],
  ));
  const restartedConsent = one(await client.query(
    'select status from public.sms_consent where account_id=$1 and phone_number=$2',
    [accountA, contact],
  ));
  const restartedPreference = one(await client.query(
    `select status from public.sms_sender_keyword_preferences
      where sender_number_id=$1 and phone_number=$2`,
    [dedicatedSender, contact],
  ));
  check('dedicated START resumes only the same account and sender',
    start.ingress_disposition === 'keyword_start'
      && restartedConsent.status === 'opted_in'
      && restartedPreference.status === 'opted_in');

  const sharedContact = '+12485550112';
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values
       ($1,$3,'opted_in','test',now(),null),
       ($2,$3,'opted_out','test',now(),now())`,
    [accountA, accountB, sharedContact],
  );
  const sharedStart = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-shared-start','msg-shared-start',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550141','START',array[]::text[],'start'
     )`,
    ['1'.repeat(64), sharedContact],
  ));
  const sharedConsents = await client.query(
    'select account_id,status from public.sms_consent where phone_number=$1 order by account_id',
    [sharedContact],
  );
  const sharedPreference = one(await client.query(
    `select status from public.sms_sender_keyword_preferences
      where sender_number_id=$1 and phone_number=$2`,
    [sharedSender, sharedContact],
  ));
  check('shared START changes only the platform sender preference',
    sharedStart.ingress_disposition === 'keyword_start'
      && sharedStart.routed_account_id === null
      && sharedConsents.rows.find((row) => row.account_id === accountA)?.status === 'opted_in'
      && sharedConsents.rows.find((row) => row.account_id === accountB)?.status === 'opted_out'
      && sharedPreference.status === 'opted_in');

  const uniquelyAssociatedContact = '+12485550113';
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values
       ($1,$3,'opted_out','test',now(),now()),
       ($2,$3,'opted_out','test',now(),now())`,
    [accountA, accountB, uniquelyAssociatedContact],
  );
  await client.query(
    `insert into public.sms_events(
       account_id,event_type,phone_number,status,provider_id,provider,body,
       context,sent_at,provider_accepted_at,sender_number_id
     ) values (
       $1,'shared_association',$2,'sent','shared-association-a','signalwire',
       'accepted shared message','platform',now(),now(),$3
     )`,
    [accountA, uniquelyAssociatedContact, sharedSender],
  );
  const uniquelyAssociatedStart = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-shared-unique-start','msg-shared-unique-start',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550141','START',array[]::text[],'start'
     )`,
    ['2'.repeat(64), uniquelyAssociatedContact],
  ));
  const uniquelyAssociatedConsents = await client.query(
    'select account_id,status from public.sms_consent where phone_number=$1 order by account_id',
    [uniquelyAssociatedContact],
  );
  check('shared keyword uses one exact accepted sender/contact association',
    uniquelyAssociatedStart.ingress_disposition === 'keyword_start'
      && uniquelyAssociatedStart.routed_account_id === accountA
      && uniquelyAssociatedConsents.rows.find((row) => row.account_id === accountA)?.status === 'opted_in'
      && uniquelyAssociatedConsents.rows.find((row) => row.account_id === accountB)?.status === 'opted_out');

  const ambiguouslyAssociatedContact = '+12485550114';
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values
       ($1,$3,'opted_out','test',now(),now()),
       ($2,$3,'opted_out','test',now(),now())`,
    [accountA, accountB, ambiguouslyAssociatedContact],
  );
  await client.query(
    `insert into public.sms_events(
       account_id,event_type,phone_number,status,provider_id,provider,body,
       context,sent_at,provider_accepted_at,sender_number_id
     ) values
       ($1,'shared_association',$3,'sent','shared-ambiguous-a','signalwire',
        'accepted shared message A','platform',now(),now(),$4),
       ($2,'shared_association',$3,'sent','shared-ambiguous-b','signalwire',
        'accepted shared message B','platform',now(),now(),$4)`,
    [accountA, accountB, ambiguouslyAssociatedContact, sharedSender],
  );
  const ambiguouslyAssociatedStart = one(await client.query(
    `select * from public.ingest_sms_inbound_webhook(
       'signalwire','msg-shared-ambiguous-start','msg-shared-ambiguous-start',$1,
       'application/x-www-form-urlencoded','https://example.test/api/sms/inbound',
       $2,'+12485550141','START',array[]::text[],'start'
     )`,
    ['3'.repeat(64), ambiguouslyAssociatedContact],
  ));
  const ambiguouslyAssociatedConsents = await client.query(
    'select account_id,status from public.sms_consent where phone_number=$1 order by account_id',
    [ambiguouslyAssociatedContact],
  );
  check('shared keyword never guesses between two accepted account histories',
    ambiguouslyAssociatedStart.ingress_disposition === 'keyword_start'
      && ambiguouslyAssociatedStart.routed_account_id === null
      && ambiguouslyAssociatedConsents.rows.every((row) => row.status === 'opted_out'));

  const earlyDeliveredArgs = [
    'signalwire', 'early-provider-id', 'delivered', null,
    'early-provider-id:delivered:-', '4'.repeat(64), 'application/json',
    'https://example.test/api/sms/status',
  ];
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values ($1,'+12485550115','opted_in','test',now(),null)`,
    [accountA],
  );
  const earlyEnqueue = one(await client.query(
    `select * from public.enqueue_sms_delivery(
       p_account_id => $1,
       p_phone_number => '+12485550115',
       p_body => 'accepted body',
       p_message_kind => 'early-status',
       p_billing_category => 'customer_message',
       p_sender_purpose => 'contractor_dedicated',
       p_context => 'automation',
       p_event_type => 'early_status',
       p_idempotency_key => 'early-status-completion-race',
       p_sender_number_id => $2
     )`,
    [accountA, dedicatedSender],
  ));
  const earlyClaim = one(await client.query('select * from public.claim_sms_delivery_tasks(1)'));
  const earlyStage = one(await client.query(
    'select * from public.stage_sms_delivery($1,$2,\'signalwire\')',
    [earlyEnqueue.sms_event_id, earlyClaim.work_claim_token],
  ));
  const earlyStarted = one(await client.query(
    'select public.mark_sms_delivery_request_started($1,$2) as ok',
    [earlyEnqueue.sms_event_id, earlyClaim.work_claim_token],
  ));
  const earlyDelivered = one(await client.query(
    'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
    earlyDeliveredArgs,
  ));
  const mismatchedStatusCode = await rejectionCode(
    client,
    'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
    earlyDeliveredArgs.map((value, index) => index === 5 ? '6'.repeat(64) : value),
  );
  const earlyCompleted = one(await client.query(
    `select public.complete_sms_delivery($1,$2,'early-provider-id') as ok`,
    [earlyEnqueue.sms_event_id, earlyClaim.work_claim_token],
  ));
  const automaticReplay = one(await client.query(
    'select * from public.reconcile_sms_matched_status_receipts(50)',
  ));
  const concurrentRetries = await Promise.all([
    client.query(
      'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
      earlyDeliveredArgs,
    ),
    concurrentClient.query(
      'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
      earlyDeliveredArgs,
    ),
  ]);
  const earlyRetryRows = concurrentRetries.map(one);
  const earlyProjection = one(await client.query(
    `select e.status,w.processing_state,r.review_state,t.task_state,
            (select count(*)::int
               from public.sms_operator_review_items all_reviews
              where all_reviews.webhook_receipt_id=w.id) as review_count
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
       join public.sms_webhook_receipts w on w.sms_event_id=e.id
       join public.sms_operator_review_items r on r.webhook_receipt_id=w.id
      where e.id=$1`,
    [earlyEnqueue.sms_event_id],
  ));
  check('automatic replay projects an early unmatched status and later duplicates stay inert',
    earlyDelivered.status_disposition === 'review'
      && earlyStage.dispatch_status === 'ready'
      && earlyStarted.ok === true
      && earlyCompleted.ok === true
      && automaticReplay.examined >= 1
      && automaticReplay.projected >= 1
      && automaticReplay.failed === 0
      && earlyRetryRows.every((row) => row.status_disposition === 'duplicate')
      && earlyProjection.status === 'delivered'
      && earlyProjection.task_state === 'completed'
      && earlyProjection.processing_state === 'processed'
      && earlyProjection.review_state === 'resolved'
      && earlyProjection.review_count === 1
      && mismatchedStatusCode === 'P5122');

  const operatorEarlyArgs = [
    'signalwire', 'operator-early-provider-id', 'undelivered', '30034',
    'operator-early-provider-id:undelivered:30034', '5'.repeat(64), 'application/json',
    'https://example.test/api/sms/status',
  ];
  const operatorEarly = one(await client.query(
    'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
    operatorEarlyArgs,
  ));
  const operatorEarlyEvent = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider_id,provider,body,
       context,sent_at,provider_accepted_at,sender_number_id
     ) values (
       $1,$2,'early_status','+12485550116','sent','operator-early-provider-id',
       'signalwire','accepted body','platform',now(),now(),$3
     )`,
    [operatorEarlyEvent, accountA, dedicatedSender],
  );
  const operatorEarlyReview = one(await client.query(
    `select r.id
       from public.sms_operator_review_items r
       join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
      where w.provider_event_id='operator-early-provider-id'`,
  ));
  const operatorReconciled = one(await client.query(
    `select public.resolve_sms_operator_review_item(
       $1,'resolved','Reapplied after provider identity became available'
     ) as ok`,
    [operatorEarlyReview.id],
  ));
  const operatorEarlyProjection = one(await client.query(
    `select e.status,r.review_state,r.resolution_note
       from public.sms_events e
       join public.sms_webhook_receipts w on w.sms_event_id=e.id
       join public.sms_operator_review_items r on r.webhook_receipt_id=w.id
      where e.id=$1`,
    [operatorEarlyEvent],
  ));
  check('operator resolution reapplies unmatched status instead of annotating it away',
    operatorEarly.status_disposition === 'review'
      && operatorReconciled.ok === true
      && operatorEarlyProjection.status === 'failed'
      && operatorEarlyProjection.review_state === 'resolved'
      && operatorEarlyProjection.resolution_note === 'Reapplied after provider identity became available');

  // -------------------------------------------------------------------
  // Manual identity recovery: a response was lost after provider request.
  // -------------------------------------------------------------------
  const recoveryPhone = '+12485550119';
  await client.query(
    `insert into public.sms_consent(
       account_id,phone_number,status,source,consented_at,opted_out_at
     ) values ($1,$2,'opted_in','test',now(),null)`,
    [accountA, recoveryPhone],
  );
  const recoveryEnqueue = one(await client.query(
    `select * from public.enqueue_sms_delivery(
       p_account_id => $1,
       p_phone_number => $2,
       p_body => 'ambiguous provider request',
       p_message_kind => 'manual-recovery',
       p_billing_category => 'customer_message',
       p_sender_purpose => 'contractor_dedicated',
       p_context => 'automation',
       p_event_type => 'manual_recovery',
       p_idempotency_key => 'manual-recovery-happy-path',
       p_sender_number_id => $3
     )`,
    [accountA, recoveryPhone, dedicatedSender],
  ));
  const recoveryClaim = one(await client.query('select * from public.claim_sms_delivery_tasks(1)'));
  await client.query('select * from public.stage_sms_delivery($1,$2,\'signalwire\')',
    [recoveryEnqueue.sms_event_id, recoveryClaim.work_claim_token]);
  await client.query('select public.mark_sms_delivery_request_started($1,$2)',
    [recoveryEnqueue.sms_event_id, recoveryClaim.work_claim_token]);
  const uncertain = one(await client.query(
    `select * from public.fail_sms_delivery($1,$2,'provider_response_unknown',true)`,
    [recoveryEnqueue.sms_event_id, recoveryClaim.work_claim_token],
  ));
  const unmatched = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','manual-recovery-provider-id','delivered',null,
       'manual-recovery-provider-id:delivered:-',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['a'.repeat(64)],
  ));
  const recoveryReview = one(await client.query(
    `select r.id
       from public.sms_operator_review_items r
       join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
      where w.provider='signalwire'
        and w.provider_event_id='manual-recovery-provider-id'
        and r.reason='unmatched_status'`,
  ));
  const recoveryCalls = await Promise.allSettled([
    client.query(
      `select public.reconcile_sms_unmatched_status($1,$2,$3,$4) as ok`,
      [recoveryReview.id, recoveryEnqueue.sms_event_id,
        'Matched against the provider delivery log.', 'operator@example.com'],
    ),
    concurrentClient.query(
      `select public.reconcile_sms_unmatched_status($1,$2,$3,$4) as ok`,
      [recoveryReview.id, recoveryEnqueue.sms_event_id,
        'Matched against the provider delivery log.', 'operator@example.com'],
    ),
  ]);
  const recoveredProjection = one(await client.query(
    `select e.status as event_status,e.provider_id,e.indeterminate_at,
            t.task_state,t.attempt_count,t.completed_at,
            w.processing_state,w.sms_event_id as receipt_event_id,
            r.review_state,r.sms_event_id as review_event_id,
            r.resolution_note,r.resolution_actor,
            (select count(*)::int from public.sms_delivery_attempts a
              where a.sms_event_id=e.id) as attempt_rows,
            (select min(a.outcome) from public.sms_delivery_attempts a
              where a.sms_event_id=e.id) as attempt_outcome
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
       join public.sms_webhook_receipts w on w.sms_event_id=e.id
       join public.sms_operator_review_items r on r.webhook_receipt_id=w.id
      where e.id=$1`,
    [recoveryEnqueue.sms_event_id],
  ));
  check('manual unmatched status recovery is one-winner and never resends',
    uncertain.failure_status === 'indeterminate'
      && unmatched.status_disposition === 'review'
      && recoveryCalls.filter((result) => result.status === 'fulfilled').length === 1
      && recoveryCalls.filter((result) => result.status === 'rejected').length === 1
      && recoveryCalls.find((result) => result.status === 'rejected')?.reason?.code === '55000'
      && recoveredProjection.event_status === 'delivered'
      && recoveredProjection.provider_id === 'manual-recovery-provider-id'
      && recoveredProjection.indeterminate_at === null
      && recoveredProjection.task_state === 'completed'
      && recoveredProjection.attempt_count === 1
      && recoveredProjection.attempt_rows === 1
      && recoveredProjection.attempt_outcome === 'indeterminate'
      && recoveredProjection.processing_state === 'processed'
      && recoveredProjection.receipt_event_id === recoveryEnqueue.sms_event_id
      && recoveredProjection.review_state === 'resolved'
      && recoveredProjection.review_event_id === recoveryEnqueue.sms_event_id
      && recoveredProjection.resolution_note === 'Matched against the provider delivery log.'
      && recoveredProjection.resolution_actor === 'operator@example.com',
    JSON.stringify({ recoveryCalls, recoveredProjection }));

  const insertIndeterminate = async ({
    provider = 'signalwire', providerId = null, eventType,
  }) => {
    const eventId = randomUUID();
    await client.query(
      `insert into public.sms_events(
         id,account_id,event_type,phone_number,status,provider_id,provider,body,
         context,indeterminate_at,sender_number_id,error_reason
       ) values (
         $1,$2,$3,'+12485550120','indeterminate',$4,$5,'uncertain body',
         'platform',now(),$6,'provider_response_unknown'
       )`,
      [eventId, accountA, eventType, providerId, provider, dedicatedSender],
    );
    await client.query(
      `insert into public.sms_delivery_tasks(
         sms_event_id,task_state,attempt_count,last_error_code,indeterminate_at
       ) values ($1,'indeterminate',1,'provider_response_unknown',now())`,
      [eventId],
    );
    return eventId;
  };
  const createUnmatched = async (provider, providerId, status, hashCharacter) => {
    const errorCode = status === 'failed' || status === 'undelivered' ? '30034' : null;
    await client.query(
      `select * from public.apply_sms_delivery_status_webhook(
         $1,$2,$3,$4,$5,$6,'application/json',
         'https://example.test/api/sms/status'
       )`,
      [provider, providerId, status, errorCode,
        `${providerId}:${status}:${errorCode ?? '-'}`, hashCharacter.repeat(64)],
    );
    return one(await client.query(
      `select r.id
         from public.sms_operator_review_items r
         join public.sms_webhook_receipts w on w.id=r.webhook_receipt_id
        where w.provider=$1 and w.provider_event_id=$2
          and w.provider_status=$3 and r.review_state='open'`,
      [provider, providerId, status],
    )).id;
  };

  const wrongProviderEvent = await insertIndeterminate({ eventType: 'recovery_wrong_provider' });
  const wrongProviderReview = await createUnmatched(
    'twilio', 'wrong-provider-recovery-id', 'delivered', 'b',
  );
  const wrongProviderCode = await rejectionCode(
    client,
    'select public.reconcile_sms_unmatched_status($1,$2,$3,$4)',
    [wrongProviderReview, wrongProviderEvent, 'Provider does not match.', 'operator@example.com'],
  );

  const queuedEvent = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider,body,context,sender_number_id
     ) values ($1,$2,'recovery_not_indeterminate','+12485550121','queued',
               'signalwire','queued body','platform',$3)`,
    [queuedEvent, accountA, dedicatedSender],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(sms_event_id,task_state)
     values ($1,'queued')`,
    [queuedEvent],
  );
  const queuedReview = await createUnmatched(
    'signalwire', 'queued-recovery-id', 'delivered', 'c',
  );
  const nonIndeterminateCode = await rejectionCode(
    client,
    'select public.reconcile_sms_unmatched_status($1,$2,$3,$4)',
    [queuedReview, queuedEvent, 'Not indeterminate.', 'operator@example.com'],
  );

  const boundEvent = await insertIndeterminate({
    eventType: 'recovery_already_bound', providerId: 'already-bound-provider-id',
  });
  const boundReview = await createUnmatched(
    'signalwire', 'different-unmatched-provider-id', 'delivered', 'd',
  );
  const alreadyBoundCode = await rejectionCode(
    client,
    'select public.reconcile_sms_unmatched_status($1,$2,$3,$4)',
    [boundReview, boundEvent, 'Event is already bound.', 'operator@example.com'],
  );

  const closedEvent = await insertIndeterminate({ eventType: 'recovery_closed_review' });
  const closedReview = await createUnmatched(
    'signalwire', 'closed-recovery-id', 'delivered', 'e',
  );
  await client.query(
    `select public.resolve_sms_operator_review_item($1,'dismissed','Not the right event')`,
    [closedReview],
  );
  const closedReviewCode = await rejectionCode(
    client,
    'select public.reconcile_sms_unmatched_status($1,$2,$3,$4)',
    [closedReview, closedEvent, 'Review was already closed.', 'operator@example.com'],
  );

  const conflictEvent = await insertIndeterminate({ eventType: 'recovery_unique_conflict' });
  const conflictReview = await createUnmatched(
    'signalwire', 'unique-conflict-provider-id', 'delivered', 'f',
  );
  await client.query(
    `insert into public.sms_events(
       account_id,event_type,phone_number,status,provider_id,provider,body,context,
       sent_at,provider_accepted_at,sender_number_id
     ) values ($1,'recovery_conflict_owner','+12485550122','sent',$2,'signalwire',
               'already owns provider id','platform',now(),now(),$3)`,
    [accountA, 'unique-conflict-provider-id', dedicatedSender],
  );
  const uniquenessCode = await rejectionCode(
    client,
    'select public.reconcile_sms_unmatched_status($1,$2,$3,$4)',
    [conflictReview, conflictEvent, 'Must reject duplicate provider id.', 'operator@example.com'],
  );
  const rejectedState = one(await client.query(
    `select
       (select status from public.sms_events where id=$1) as wrong_provider_status,
       (select status from public.sms_events where id=$2) as queued_status,
       (select provider_id from public.sms_events where id=$3) as bound_provider_id,
       (select provider_id from public.sms_events where id=$4) as conflict_provider_id,
       (select review_state from public.sms_operator_review_items where id=$5) as conflict_review_state`,
    [wrongProviderEvent, queuedEvent, boundEvent, conflictEvent, conflictReview],
  ));
  check('manual recovery rejects provider/state/binding/review/uniqueness hazards',
    wrongProviderCode === '55000'
      && nonIndeterminateCode === '55000'
      && alreadyBoundCode === '55000'
      && closedReviewCode === '55000'
      && uniquenessCode === '23505'
      && rejectedState.wrong_provider_status === 'indeterminate'
      && rejectedState.queued_status === 'queued'
      && rejectedState.bound_provider_id === 'already-bound-provider-id'
      && rejectedState.conflict_provider_id === null
      && rejectedState.conflict_review_state === 'open',
    JSON.stringify({
      wrongProviderCode, nonIndeterminateCode, alreadyBoundCode,
      closedReviewCode, uniquenessCode, rejectedState,
    }));

  const indeterminateDeliveredEvent = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider_id,provider,body,
       context,provider_accepted_at,indeterminate_at,sender_number_id,error_reason
     ) values (
       $1,$2,'indeterminate_status','+12485550117','indeterminate',
       'indeterminate-delivered-id','signalwire','uncertain body','platform',
       now(),now(),$3,'sms_delivery_unknown_after_lease_expiry'
     )`,
    [indeterminateDeliveredEvent, accountA, dedicatedSender],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(
       sms_event_id,task_state,attempt_count,last_error_code,indeterminate_at
     ) values ($1,'indeterminate',1,'sms_delivery_unknown_after_lease_expiry',now())`,
    [indeterminateDeliveredEvent],
  );
  const lateQueued = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','indeterminate-delivered-id','queued',null,
       'indeterminate-delivered-id:queued:-',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['6'.repeat(64)],
  ));
  const lateSending = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','indeterminate-delivered-id','sending',null,
       'indeterminate-delivered-id:sending:-',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['7'.repeat(64)],
  ));
  const beforeTerminalFact = one(await client.query(
    `select e.status as event_status,t.task_state
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
      where e.id=$1`,
    [indeterminateDeliveredEvent],
  ));
  const resolvedDelivered = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','indeterminate-delivered-id','delivered',null,
       'indeterminate-delivered-id:delivered:-',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['8'.repeat(64)],
  ));
  const afterTerminalFact = one(await client.query(
    `select e.status as event_status,e.indeterminate_at,
            t.task_state,t.completed_at,t.indeterminate_at as task_indeterminate_at
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
      where e.id=$1`,
    [indeterminateDeliveredEvent],
  ));
  check('lower carrier states cannot reopen an indeterminate accepted delivery',
    lateQueued.status_disposition === 'ignored_stale'
      && lateSending.status_disposition === 'ignored_stale'
      && beforeTerminalFact.event_status === 'indeterminate'
      && beforeTerminalFact.task_state === 'indeterminate');
  check('delivered fact closes an indeterminate task as completed',
    resolvedDelivered.status_disposition === 'applied'
      && afterTerminalFact.event_status === 'delivered'
      && afterTerminalFact.indeterminate_at === null
      && afterTerminalFact.task_state === 'completed'
      && afterTerminalFact.completed_at !== null
      && afterTerminalFact.task_indeterminate_at === null);

  const indeterminateFailedEvent = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider_id,provider,body,
       context,indeterminate_at,sender_number_id,error_reason
     ) values (
       $1,$2,'indeterminate_status','+12485550118','indeterminate',
       'indeterminate-failed-id','signalwire','uncertain body','platform',
       now(),$3,'sms_delivery_unknown_after_lease_expiry'
     )`,
    [indeterminateFailedEvent, accountA, dedicatedSender],
  );
  await client.query(
    `insert into public.sms_delivery_tasks(
       sms_event_id,task_state,attempt_count,last_error_code,indeterminate_at
     ) values ($1,'indeterminate',1,'sms_delivery_unknown_after_lease_expiry',now())`,
    [indeterminateFailedEvent],
  );
  const resolvedFailed = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','indeterminate-failed-id','undelivered','30034',
       'indeterminate-failed-id:undelivered:30034',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['9'.repeat(64)],
  ));
  const afterFailedFact = one(await client.query(
    `select e.status as event_status,e.error_reason,e.indeterminate_at,
            t.task_state,t.failed_at,t.indeterminate_at as task_indeterminate_at,
            t.last_error_code
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id=e.id
      where e.id=$1`,
    [indeterminateFailedEvent],
  ));
  check('failed fact closes an indeterminate task as failed',
    resolvedFailed.status_disposition === 'applied'
      && afterFailedFact.event_status === 'failed'
      && afterFailedFact.error_reason === '30034'
      && afterFailedFact.indeterminate_at === null
      && afterFailedFact.task_state === 'failed'
      && afterFailedFact.failed_at !== null
      && afterFailedFact.task_indeterminate_at === null
      && afterFailedFact.last_error_code === 'carrier_status_failed');

  const eventSignalWire = randomUUID();
  const eventTwilio = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider_id,provider,body,context,sent_at,provider_accepted_at
     ) values
       ($1,$3,'status_test','+12485550111','sent','same-provider-id','signalwire','body','platform',now(),now()),
       ($2,$4,'status_test','+12485550111','sent','same-provider-id','twilio','body','platform',now(),now())`,
    [eventSignalWire, eventTwilio, accountA, accountB],
  );
  await client.query(
    `insert into public.sms_messages(id,account_id,phone_number,direction,body,provider_id)
     values ($1,$2,'+12485550111','outbound','accepted body','same-provider-id')`,
    [eventSignalWire, accountA],
  );
  const outboundTranscript = one(await client.query(
    'select provider,sms_event_id from public.sms_messages where id=$1',
    [eventSignalWire],
  ));
  check('legacy completion insert receives provider identity at the table boundary',
    outboundTranscript.provider === 'signalwire'
      && outboundTranscript.sms_event_id === eventSignalWire);
  const deliveredArgs = [
    'signalwire', 'same-provider-id', 'delivered', null,
    'same-provider-id:delivered:-', 'd'.repeat(64), 'application/json',
    'https://example.test/api/sms/status',
  ];
  const delivered = one(await client.query(
    'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
    deliveredArgs,
  ));
  const replay = one(await client.query(
    'select * from public.apply_sms_delivery_status_webhook($1,$2,$3,$4,$5,$6,$7,$8)',
    deliveredArgs,
  ));
  const states = await client.query(
    'select id,status from public.sms_events where id=any($1::uuid[]) order by id',
    [[eventSignalWire, eventTwilio]],
  );
  check('status projection is provider-scoped and deduplicated',
    delivered.status_disposition === 'applied'
      && replay.status_disposition === 'duplicate'
      && states.rows.find((row) => row.id === eventSignalWire)?.status === 'delivered'
      && states.rows.find((row) => row.id === eventTwilio)?.status === 'sent');

  const lateFailure = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','same-provider-id','failed','carrier-failed',
       'same-provider-id:failed:carrier-failed',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['e'.repeat(64)],
  ));
  const finalState = one(await client.query('select status from public.sms_events where id=$1', [eventSignalWire]));
  check('terminal delivered state does not regress',
    lateFailure.status_disposition === 'ignored_terminal' && finalState.status === 'delivered');

  const failedEvent = randomUUID();
  await client.query(
    `insert into public.sms_events(
       id,account_id,event_type,phone_number,status,provider_id,provider,body,context,sent_at,provider_accepted_at
     ) values ($1,$2,'status_test','+12485550111','sent','failure-id','signalwire','body','platform',now(),now())`,
    [failedEvent, accountA],
  );
  const failed = one(await client.query(
    `select * from public.apply_sms_delivery_status_webhook(
       'signalwire','failure-id','undelivered','30034',
       'failure-id:undelivered:30034',$1,'application/json',
       'https://example.test/api/sms/status'
     )`,
    ['1'.repeat(64)],
  ));
  const failedState = one(await client.query(
    'select status,error_reason,failed_at from public.sms_events where id=$1',
    [failedEvent],
  ));
  check('terminal carrier failure is recorded with evidence',
    failed.status_disposition === 'applied'
      && failedState.status === 'failed'
      && failedState.error_reason === '30034'
      && failedState.failed_at !== null);

  const reviewId = one(await client.query(
    `select id from public.sms_operator_review_items where review_state='open' order by created_at limit 1`,
  )).id;
  const resolved = one(await client.query(
    `select public.resolve_sms_operator_review_item($1,'resolved','Verified against sender inventory') as ok`,
    [reviewId],
  ));
  const stale = one(await client.query(
    `select public.resolve_sms_operator_review_item($1,'dismissed','A second terminal update') as ok`,
    [reviewId],
  ));
  check('operator review resolution is compare-and-set', resolved.ok === true && stale.ok === false);

  await client.query('grant insert,update on public.sms_messages to authenticated');
  await client.query('set role authenticated');
  let spoofCode = null;
  try {
    await client.query(
      `insert into public.sms_messages(
         account_id,phone_number,direction,body,provider_id,provider,sender_number_id
       ) values ($1,$2,'inbound','spoof','forged','signalwire',$3)`,
      [accountA, contact, dedicatedSender],
    );
  } catch (error) {
    spoofCode = error?.code ?? null;
  } finally {
    await client.query('reset role');
  }
  check('browser role cannot manufacture provider identity', spoofCode === '42501', String(spoofCode));

  const security = await client.query(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity,
            has_table_privilege('authenticated',c.oid,'select') as auth_select,
            has_table_privilege('service_role',c.oid,'update') as service_update
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in (
        'sms_webhook_receipts','sms_operator_review_items','sms_sender_keyword_preferences'
      )`,
  );
  const grants = one(await client.query(
    `select
       has_function_privilege('service_role','public.resolve_sms_operator_review_item(uuid,text,text)','execute') as service_exec,
       has_function_privilege('authenticated','public.resolve_sms_operator_review_item(uuid,text,text)','execute') as auth_exec,
       has_function_privilege('service_role','public.reconcile_sms_unmatched_status(uuid,uuid,text,text)','execute') as recovery_service_exec,
       has_function_privilege('authenticated','public.reconcile_sms_unmatched_status(uuid,uuid,text,text)','execute') as recovery_auth_exec`,
  ));
  check('callback storage is forced RLS with RPC-only mutation',
    security.rowCount === 3
      && security.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)
      && security.rows.every((row) => !row.auth_select && !row.service_update)
      && grants.service_exec === true && grants.auth_exec === false
      && grants.recovery_service_exec === true && grants.recovery_auth_exec === false);
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  try { await concurrentClient?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 12) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
