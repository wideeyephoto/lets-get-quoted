// Verify 20260903172223_owner_shared_field_command_routing.sql against a
// disposable PostgreSQL 17 cluster. This harness creates only the tables and
// pre-existing trigger behavior that the migration depends on. It never reads
// a hosted database URL or calls an external service.

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

const MIGRATION = 'migrations/20260903172223_owner_shared_field_command_routing.sql';
const NOTICE_MIGRATION = 'migrations/20260903190000_sms_shared_notice_stop_suppression.sql';
const PORT = Number(process.env.LGQ_OWNER_FIELD_ROUTING_CHECK_PORT || 54374);
const execFileAsync = promisify(execFile);

function errorText(value) {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}

async function bounded(label, timeoutMs, action) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function childExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child) {
  if (childExited(child)) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

// embedded-postgres uses taskkill internally on Windows. Sandbox-restricted
// process APIs can leave that call waiting forever, so use PostgreSQL's own
// bounded shutdown there, retain a force-stop fallback, and clear the instance
// reference so its process-exit hook cannot try a hung stop a second time.
async function stopPostgresBounded(instance) {
  const child = instance.process;
  const pid = child?.pid;
  const failures = [];

  if (childExited(child)) {
    if (instance.process === child) instance.process = undefined;
    return { ok: true, details: [] };
  }

  try {
    if (process.platform === 'win32') {
      await bounded('stop PostgreSQL with pg_ctl', 10_000, () =>
        execFileAsync(join(bin, 'pg_ctl.exe'), [
          'stop',
          '-D',
          instance.options.databaseDir,
          '-m',
          'fast',
          '-w',
          '-t',
          '8',
        ], { windowsHide: true }));
      await bounded('wait for PostgreSQL exit', 5_000, () => waitForExit(child));
      if (instance.process === child) instance.process = undefined;
    } else {
      await bounded('stop PostgreSQL', 10_000, () => instance.stop());
    }
    return { ok: true, details: [] };
  } catch (error) {
    failures.push(errorText(error));
  }

  if (!childExited(child) && pid) {
    try {
      if (process.platform === 'win32') {
        if (!child.kill('SIGKILL')) throw new Error(`Could not terminate PostgreSQL PID ${pid}`);
      } else {
        child.kill('SIGKILL');
      }
    } catch (error) {
      if (!childExited(child)) failures.push(errorText(error));
    }

    try {
      await bounded('wait for PostgreSQL exit', 5_000, () => waitForExit(child));
    } catch (error) {
      if (!childExited(child)) failures.push(errorText(error));
    }
  }

  const stopped = childExited(child);
  if (instance.process === child) instance.process = undefined;
  if (!stopped) {
    child?.unref?.();
    failures.push(`PostgreSQL PID ${pid ?? 'unknown'} did not confirm exit`);
  }
  return { ok: stopped, details: failures };
}

// Windows sandbox sessions can expose USERNAME/USERPROFILE while the native
// os.userInfo() lookup is unavailable. embedded-postgres only needs a stable
// local identity for its disposable data directory.
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
    + '@embedded-postgres/windows-x64@17.10.0-beta.17\n'
    + '  (cd node_modules/@embedded-postgres/windows-x64 && node scripts/hydrate-symlinks.js)',
  );
  process.exit(2);
}

const bin = join(
  process.cwd(),
  'node_modules',
  '@embedded-postgres',
  process.platform === 'win32'
    ? 'windows-x64'
    : process.platform === 'darwin'
      ? 'darwin-arm64'
      : 'linux-x64',
  'native',
  'bin',
);
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
    create role service_role nologin;
  end if;
end
$roles$;

create table public.accounts (
  id uuid primary key,
  alert_phone text,
  high_value_sms_enabled boolean not null default false,
  suspended_at timestamptz
);

create table public.crew (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  phone text not null,
  active boolean not null default true,
  deleted_at timestamptz,
  access_revoked_at timestamptz
);

create table public.sms_sender_numbers (
  id uuid primary key,
  provider text not null,
  e164_number text not null,
  purpose text not null,
  account_id uuid references public.accounts(id) on delete restrict,
  provisioning_status text not null,
  assignment_state text not null,
  inbound_ready boolean not null,
  activated_at timestamptz,
  suspended_at timestamptz
);

create table public.sms_consent (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  status text not null,
  opted_out_at timestamptz,
  unique (account_id, phone_number)
);

create table public.sms_consent_scopes (
  account_id uuid not null,
  phone_number text not null,
  consent_scope text not null,
  primary key (account_id, phone_number, consent_scope),
  foreign key (account_id, phone_number)
    references public.sms_consent(account_id, phone_number) on delete cascade
);

create table public.sms_sender_keyword_preferences (
  sender_number_id uuid not null
    references public.sms_sender_numbers(id) on delete restrict,
  phone_number text not null,
  status text not null,
  opted_out_at timestamptz,
  primary key (sender_number_id, phone_number)
);

create table public.sms_events (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_id text,
  provider text,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict
);

create table public.sms_messages (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  provider_id text,
  provider text,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  read_at timestamptz,
  media_urls text[],
  created_at timestamptz not null default pg_catalog.now()
);

create or replace function public.office_can(uuid, text)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select true $$;

create policy sms_messages_all on public.sms_messages
  for all using (true) with check (true);
create policy sms_messages_modify on public.sms_messages
  for all using (true) with check (true);

grant select, insert, update, delete on public.sms_messages to authenticated;
grant select on public.sms_events to authenticated;

