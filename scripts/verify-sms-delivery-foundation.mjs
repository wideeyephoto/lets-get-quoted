// Execute the durable SMS migration against a throwaway local PostgreSQL 17.
// The harness creates its own cluster and never reads a hosted database URL.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const MIGRATION = 'migrations/20260821180506_sms_delivery_foundation.sql';
const USAGE_MIGRATION = 'migrations/20260821191500_sms_usage_finalization.sql';
const PRODUCER_PROJECTION_MIGRATION = 'migrations/20260821194000_producer_sms_queue_projection.sql';
const PORT = Number(process.env.LGQ_SMS_FOUNDATION_CHECK_PORT || 54355);

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

const BIN = join(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  'windows-x64',
  'native',
  'bin',
);
process.env.PATH = `${BIN}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

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

function sqlState(error) {
  return error && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : null;
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
    create role service_role nologin;
  end if;
end
$roles$;

create table public.accounts (
  id uuid primary key default pg_catalog.gen_random_uuid()
);
create table public.usage_reservations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  resource_code text not null,
  units bigint not null,
  operation_type text not null,
  idempotency_key text not null,
  state text not null default 'reserved',
  expires_at timestamptz not null default (pg_catalog.now() + interval '15 minutes'),
  committed_at timestamptz,
  released_at timestamptz,
  finalization_key text,
  release_reason text
);
create table public.workspace_overage_accrual_events (
  account_id uuid not null references public.accounts(id),
  idempotency_key text not null,
  resource_code text not null,
  units bigint not null default 1,
  millicents bigint not null default 4800,
  released_at timestamptz,
  primary key (account_id, idempotency_key)
);
create function public.commit_usage_reservation(uuid, text)
returns boolean language plpgsql as $usage_commit$
begin
  update public.usage_reservations set state = 'committed', committed_at = pg_catalog.now(),
    finalization_key = $2 where id = $1 and state = 'reserved';
  if found then return true; end if;
  return exists (select 1 from public.usage_reservations
    where id = $1 and state = 'committed' and finalization_key = $2);
end $usage_commit$;
create function public.release_usage_reservation(uuid, text, text default 'released')
returns boolean language plpgsql as $usage_release$
begin
  update public.usage_reservations set state = 'released', released_at = pg_catalog.now(),
    finalization_key = $2, release_reason = $3 where id = $1 and state = 'reserved';
  if found then return true; end if;
  return exists (select 1 from public.usage_reservations
    where id = $1 and state = 'released');
end $usage_release$;
create function public.release_usage_overage(uuid, text)
returns bigint language plpgsql as $overage_release$
declare v_amount bigint;
begin
  update public.workspace_overage_accrual_events
     set released_at = pg_catalog.now()
   where account_id = $1 and idempotency_key = $2 and released_at is null
   returning millicents into v_amount;
  return coalesce(v_amount, 0);
end $overage_release$;
create table public.payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);
create table public.crew (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);
create table public.jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);

create table public.subcontractor_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  job_id uuid not null references public.jobs(id),
  status text not null default 'draft',
  expires_at timestamptz not null default (pg_catalog.now() + interval '1 day'),
  sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint subcontractor_requests_status_check check (
    status in ('draft','sent','viewed','partially_responded','claimed','expired','cancelled','reopened')
  )
);
create unique index subcontractor_requests_one_live_per_job
  on public.subcontractor_requests(job_id)
  where status in ('draft','sent','viewed','partially_responded','reopened');
create index subcontractor_requests_open_idx
  on public.subcontractor_requests(account_id, created_at)
  where status in ('sent','viewed','partially_responded','reopened');

create table public.subcontractor_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  request_id uuid not null references public.subcontractor_requests(id),
  crew_id uuid not null references public.crew(id),
  status text not null default 'queued',
  provider_id text,
  error_reason text,
  queued_at timestamptz not null default pg_catalog.now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create function public.is_owner(uuid)
returns boolean language sql stable as $$ select false $$;

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
  constraint sms_events_status_check check (
    status in ('pending', 'sent', 'failed', 'opted_out', 'indeterminate')
  ),
  constraint sms_events_context_check check (
    context in ('payment', 'crew', 'subcontractor')
  ),
  constraint sms_events_event_type_allowed check (
    event_type in (
      'payment_requested', 'payment_paid', 'payment_failed', 'payment_refunded',
      'crew_assigned', 'crew_scheduled', 'sub_offer', 'sub_offer_covered',
      'sub_offer_won', 'sub_offer_cancelled'
    )
  ),
  constraint sms_events_target_check check (
    (context = 'payment' and payment_id is not null)
    or (context in ('crew', 'subcontractor') and crew_id is not null)
  ),
  unique (payment_id, event_type)
);

create table public.sms_consent (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  status text not null check (status in ('opted_in', 'opted_out')),
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
  direction text not null check (direction in ('inbound', 'outbound')),
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
  databaseDir: join(process.cwd(), '.pg17-sms-foundation-check'),
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let control;
let workerA;
let workerB;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_check');
  const { Client } = await import('pg');
  const clientOptions = {
    host: '127.0.0.1', port: PORT, user: 'postgres',
    password: 'postgres', database: 'lgq_sms_check',
  };
  control = new Client({ ...clientOptions, application_name: 'lgq-sms-check-control' });
  workerA = new Client({ ...clientOptions, application_name: 'lgq-sms-check-a' });
  workerB = new Client({ ...clientOptions, application_name: 'lgq-sms-check-b' });
  await Promise.all([control.connect(), workerA.connect(), workerB.connect()]);
  for (const client of [control, workerA, workerB]) {
    await client.query("set statement_timeout = '15s'");
    await client.query("set lock_timeout = '5s'");
  }

  const migration = readFileSync(MIGRATION, 'utf8');
  const usageMigration = readFileSync(USAGE_MIGRATION, 'utf8');
  const producerProjectionMigration = readFileSync(PRODUCER_PROJECTION_MIGRATION, 'utf8');
  await control.query(BASE);
  await control.query(migration);
  await control.query(migration);
  check('migration applies twice', true);
  await control.query(usageMigration);
  await control.query(usageMigration);
  check('usage finalization migration applies twice', true);
  await control.query(producerProjectionMigration);
  await control.query(producerProjectionMigration);
  check('producer projection migration applies twice', true);

  const accountId = randomUUID();
  const phone = '+12485550140';
  await control.query('insert into public.accounts (id) values ($1)', [accountId]);
  await control.query(
    `insert into public.sms_consent (
       account_id, phone_number, status, source, consented_at, disclosure_version
     ) values ($1, $2, 'opted_in', 'pg17_test', pg_catalog.now(), 'test-v1')`,
    [accountId, phone],
  );
  const senderId = randomUUID();
  await control.query(
    `insert into public.sms_sender_numbers (
       id, provider, e164_number, provider_number_id, purpose,
       assignment_state, provisioning_status, inbound_ready, activated_at
     ) values (
       $1, 'signalwire', '+19479412323', 'pn_test', 'lgq_shared',
       'assigned', 'active', true, pg_catalog.now()
     )`,
    [senderId],
  );

  const enqueueArgs = [
    accountId, phone, 'A durable test message', 'owner-high-value-lead',
    'owner_alert', 'lgq_shared', 'owner', 'owner_alert',
    `pg17:owner-alert:${randomUUID()}`, null, null, senderId,
  ];
  const first = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    enqueueArgs,
  ));
  const replay = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    enqueueArgs,
  ));
  check('enqueue replay returns the same event',
    first.sms_event_id === replay.sms_event_id && first.created === true && replay.created === false);

  let mismatchCode = null;
  try {
    const changed = [...enqueueArgs];
    changed[2] = 'A different body under the same key';
    await control.query(
      'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      changed,
    );
  } catch (error) {
    mismatchCode = sqlState(error);
  }
  check('idempotency payload drift is refused', mismatchCode === '22000', String(mismatchCode));

  const [claimA, claimB] = await Promise.all([
    workerA.query('select * from public.claim_sms_delivery_tasks(1)'),
    workerB.query('select * from public.claim_sms_delivery_tasks(1)'),
  ]);
  check('two workers cannot claim one task',
    claimA.rowCount + claimB.rowCount === 1,
    `${claimA.rowCount}+${claimB.rowCount}`);
  const claim = one(claimA.rowCount === 1 ? claimA : claimB);

  const staged = one(await control.query(
    'select * from public.stage_sms_delivery($1,$2,$3)',
    [claim.sms_event_id, claim.work_claim_token, 'signalwire'],
  ));
  check('consent and sender readiness stage the task',
    staged.dispatch_status === 'ready'
      && staged.sender_number_id === senderId
      && staged.sender_e164 === '+19479412323');

  await control.query(
    'select public.mark_sms_delivery_request_started($1,$2)',
    [claim.sms_event_id, claim.work_claim_token],
  );
  await control.query(
    `update public.sms_delivery_tasks
        set lease_expires_at = pg_catalog.now() - interval '1 second'
      where sms_event_id = $1`,
    [claim.sms_event_id],
  );
  await control.query('select * from public.claim_sms_delivery_tasks(1)');
  const uncertain = one(await control.query(
    `select e.status, t.task_state, t.last_error_code
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id = e.id
      where e.id = $1`,
    [claim.sms_event_id],
  ));
  check('expired post-request lease becomes indeterminate',
    uncertain.status === 'indeterminate'
      && uncertain.task_state === 'indeterminate'
      && uncertain.last_error_code === 'sms_delivery_unknown_after_lease_expiry');

  const secondArgs = [...enqueueArgs];
  secondArgs[2] = 'A pre-request recovery test';
  secondArgs[8] = `pg17:pre-request:${randomUUID()}`;
  const second = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    secondArgs,
  ));
  const oldClaim = one(await control.query('select * from public.claim_sms_delivery_tasks(1)'));
  await control.query(
    `update public.sms_delivery_tasks
        set lease_expires_at = pg_catalog.now() - interval '1 second'
      where sms_event_id = $1`,
    [second.sms_event_id],
  );
  const recovered = one(await control.query('select * from public.claim_sms_delivery_tasks(1)'));
  const attempts = await control.query(
    `select attempt_number, outcome from public.sms_delivery_attempts
      where sms_event_id = $1 order by attempt_number`,
    [second.sms_event_id],
  );
  check('expired pre-request lease is safely reclaimed',
    oldClaim.work_claim_token !== recovered.work_claim_token
      && recovered.attempt_number === 2
      && attempts.rows[0]?.outcome === 'lease_expired'
      && attempts.rows[1]?.outcome === null);

  const retryRejectedArgs = [...enqueueArgs];
  retryRejectedArgs[2] = 'A definite provider throttle test';
  retryRejectedArgs[8] = `pg17:provider-throttle:${randomUUID()}`;
  const retryRejected = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    retryRejectedArgs,
  ));
  const retryRejectedClaim = one(await control.query(
    'select * from public.claim_sms_delivery_tasks(1)',
  ));
  let prematureRejectionCode = null;
  try {
    await control.query(
      'select * from public.record_sms_delivery_provider_rejection($1,$2,$3,$4)',
      [
        retryRejected.sms_event_id,
        retryRejectedClaim.work_claim_token,
        'sms_provider_rejected_429',
        true,
      ],
    );
  } catch (error) {
    prematureRejectionCode = sqlState(error);
  }
  check('provider rejection RPC refuses a pre-request attempt',
    prematureRejectionCode === '55000', String(prematureRejectionCode));
  await control.query(
    'select * from public.stage_sms_delivery($1,$2,$3)',
    [retryRejected.sms_event_id, retryRejectedClaim.work_claim_token, 'signalwire'],
  );
  await control.query(
    'select public.mark_sms_delivery_request_started($1,$2)',
    [retryRejected.sms_event_id, retryRejectedClaim.work_claim_token],
  );
  const retryRejectionResult = one(await control.query(
    'select * from public.record_sms_delivery_provider_rejection($1,$2,$3,$4)',
    [
      retryRejected.sms_event_id,
      retryRejectedClaim.work_claim_token,
      'sms_provider_rejected_429',
      true,
    ],
  ));
  const retryRejectionState = one(await control.query(
    `select e.status, e.send_started_at, t.task_state, t.request_started_at,
            a.outcome, a.error_code
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id = e.id
       join public.sms_delivery_attempts a on a.sms_event_id = e.id
      where e.id = $1 and a.claim_token = $2`,
    [retryRejected.sms_event_id, retryRejectedClaim.work_claim_token],
  ));
  check('a definite provider throttle safely returns to the retry queue',
    retryRejectionResult.failure_status === 'retryable'
      && retryRejectionResult.task_state === 'queued'
      && retryRejectionResult.next_attempt_at instanceof Date
      && retryRejectionState.status === 'queued'
      && retryRejectionState.task_state === 'queued'
      && retryRejectionState.send_started_at === null
      && retryRejectionState.request_started_at === null
      && retryRejectionState.outcome === 'provider_rejected_retryable'
      && retryRejectionState.error_code === 'sms_provider_rejected_429');

  const terminalRejectedArgs = [...enqueueArgs];
  terminalRejectedArgs[2] = 'A definite terminal provider rejection test';
  terminalRejectedArgs[8] = `pg17:provider-rejected:${randomUUID()}`;
  const terminalRejected = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    terminalRejectedArgs,
  ));
  const terminalRejectedClaim = one(await control.query(
    'select * from public.claim_sms_delivery_tasks(1)',
  ));
  await control.query(
    'select * from public.stage_sms_delivery($1,$2,$3)',
    [terminalRejected.sms_event_id, terminalRejectedClaim.work_claim_token, 'signalwire'],
  );
  await control.query(
    'select public.mark_sms_delivery_request_started($1,$2)',
    [terminalRejected.sms_event_id, terminalRejectedClaim.work_claim_token],
  );
  const terminalRejectionResult = one(await control.query(
    'select * from public.record_sms_delivery_provider_rejection($1,$2,$3,$4)',
    [
      terminalRejected.sms_event_id,
      terminalRejectedClaim.work_claim_token,
      'sms_provider_rejected_400',
      false,
    ],
  ));
  const terminalRejectionState = one(await control.query(
    `select e.status, t.task_state, a.outcome, a.error_code
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id = e.id
       join public.sms_delivery_attempts a on a.sms_event_id = e.id
      where e.id = $1 and a.claim_token = $2`,
    [terminalRejected.sms_event_id, terminalRejectedClaim.work_claim_token],
  ));
  check('a definite provider rejection terminal-fails without indeterminate state',
    terminalRejectionResult.failure_status === 'terminal'
      && terminalRejectionResult.task_state === 'failed'
      && terminalRejectionState.status === 'failed'
      && terminalRejectionState.task_state === 'failed'
      && terminalRejectionState.outcome === 'provider_rejected_terminal'
      && terminalRejectionState.error_code === 'sms_provider_rejected_400');

  const prepareUsageDelivery = async (label) => {
    const args = [...enqueueArgs];
    args[2] = label;
    args[8] = `pg17:usage:${randomUUID()}`;
    const event = one(await control.query(
      'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      args,
    ));
    const usageClaim = one(await control.query('select * from public.claim_sms_delivery_tasks(1)'));
    await control.query('select * from public.stage_sms_delivery($1,$2,$3)',
      [event.sms_event_id, usageClaim.work_claim_token, 'signalwire']);
    const reservationId = randomUUID();
    const identity = `text-credit:v1:sms:${event.sms_event_id}:attempt:${usageClaim.attempt_number}`;
    await control.query(
      `insert into public.usage_reservations (
         id, account_id, resource_code, units, operation_type, idempotency_key
       ) values ($1, $2, 'text_segments', 1, 'text_send', $3)`,
      [reservationId, accountId, identity],
    );
    await control.query(
      `select public.mark_sms_delivery_request_started_with_usage(
        $1,$2,'reservation',$3,$4,null)`,
      [event.sms_event_id, usageClaim.work_claim_token, reservationId, `${identity}:commit`],
    );
    return { event, usageClaim, reservationId };
  };

  const rolledBackUsage = await prepareUsageDelivery('Pre-request marker response loss');
  await control.query(
    'select public.rollback_sms_delivery_pre_request_boundary($1,$2)',
    [rolledBackUsage.event.sms_event_id, rolledBackUsage.usageClaim.work_claim_token],
  );
  const rolledBackFailure = one(await control.query(
    'select * from public.fail_sms_delivery($1,$2,$3,$4)',
    [
      rolledBackUsage.event.sms_event_id,
      rolledBackUsage.usageClaim.work_claim_token,
      'sms_worker_transport_error',
      true,
    ],
  ));
  const rolledBackState = one(await control.query(
    `select e.status, e.send_started_at, e.text_usage_kind,
            t.task_state, t.request_started_at,
            a.outcome, r.state as reservation_state
       from public.sms_events e
       join public.sms_delivery_tasks t on t.sms_event_id = e.id
       join public.sms_delivery_attempts a on a.sms_event_id = e.id
       join public.usage_reservations r on r.id = $2
      where e.id = $1 and a.claim_token = $3`,
    [
      rolledBackUsage.event.sms_event_id,
      rolledBackUsage.reservationId,
      rolledBackUsage.usageClaim.work_claim_token,
    ],
  ));
  check('a lost marker response before provider egress is safely compensatable',
    rolledBackFailure.failure_status === 'retryable'
      && rolledBackFailure.task_state === 'queued'
      && rolledBackState.status === 'queued'
      && rolledBackState.send_started_at === null
      && rolledBackState.text_usage_kind === null
      && rolledBackState.task_state === 'queued'
      && rolledBackState.request_started_at === null
      && rolledBackState.outcome === 'retryable_failure'
      && rolledBackState.reservation_state === 'released');

  const acceptedUsage = await prepareUsageDelivery('Usage acceptance reconciliation');
  await control.query('select public.complete_sms_delivery($1,$2,$3)', [
    acceptedUsage.event.sms_event_id,
    acceptedUsage.usageClaim.work_claim_token,
    `usage-accepted-${randomUUID()}`,
  ]);
  const acceptedReconcile = one(await control.query(
    'select * from public.reconcile_sms_text_usage(50)'));
  const acceptedUsageState = one(await control.query(
    `select e.text_usage_state, r.state as reservation_state
       from public.sms_events e
       join public.usage_reservations r on r.id = e.text_usage_reservation_id
      where e.id = $1`,
    [acceptedUsage.event.sms_event_id],
  ));
  check('an accepted provider send durably commits its exact text hold',
    acceptedReconcile.committed >= 1
      && acceptedUsageState.text_usage_state === 'committed'
      && acceptedUsageState.reservation_state === 'committed');

  const ambiguousUsage = await prepareUsageDelivery('Usage ambiguity reconciliation');
  await control.query('select * from public.fail_sms_delivery($1,$2,$3,$4)', [
    ambiguousUsage.event.sms_event_id,
    ambiguousUsage.usageClaim.work_claim_token,
    'sms_provider_transport_error',
    false,
  ]);
  const ambiguousReconcile = one(await control.query(
    'select * from public.reconcile_sms_text_usage(50)'));
  const ambiguousUsageState = one(await control.query(
    `select e.status, e.text_usage_state, r.state as reservation_state
       from public.sms_events e
       join public.usage_reservations r on r.id = e.text_usage_reservation_id
      where e.id = $1`,
    [ambiguousUsage.event.sms_event_id],
  ));
  check('an indeterminate provider send keeps and commits its hold',
    ambiguousReconcile.committed >= 1
      && ambiguousUsageState.status === 'indeterminate'
      && ambiguousUsageState.text_usage_state === 'committed'
      && ambiguousUsageState.reservation_state === 'committed');

  const rejectedUsage = await prepareUsageDelivery('Usage rejection reconciliation');
  await control.query('select * from public.record_sms_delivery_provider_rejection($1,$2,$3,$4)', [
    rejectedUsage.event.sms_event_id,
    rejectedUsage.usageClaim.work_claim_token,
    'sms_provider_rejected_400',
    false,
  ]);
  const rejectedReconcile = one(await control.query(
    'select * from public.reconcile_sms_text_usage(50)'));
  const rejectedUsageState = one(await control.query(
    `select e.text_usage_state, r.state as reservation_state
       from public.sms_events e
       join public.usage_reservations r on r.id = e.text_usage_reservation_id
      where e.id = $1`,
    [rejectedUsage.event.sms_event_id],
  ));
  check('a definite provider rejection durably releases its exact text hold',
    rejectedReconcile.failed === 0
      && rejectedUsageState.text_usage_state === 'released'
      && rejectedUsageState.reservation_state === 'released');

  await control.query(
    `update public.sms_consent
        set status = 'opted_out', opted_out_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where account_id = $1 and phone_number = $2`,
    [accountId, phone],
  );
  const cancelled = one(await control.query(
    'select * from public.stage_sms_delivery($1,$2,$3)',
    [recovered.sms_event_id, recovered.work_claim_token, 'signalwire'],
  ));
  const cancelledState = one(await control.query(
    `select e.status, t.task_state
       from public.sms_events e join public.sms_delivery_tasks t on t.sms_event_id = e.id
      where e.id = $1`,
    [second.sms_event_id],
  ));
  check('STOP between enqueue and egress cancels the task',
    cancelled.dispatch_status === 'cancelled'
      && cancelledState.status === 'cancelled'
      && cancelledState.task_state === 'cancelled');

  await control.query(
    `update public.sms_consent
        set status = 'opted_in', consented_at = coalesce(consented_at, pg_catalog.now()),
            opted_out_at = null, updated_at = pg_catalog.now()
      where account_id = $1 and phone_number = $2`,
    [accountId, phone],
  );
  const senderScopedArgs = [...enqueueArgs];
  senderScopedArgs[2] = 'A sender-scoped STOP race test';
  senderScopedArgs[8] = `pg17:sender-stop:${randomUUID()}`;
  const senderScoped = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    senderScopedArgs,
  ));
  const senderScopedClaim = one(await control.query('select * from public.claim_sms_delivery_tasks(1)'));
  await control.query(
    `insert into public.sms_sender_keyword_preferences(
       sender_number_id,phone_number,status,source,opted_out_at
     ) values ($1,$2,'opted_out','inbound_stop',pg_catalog.now())`,
    [senderId, phone],
  );
  const senderCancelled = one(await control.query(
    'select * from public.stage_sms_delivery($1,$2,$3)',
    [senderScoped.sms_event_id, senderScopedClaim.work_claim_token, 'signalwire'],
  ));
  const senderCancelledState = one(await control.query(
    `select e.status, e.error_reason, t.task_state, t.last_error_code
       from public.sms_events e join public.sms_delivery_tasks t on t.sms_event_id=e.id
      where e.id=$1`,
    [senderScoped.sms_event_id],
  ));
  check('sender-scoped STOP between enqueue and egress cancels the task',
    senderCancelled.dispatch_status === 'cancelled'
      && senderCancelledState.status === 'cancelled'
      && senderCancelledState.task_state === 'cancelled'
      && senderCancelledState.error_reason === 'sms_sender_opted_out'
      && senderCancelledState.last_error_code === 'sms_sender_opted_out');

  const subcontractorCrewId = randomUUID();
  const subcontractorJobId = randomUUID();
  const subcontractorRequestId = randomUUID();
  const subcontractorOfferId = randomUUID();
  await control.query('insert into public.crew(id,account_id) values ($1,$2)', [subcontractorCrewId, accountId]);
  await control.query('insert into public.jobs(id,account_id) values ($1,$2)', [subcontractorJobId, accountId]);
  await control.query(
    `insert into public.subcontractor_requests(id,account_id,job_id,status,queued_at)
     values ($1,$2,$3,'queued',pg_catalog.now())`,
    [subcontractorRequestId, accountId, subcontractorJobId],
  );
  await control.query(
    `insert into public.subcontractor_offers(id,account_id,request_id,crew_id,status)
     values ($1,$2,$3,$4,'queued')`,
    [subcontractorOfferId, accountId, subcontractorRequestId, subcontractorCrewId],
  );
  const subcontractorEvent = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [
      accountId, phone, 'Subcontractor offer', 'sub-offer', 'crew_message',
      'lgq_dispatch', 'subcontractor', 'sub_offer',
      `pg17:subcontractor:${subcontractorOfferId}`, null, subcontractorCrewId, null,
    ],
  ));
  await control.query(
    'update public.subcontractor_offers set sms_event_id=$1 where id=$2',
    [subcontractorEvent.sms_event_id, subcontractorOfferId],
  );
  const queuedProjection = one(await control.query(
    `select o.status as offer_status, o.provider_id, o.sms_event_id, o.sent_at,
            r.status as request_status, r.sent_at as request_sent_at
       from public.subcontractor_offers o
       join public.subcontractor_requests r on r.id=o.request_id
      where o.id=$1`,
    [subcontractorOfferId],
  ));
  check('subcontractor enqueue keeps carrier identity and sent timestamps empty',
    queuedProjection.offer_status === 'queued'
      && queuedProjection.provider_id === null
      && queuedProjection.sms_event_id === subcontractorEvent.sms_event_id
      && queuedProjection.sent_at === null
      && queuedProjection.request_status === 'queued'
      && queuedProjection.request_sent_at === null);

  await control.query(
    `update public.sms_events
        set status='sent', provider='signalwire', provider_id='sw_sub_offer_1',
            provider_accepted_at=pg_catalog.now(), sent_at=pg_catalog.now(),
            updated_at=pg_catalog.now()
      where id=$1`,
    [subcontractorEvent.sms_event_id],
  );
  const acceptedProjection = one(await control.query(
    `select o.status as offer_status, o.provider_id, o.sent_at,
            r.status as request_status, r.sent_at as request_sent_at
       from public.subcontractor_offers o
       join public.subcontractor_requests r on r.id=o.request_id
      where o.id=$1`,
    [subcontractorOfferId],
  ));
  check('provider acceptance projects subcontractor sent state and carrier id',
    acceptedProjection.offer_status === 'sent'
      && acceptedProjection.provider_id === 'sw_sub_offer_1'
      && acceptedProjection.sent_at !== null
      && acceptedProjection.request_status === 'sent'
      && acceptedProjection.request_sent_at !== null);

  await control.query(
    `update public.sms_events
        set status='delivered', delivered_at=pg_catalog.now(), updated_at=pg_catalog.now()
      where id=$1`,
    [subcontractorEvent.sms_event_id],
  );
  const deliveredProjection = one(await control.query(
    'select status, delivered_at from public.subcontractor_offers where id=$1',
    [subcontractorOfferId],
  ));
  check('provider delivery projects without losing acceptance evidence',
    deliveredProjection.status === 'delivered' && deliveredProjection.delivered_at !== null);

  const failedCrewId = randomUUID();
  const failedJobId = randomUUID();
  const failedRequestId = randomUUID();
  const failedOfferId = randomUUID();
  await control.query('insert into public.crew(id,account_id) values ($1,$2)', [failedCrewId, accountId]);
  await control.query('insert into public.jobs(id,account_id) values ($1,$2)', [failedJobId, accountId]);
  await control.query(
    `insert into public.subcontractor_requests(id,account_id,job_id,status,queued_at)
     values ($1,$2,$3,'queued',pg_catalog.now())`,
    [failedRequestId, accountId, failedJobId],
  );
  await control.query(
    `insert into public.subcontractor_offers(id,account_id,request_id,crew_id,status)
     values ($1,$2,$3,$4,'queued')`,
    [failedOfferId, accountId, failedRequestId, failedCrewId],
  );
  let crossCrewCode = null;
  try {
    await control.query(
      'update public.subcontractor_offers set sms_event_id=$1 where id=$2',
      [subcontractorEvent.sms_event_id, failedOfferId],
    );
  } catch (error) {
    crossCrewCode = sqlState(error);
  }
  check('an offer cannot borrow another crew member SMS event', crossCrewCode === '23514', String(crossCrewCode));

  const failedEvent = one(await control.query(
    'select * from public.enqueue_sms_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [
      accountId, phone, 'Subcontractor failure', 'sub-offer', 'crew_message',
      'lgq_dispatch', 'subcontractor', 'sub_offer',
      `pg17:subcontractor:${failedOfferId}`, null, failedCrewId, null,
    ],
  ));
  await control.query(
    `update public.sms_events
        set status='failed', error_reason='provider_rejected',
            failed_at=pg_catalog.now(), updated_at=pg_catalog.now()
      where id=$1`,
    [failedEvent.sms_event_id],
  );
  // The terminal callback deliberately wins the race. Attaching the event later
  // must replay the fact rather than strand this offer in queued forever.
  await control.query(
    'update public.subcontractor_offers set sms_event_id=$1 where id=$2',
    [failedEvent.sms_event_id, failedOfferId],
  );
  const failedProjection = one(await control.query(
    `select o.status as offer_status, o.provider_id, o.sent_at,
            r.status as request_status, r.sent_at as request_sent_at
       from public.subcontractor_offers o
       join public.subcontractor_requests r on r.id=o.request_id
      where o.id=$1`,
    [failedOfferId],
  ));
  check('an early pre-link failure replays on attachment and closes the request honestly',
    failedProjection.offer_status === 'failed'
      && failedProjection.provider_id === null
      && failedProjection.sent_at === null
      && failedProjection.request_status === 'delivery_failed'
      && failedProjection.request_sent_at === null);

  const security = await control.query(
    `select c.relname,
            c.relrowsecurity,
            c.relforcerowsecurity,
            pg_catalog.has_table_privilege('authenticated', c.oid, 'insert') as auth_insert,
            pg_catalog.has_table_privilege('service_role', c.oid, 'insert') as service_insert
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'sms_sender_numbers','sms_sender_keyword_preferences',
          'sms_delivery_tasks','sms_delivery_attempts'
        )
      order by c.relname`,
  );
  check('queue storage is FORCE RLS with no direct browser or service writes',
    security.rowCount === 4
      && security.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)
      && security.rows.every((row) => !row.auth_insert && !row.service_insert));

  const functionGrant = one(await control.query(
    `select
       pg_catalog.has_function_privilege(
         'service_role',
         'public.claim_sms_delivery_tasks(integer)',
         'execute'
       ) as service_execute,
        pg_catalog.has_function_privilege(
          'authenticated',
          'public.claim_sms_delivery_tasks(integer)',
          'execute'
        ) as authenticated_execute,
        pg_catalog.has_function_privilege(
          'service_role',
          'public.record_sms_delivery_provider_rejection(uuid,uuid,text,boolean)',
          'execute'
        ) as rejection_service_execute,
        pg_catalog.has_function_privilege(
          'authenticated',
          'public.record_sms_delivery_provider_rejection(uuid,uuid,text,boolean)',
          'execute'
        ) as rejection_authenticated_execute,
        pg_catalog.has_function_privilege(
          'service_role',
          'public.rollback_sms_delivery_pre_request_boundary(uuid,uuid)',
          'execute'
        ) as rollback_service_execute,
        pg_catalog.has_function_privilege(
          'authenticated',
          'public.rollback_sms_delivery_pre_request_boundary(uuid,uuid)',
          'execute'
        ) as rollback_authenticated_execute`,
  ));
  check('only service_role can execute worker RPCs',
    functionGrant.service_execute === true
      && functionGrant.authenticated_execute === false
      && functionGrant.rejection_service_execute === true
      && functionGrant.rejection_authenticated_execute === false
      && functionGrant.rollback_service_execute === true
      && functionGrant.rollback_authenticated_execute === false);
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const client of [workerB, workerA, control]) {
    try { await client?.end(); } catch { /* already closed */ }
  }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 9) {
  console.error('The harness did not run every check; a short run is not a pass.');
  process.exit(2);
}
process.exit(failed.length === 0 ? 0 : 1);
