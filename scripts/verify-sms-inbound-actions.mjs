// Execute the SMS inbox and durable inbound-action migrations against a
// disposable PostgreSQL 17 cluster. No hosted database or carrier is used.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const PORT = Number(process.env.LGQ_SMS_INBOUND_ACTION_CHECK_PORT || 54358);
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` -- ${detail}` : ''}`);
}
function one(result) {
  if (result.rowCount !== 1) throw new Error(`Expected one row, got ${result.rowCount}.`);
  return result.rows[0];
}

const base = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end
$roles$;
create table public.accounts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  business_name text,
  alert_phone text,
  high_value_sms_enabled boolean not null default false
);
create table public.payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id)
);
create table public.crew (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  name text,
  phone text,
  active boolean not null default true,
  deleted_at timestamptz
);
create function public.is_owner(uuid) returns boolean language sql stable as $$ select false $$;
create table public.leads (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  name text,
  address text,
  lat numeric,
  lng numeric,
  status text not null default 'new',
  quote_visit jsonb,
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  ref text not null,
  client_name text not null,
  client_phone text,
  status text not null default 'in_progress',
  scheduled_for date,
  scheduled_time time,
  appointment_confirmed_at timestamptz,
  reschedule_discount_percent numeric,
  reschedule_discount_note text,
  reschedule_discount_agreed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.crew_assignments (
  job_id uuid not null references public.jobs(id),
  crew_id uuid not null references public.crew(id),
  account_id uuid not null references public.accounts(id),
  assigned_at timestamptz not null default pg_catalog.now(),
  primary key(job_id,crew_id)
);
create table public.route_stops (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  crew_id uuid references public.crew(id),
  lead_id uuid references public.leads(id),
  scheduled_for date not null,
  scheduled_time time,
  label text not null,
  address text,
  lat numeric,
  lng numeric,
  minutes integer not null default 20,
  kind text not null default 'other',
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.estimate_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  lead_id uuid not null references public.leads(id),
  crew_id uuid references public.crew(id),
  status text not null default 'held',
  offer_date date not null,
  window_start time not null,
  window_end time not null,
  arrival_time time not null,
  visit_minutes integer not null default 30,
  phone text not null,
  body text not null,
  hold_expires_at timestamptz not null,
  sent_at timestamptz not null default pg_catalog.now(),
  replied_at timestamptz,
  reply_body text,
  forwarded_at timestamptz,
  route_stop_id uuid references public.route_stops(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.reschedule_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  job_id uuid not null references public.jobs(id),
  crew_id uuid references public.crew(id),
  status text not null default 'sent',
  from_date date not null,
  to_date date not null,
  window_start time not null,
  window_end time not null,
  arrival_time time not null,
  discount_percent numeric not null,
  phone text not null,
  body text not null,
  sent_at timestamptz not null default pg_catalog.now(),
  replied_at timestamptz,
  reply_body text,
  forwarded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.subcontractor_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  job_id uuid not null references public.jobs(id),
  status text not null default 'sent',
  work_description text not null,
  expires_at timestamptz not null,
  selection_mode text not null default 'first_accept',
  claimed_offer_id uuid,
  claimed_crew_id uuid references public.crew(id),
  claimed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.subcontractor_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  request_id uuid not null references public.subcontractor_requests(id),
  crew_id uuid not null references public.crew(id),
  status text not null default 'sent',
  phone text not null,
  sms_event_id uuid,
  won boolean not null default false,
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table public.subcontractor_requests add constraint sub_claim_offer_fk
  foreign key(claimed_offer_id) references public.subcontractor_offers(id);
create unique index sub_one_winner on public.subcontractor_offers(request_id) where won;
create table public.job_feed (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  job_id uuid not null references public.jobs(id),
  kind text not null,
  meta jsonb,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.account_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  kind text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);
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
  constraint sms_events_status_check check (status in ('pending','sent','failed','opted_out','indeterminate')),
  constraint sms_events_context_check check (context in ('payment','crew','subcontractor')),
  constraint sms_events_event_type_allowed check (event_type in ('payment_requested','crew_assigned')),
  constraint sms_events_target_check check (
    (context='payment' and payment_id is not null) or
    (context in ('crew','subcontractor') and crew_id is not null)
  )
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
  unique(account_id,phone_number)
);
create table public.sms_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  direction text not null check(direction in ('inbound','outbound')),
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
  databaseDir: join(process.cwd(), '.pg17-sms-inbound-action-check'),
  user: 'postgres', password: 'postgres', port: PORT, persistent: false,
});

let client;
let concurrentClient;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_sms_inbound_action_check');
  const { Client } = await import('pg');
  const connection = {
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_sms_inbound_action_check',
  };
  client = new Client(connection);
  concurrentClient = new Client(connection);
  await client.connect();
  await concurrentClient.connect();
  await client.query("set statement_timeout='15s'");
  await concurrentClient.query("set statement_timeout='15s'");
  await client.query(base);
  await client.query(readFileSync('migrations/20260821180506_sms_delivery_foundation.sql', 'utf8'));
  await client.query(readFileSync('migrations/20260821182355_sms_webhook_safety.sql', 'utf8'));
  const migration = readFileSync('migrations/20260821192000_sms_inbound_action_outbox.sql', 'utf8');
  await client.query(migration);
  await client.query(migration);
  // The complete durability follow-up also contains unrelated billing and
  // missed-call projections. This disposable harness installs its exact scope
  // table contract, then exercises the later routing migration against the real
  // webhook and action-outbox foundations.
  await client.query(`
    create table public.sms_consent_scopes (
      account_id uuid not null,
      phone_number text not null check (phone_number ~ '^\\+[1-9][0-9]{7,14}$'),
      consent_scope text not null check (consent_scope in ('customer','crew','owner')),
      evidence_source text not null,
      established_at timestamptz not null default pg_catalog.now(),
      primary key(account_id,phone_number,consent_scope),
      foreign key(account_id,phone_number)
        references public.sms_consent(account_id,phone_number) on delete cascade
    )
  `);
  const purposeRouting = readFileSync(
    'migrations/20260821210500_sms_purpose_aware_inbound_routing.sql',
    'utf8',
  );
  await client.query(purposeRouting);
  await client.query(purposeRouting);
  check('inbound action and purpose-routing migrations apply twice', true);

  const accountId = randomUUID();
  const accountB = randomUUID();
  const crewId = randomUUID();
  const senderId = randomUUID();
  const sharedSenderId = randomUUID();
  const dispatchSenderId = randomUUID();
  const dispatchSenderBId = randomUUID();
  const phone = '+12485550111';
  await client.query(
    `insert into public.accounts(
       id,business_name,alert_phone,high_value_sms_enabled
     ) values
       ($1,'Test Plumbing','+12485550131',true),
       ($2,'Second Plumbing','+12485550198',true)`,
    [accountId, accountB],
  );
  await client.query(
    `insert into public.crew(id,account_id,name,phone,active)
     values($1,$2,'Primary crew','+12485550132',true)`,
    [crewId, accountId],
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,e164_number,provider_number_id,purpose,account_id,
       assignment_state,provisioning_status,inbound_ready,activated_at
     ) values
       ($1,'signalwire','+12485550140','pn_test','contractor_dedicated',$4,
        'assigned','active',true,now()),
       ($2,'signalwire','+12485550141','pn_shared','lgq_shared',null,
        'assigned','active',true,now()),
       ($3,'signalwire','+12485550142','pn_dispatch','lgq_dispatch',null,
        'assigned','active',true,now()),
       ($5,'signalwire','+12485550143','pn_dispatch_b','lgq_dispatch',null,
        'assigned','active',true,now())`,
    [senderId, sharedSenderId, dispatchSenderId, accountId, dispatchSenderBId],
  );
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
       values($1,$2,'opted_in','test',now()),($1,'+12485550199','opted_in','test',now())`,
    [accountId, phone],
  );

  const browserLead = randomUUID();
  await client.query("insert into public.leads(id,account_id,name) values($1,$2,'Browser lead')", [browserLead, accountId]);
  await client.query('grant insert on public.estimate_offers to authenticated');
  await client.query('set role authenticated');
  let browserOfferInserted = false;
  try {
    await client.query(
      `insert into public.estimate_offers(
         account_id,lead_id,crew_id,offer_date,window_start,window_end,arrival_time,
         phone,body,hold_expires_at
       ) values($1,$2,$3,current_date+1,'09:00','11:00','10:00','+12485550155','offer',now()+interval '1 hour')`,
      [accountId, browserLead, crewId],
    );
    browserOfferInserted = true;
  } finally {
    await client.query('reset role');
  }
  check('recipient-lock triggers preserve authenticated candidate writes', browserOfferInserted);
  await client.query('delete from public.estimate_offers where lead_id=$1', [browserLead]);

  async function ingest(id, body, from = phone) {
    return ingestAt(id, body, from, '+12485550140');
  }

  async function ingestAt(id, body, from, to, keyword = 'other') {
    return one(await client.query(
      `select * from public.ingest_sms_inbound_webhook(
        'signalwire',$1,$1,$2,'application/json','https://example.test/api/sms/inbound',
        $3,$4,$5,array[]::text[],$6)`,
      [id, createHash('sha256').update(id).digest('hex'), from, to, body, keyword],
    ));
  }

  async function applyReceipt(receipt) {
    const claim = one(await client.query(
      'select * from public.claim_sms_inbound_action($1)', [receipt.webhook_receipt_id],
    ));
    return one(await client.query(
      'select public.apply_sms_inbound_action($1,$2) as outcome',
      [claim.task_id, claim.work_claim_token],
    )).outcome;
  }

  async function createQuestionEvent(tag, recipient, overrides = {}) {
    const id = randomUUID();
    const future = overrides.future === true;
    const status = overrides.status ?? 'sent';
    const offset = future ? 600_000 : 0;
    const createdAt = new Date(Date.now() + offset - 240_000);
    const queuedAt = new Date(Date.now() + offset - 180_000);
    const sendStartedAt = new Date(Date.now() + offset - 120_000);
    const acceptedAt = overrides.providerAcceptedAt === null
      ? null
      : new Date(Date.now() + offset - 60_000);
    const sentAt = acceptedAt === null
      ? null
      : new Date(Date.now() + offset - 30_000);
    const deliveredAt = status === 'delivered'
      ? (overrides.deliveredAt ?? new Date(Date.now() + offset - 15_000))
      : null;
    const providerId = overrides.blankProviderId === true
      ? ' '.repeat(tag.length)
      : Object.hasOwn(overrides, 'providerId')
      ? overrides.providerId
      : `provider-${tag}`;
    const idempotencyKey = providerId === null || acceptedAt === null
      ? null
      : (overrides.idempotencyKey ?? `question:${tag}`);
    await client.query(
      `insert into public.sms_events(
         id,account_id,event_type,phone_number,status,provider_id,body,
         created_at,sent_at,context,crew_id,provider,sender_number_id,
         sender_purpose,queued_at,send_started_at,provider_accepted_at,
         message_kind,billing_category,idempotency_key,failed_at,delivered_at
       ) values(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
       )`,
      [
        id,
        overrides.accountId ?? accountId,
        overrides.eventType ?? 'estimate_offer',
        overrides.phone ?? recipient,
        status,
        providerId,
        `Question ${tag}`,
        createdAt,
        sentAt,
        overrides.context ?? 'customer',
        overrides.crewId ?? null,
        overrides.provider ?? 'signalwire',
        overrides.senderNumberId ?? senderId,
        overrides.senderPurpose ?? 'contractor_dedicated',
        queuedAt,
        sendStartedAt,
        acceptedAt,
        overrides.messageKind ?? 'estimate-offer',
        overrides.billingCategory ?? 'customer_message',
        idempotencyKey,
        status === 'failed' ? sentAt : null,
        deliveredAt,
      ],
    );
    return id;
  }

  async function linkAccountQuestion(source, targetId, eventId, metadata = {}) {
    await client.query(
      `insert into public.account_events(account_id,kind,meta,created_at)
       values($1,'automation_toggled',jsonb_build_object(
         'source',$2::text,'offer_id',$3::text,'sms_event_id',$4::text,
         'lead_id',$5::text,'job_id',$6::text
       ),now()-interval '30 seconds')`,
      [accountId, source, targetId, eventId, metadata.leadId ?? null, metadata.jobId ?? null],
    );
  }

  const sharedPhone = '+12485550131';
  const dispatchPhone = '+12485550132';
  const ambiguousOwnerPhone = '+12485550133';
  const ambiguousCrewPhone = '+12485550134';
  const crossLanePhone = '+12485550135';
  const staleOwnerPhone = '+12485550136';
  const staleCrewPhone = '+12485550137';
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
     values
       ($1,$3,'opted_in','owner_alerts',now()),
       ($1,$4,'opted_in','crew_added',now()),
       ($1,$5,'opted_in','owner_alerts',now()),
       ($2,$5,'opted_in','owner_alerts',now()),
       ($1,$6,'opted_in','crew_added',now()),
       ($2,$6,'opted_in','crew_added',now()),
       ($1,$7,'opted_in','owner_alerts',now()),
       ($1,$8,'opted_in','owner_alerts',now()),
       ($1,$9,'opted_in','crew_added',now())`,
    [
      accountId, accountB, sharedPhone, dispatchPhone, ambiguousOwnerPhone,
      ambiguousCrewPhone, crossLanePhone, staleOwnerPhone, staleCrewPhone,
    ],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope,evidence_source)
     values
       ($1,$3,'owner','owner_alerts'),
       ($1,$4,'crew','crew_added'),
       ($1,$5,'owner','owner_alerts'),
       ($2,$5,'owner','owner_alerts'),
       ($1,$6,'crew','crew_added'),
       ($2,$6,'crew','crew_added'),
       ($1,$7,'owner','owner_alerts'),
       ($1,$7,'crew','crew_added'),
       ($1,$8,'owner','owner_alerts'),
       ($1,$9,'crew','crew_added')`,
    [
      accountId, accountB, sharedPhone, dispatchPhone, ambiguousOwnerPhone,
      ambiguousCrewPhone, crossLanePhone, staleOwnerPhone, staleCrewPhone,
    ],
  );
  await client.query(
    `insert into public.crew(account_id,name,phone,active,deleted_at) values
       ($1,'Cross lane crew',$3,true,null),
       ($1,'Ambiguous crew A',$4,true,null),
       ($2,'Ambiguous crew B',$4,true,null),
       ($1,'Deleted stale crew',$5,true,now()),
       ($1,'Inactive stale crew',$5,false,null)`,
    [accountId, accountB, crossLanePhone, ambiguousCrewPhone, staleCrewPhone],
  );

  const exactShared = await ingestAt('shared-exact-one', 'Owner reply', sharedPhone, '+12485550141');
  const exactDispatch = await ingestAt('dispatch-exact-one', 'Crew reply', dispatchPhone, '+12485550142');
  const exactProjection = one(await client.query(
    `select
       count(*) filter (where r.provider_event_id in ('shared-exact-one','dispatch-exact-one'))::int as receipts,
       count(distinct m.id)::int as messages,
       count(distinct t.id)::int as tasks
     from public.sms_webhook_receipts r
     left join public.sms_messages m on m.id=r.sms_message_id
     left join public.sms_inbound_action_tasks t on t.webhook_receipt_id=r.id
     where r.provider_event_id in ('shared-exact-one','dispatch-exact-one')
       and r.account_id=$1 and r.disposition='routed'`,
    [accountId],
  ));
  check('exact-one shared owner and dispatch crew scopes route and enqueue actions',
    exactShared.ingress_disposition === 'routed'
      && exactShared.routed_account_id === accountId
      && exactDispatch.ingress_disposition === 'routed'
      && exactDispatch.routed_account_id === accountId
      && exactProjection.receipts === 2
      && exactProjection.messages === 2
      && exactProjection.tasks === 2);

  await client.query(
    `update public.accounts
        set alert_phone=$3
      where id in ($1,$2)`,
    [accountId, accountB, ambiguousOwnerPhone],
  );

  const ambiguousShared = await ingestAt(
    'shared-ambiguous', 'Which owner?', ambiguousOwnerPhone, '+12485550141',
  );
  const ambiguousDispatch = await ingestAt(
    'dispatch-ambiguous', 'Which crew?', ambiguousCrewPhone, '+12485550142',
  );
  const ambiguousProjection = one(await client.query(
    `select
       count(*) filter (where r.disposition='ambiguous_destination')::int as reviews,
       count(m.id)::int as messages,
       count(t.id)::int as tasks
     from public.sms_webhook_receipts r
     left join public.sms_messages m on m.id=r.sms_message_id
     left join public.sms_inbound_action_tasks t on t.webhook_receipt_id=r.id
     where r.provider_event_id in ('shared-ambiguous','dispatch-ambiguous')`,
  ));
  check('ambiguous shared and dispatch scopes go to review without transcript or action',
    ambiguousShared.ingress_disposition === 'review'
      && ambiguousDispatch.ingress_disposition === 'review'
      && ambiguousProjection.reviews === 2
      && ambiguousProjection.messages === 0
      && ambiguousProjection.tasks === 0);

  await client.query(
    `update public.accounts set alert_phone=case
       when id=$1 then $3 else '+12485550198' end
     where id in ($1,$2)`,
    [accountId, accountB, sharedPhone],
  );

  const noShared = await ingestAt('shared-no-scope', 'Unknown owner', '+12485550138', '+12485550141');
  const noDispatch = await ingestAt('dispatch-no-scope', 'Unknown crew', '+12485550139', '+12485550142');
  check('zero-match shared and dispatch authorities also fail closed',
    noShared.ingress_disposition === 'review' && noShared.routed_account_id === null
      && noDispatch.ingress_disposition === 'review' && noDispatch.routed_account_id === null);

  const staleShared = await ingestAt(
    'shared-stale-owner', 'Former owner phone', staleOwnerPhone, '+12485550141',
  );
  const staleDispatch = await ingestAt(
    'dispatch-stale-crew', 'Former crew phone', staleCrewPhone, '+12485550142',
  );
  check('stale owner alert_phone and stale crew phone scopes route to review',
    staleShared.ingress_disposition === 'review'
      && staleShared.routed_account_id === null
      && staleDispatch.ingress_disposition === 'review'
      && staleDispatch.routed_account_id === null);

  await client.query(
    'update public.accounts set high_value_sms_enabled=false where id=$1', [accountId],
  );
  const disabledShared = await ingestAt(
    'shared-disabled-setting', 'Alerts disabled', sharedPhone, '+12485550141',
  );
  check('current owner phone without enabled messaging setting routes to review',
    disabledShared.ingress_disposition === 'review'
      && disabledShared.routed_account_id === null);
  await client.query(
    'update public.accounts set high_value_sms_enabled=true where id=$1', [accountId],
  );

  const dispatchStop = await ingestAt(
    'dispatch-stop-unique', 'STOP', dispatchPhone, '+12485550142', 'stop',
  );
  const stoppedDispatch = one(await client.query(
    `select
       (select status from public.sms_consent
         where account_id=$1 and phone_number=$2) as ledger_status,
       (select status from public.sms_sender_keyword_preferences
         where sender_number_id=$3 and phone_number=$2) as sender_a_status,
       (select count(*)::int from public.sms_sender_keyword_preferences
         where sender_number_id=$4 and phone_number=$2) as sender_b_rows`,
    [accountId, dispatchPhone, dispatchSenderId, dispatchSenderBId],
  ));
  check('unique dispatch STOP updates the current account ledger and exact sender only',
    dispatchStop.ingress_disposition === 'keyword_stop'
      && dispatchStop.routed_account_id === accountId
      && stoppedDispatch.ledger_status === 'opted_out'
      && stoppedDispatch.sender_a_status === 'opted_out'
      && stoppedDispatch.sender_b_rows === 0);

  const stoppedOnOtherSender = await ingestAt(
    'dispatch-other-sender-while-ledger-stopped', 'Still blocked',
    dispatchPhone, '+12485550143', 'other',
  );
  check('dispatch STOP account ledger blocks ordinary traffic on another sender',
    stoppedOnOtherSender.ingress_disposition === 'review'
      && stoppedOnOtherSender.routed_account_id === null);

  const dispatchStartB = await ingestAt(
    'dispatch-start-other-sender', 'START', dispatchPhone, '+12485550143', 'start',
  );
  const restartedDispatch = one(await client.query(
    `select
       (select status from public.sms_consent
         where account_id=$1 and phone_number=$2) as ledger_status,
       (select status from public.sms_sender_keyword_preferences
         where sender_number_id=$3 and phone_number=$2) as sender_a_status,
       (select status from public.sms_sender_keyword_preferences
         where sender_number_id=$4 and phone_number=$2) as sender_b_status`,
    [accountId, dispatchPhone, dispatchSenderId, dispatchSenderBId],
  ));
  check('unique cross-sender dispatch START restores the ledger without clearing the old sender block',
    dispatchStartB.ingress_disposition === 'keyword_start'
      && dispatchStartB.routed_account_id === accountId
      && restartedDispatch.ledger_status === 'opted_in'
      && restartedDispatch.sender_a_status === 'opted_out'
      && restartedDispatch.sender_b_status === 'opted_in');

  const blockedSenderA = await ingestAt(
    'dispatch-old-sender-still-blocked', 'Old sender reply',
    dispatchPhone, '+12485550142', 'other',
  );
  const routedSenderB = await ingestAt(
    'dispatch-new-sender-routes', 'New sender reply',
    dispatchPhone, '+12485550143', 'other',
  );
  check('dispatch sender preferences remain exact across senders',
    blockedSenderA.ingress_disposition === 'review'
      && routedSenderB.ingress_disposition === 'routed'
      && routedSenderB.routed_account_id === accountId);

  const dispatchStartA = await ingestAt(
    'dispatch-start-original-sender', 'START', dispatchPhone, '+12485550142', 'start',
  );
  check('dispatch START can restore the original exact sender',
    dispatchStartA.ingress_disposition === 'keyword_start'
      && dispatchStartA.routed_account_id === accountId);

  const ambiguousStop = await ingestAt(
    'dispatch-stop-ambiguous', 'STOP', ambiguousCrewPhone, '+12485550142', 'stop',
  );
  const ambiguousStart = await ingestAt(
    'dispatch-start-ambiguous', 'START', ambiguousCrewPhone, '+12485550143', 'start',
  );
  const ambiguousKeywordState = one(await client.query(
    `select
       (select status from public.sms_sender_keyword_preferences
         where sender_number_id=$3 and phone_number=$5) as sender_a_status,
       (select status from public.sms_sender_keyword_preferences
         where sender_number_id=$4 and phone_number=$5) as sender_b_status,
       (select count(*)::int from public.sms_consent
         where account_id in ($1,$2) and phone_number=$5 and status='opted_in') as opted_in_ledgers,
       (select count(*)::int from public.sms_operator_review_items review
          join public.sms_webhook_receipts receipt on receipt.id=review.webhook_receipt_id
         where receipt.provider_event_id in (
           'dispatch-stop-ambiguous','dispatch-start-ambiguous'
         ) and review.reason='ambiguous_destination') as reviews`,
    [
      accountId, accountB, dispatchSenderId, dispatchSenderBId,
      ambiguousCrewPhone,
    ],
  ));
  check('ambiguous dispatch STOP and START retain sender-only blocks and create review work',
    ambiguousStop.ingress_disposition === 'keyword_stop'
      && ambiguousStop.routed_account_id === null
      && ambiguousStart.ingress_disposition === 'review'
      && ambiguousStart.routed_account_id === null
      && ambiguousKeywordState.sender_a_status === 'opted_out'
      && ambiguousKeywordState.sender_b_status === 'opted_out'
      && ambiguousKeywordState.opted_in_ledgers === 2
      && ambiguousKeywordState.reviews === 2);

  const leadId = randomUUID();
  const offerId = randomUUID();
  await client.query(
    `insert into public.leads(id,account_id,name,address) values($1,$2,'Jamie','1 Main St')`,
    [leadId, accountId],
  );
  await client.query(
    `insert into public.estimate_offers(
       id,account_id,lead_id,crew_id,offer_date,window_start,window_end,
       arrival_time,phone,body,hold_expires_at
     ) values($1,$2,$3,$4,current_date+1,'09:00','11:00','10:00',$5,'offer',now()+interval '1 hour')`,
    [offerId, accountId, leadId, crewId, phone],
  );
  const estimateQuestion = await createQuestionEvent('estimate-positive', phone, {
    idempotencyKey: `estimate-offer:${offerId}`,
  });
  await linkAccountQuestion(
    'estimate_offer', offerId, estimateQuestion, { leadId },
  );
  const estimateReceipt = await ingest('estimate-yes', 'YES');
  const taskCreated = one(await client.query(
    'select count(*)::int as count from public.sms_inbound_action_tasks where webhook_receipt_id=$1',
    [estimateReceipt.webhook_receipt_id],
  ));
  check('routed receipt atomically creates one action task', taskCreated.count === 1);

  const claim = one(await client.query(
    'select * from public.claim_sms_inbound_action($1)', [estimateReceipt.webhook_receipt_id],
  ));
  const busy = one(await concurrentClient.query(
    'select * from public.claim_sms_inbound_action($1)', [estimateReceipt.webhook_receipt_id],
  ));
  check('concurrent receipt claims have one owner', claim.claim_status === 'claimed' && busy.claim_status === 'busy');

  const applied = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome', [claim.task_id, claim.work_claim_token],
  )).outcome;
  const replayed = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome', [claim.task_id, claim.work_claim_token],
  )).outcome;
  const estimateState = one(await client.query(
    `select e.status,e.route_stop_id,count(s.id)::int as stops
       from public.estimate_offers e left join public.route_stops s on s.source_sms_webhook_receipt_id=$2
      where e.id=$1 group by e.status,e.route_stop_id`,
    [offerId, estimateReceipt.webhook_receipt_id],
  ));
  check('lost apply response replays one accepted estimate effect',
    applied.action_kind === 'estimate' && JSON.stringify(applied) === JSON.stringify(replayed)
      && estimateState.status === 'accepted' && estimateState.stops === 1,
    JSON.stringify({ applied, replayed, estimateState }));

  await client.query('select public.fail_sms_inbound_action($1,$2,$3)', [claim.task_id, claim.work_claim_token, 'test_crash']);
  await client.query('update public.sms_inbound_action_tasks set next_attempt_at=now()-interval \'1 second\' where id=$1', [claim.task_id]);
  const retry = one(await client.query('select * from public.claim_sms_inbound_action($1)', [estimateReceipt.webhook_receipt_id]));
  const retryOutcome = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome', [retry.task_id, retry.work_claim_token],
  )).outcome;
  const stopCount = one(await client.query(
    'select count(*)::int as count from public.route_stops where source_sms_webhook_receipt_id=$1',
    [estimateReceipt.webhook_receipt_id],
  ));
  check('failed-after-effect retry returns stored outcome without duplicate booking',
    retryOutcome.action_kind === 'estimate' && stopCount.count === 1,
    JSON.stringify({ retryOutcome, stopCount }));
  await client.query('select public.complete_sms_inbound_action($1,$2,null,null)', [retry.task_id, retry.work_claim_token]);

  const secondLead = randomUUID();
  const secondEstimateId = randomUUID();
  const rescheduleJob = randomUUID();
  const rescheduleId = randomUUID();
  await client.query(`insert into public.leads(id,account_id,name) values($1,$2,'Other')`, [secondLead, accountId]);
  await client.query(
    `insert into public.estimate_offers(
       id,account_id,lead_id,crew_id,offer_date,window_start,window_end,arrival_time,
       phone,body,hold_expires_at
     ) values($1,$2,$3,$4,current_date+2,'09:00','11:00','10:00',$5,'offer',now()+interval '1 hour')`,
    [secondEstimateId, accountId, secondLead, crewId, phone],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,client_phone,scheduled_for)
       values($1,$2,'J-2','Jamie',$3,current_date+3)`,
    [rescheduleJob, accountId, phone],
  );
  await client.query(
    `insert into public.reschedule_offers(
       id,account_id,job_id,status,from_date,to_date,window_start,window_end,
       arrival_time,discount_percent,phone,body
     ) values($1,$2,$3,'sent',current_date+3,current_date+4,'12:00','14:00','13:00',10,$4,'move')`,
    [rescheduleId, accountId, rescheduleJob, phone],
  );
  const secondEstimateQuestion = await createQuestionEvent('estimate-ambiguous', phone, {
    idempotencyKey: `estimate-offer:${secondEstimateId}`,
  });
  const rescheduleQuestion = await createQuestionEvent('reschedule-ambiguous', phone, {
    status: 'delivered',
    idempotencyKey: `reschedule-offer:${rescheduleId}`,
  });
  await linkAccountQuestion(
    'estimate_offer', secondEstimateId, secondEstimateQuestion, { leadId: secondLead },
  );
  await linkAccountQuestion(
    'reschedule_offer', rescheduleId, rescheduleQuestion, { jobId: rescheduleJob },
  );
  const ambiguousReceipt = await ingest('ambiguous-yes', 'YES');
  const ambiguousClaim = one(await client.query(
    'select * from public.claim_sms_inbound_action($1)', [ambiguousReceipt.webhook_receipt_id],
  ));
  const ambiguous = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome',
    [ambiguousClaim.task_id, ambiguousClaim.work_claim_token],
  )).outcome;
  const unchanged = one(await client.query('select status from public.reschedule_offers where id=$1', [rescheduleId]));
  check('multiple compatible pending questions produce ambiguity without mutation',
    ambiguous.action_kind === 'ambiguous' && ambiguous.reply_kind === 'ambiguity' && unchanged.status === 'sent',
    JSON.stringify({ ambiguous, unchanged }));

  await client.query("update public.estimate_offers set status='canceled' where account_id=$1 and status='held'", [accountId]);
  const rescheduleOutcome = await applyReceipt(await ingest('reschedule-yes', 'YES'));
  const rescheduleState = one(await client.query(
    `select o.status,j.scheduled_for=o.to_date as moved
       from public.reschedule_offers o
       join public.jobs j on j.id=o.job_id
      where o.id=$1`,
    [rescheduleId],
  ));
  check('reschedule YES requires and consumes its exact provider-accepted question',
    rescheduleOutcome.action_kind === 'reschedule'
      && rescheduleState.status === 'accepted'
      && rescheduleState.moved === true,
    JSON.stringify({ rescheduleOutcome, rescheduleState }));

  const appointmentJob = randomUUID();
  const appointmentSchedule = one(await client.query(
    "select (current_date+1)::text as scheduled_for, time '08:30'::text as scheduled_time",
  ));
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,client_phone,scheduled_for,scheduled_time)
       values($1,$2,'J-3','Pat',$3,current_date+1,'08:30')`,
    [appointmentJob, accountId, phone],
  );
  const appointmentQuestion = await createQuestionEvent('appointment-positive', phone, {
    eventType: 'appointment_reminder',
    context: 'automation',
    messageKind: 'appointment-reminder',
    idempotencyKey: `appointment-reminder:${appointmentJob}:${appointmentSchedule.scheduled_for}:${appointmentSchedule.scheduled_time}`,
  });
  await client.query(
    `insert into public.job_feed(account_id,job_id,kind,meta)
       values($2,$1,'appointment_reminder',jsonb_build_object(
         'channel','sms','scheduled_for',(current_date+1)::text,
         'scheduled_time',time '08:30'::text,'sms_event_id',$3::text))`,
    [appointmentJob, accountId, appointmentQuestion],
  );
  await client.query("update public.reschedule_offers set status='canceled' where id=$1", [rescheduleId]);
  const appointmentReceipt = await ingest('appointment-c', 'C');
  const appointmentClaim = one(await client.query(
    'select * from public.claim_sms_inbound_action($1)', [appointmentReceipt.webhook_receipt_id],
  ));
  const appointment = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome',
    [appointmentClaim.task_id, appointmentClaim.work_claim_token],
  )).outcome;
  const appointmentState = one(await client.query(
    'select appointment_confirmed_at from public.jobs where id=$1', [appointmentJob],
  ));
  check('appointment confirmation requires its exact provider-accepted SMS reminder and commits once',
    appointment.action_kind === 'appointment' && appointmentState.appointment_confirmed_at !== null,
    JSON.stringify({ appointment, appointmentState }));

  const subPhone = '+12485550122';
  const subCrew = randomUUID();
  const subJob = randomUUID();
  const subRequest = randomUUID();
  const subOffer = randomUUID();
  await client.query(
    `insert into public.crew(id,account_id,name,phone,active)
     values($1,$2,'Subcontractor',$3,true)`,
    [subCrew, accountId, subPhone],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,scheduled_for)
       values($1,$2,'J-4','Client',current_date+2)`, [subJob, accountId],
  );
  await client.query(
    `insert into public.subcontractor_requests(id,account_id,job_id,status,work_description,expires_at,selection_mode)
       values($1,$2,$3,'sent','Install sink',now()+interval '1 day','first_accept')`,
    [subRequest, accountId, subJob],
  );
  const subQuestion = await createQuestionEvent('subcontractor-positive', subPhone, {
    status: 'delivered',
    senderNumberId: dispatchSenderId,
    senderPurpose: 'lgq_dispatch',
    eventType: 'sub_offer',
    context: 'subcontractor',
    crewId: subCrew,
    messageKind: 'sub-offer',
    billingCategory: 'crew_message',
    idempotencyKey: `subcontractor:${subOffer}:offer`,
  });
  await client.query(
    `insert into public.subcontractor_offers(
       id,account_id,request_id,crew_id,status,phone,sms_event_id
     ) values($1,$2,$3,$4,'sent',$5,$6)`,
    [subOffer, accountId, subRequest, subCrew, subPhone, subQuestion],
  );
  await client.query(
    `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
       values($1,$2,'opted_in','crew_added',now())`, [accountId, subPhone],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope,evidence_source)
       values($1,$2,'crew','crew_added')`, [accountId, subPhone],
  );
  const subReceipt = await ingestAt('sub-yes', 'YES', subPhone, '+12485550142');
  const subClaim = one(await client.query('select * from public.claim_sms_inbound_action($1)', [subReceipt.webhook_receipt_id]));
  const subOutcome = one(await client.query(
    'select public.apply_sms_inbound_action($1,$2) as outcome', [subClaim.task_id, subClaim.work_claim_token],
  )).outcome;
  const subState = one(await client.query(
    `select r.status,r.claimed_offer_id,o.status as offer_status,o.won,
            (select count(*)::int from public.crew_assignments where job_id=r.job_id and crew_id=o.crew_id) as assignments
       from public.subcontractor_requests r join public.subcontractor_offers o on o.request_id=r.id
      where r.id=$1`, [subRequest],
  ));
  check('one exactly-bound subcontractor YES atomically claims and assigns',
    subOutcome.action_kind === 'subcontractor' && subState.status === 'claimed'
      && subState.claimed_offer_id === subOffer && subState.offer_status === 'accepted'
      && subState.won === true && subState.assignments === 1,
    JSON.stringify({ subOutcome, subState }));

  async function createBindingCandidate(domain, tag, recipient, eventOverrides) {
    if (domain === 'estimate') {
      const targetId = randomUUID();
      const candidateLead = randomUUID();
      const questionEventId = await createQuestionEvent(tag, recipient, {
        idempotencyKey: `estimate-offer:${targetId}`,
        ...eventOverrides,
      });
      await client.query(
        `insert into public.leads(id,account_id,name,address)
         values($1,$2,$3,'1 Binding St')`,
        [candidateLead, accountId, `Estimate ${tag}`],
      );
      await client.query(
        `insert into public.estimate_offers(
           id,account_id,lead_id,crew_id,offer_date,window_start,window_end,
           arrival_time,phone,body,hold_expires_at
         ) values($1,$2,$3,$4,current_date+7,'09:00','11:00','10:00',$5,$6,
                  now()+interval '1 hour')`,
        [targetId, accountId, candidateLead, crewId, recipient, `Estimate ${tag}`],
      );
      await linkAccountQuestion(
        'estimate_offer', targetId, questionEventId, { leadId: candidateLead },
      );
      return { domain, targetId };
    }
    if (domain === 'reschedule') {
      const targetId = randomUUID();
      const candidateJob = randomUUID();
      const questionEventId = await createQuestionEvent(tag, recipient, {
        idempotencyKey: `reschedule-offer:${targetId}`,
        ...eventOverrides,
      });
      await client.query(
        `insert into public.jobs(
           id,account_id,ref,client_name,client_phone,scheduled_for
         ) values($1,$2,$3,'Binding client',$4,current_date+7)`,
        [candidateJob, accountId, `R-${tag}`, recipient],
      );
      await client.query(
        `insert into public.reschedule_offers(
           id,account_id,job_id,status,from_date,to_date,window_start,
           window_end,arrival_time,discount_percent,phone,body
         ) values($1,$2,$3,'sent',current_date+7,current_date+8,
                  '12:00','14:00','13:00',10,$4,$5)`,
        [targetId, accountId, candidateJob, recipient, `Reschedule ${tag}`],
      );
      await linkAccountQuestion(
        'reschedule_offer', targetId, questionEventId, { jobId: candidateJob },
      );
      return { domain, targetId, jobId: candidateJob };
    }
    if (domain === 'appointment') {
      const targetId = randomUUID();
      const schedule = one(await client.query(
        "select (current_date+7)::text as scheduled_for, time '08:30'::text as scheduled_time",
      ));
      const questionEventId = await createQuestionEvent(tag, recipient, {
        eventType: 'appointment_reminder',
        context: 'automation',
        messageKind: 'appointment-reminder',
        idempotencyKey: `appointment-reminder:${targetId}:${schedule.scheduled_for}:${schedule.scheduled_time}`,
        ...eventOverrides,
      });
      await client.query(
        `insert into public.jobs(
           id,account_id,ref,client_name,client_phone,scheduled_for,scheduled_time
         ) values($1,$2,$3,'Binding client',$4,current_date+7,'08:30')`,
        [targetId, accountId, `A-${tag}`, recipient],
      );
      await client.query(
        `insert into public.job_feed(account_id,job_id,kind,meta,created_at)
         values($1,$2,'appointment_reminder',jsonb_build_object(
           'channel','sms','scheduled_for',(current_date+7)::text,
           'scheduled_time',time '08:30'::text,
           'sms_event_id',$3::text
         ),now()-interval '30 seconds')`,
        [accountId, targetId, questionEventId],
      );
      return { domain, targetId };
    }

    const targetId = randomUUID();
    const candidateCrew = randomUUID();
    const candidateJob = randomUUID();
    const candidateRequest = randomUUID();
    await client.query(
      `insert into public.crew(id,account_id,name,phone,active)
       values($1,$2,$3,$4,true)`,
      [candidateCrew, accountId, `Sub ${tag}`, recipient],
    );
    const questionEventId = await createQuestionEvent(tag, recipient, {
      senderNumberId: dispatchSenderId,
      senderPurpose: 'lgq_dispatch',
      eventType: 'sub_offer',
      context: 'subcontractor',
      crewId: candidateCrew,
      messageKind: 'sub-offer',
      billingCategory: 'crew_message',
      idempotencyKey: `subcontractor:${targetId}:offer`,
      ...eventOverrides,
    });
    await client.query(
      `insert into public.sms_consent(account_id,phone_number,status,source,consented_at)
       values($1,$2,'opted_in','crew_added',now())`,
      [accountId, recipient],
    );
    await client.query(
      `insert into public.sms_consent_scopes(
         account_id,phone_number,consent_scope,evidence_source
       ) values($1,$2,'crew','crew_added')`,
      [accountId, recipient],
    );
    await client.query(
      `insert into public.jobs(id,account_id,ref,client_name,scheduled_for)
       values($1,$2,$3,'Binding client',current_date+7)`,
      [candidateJob, accountId, `S-${tag}`],
    );
    await client.query(
      `insert into public.subcontractor_requests(
         id,account_id,job_id,status,work_description,expires_at,selection_mode
       ) values($1,$2,$3,'sent',$4,now()+interval '1 day','first_accept')`,
      [candidateRequest, accountId, candidateJob, `Binding work ${tag}`],
    );
    await client.query(
      `insert into public.subcontractor_offers(
         id,account_id,request_id,crew_id,status,phone,sms_event_id
       ) values($1,$2,$3,$4,'sent',$5,$6)`,
      [targetId, accountId, candidateRequest, candidateCrew, recipient, questionEventId],
    );
    return { domain, targetId, requestId: candidateRequest };
  }

  async function bindingCandidateStayedOpen(candidate) {
    if (candidate.domain === 'estimate') {
      return one(await client.query(
        "select status='held' as unchanged from public.estimate_offers where id=$1",
        [candidate.targetId],
      )).unchanged;
    }
    if (candidate.domain === 'reschedule') {
      return one(await client.query(
        "select status='sent' as unchanged from public.reschedule_offers where id=$1",
        [candidate.targetId],
      )).unchanged;
    }
    if (candidate.domain === 'appointment') {
      return one(await client.query(
        'select appointment_confirmed_at is null as unchanged from public.jobs where id=$1',
        [candidate.targetId],
      )).unchanged;
    }
    return one(await client.query(
      `select o.status='sent' and r.status='sent' and r.claimed_offer_id is null as unchanged
         from public.subcontractor_offers o
         join public.subcontractor_requests r on r.id=o.request_id
        where o.id=$1`,
      [candidate.targetId],
    )).unchanged;
  }

  async function retireBindingCandidate(candidate) {
    if (candidate.domain === 'estimate') {
      await client.query("update public.estimate_offers set status='canceled' where id=$1", [candidate.targetId]);
    } else if (candidate.domain === 'reschedule') {
      await client.query("update public.reschedule_offers set status='canceled' where id=$1", [candidate.targetId]);
    } else if (candidate.domain === 'appointment') {
      await client.query("update public.jobs set status='canceled' where id=$1", [candidate.targetId]);
    } else {
      await client.query("update public.subcontractor_offers set status='covered' where id=$1", [candidate.targetId]);
      await client.query("update public.subcontractor_requests set status='canceled' where id=$1", [candidate.requestId]);
    }
  }

  const bindingVariants = [
    ['queued', { status: 'queued' }],
    ['failed', { status: 'failed' }],
    ['cross-account', { accountId: accountB }],
    ['cross-recipient', { crossRecipient: true }],
    ['cross-purpose', { senderPurpose: 'lgq_shared' }],
    ['cross-sender', { crossSender: true }],
    ['cross-provider', { provider: 'twilio' }],
    ['missing-provider-id', { providerId: null }],
    ['blank-provider-id', { blankProviderId: true }],
    ['simulated-provider-id', { providerId: 'simulated' }],
    ['missing-accepted-at', { providerAcceptedAt: null }],
    ['reply-before-question', { future: true }],
  ];
  const bindingDomains = ['estimate', 'reschedule', 'appointment', 'subcontractor'];
  for (const [domainIndex, domain] of bindingDomains.entries()) {
    const failures = [];
    for (const [variantIndex, [variant, rawOverrides]] of bindingVariants.entries()) {
      const recipient = `+1248555${String(2000 + domainIndex * 20 + variantIndex).padStart(4, '0')}`;
      const isDispatch = domain === 'subcontractor';
      const overrides = {
        ...rawOverrides,
        phone: rawOverrides.crossRecipient ? '+12485552999' : recipient,
        senderNumberId: rawOverrides.crossSender
          ? (isDispatch ? dispatchSenderBId : sharedSenderId)
          : (isDispatch ? dispatchSenderId : senderId),
        senderPurpose: rawOverrides.senderPurpose
          ?? (isDispatch ? 'lgq_dispatch' : 'contractor_dedicated'),
      };
      const candidate = await createBindingCandidate(
        domain, `${domain}-${variant}`, recipient, overrides,
      );
      const receipt = isDispatch
        ? await ingestAt(
          `binding-${domain}-${variant}`, 'YES', recipient, '+12485550142', 'other',
        )
        : await ingestAt(
          `binding-${domain}-${variant}`,
          domain === 'appointment' ? 'C' : 'YES',
          recipient,
          '+12485550140',
          'other',
        );
      const outcome = await applyReceipt(receipt);
      const unchanged = await bindingCandidateStayedOpen(candidate);
      if (outcome.action_kind !== 'none' || unchanged !== true) {
        failures.push(`${variant}:${outcome.action_kind}/${unchanged}`);
      }
      await retireBindingCandidate(candidate);
    }
    check(`${domain} rejects every inexact or unaccepted outbound question binding`,
      failures.length === 0, failures.join(', '));
  }

  async function createCrossLaneCandidates(tag) {
    const leadId = randomUUID();
    const estimateId = randomUUID();
    const jobId = randomUUID();
    const requestId = randomUUID();
    const offerId = randomUUID();
    const estimateQuestion = await createQuestionEvent(
      `cross-estimate-${tag}`, crossLanePhone,
      { idempotencyKey: `estimate-offer:${estimateId}` },
    );
    const dispatchQuestion = await createQuestionEvent(
      `cross-subcontractor-${tag}`, crossLanePhone,
      {
        senderNumberId: dispatchSenderId,
        senderPurpose: 'lgq_dispatch',
        eventType: 'sub_offer',
        context: 'subcontractor',
        crewId,
        messageKind: 'sub-offer',
        billingCategory: 'crew_message',
        idempotencyKey: `subcontractor:${offerId}:offer`,
      },
    );
    await client.query(
      `insert into public.leads(id,account_id,name,address)
       values($1,$2,$3,'1 Cross Lane')`,
      [leadId, accountId, `Cross ${tag}`],
    );
    await client.query(
      `insert into public.estimate_offers(
         id,account_id,lead_id,crew_id,offer_date,window_start,window_end,
         arrival_time,phone,body,hold_expires_at
       ) values($1,$2,$3,$4,current_date+5,'09:00','11:00','10:00',$5,'estimate',now()+interval '1 hour')`,
      [estimateId, accountId, leadId, crewId, crossLanePhone],
    );
    await linkAccountQuestion(
      'estimate_offer', estimateId, estimateQuestion, { leadId },
    );
    await client.query(
      `insert into public.jobs(id,account_id,ref,client_name,scheduled_for)
       values($1,$2,$3,'Cross client',current_date+5)`,
      [jobId, accountId, `X-${tag}`],
    );
    await client.query(
      `insert into public.subcontractor_requests(
         id,account_id,job_id,status,work_description,expires_at,selection_mode
       ) values($1,$2,$3,'sent',$4,now()+interval '1 day','first_accept')`,
      [requestId, accountId, jobId, `Cross work ${tag}`],
    );
    await client.query(
      `insert into public.subcontractor_offers(
         id,account_id,request_id,crew_id,status,phone,sms_event_id
       ) values($1,$2,$3,$4,'sent',$5,$6)`,
      [offerId, accountId, requestId, crewId, crossLanePhone, dispatchQuestion],
    );
    return { estimateId, offerId };
  }

  const dedicatedCross = await createCrossLaneCandidates('dedicated');
  const dedicatedCrossOutcome = await applyReceipt(await ingestAt(
    'cross-dedicated-no', 'NO', crossLanePhone, '+12485550140',
  ));
  const dedicatedCrossState = one(await client.query(
    `select e.status as estimate_status,o.status as subcontractor_status
       from public.estimate_offers e cross join public.subcontractor_offers o
      where e.id=$1 and o.id=$2`,
    [dedicatedCross.estimateId, dedicatedCross.offerId],
  ));
  check('same-phone dedicated reply can mutate customer intent only',
    dedicatedCrossOutcome.action_kind === 'estimate'
      && dedicatedCrossState.estimate_status === 'declined'
      && dedicatedCrossState.subcontractor_status === 'sent');
  await client.query("update public.subcontractor_offers set status='covered' where id=$1", [dedicatedCross.offerId]);

  const dispatchCross = await createCrossLaneCandidates('dispatch');
  const dispatchCrossOutcome = await applyReceipt(await ingestAt(
    'cross-dispatch-no', 'NO', crossLanePhone, '+12485550142',
  ));
  const dispatchCrossState = one(await client.query(
    `select e.status as estimate_status,o.status as subcontractor_status
       from public.estimate_offers e cross join public.subcontractor_offers o
      where e.id=$1 and o.id=$2`,
    [dispatchCross.estimateId, dispatchCross.offerId],
  ));
  check('same-phone dispatch reply can mutate subcontractor intent only',
    dispatchCrossOutcome.action_kind === 'subcontractor'
      && dispatchCrossState.estimate_status === 'held'
      && dispatchCrossState.subcontractor_status === 'declined');
  await client.query("update public.estimate_offers set status='canceled' where id=$1", [dispatchCross.estimateId]);

  await client.query(
    'update public.accounts set alert_phone=$2 where id=$1', [accountId, crossLanePhone],
  );
  const sharedCross = await createCrossLaneCandidates('shared');
  const sharedCrossOutcome = await applyReceipt(await ingestAt(
    'cross-shared-no', 'NO', crossLanePhone, '+12485550141',
  ));
  const sharedCrossState = one(await client.query(
    `select e.status as estimate_status,o.status as subcontractor_status
       from public.estimate_offers e cross join public.subcontractor_offers o
      where e.id=$1 and o.id=$2`,
    [sharedCross.estimateId, sharedCross.offerId],
  ));
  check('same-phone shared reply remains inbox-only',
    sharedCrossOutcome.action_kind === 'none'
      && sharedCrossState.estimate_status === 'held'
      && sharedCrossState.subcontractor_status === 'sent');
  await client.query(
    'update public.accounts set alert_phone=$2 where id=$1', [accountId, sharedPhone],
  );

  const security = one(await client.query(
    `select c.relrowsecurity,c.relforcerowsecurity,
            has_table_privilege('authenticated',c.oid,'select') as auth_select,
            has_table_privilege('service_role',c.oid,'update') as service_update,
            has_function_privilege('service_role','public.apply_sms_inbound_action(uuid,uuid)','execute') as service_exec,
            has_function_privilege('authenticated','public.apply_sms_inbound_action(uuid,uuid)','execute') as auth_exec
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='sms_inbound_action_tasks'`,
  ));
  check('action storage is forced RLS and mutation is service-RPC-only',
    security.relrowsecurity && security.relforcerowsecurity
      && !security.auth_select && !security.service_update
      && security.service_exec && !security.auth_exec);
} catch (error) {
  check('harness ran to completion', false, error instanceof Error ? error.message : String(error));
} finally {
  try { await concurrentClient?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  try { await pg.stop(); } catch { /* cluster may not have started */ }
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 10) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