-- Preserve the installed provider-identity guard's name and behavior. The
-- migration relies on PostgreSQL's alphabetical ordering of BEFORE triggers:
-- this guard must hydrate sender_number_id before visibility is derived.
create or replace function public.prevent_sms_message_provider_spoofing()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.direction = 'outbound'
     and new.sms_event_id is null then
    select e.id, e.provider, e.sender_number_id
      into new.sms_event_id, new.provider, new.sender_number_id
      from public.sms_events e
     where e.id = new.id
       and e.provider_id is not distinct from new.provider_id;
  end if;

  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (
      new.direction <> 'outbound'
      or new.provider_id is not null
      or new.provider is not null
      or new.sender_number_id is not null
      or new.sms_event_id is not null
    ) then
      raise exception 'Browser sessions cannot assign SMS provider identity'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (
      old.id is distinct from new.id
      or old.account_id is distinct from new.account_id
      or old.phone_number is distinct from new.phone_number
      or old.direction is distinct from new.direction
      or old.body is distinct from new.body
      or old.provider_id is distinct from new.provider_id
      or old.provider is distinct from new.provider
      or old.sender_number_id is distinct from new.sender_number_id
      or old.sms_event_id is distinct from new.sms_event_id
      or old.media_urls is distinct from new.media_urls
      or old.created_at is distinct from new.created_at
    ) then
      raise exception 'Browser sessions can only update SMS read state'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger sms_messages_provider_identity_guard
before insert or update on public.sms_messages
for each row execute function public.prevent_sms_message_provider_spoofing();

create table public.sms_webhook_receipts (
  id uuid primary key,
  provider text not null,
  webhook_kind text not null,
  provider_event_id text not null,
  processing_state text not null,
  disposition text,
  account_id uuid references public.accounts(id) on delete restrict,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  sms_message_id uuid references public.sms_messages(id) on delete restrict,
  from_number text,
  to_number text
);

create table public.sms_shared_notice_replies (
  webhook_receipt_id uuid primary key
    references public.sms_webhook_receipts(id) on delete restrict,
  egress_result text not null check (egress_result in ('twiml', 'suppressed')),
  response_body_sha256 text not null check (response_body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.sms_inbound_action_tasks (
  id uuid primary key,
  webhook_receipt_id uuid not null unique
    references public.sms_webhook_receipts(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  sender_number_id uuid not null
    references public.sms_sender_numbers(id) on delete restrict,
  sms_message_id uuid not null unique
    references public.sms_messages(id) on delete restrict,
  task_state text not null default 'pending',
  claim_token uuid,
  lease_expires_at timestamptz,
  effect_applied_at timestamptz,
  outcome jsonb,
  updated_at timestamptz not null default pg_catalog.now()
);

create or replace function public.sms_normalize_recipient_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  with normalized as (
    select pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g') as value
  )
  select case
    when value ~ '^\\+[1-9][0-9]{7,14}$' then value
    when value ~ '^1[0-9]{10}$' then '+' || value
    when value ~ '^[0-9]{10}$' then '+1' || value
    else null::text
  end
  from normalized
$$;

create or replace function public.sms_inbound_recipient_lock_key(
  p_account_id uuid,
  p_phone text
)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.hashtextextended(
    'sms-inbound-recipient:' || p_account_id::text || ':' || coalesce(p_phone, ''),
    20260821
  )
$$;

create or replace function public.apply_owner_field_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_intent text,
  p_params jsonb,
  p_transcript text,
  p_confirmation_text text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_build_object(
    'intent', p_intent,
    'target_id', null,
    'delegated', true
  )
$$;

revoke all on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)
  to service_role;

alter table public.sms_inbound_action_tasks enable row level security;
alter table public.sms_inbound_action_tasks force row level security;
`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-owner-field-routing-pg17-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_owner_field_routing_check');
  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_owner_field_routing_check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query(baseSchema);

  const accountId = randomUUID();
  const sharedSenderId = randomUUID();
  const dispatchSenderId = randomUUID();
  const dedicatedSenderId = randomUUID();
  const existingSharedMessageId = randomUUID();
  const existingDispatchMessageId = randomUUID();
  const existingDedicatedMessageId = randomUUID();
  const existingNullMessageId = randomUUID();
  const receiptId = randomUUID();
  const taskId = randomUUID();
  const claimToken = randomUUID();
  const ownerPhone = '+18103042061';
  const sharedNumber = '+12485550141';
  const providerEventId = 'shared-field-event';

  await client.query(
    `insert into public.accounts(id,alert_phone,high_value_sms_enabled)
     values ($1,$2,true)`,
    [accountId, ownerPhone],
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,e164_number,purpose,account_id,provisioning_status,
       assignment_state,inbound_ready,activated_at
     ) values
       ($1,'signalwire',$4,'lgq_shared',null,'active','assigned',true,pg_catalog.now()),
       ($2,'signalwire','+12485550142','lgq_dispatch',null,'active','assigned',true,pg_catalog.now()),
       ($3,'signalwire','+12485550143','contractor_dedicated',$5,'active','assigned',true,pg_catalog.now())`,
    [sharedSenderId, dispatchSenderId, dedicatedSenderId, sharedNumber, accountId],
  );
  const consentId = randomUUID();
  await client.query(
    `insert into public.sms_consent(id,account_id,phone_number,status)
     values($1,$2,$3,'opted_in')`,
    [consentId, accountId, ownerPhone],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope)
     values($1,$2,'owner')`,
    [accountId, ownerPhone],
  );
  await client.query(
    `insert into public.sms_messages(
       id,account_id,phone_number,direction,body,provider_id,provider,sender_number_id
     ) values
       ($1,$5,$9,'inbound','existing shared command',$10,'signalwire',$6),
       ($2,$5,'+18103042062','inbound','existing dispatch reply','dispatch-event','signalwire',$7),
       ($3,$5,'+18103042063','inbound','existing dedicated reply','dedicated-event','signalwire',$8),
       ($4,$5,'+18103042064','inbound','existing legacy reply',null,null,null)`,
    [
      existingSharedMessageId,
      existingDispatchMessageId,
      existingDedicatedMessageId,
      existingNullMessageId,
      accountId,
      sharedSenderId,
      dispatchSenderId,
      dedicatedSenderId,
      ownerPhone,
      providerEventId,
    ],
  );
  await client.query(
    `insert into public.sms_webhook_receipts(
       id,provider,webhook_kind,provider_event_id,processing_state,disposition,
       account_id,sender_number_id,sms_message_id,from_number,to_number
     ) values($1,'signalwire','inbound',$2,'processed','routed',$3,$4,$5,$6,$7)`,
    [
      receiptId,
      providerEventId,
      accountId,
      sharedSenderId,
      existingSharedMessageId,
      ownerPhone,
      sharedNumber,
    ],
  );
  await client.query(
    `insert into public.sms_inbound_action_tasks(
       id,webhook_receipt_id,account_id,sender_number_id,sms_message_id,
       task_state,claim_token,lease_expires_at
     ) values($1,$2,$3,$4,$5,'processing',$6,pg_catalog.now() + interval '2 minutes')`,
    [taskId, receiptId, accountId, sharedSenderId, existingSharedMessageId, claimToken],
  );

  const migrationSql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
  await client.query(migrationSql);
  await client.query(migrationSql);
  const noticeMigrationSql = readFileSync(join(process.cwd(), NOTICE_MIGRATION), 'utf8');
  await client.query(noticeMigrationSql);
  await client.query(noticeMigrationSql);
  check('migrations apply idempotently on PostgreSQL 17', true);

  const callAuthorized = async ({
    token = claimToken,
    intent = 'no_action',
    params = { reason: 'harness' },
  } = {}) => {
    let outcome = null;
    let errorCode = null;
    await client.query('set role service_role');
    try {
      const result = await client.query(
        `select public.apply_authorized_sms_field_action(
           $1,$2,$3,$4::jsonb,'harness transcript',''
         ) as outcome`,
        [taskId, token, intent, JSON.stringify(params)],
      );
      outcome = one(result).outcome;
    } catch (error) {
      errorCode = error?.code ?? 'unknown';
    } finally {
      await client.query('reset role');
    }
    return { outcome, errorCode };
  };

  const callNoticeClaim = async (noticeReceiptId) => {
    let claimed = null;
    let errorCode = null;
    await client.query('set role service_role');
    try {
      const result = await client.query(
        `select public.record_sms_shared_notice_reply(
           $1,'twiml',$2
         ) as claimed`,
        [noticeReceiptId, 'a'.repeat(64)],
      );
      claimed = one(result).claimed;
    } catch (error) {
      errorCode = error?.code ?? 'unknown';
    } finally {
      await client.query('reset role');
    }
    return { claimed, errorCode };
  };

  const liveNoticeReceiptId = randomUUID();
  const stoppedNoticeReceiptId = randomUUID();
  const accountStoppedNoticeReceiptId = randomUUID();
  await client.query(
    `insert into public.sms_webhook_receipts(
       id,provider,webhook_kind,provider_event_id,processing_state,disposition,
       account_id,sender_number_id,from_number,to_number
     ) values
       ($1,'signalwire','inbound','notice-live','processed','routed',$4,$5,$6,$7),
       ($2,'signalwire','inbound','notice-stopped','review','shared_destination_unroutable',null,$5,$6,$7),
       ($3,'signalwire','inbound','notice-account-stopped','processed','routed',$4,$5,$6,$7)`,
    [
      liveNoticeReceiptId,
      stoppedNoticeReceiptId,
      accountStoppedNoticeReceiptId,
      accountId,
      sharedSenderId,
      ownerPhone,
      sharedNumber,
    ],
  );

  const liveNotice = await callNoticeClaim(liveNoticeReceiptId);
  const liveNoticeRetry = await callNoticeClaim(liveNoticeReceiptId);
  const liveNoticeAudit = one(await client.query(
    `select egress_result,response_body_sha256
       from public.sms_shared_notice_replies
      where webhook_receipt_id=$1`,
    [liveNoticeReceiptId],
  ));

  await client.query(
    `insert into public.sms_sender_keyword_preferences(
       sender_number_id,phone_number,status,opted_out_at
     ) values($1,$2,'opted_out',pg_catalog.now())`,
    [sharedSenderId, ownerPhone],
  );
  const stoppedNotice = await callNoticeClaim(stoppedNoticeReceiptId);
  await client.query(
    `update public.sms_sender_keyword_preferences
        set status='opted_in', opted_out_at=null
      where sender_number_id=$1 and phone_number=$2`,
    [sharedSenderId, ownerPhone],
  );
  const stoppedNoticeAfterStart = await callNoticeClaim(stoppedNoticeReceiptId);
  const stoppedNoticeAudit = one(await client.query(
    `select egress_result,response_body_sha256
       from public.sms_shared_notice_replies
      where webhook_receipt_id=$1`,
    [stoppedNoticeReceiptId],
  ));

  await client.query(
    `update public.sms_consent
        set status='opted_out', opted_out_at=pg_catalog.now()
      where account_id=$1 and phone_number=$2`,
    [accountId, ownerPhone],
  );
  const accountStoppedNotice = await callNoticeClaim(accountStoppedNoticeReceiptId);
  await client.query(
    `update public.sms_consent
        set status='opted_in', opted_out_at=null
      where account_id=$1 and phone_number=$2`,
    [accountId, ownerPhone],
  );
  const accountStoppedNoticeAudit = one(await client.query(
    `select egress_result,response_body_sha256
       from public.sms_shared_notice_replies
      where webhook_receipt_id=$1`,
    [accountStoppedNoticeReceiptId],
  ));
  const emptyTwimlHash = 'f94774d9eace296b75aeb622792d92dd74b7873a3b10ade1f415c0d399cfac07';
  check(
    'courtesy claim persists sender/account STOP suppression and retry immutability in a single transaction',
    liveNotice.errorCode === null
      && liveNotice.claimed === true
      && liveNoticeRetry.claimed === false
      && liveNoticeAudit.egress_result === 'twiml'
      && liveNoticeAudit.response_body_sha256 === 'a'.repeat(64)
      && stoppedNotice.errorCode === null
      && stoppedNotice.claimed === false
      && stoppedNoticeAfterStart.claimed === false
      && stoppedNoticeAudit.egress_result === 'suppressed'
      && stoppedNoticeAudit.response_body_sha256 === emptyTwimlHash
      && accountStoppedNotice.errorCode === null
      && accountStoppedNotice.claimed === false
      && accountStoppedNoticeAudit.egress_result === 'suppressed'
      && accountStoppedNoticeAudit.response_body_sha256 === emptyTwimlHash,
    JSON.stringify({
      liveNotice,
      liveNoticeRetry,
      liveNoticeAudit,
      stoppedNotice,
      stoppedNoticeAfterStart,
      stoppedNoticeAudit,
      accountStoppedNotice,
      accountStoppedNoticeAudit,
    }),
  );

  await client.query(
    `delete from public.sms_sender_keyword_preferences
      where sender_number_id=$1 and phone_number=$2`,
    [sharedSenderId, ownerPhone],
  );

  const liveOwner = await callAuthorized();
  const wrongClaim = await callAuthorized({ token: randomUUID() });
  check(
    'authorized wrapper delegates only a live claimed owner action',
    liveOwner.errorCode === null
      && liveOwner.outcome?.delegated === true
      && liveOwner.outcome?.intent === 'no_action'
      && wrongClaim.errorCode === '55000',
    JSON.stringify({ liveOwner, wrongClaim }),
  );

  await client.query(
    `insert into public.sms_sender_keyword_preferences(
       sender_number_id,phone_number,status,opted_out_at
     ) values($1,$2,'opted_out',pg_catalog.now())`,
    [sharedSenderId, ownerPhone],
  );
  const senderStopped = await callAuthorized();
  await client.query(
    `delete from public.sms_sender_keyword_preferences
      where sender_number_id=$1 and phone_number=$2`,
    [sharedSenderId, ownerPhone],
  );

  await client.query(
    `update public.accounts set high_value_sms_enabled=false where id=$1`,
    [accountId],
  );
  const disabledAccount = await callAuthorized();
  await client.query(
    `update public.accounts set high_value_sms_enabled=true where id=$1`,
    [accountId],
  );

  await client.query(
    `update public.accounts set suspended_at=pg_catalog.now() where id=$1`,
    [accountId],
  );
  const suspendedAccount = await callAuthorized();
  await client.query(
    `update public.accounts set suspended_at=null where id=$1`,
    [accountId],
  );

  await client.query(
    `update public.sms_consent
        set status='opted_out', opted_out_at=pg_catalog.now()
      where account_id=$1 and phone_number=$2`,
    [accountId, ownerPhone],
  );
  const revokedConsent = await callAuthorized();
  await client.query(
    `update public.sms_consent
        set status='opted_in', opted_out_at=null
      where account_id=$1 and phone_number=$2`,
    [accountId, ownerPhone],
  );

  await client.query(
    `delete from public.sms_consent_scopes
      where account_id=$1 and phone_number=$2 and consent_scope='owner'`,
    [accountId, ownerPhone],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope)
     values($1,$2,'crew')`,
    [accountId, ownerPhone],
  );
  const crewOnlyScope = await callAuthorized();
  await client.query(
    `delete from public.sms_consent_scopes
      where account_id=$1 and phone_number=$2 and consent_scope='crew'`,
    [accountId, ownerPhone],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope)
     values($1,$2,'owner')`,
    [accountId, ownerPhone],
  );

  check(
    'STOP, disabled, suspended, revoked, and crew-only identities fail closed',
    senderStopped.errorCode === '28000'
      && disabledAccount.errorCode === '28000'
      && suspendedAccount.errorCode === '28000'
      && revokedConsent.errorCode === '28000'
      && crewOnlyScope.errorCode === '28000',
    JSON.stringify({
      senderStopped,
      disabledAccount,
      suspendedAccount,
      revokedConsent,
      crewOnlyScope,
    }),
  );

  await client.query(
    `update public.sms_messages set phone_number='+18103042999' where id=$1`,
    [existingSharedMessageId],
  );
  const mismatchedMessage = await callAuthorized();
  await client.query(
    `update public.sms_messages set phone_number=$2 where id=$1`,
    [existingSharedMessageId, ownerPhone],
  );
  await client.query(
    `update public.sms_sender_numbers set purpose='lgq_dispatch' where id=$1`,
    [sharedSenderId],
  );
  const wrongSenderPurpose = await callAuthorized();
  await client.query(
    `update public.sms_sender_numbers set purpose='lgq_shared' where id=$1`,
    [sharedSenderId],
  );
  check(
    'message provenance and active shared-sender identity are revalidated',
    mismatchedMessage.errorCode === '23514'
      && wrongSenderPurpose.errorCode === '55000',
    JSON.stringify({ mismatchedMessage, wrongSenderPurpose }),
  );

  const crewId = randomUUID();
  const duplicateCrewId = randomUUID();
  const crewConsentId = randomUUID();
  const crewPhone = '+18103042088';
  await client.query(
    `insert into public.crew(id,account_id,name,phone)
     values($1,$2,'Harness Crew',$3)`,
    [crewId, accountId, crewPhone],
  );
  await client.query(
    `insert into public.sms_consent(id,account_id,phone_number,status)
     values($1,$2,$3,'opted_in')`,
    [crewConsentId, accountId, crewPhone],
  );
  await client.query(
    `insert into public.sms_consent_scopes(account_id,phone_number,consent_scope)
     values($1,$2,'crew')`,
    [accountId, crewPhone],
  );
  await client.query(
    `update public.sms_webhook_receipts set from_number=$2 where id=$1`,
    [receiptId, crewPhone],
  );
  await client.query(
    `update public.sms_messages set phone_number=$2 where id=$1`,
    [existingSharedMessageId, crewPhone],
  );
  const crewNoAction = await callAuthorized();
  const crewMutation = await callAuthorized({
    intent: 'append_internal_note',
    params: { job_id: randomUUID(), note: 'must not run' },
  });
  await client.query(
    `update public.crew set access_revoked_at=pg_catalog.now() where id=$1`,
    [crewId],
  );
  const revokedCrew = await callAuthorized();
  await client.query(
    `update public.crew set access_revoked_at=null where id=$1`,
    [crewId],
  );
  await client.query(
    `insert into public.crew(id,account_id,name,phone)
     values($1,$2,'Duplicate Harness Crew',$3)`,
    [duplicateCrewId, accountId, crewPhone],
  );
  const ambiguousCrew = await callAuthorized();
  await client.query(`delete from public.crew where id=$1`, [duplicateCrewId]);
  check(
    'one live crew identity may finalize only no_action while mutations, revocation, and ambiguity fail closed',
    crewNoAction.errorCode === null
      && crewNoAction.outcome?.delegated === true
      && crewMutation.errorCode === '42501'
      && revokedCrew.errorCode === '28000'
      && ambiguousCrew.errorCode === '28000',
    JSON.stringify({ crewNoAction, crewMutation, revokedCrew, ambiguousCrew }),
  );
  await client.query(
    `update public.sms_webhook_receipts set from_number=$2 where id=$1`,
    [receiptId, ownerPhone],
  );
  await client.query(
    `update public.sms_messages set phone_number=$2 where id=$1`,
    [existingSharedMessageId, ownerPhone],
  );

  const exactTaskCompletion = await callAuthorized({
    intent: 'complete_job_task',
    params: { job_id: randomUUID(), title: '%' },
  });
  const validCost = await callAuthorized({
    intent: 'log_cost',
    params: { job_id: randomUUID(), amount: 45.5, cost_type: 'receipt' },
  });
  const stringCost = await callAuthorized({
    intent: 'log_cost',
    params: { job_id: randomUUID(), amount: '45.5', cost_type: 'receipt' },
  });
  const zeroCost = await callAuthorized({
    intent: 'log_cost',
    params: { job_id: randomUUID(), amount: 0, cost_type: 'receipt' },
  });
  const oversizedCost = await callAuthorized({
    intent: 'log_cost',
    params: { job_id: randomUUID(), amount: 1_000_000.01, cost_type: 'receipt' },
  });
  const invalidCostType = await callAuthorized({
    intent: 'log_cost',
    params: { job_id: randomUUID(), amount: 45.5, cost_type: 'equipment' },
  });
  check(
    'fresh rail denies fuzzy task completion and validates bounded typed costs',
    exactTaskCompletion.errorCode === '42501'
      && validCost.errorCode === null
      && validCost.outcome?.delegated === true
      && stringCost.errorCode === '22023'
      && zeroCost.errorCode === '22023'
      && oversizedCost.errorCode === '22023'
      && invalidCostType.errorCode === '22023',
    JSON.stringify({
      exactTaskCompletion,
      validCost,
      stringCost,
      zeroCost,
      oversizedCost,
      invalidCostType,
    }),
  );

  const wrapperDefinition = one(await client.query(
    `select pg_catalog.pg_get_functiondef(
       'public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)'::pg_catalog.regprocedure
     ) as definition`,
  )).definition;
  const senderConsentLockAt = wrapperDefinition.indexOf('sms-sender-consent:');
  const accountRecipientLockAt = wrapperDefinition.indexOf('sms_inbound_recipient_lock_key');
  const delegateAt = wrapperDefinition.indexOf('apply_owner_field_action');
  check(
    'wrapper retains task-first row locking and canonical advisory lock order',
    /FOR UPDATE/i.test(wrapperDefinition)
      && /FROM public\.sms_webhook_receipts[\s\S]*FOR SHARE/i.test(wrapperDefinition)
      && /FROM public\.sms_messages[\s\S]*FOR SHARE/i.test(wrapperDefinition)
      && senderConsentLockAt >= 0
      && accountRecipientLockAt > senderConsentLockAt
      && delegateAt > accountRecipientLockAt,
    JSON.stringify({ senderConsentLockAt, accountRecipientLockAt, delegateAt }),
  );

  const noticeDefinition = one(await client.query(
    `select pg_catalog.pg_get_functiondef(
       'public.record_sms_shared_notice_reply(uuid,text,text)'::pg_catalog.regprocedure
     ) as definition`,
  )).definition;
  const noticeSenderLockAt = noticeDefinition.indexOf('sms-sender-consent:');
  const noticeRecipientLockAt = noticeDefinition.indexOf('sms_inbound_recipient_lock_key');
  const noticePreferenceReadAt = noticeDefinition.toLowerCase().indexOf(
    'from public.sms_sender_keyword_preferences',
  );
  const noticeInsertAt = noticeDefinition.indexOf('insert into public.sms_shared_notice_replies');
  check(
    'courtesy claim locks exact consent state before its immutable insert',
    /FROM public\.sms_webhook_receipts[\s\S]*FOR SHARE/i.test(noticeDefinition)
      && /FROM public\.sms_sender_numbers[\s\S]*FOR SHARE/i.test(noticeDefinition)
      && noticeSenderLockAt >= 0
      && noticeRecipientLockAt > noticeSenderLockAt
      && noticePreferenceReadAt > noticeRecipientLockAt
      && noticeInsertAt > noticePreferenceReadAt
      && noticeDefinition.includes('v_effective_egress_result = \'twiml\''),
    JSON.stringify({
      noticeSenderLockAt,
      noticeRecipientLockAt,
      noticePreferenceReadAt,
      noticeInsertAt,
    }),
  );

  const backfill = await client.query(
    `select id,inbox_visible from public.sms_messages
      where id = any($1::uuid[])`,
    [[
      existingSharedMessageId,
      existingDispatchMessageId,
      existingDedicatedMessageId,
      existingNullMessageId,
    ]],
  );
  const visibilityById = new Map(
    backfill.rows.map((row) => [row.id, row.inbox_visible]),
  );
  check(
    'existing shared and dispatch rows are hidden while dedicated and null rows stay visible',
    visibilityById.get(existingSharedMessageId) === false
      && visibilityById.get(existingDispatchMessageId) === false
      && visibilityById.get(existingDedicatedMessageId) === true
      && visibilityById.get(existingNullMessageId) === true,
    JSON.stringify(Object.fromEntries(visibilityById)),
  );

  const insertedIds = {
    shared: randomUUID(),
    dispatch: randomUUID(),
    dedicated: randomUUID(),
    legacy: randomUUID(),
  };
  await client.query(
    `insert into public.sms_messages(
       id,account_id,phone_number,direction,body,sender_number_id,inbox_visible
     ) values
       ($1,$5,'+18103042101','inbound','new shared command',$6,true),
       ($2,$5,'+18103042102','inbound','new dispatch reply',$7,true),
       ($3,$5,'+18103042103','inbound','new dedicated reply',$8,false),
       ($4,$5,'+18103042104','inbound','new legacy reply',null,false)`,
    [
      insertedIds.shared,
      insertedIds.dispatch,
      insertedIds.dedicated,
      insertedIds.legacy,
      accountId,
      sharedSenderId,
      dispatchSenderId,
      dedicatedSenderId,
    ],
  );
  const inserted = await client.query(
    `select id,inbox_visible from public.sms_messages
      where id = any($1::uuid[])`,
    [[insertedIds.shared, insertedIds.dispatch, insertedIds.dedicated, insertedIds.legacy]],
  );
  const insertedVisibility = new Map(
    inserted.rows.map((row) => [row.id, row.inbox_visible]),
  );
  check(
    'new shared and dispatch inserts are hidden and dedicated or null inserts are visible',
    insertedVisibility.get(insertedIds.shared) === false
      && insertedVisibility.get(insertedIds.dispatch) === false
      && insertedVisibility.get(insertedIds.dedicated) === true
      && insertedVisibility.get(insertedIds.legacy) === true,
    JSON.stringify(Object.fromEntries(insertedVisibility)),
  );

  const policyRows = await client.query(
    `select policyname,cmd,permissive
       from pg_catalog.pg_policies
      where schemaname='public' and tablename='sms_messages'
      order by policyname`,
  );
  const policyShape = policyRows.rows.map((row) => `${row.policyname}:${row.cmd}:${row.permissive}`);
  check(
    'sms_messages has only command-specific policies and no permissive ALL bypass',
    policyShape.join(',') === [
      'sms_messages_delete:DELETE:PERMISSIVE',
      'sms_messages_insert:INSERT:PERMISSIVE',
      'sms_messages_select:SELECT:PERMISSIVE',
      'sms_messages_update:UPDATE:PERMISSIVE',
    ].join(','),
    policyShape.join(','),
  );

  const officeInsertId = randomUUID();
  let officeVisibility;
  await client.query('set role authenticated');
  try {
    const visibleRead = one(await client.query(
      `select pg_catalog.count(*)::integer as count
         from public.sms_messages where id=$1`,
      [insertedIds.legacy],
    ));
    const hiddenRead = one(await client.query(
      `select pg_catalog.count(*)::integer as count
         from public.sms_messages where id=$1`,
      [insertedIds.shared],
    ));
    const visibleUpdate = await client.query(
      `update public.sms_messages set read_at=pg_catalog.now()
        where id=$1 returning id`,
      [insertedIds.legacy],
    );
    const hiddenUpdate = await client.query(
      `update public.sms_messages set read_at=pg_catalog.now()
        where id=$1 returning id`,
      [insertedIds.shared],
    );
    const hiddenDelete = await client.query(
      `delete from public.sms_messages where id=$1 returning id`,
      [insertedIds.shared],
    );
    const officeInsert = one(await client.query(
      `insert into public.sms_messages(id,account_id,phone_number,direction,body)
       values($1,$2,'+18103042199','outbound','office-authored customer message')
       returning inbox_visible`,
      [officeInsertId, accountId],
    ));
    officeVisibility = {
      visibleRead: visibleRead.count,
      hiddenRead: hiddenRead.count,
      visibleUpdate: visibleUpdate.rowCount,
      hiddenUpdate: hiddenUpdate.rowCount,
      hiddenDelete: hiddenDelete.rowCount,
      officeInsert: officeInsert.inbox_visible,
    };
  } finally {
    await client.query('reset role');
  }
  check(
    'office RLS reads and mutates visible rows but cannot see, update, or delete hidden rows',
    officeVisibility.visibleRead === 1
      && officeVisibility.hiddenRead === 0
      && officeVisibility.visibleUpdate === 1
      && officeVisibility.hiddenUpdate === 0
      && officeVisibility.hiddenDelete === 0
      && officeVisibility.officeInsert === true,
    JSON.stringify(officeVisibility),
  );

  const sharedOverride = one(await client.query(
    `update public.sms_messages set inbox_visible=true where id=$1
      returning inbox_visible`,
    [insertedIds.shared],
  ));
  const dedicatedOverride = one(await client.query(
    `update public.sms_messages set inbox_visible=false where id=$1
      returning inbox_visible`,
    [insertedIds.dedicated],
  ));
  check(
    'direct inbox_visible overrides are corrected at the table boundary',
    sharedOverride.inbox_visible === false && dedicatedOverride.inbox_visible === true,
    JSON.stringify({ sharedOverride, dedicatedOverride }),
  );

  const switchedToShared = one(await client.query(
    `update public.sms_messages set sender_number_id=$2 where id=$1
      returning inbox_visible`,
    [insertedIds.dedicated, sharedSenderId],
  ));
  const switchedToNull = one(await client.query(
    `update public.sms_messages set sender_number_id=null where id=$1
      returning inbox_visible`,
    [insertedIds.dedicated],
  ));
  check(
    'changing sender identity re-derives visibility',
    switchedToShared.inbox_visible === false && switchedToNull.inbox_visible === true,
    JSON.stringify({ switchedToShared, switchedToNull }),
  );

  const hydratedMessageId = randomUUID();
  const hydratedProviderId = 'signalwire-hydration-check';
  await client.query(
    `insert into public.sms_events(
       id,account_id,provider_id,provider,sender_number_id
     ) values($1,$2,$3,'signalwire',$4)`,
    [hydratedMessageId, accountId, hydratedProviderId, sharedSenderId],
  );
  const hydrated = one(await client.query(
    `insert into public.sms_messages(
       id,account_id,phone_number,direction,body,provider_id,inbox_visible
     ) values($1,$2,'+18103042105','outbound','hydrated event mirror',$3,true)
     returning sms_event_id,provider,sender_number_id,inbox_visible`,
    [hydratedMessageId, accountId, hydratedProviderId],
  ));
  check(
    'provider identity hydrates before visibility is derived',
    hydrated.sms_event_id === hydratedMessageId
      && hydrated.provider === 'signalwire'
      && hydrated.sender_number_id === sharedSenderId
      && hydrated.inbox_visible === false,
    JSON.stringify(hydrated),
  );

  const triggerOrder = await client.query(
    `select t.tgname
       from pg_catalog.pg_trigger t
      where t.tgrelid='public.sms_messages'::pg_catalog.regclass
        and not t.tgisinternal
      order by t.tgname`,
  );
  check(
    'provider and visibility guards retain deterministic trigger order',
    triggerOrder.rows.map((row) => row.tgname).join(',')
      === 'sms_messages_provider_identity_guard,sms_messages_visibility_from_sender_guard',
    triggerOrder.rows.map((row) => row.tgname).join(','),
  );

  const preservedTask = one(await client.query(
    `select t.id as task_id,t.sms_message_id,m.inbox_visible
       from public.sms_inbound_action_tasks t
       join public.sms_messages m on m.id=t.sms_message_id
      where t.id=$1`,
    [taskId],
  ));
  let deleteErrorCode = null;
  try {
    await client.query('delete from public.sms_messages where id=$1', [existingSharedMessageId]);
  } catch (error) {
    deleteErrorCode = error?.code ?? 'unknown';
  }
  check(
    'existing field task keeps its hidden message FK intact',
    preservedTask.task_id === taskId
      && preservedTask.sms_message_id === existingSharedMessageId
      && preservedTask.inbox_visible === false
      && deleteErrorCode === '23503',
    JSON.stringify({ preservedTask, deleteErrorCode }),
  );

  const columnContract = one(await client.query(
    `select a.attnotnull,
            pg_catalog.pg_get_expr(d.adbin,d.adrelid) as column_default
       from pg_catalog.pg_attribute a
       left join pg_catalog.pg_attrdef d
         on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.sms_messages'::pg_catalog.regclass
        and a.attname='inbox_visible'`,
  ));
  check(
    'inbox_visible is non-null with a true default',
    columnContract.attnotnull === true && columnContract.column_default === 'true',
    JSON.stringify(columnContract),
  );

  const leaseBefore = one(await client.query(
    `select lease_expires_at from public.sms_inbound_action_tasks where id=$1`,
    [taskId],
  ));
  const deniedLeaseCall = async (role) => {
    let errorCode = null;
    await client.query(`set role ${role}`);
    try {
      await client.query(
        `select public.extend_sms_inbound_action_field_lease($1,$2) as extended`,
        [taskId, claimToken],
      );
    } catch (error) {
      errorCode = error?.code ?? 'unknown';
    } finally {
      await client.query('reset role');
    }
    return errorCode;
  };
  const anonLeaseErrorCode = await deniedLeaseCall('anon');
  const authenticatedLeaseErrorCode = await deniedLeaseCall('authenticated');

  await client.query('set role service_role');
  let wrongLease;
  let rightLease;
  try {
    wrongLease = one(await client.query(
      `select public.extend_sms_inbound_action_field_lease($1,$2) as extended`,
      [taskId, randomUUID()],
    ));
    rightLease = one(await client.query(
      `select public.extend_sms_inbound_action_field_lease($1,$2) as extended`,
      [taskId, claimToken],
    ));
  } finally {
    await client.query('reset role');
  }
  const leaseAfter = one(await client.query(
    `select lease_expires_at,
            lease_expires_at >= pg_catalog.now() + interval '5 minutes 50 seconds' as safely_extended
       from public.sms_inbound_action_tasks where id=$1`,
    [taskId],
  ));
  check(
    'only the live claim token extends the field lease beyond five minutes',
    anonLeaseErrorCode === '42501'
      && authenticatedLeaseErrorCode === '42501'
      && wrongLease.extended === false
      && rightLease.extended === true
      && Date.parse(leaseAfter.lease_expires_at) > Date.parse(leaseBefore.lease_expires_at)
      && leaseAfter.safely_extended === true,
    JSON.stringify({
      anonLeaseErrorCode,
      authenticatedLeaseErrorCode,
      wrongLease,
      rightLease,
      leaseBefore,
      leaseAfter,
    }),
  );

  const security = one(await client.query(
    `select
       has_function_privilege('anon',
         'public.derive_sms_message_inbox_visibility()','execute') as anon_exec,
       has_function_privilege('authenticated',
         'public.derive_sms_message_inbox_visibility()','execute') as authenticated_exec,
       has_function_privilege('service_role',
         'public.derive_sms_message_inbox_visibility()','execute') as service_exec,
       has_function_privilege('anon',
         'public.extend_sms_inbound_action_field_lease(uuid,uuid)','execute') as anon_lease_exec,
       has_function_privilege('authenticated',
          'public.extend_sms_inbound_action_field_lease(uuid,uuid)','execute') as authenticated_lease_exec,
       has_function_privilege('service_role',
          'public.extend_sms_inbound_action_field_lease(uuid,uuid)','execute') as service_lease_exec,
       has_function_privilege('anon',
          'public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)','execute') as anon_authorized_exec,
       has_function_privilege('authenticated',
          'public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)','execute') as authenticated_authorized_exec,
       has_function_privilege('service_role',
          'public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)','execute') as service_authorized_exec,
       has_function_privilege('anon',
          'public.record_sms_shared_notice_reply(uuid,text,text)','execute') as anon_notice_exec,
       has_function_privilege('authenticated',
          'public.record_sms_shared_notice_reply(uuid,text,text)','execute') as authenticated_notice_exec,
       has_function_privilege('service_role',
          'public.record_sms_shared_notice_reply(uuid,text,text)','execute') as service_notice_exec,
       has_function_privilege('service_role',
          'public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)','execute') as legacy_rollout_exec`,
  ));
  check(
    'internal trigger stays private and authorized worker RPCs are service-role only',
    security.anon_exec === false
      && security.authenticated_exec === false
      && security.service_exec === false
      && security.anon_lease_exec === false
      && security.authenticated_lease_exec === false
      && security.service_lease_exec === true
      && security.anon_authorized_exec === false
      && security.authenticated_authorized_exec === false
      && security.service_authorized_exec === true
      && security.anon_notice_exec === false
      && security.authenticated_notice_exec === false
      && security.service_notice_exec === true
      && security.legacy_rollout_exec === true,
    JSON.stringify(security),
  );
} catch (error) {
  check(
    'PostgreSQL 17 harness ran to completion',
    false,
    error instanceof Error
      ? JSON.stringify({
          message: error.message,
          code: error.code ?? null,
          detail: error.detail ?? null,
          where: error.where ?? null,
        })
      : String(error),
  );
} finally {
  const cleanupErrors = [];
  if (client) {
    try {
      await bounded('close PostgreSQL client', 5_000, () => client.end());
    } catch (error) {
      cleanupErrors.push(errorText(error));
    }
  }

  const stopped = await stopPostgresBounded(pg);
  cleanupErrors.push(...stopped.details);
  if (stopped.ok) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(errorText(error));
    }
  } else {
    cleanupErrors.push(`left disposable cluster at ${dataDir}`);
  }
  check(
    'disposable PostgreSQL process and data directory are cleaned up',
    stopped.ok && !existsSync(dataDir),
    cleanupErrors.join('; '),
  );
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (checks.length < 12) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
