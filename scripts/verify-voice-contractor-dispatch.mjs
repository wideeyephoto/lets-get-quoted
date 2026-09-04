// Verify 20260903215831_voice_contractor_dispatch_hardening.sql against a
// disposable PostgreSQL 17 cluster. The harness defines only the migration's
// prerequisite roles, extension, schemas, tables, and enum. It never reads a
// hosted database URL or calls an external service.

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

const MIGRATION = 'migrations/20260903215831_voice_contractor_dispatch_hardening.sql';
const PORT = Number(process.env.LGQ_VOICE_CONTRACTOR_DISPATCH_CHECK_PORT || 54379);
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
  return new Promise((resolveExit) => child.once('exit', resolveExit));
}

// embedded-postgres uses taskkill internally on Windows. Sandbox-restricted
// process APIs can leave that call waiting forever, so prefer PostgreSQL's own
// bounded shutdown and retain a force-stop fallback.
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
      child.kill('SIGKILL');
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

const platformPackage = process.platform === 'win32'
  ? 'windows-x64'
  : process.platform === 'darwin'
    ? 'darwin-arm64'
    : 'linux-x64';
const bin = join(process.cwd(), 'node_modules', '@embedded-postgres', platformPackage, 'native', 'bin');
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
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;

create type public.job_status as enum ('new_lead', 'in_progress', 'complete');

create table auth.users (
  id uuid primary key,
  phone text
);

create table public.accounts (
  id uuid primary key,
  business_name text not null,
  suspended_at timestamptz,
  alert_phone text,
  call_forward_number text,
  call_tracking_number text,
  ai_voice_route_revision bigint not null default 0,
  default_burden_pct numeric not null default 0
);

create table public.memberships (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  deactivated_at timestamptz,
  unique (account_id, user_id)
);

create table public.crew (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  phone text not null,
  role_label text not null default 'Laborer',
  hourly_rate numeric(10,2) not null default 0,
  burden_pct numeric,
  user_id uuid references auth.users(id) on delete set null,
  last_signed_in_at timestamptz,
  active boolean not null default true,
  deleted_at timestamptz,
  access_revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create table public.sites (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  company_name text not null,
  phone text
);

create table public.voice_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  transfer_number text
);

create table public.clients (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  notes text,
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.jobs (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  ref text not null,
  client_name text not null,
  client_id uuid references public.clients(id) on delete set null,
  scope text,
  status public.job_status not null default 'in_progress',
  scheduled_for date,
  scheduled_time time,
  quote_items jsonb,
  quoted_amount numeric(12,2) not null default 0,
  deleted_at timestamptz,
  unique (account_id, ref)
);

create table public.crew_assignments (
  job_id uuid not null references public.jobs(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  assigned_at timestamptz not null default pg_catalog.now(),
  primary key (job_id, crew_id)
);

create table public.leads (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  source text not null,
  status text not null default 'new',
  name text,
  phone text,
  email text,
  address text,
  project_type text,
  message text,
  source_page text,
  triage jsonb,
  quote_visit jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.sms_sender_numbers (
  id uuid primary key,
  provider text not null,
  e164_number text not null,
  provider_number_id text,
  purpose text not null,
  account_id uuid references public.accounts(id) on delete restrict,
  provisioning_status text not null,
  assignment_state text not null,
  inbound_ready boolean not null,
  activated_at timestamptz,
  suspended_at timestamptz
);

create table public.voice_call_admissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  provider_call_id text not null,
  reservation_id uuid,
  reserved_minutes integer not null default 0,
  admission_state text not null default 'admitted',
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  dialed_number text,
  route_revision bigint,
  admitted_at timestamptz not null default pg_catalog.now(),
  unique (provider, provider_call_id)
);

create table public.voice_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null,
  provider_call_id text not null
);

create table public.costs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  type text not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null,
  crew_id uuid references public.crew(id) on delete set null,
  crew_name text,
  crew_role_label text,
  hours numeric(8,2),
  rate numeric(10,2),
  burden_amount numeric(12,2),
  cost_source text,
  created_at timestamptz not null default pg_catalog.now()
);

create table public.change_orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  crew_id uuid references public.crew(id) on delete set null,
  crew_name text,
  status text not null default 'draft',
  title text not null,
  field_note text not null default '',
  scope text not null default '',
  created_at timestamptz not null default pg_catalog.now()
);

create table public.job_feed (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null,
  title text,
  body text check (body is distinct from 'force rollback'),
  author text,
  meta jsonb,
  visibility text not null default 'internal',
  source_table text,
  source_id uuid,
  created_at timestamptz not null default pg_catalog.now()
);
`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-voice-contractor-dispatch-pg17-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
});

let client;
let fatalError = null;

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice_contractor_dispatch_check');

  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'lgq_voice_contractor_dispatch_check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query(baseSchema);

  const migrationSql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
  await client.query(migrationSql);
  await client.query(migrationSql);
  check('migration applies idempotently on PostgreSQL 17', true);

  const privilege = one(await client.query(`
    select
      pg_catalog.has_function_privilege(
        'service_role',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as service_action_rpc,
      pg_catalog.has_function_privilege(
        'anon',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as anon_action_rpc,
      pg_catalog.has_function_privilege(
        'authenticated',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as authenticated_action_rpc,
      pg_catalog.has_function_privilege(
        'service_role',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as service_admission_rpc,
      pg_catalog.has_function_privilege(
        'anon',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as anon_admission_rpc,
      pg_catalog.has_function_privilege(
        'authenticated',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as authenticated_admission_rpc,
      (
        pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'SELECT')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'INSERT')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'UPDATE')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'DELETE')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'TRUNCATE')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'REFERENCES')
        or pg_catalog.has_table_privilege('service_role', 'public.voice_tool_actions', 'TRIGGER')
      ) as service_table_any,
      (
        pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'SELECT')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'INSERT')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'UPDATE')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'DELETE')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'TRUNCATE')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'REFERENCES')
        or pg_catalog.has_table_privilege('anon', 'public.voice_tool_actions', 'TRIGGER')
      ) as anon_table_any,
      (
        pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'INSERT')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'UPDATE')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'DELETE')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'TRUNCATE')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'REFERENCES')
        or pg_catalog.has_table_privilege('authenticated', 'public.voice_tool_actions', 'TRIGGER')
      ) as authenticated_table_any,
      c.relrowsecurity,
      c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_tool_actions'
  `));
  check(
    'voice admission and contractor-action RPCs are service-role only',
    privilege.service_action_rpc
      && !privilege.anon_action_rpc
      && !privilege.authenticated_action_rpc
      && privilege.service_admission_rpc
      && !privilege.anon_admission_rpc
      && !privilege.authenticated_admission_rpc,
    JSON.stringify({
      action: {
        service: privilege.service_action_rpc,
        anon: privilege.anon_action_rpc,
        authenticated: privilege.authenticated_action_rpc,
      },
      admission: {
        service: privilege.service_admission_rpc,
        anon: privilege.anon_admission_rpc,
        authenticated: privilege.authenticated_admission_rpc,
      },
    }),
  );
  check(
    'action ledger is force-RLS and has no direct table grants',
    privilege.relrowsecurity
      && privilege.relforcerowsecurity
      && !privilege.service_table_any
      && !privilege.anon_table_any
      && !privilege.authenticated_table_any,
    JSON.stringify({
      rls: privilege.relrowsecurity,
      forceRls: privilege.relforcerowsecurity,
      serviceAny: privilege.service_table_any,
      anonAny: privilege.anon_table_any,
      authenticatedAny: privilege.authenticated_table_any,
    }),
  );

  const accountA = randomUUID();
  const accountB = randomUUID();
  const senderA = randomUUID();
  const senderB = randomUUID();
  const clientA = randomUUID();
  const jobA = randomUUID();
  const unassignedJobA = randomUUID();
  const jobB = randomUUID();
  const leadA = randomUUID();
  const leadB = randomUUID();
  const crossTenantCrew = randomUUID();
  const ambiguousCrewA = randomUUID();
  const ambiguousCrewB = randomUUID();
  const revokedCrew = randomUUID();
  const fieldCrew = randomUUID();
  const coworkerCrew = randomUUID();
  const ownerPhoneA = '+18105550101';
  const ownerPhoneB = '+12485550102';
  const ambiguousPhone = '+18105550112';
  const revokedPhone = '+18105550113';
  const fieldCrewPhone = '+18105550114';
  const numberA = '+12485550141';
  const numberB = '+12485550142';

  const calls = {
    authorized: `call-authorized-${randomUUID()}`,
    mismatch: `call-mismatch-${randomUUID()}`,
    ambiguous: `call-ambiguous-${randomUUID()}`,
    revoked: `call-revoked-${randomUUID()}`,
    crossJob: `call-cross-job-${randomUUID()}`,
    crossCrew: `call-cross-crew-${randomUUID()}`,
    crossLead: `call-cross-lead-${randomUUID()}`,
    atomic: `call-atomic-${randomUUID()}`,
    fieldAllowed: `call-field-allowed-${randomUUID()}`,
    fieldUnassigned: `call-field-unassigned-${randomUUID()}`,
    fieldCoworkerLabor: `call-field-coworker-labor-${randomUUID()}`,
    fieldCoworkerChange: `call-field-coworker-change-${randomUUID()}`,
    fieldLead: `call-field-lead-${randomUUID()}`,
    fieldJobDetails: `call-field-job-details-${randomUUID()}`,
  };

  await client.query(
    `insert into public.accounts(
       id,business_name,alert_phone,call_tracking_number,ai_voice_route_revision,default_burden_pct
     ) values
       ($1,'Workspace A',$3,$5,0,20),
       ($2,'Workspace B',$4,$6,0,15)`,
    [accountA, accountB, ownerPhoneA, ownerPhoneB, numberA, numberB],
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,e164_number,provider_number_id,purpose,account_id,
       provisioning_status,assignment_state,inbound_ready,activated_at
     ) values
       ($1,'signalwire',$5,$7,'contractor_dedicated',$3,'active','assigned',true,pg_catalog.now()),
       ($2,'signalwire',$6,$8,'contractor_dedicated',$4,'active','assigned',true,pg_catalog.now())`,
    [senderA, senderB, accountA, accountB, numberA, numberB, randomUUID(), randomUUID()],
  );
  await client.query(
    `insert into public.clients(id,account_id,name) values($1,$2,'Exact Client')`,
    [clientA, accountA],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,client_id,scope,status,quoted_amount)
     values
       ($1,$3,'JOB-A-100','Exact Client',$5,'Original scope','in_progress',100),
       ($2,$4,'JOB-B-200','Other Tenant Client',null,'Tenant B scope','in_progress',50)`,
    [jobA, jobB, accountA, accountB, clientA],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,scope,status,quoted_amount)
     values($1,$2,'JOB-A-UNASSIGNED','Unassigned Client','Unassigned scope','in_progress',25)`,
    [unassignedJobA, accountA],
  );
  await client.query(
    `insert into public.leads(id,account_id,source,status,name,message)
     values
       ($1,$3,'manual','new','Workspace A Lead','A'),
       ($2,$4,'manual','new','Workspace B Lead','B')`,
    [leadA, leadB, accountA, accountB],
  );
  await client.query(
    `insert into public.crew(
       id,account_id,name,phone,role_label,hourly_rate,burden_pct,active,
       deleted_at,access_revoked_at,phone_verified,phone_verified_at
     ) values
       ($1,$5,'Ambiguous One',$7,'Tech',40,10,true,null,null,true,pg_catalog.now()),
       ($2,$5,'Ambiguous Two',$7,'Tech',42,10,true,null,null,true,pg_catalog.now()),
       ($3,$5,'Revoked Tech',$8,'Tech',45,10,true,null,pg_catalog.now(),true,pg_catalog.now()),
       ($4,$6,'Other Tenant Crew','+12485550122','Tech',50,10,true,null,null,true,pg_catalog.now())`,
    [
      ambiguousCrewA,
      ambiguousCrewB,
      revokedCrew,
      crossTenantCrew,
      accountA,
      accountB,
      ambiguousPhone,
      revokedPhone,
    ],
  );
  await client.query(
    `insert into public.crew(
       id,account_id,name,phone,role_label,hourly_rate,burden_pct,active,
       deleted_at,access_revoked_at,phone_verified,phone_verified_at
     ) values
       ($1,$3,'Assigned Field Tech',$4,'Tech',48,10,true,null,null,true,pg_catalog.now()),
       ($2,$3,'Coworker Tech',$5,'Tech',46,10,true,null,null,true,pg_catalog.now())`,
    [fieldCrew, coworkerCrew, accountA, fieldCrewPhone, '+18105550115'],
  );
  await client.query(
    `insert into public.crew_assignments(job_id,crew_id,account_id) values($1,$2,$3)`,
    [jobA, fieldCrew, accountA],
  );

  const admissions = [
    [calls.authorized, ownerPhoneA, 'owner'],
    [calls.mismatch, ownerPhoneA, 'owner'],
    [calls.ambiguous, ambiguousPhone, 'crew'],
    [calls.revoked, revokedPhone, 'crew'],
    [calls.crossJob, ownerPhoneA, 'owner'],
    [calls.crossCrew, ownerPhoneA, 'owner'],
    [calls.crossLead, ownerPhoneA, 'owner'],
    [calls.atomic, ownerPhoneA, 'owner'],
    [calls.fieldAllowed, fieldCrewPhone, 'crew'],
    [calls.fieldUnassigned, fieldCrewPhone, 'crew'],
    [calls.fieldCoworkerLabor, fieldCrewPhone, 'crew'],
    [calls.fieldCoworkerChange, fieldCrewPhone, 'crew'],
    [calls.fieldLead, fieldCrewPhone, 'crew'],
    [calls.fieldJobDetails, fieldCrewPhone, 'crew'],
  ];
  for (const [providerCallId, callerNumber, callerKind] of admissions) {
    await client.query(
      `insert into public.voice_call_admissions(
         account_id,provider,provider_call_id,reserved_minutes,admission_state,
         sender_number_id,dialed_number,route_revision,caller_number,caller_kind
       ) values($1,'signalwire',$2,0,'admitted',$3,$4,0,$5,$6)`,
      [accountA, providerCallId, senderA, numberA, callerNumber, callerKind],
    );
  }

  const invoke = async ({
    role = 'service_role',
    providerCallId,
    callerNumber,
    functionName,
    targetJobId = null,
    targetLeadId = null,
    payload,
  }) => {
    let outcome = null;
    let errorCode = null;
    let message = null;
    await client.query(`set role ${role}`);
    try {
      const result = await client.query(
        `select public.apply_voice_contractor_action(
           $1,$2,$3,$4,$5,$6,$7::jsonb
         ) as outcome`,
        [
          accountA,
          providerCallId,
          callerNumber,
          functionName,
          targetJobId,
          targetLeadId,
          JSON.stringify(payload),
        ],
      );
      outcome = one(result).outcome;
    } catch (error) {
      errorCode = error?.code ?? 'unknown';
      message = error?.message ?? errorText(error);
    } finally {
      await client.query('reset role');
    }
    return { outcome, errorCode, message };
  };

  const directLedgerRead = async (role) => {
    let errorCode = null;
    await client.query(`set role ${role}`);
    try {
      await client.query('select id from public.voice_tool_actions limit 1');
    } catch (error) {
      errorCode = error?.code ?? 'unknown';
    } finally {
      await client.query('reset role');
    }
    return errorCode;
  };

  const unauthorizedRpc = await invoke({
    role: 'anon',
    providerCallId: calls.authorized,
    callerNumber: ownerPhoneA,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'Browser must not write this' },
  });
  check('anon cannot invoke contractor mutation RPC', unauthorizedRpc.errorCode === '42501', unauthorizedRpc.errorCode ?? 'no error');
  check('service_role cannot bypass the RPC to read the action ledger', await directLedgerRead('service_role') === '42501');
  check('authenticated cannot read the action ledger', await directLedgerRead('authenticated') === '42501');

  const exactPayload = { scope_append: 'Authorized exact scope' };
  const first = await invoke({
    providerCallId: calls.authorized,
    callerNumber: ownerPhoneA,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: exactPayload,
  });
  const replay = await invoke({
    providerCallId: calls.authorized,
    callerNumber: ownerPhoneA,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: exactPayload,
  });
  const exactState = one(await client.query(
    `select
       j.scope,
       (select pg_catalog.count(*)::integer from public.voice_tool_actions a
         where a.provider_call_id = $2) as action_count,
       (select pg_catalog.count(*)::integer from public.job_feed f
         where f.meta->>'providerCallId' = $2) as feed_count
     from public.jobs j where j.id = $1`,
    [jobA, calls.authorized],
  ));
  check(
    'authorized caller mutates only the exact job',
    first.errorCode === null
      && first.outcome?.replayed === false
      && first.outcome?.job_id === jobA
      && exactState.scope === 'Original scope\n\nAuthorized exact scope',
    first.errorCode ?? JSON.stringify(first.outcome),
  );
  check(
    'identical provider retry replays one durable action',
    replay.errorCode === null
      && replay.outcome?.replayed === true
      && replay.outcome?.action_id === first.outcome?.action_id
      && exactState.action_count === 1
      && exactState.feed_count === 1,
    replay.errorCode ?? JSON.stringify({ outcome: replay.outcome, state: exactState }),
  );

  const mismatch = await invoke({
    providerCallId: calls.mismatch,
    callerNumber: '+18105550199',
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'Mismatched caller write' },
  });
  const mismatchCount = one(await client.query(
    'select pg_catalog.count(*)::integer as count from public.voice_tool_actions where provider_call_id = $1',
    [calls.mismatch],
  )).count;
  check('caller must match the signed admission', mismatch.errorCode === '42501' && mismatchCount === 0, mismatch.errorCode ?? 'no error');

  const ambiguous = await invoke({
    providerCallId: calls.ambiguous,
    callerNumber: ambiguousPhone,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'Ambiguous caller write' },
  });
  const revoked = await invoke({
    providerCallId: calls.revoked,
    callerNumber: revokedPhone,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'Revoked caller write' },
  });
  const lifecycleCounts = one(await client.query(
    `select pg_catalog.count(*)::integer as count
       from public.voice_tool_actions
      where provider_call_id = any($1::text[])`,
    [[calls.ambiguous, calls.revoked]],
  )).count;
  check(
    'ambiguous live crew identity is denied',
    ambiguous.errorCode === '42501' && lifecycleCounts === 0,
    ambiguous.errorCode ?? 'no error',
  );
  check(
    'revoked crew identity is denied',
    revoked.errorCode === '42501' && lifecycleCounts === 0,
    revoked.errorCode ?? 'no error',
  );

  const fieldNote = 'Verified assigned technician reported a shutoff caution.';
  const fieldAllowed = await invoke({
    providerCallId: calls.fieldAllowed,
    callerNumber: fieldCrewPhone,
    functionName: 'append_job_caution_or_note',
    targetJobId: jobA,
    payload: { note: fieldNote, is_caution: true },
  });
  const fieldAllowedState = one(await client.query(
    `select
       (select notes from public.clients where id = $1) as client_notes,
       (select pg_catalog.count(*)::integer from public.voice_tool_actions
         where provider_call_id = $2) as action_count,
       (select pg_catalog.count(*)::integer from public.job_feed
         where meta->>'providerCallId' = $2) as feed_count`,
    [clientA, calls.fieldAllowed],
  ));
  check(
    'verified assigned crew caller succeeds on an allowed job action',
    fieldAllowed.errorCode === null
      && fieldAllowed.outcome?.job_id === jobA
      && fieldAllowed.outcome?.replayed === false
      && fieldAllowedState.client_notes?.includes(fieldNote)
      && fieldAllowedState.action_count === 1
      && fieldAllowedState.feed_count === 1,
    fieldAllowed.errorCode ?? JSON.stringify({ outcome: fieldAllowed.outcome, state: fieldAllowedState }),
  );

  const fieldUnassigned = await invoke({
    providerCallId: calls.fieldUnassigned,
    callerNumber: fieldCrewPhone,
    functionName: 'append_job_caution_or_note',
    targetJobId: unassignedJobA,
    payload: { note: 'Attempted unassigned note', is_caution: false },
  });
  const fieldCoworkerLabor = await invoke({
    providerCallId: calls.fieldCoworkerLabor,
    callerNumber: fieldCrewPhone,
    functionName: 'log_crew_time_and_materials',
    targetJobId: jobA,
    payload: { hours: 1.5, crew_id: coworkerCrew },
  });
  const fieldCoworkerChange = await invoke({
    providerCallId: calls.fieldCoworkerChange,
    callerNumber: fieldCrewPhone,
    functionName: 'create_job_change_order',
    targetJobId: jobA,
    payload: {
      crew_id: coworkerCrew,
      title: 'Attempted coworker change order',
      description: 'This must not be attributed to another technician.',
    },
  });
  const fieldLead = await invoke({
    providerCallId: calls.fieldLead,
    callerNumber: fieldCrewPhone,
    functionName: 'create_or_update_lead',
    targetLeadId: leadA,
    payload: { operation: 'update', name: 'Crew must not edit this lead' },
  });
  const fieldJobDetails = await invoke({
    providerCallId: calls.fieldJobDetails,
    callerNumber: fieldCrewPhone,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'Crew must not edit office job details' },
  });
  const fieldDeniedState = one(await client.query(
    `select
       (select scope from public.jobs where id = $1) as assigned_scope,
       (select scope from public.jobs where id = $2) as unassigned_scope,
       (select name from public.leads where id = $3) as lead_name,
       (select pg_catalog.count(*)::integer from public.costs) as cost_count,
       (select pg_catalog.count(*)::integer from public.change_orders) as change_order_count,
       (select pg_catalog.count(*)::integer from public.voice_tool_actions
         where provider_call_id = any($4::text[])) as denied_action_count`,
    [
      jobA,
      unassignedJobA,
      leadA,
      [
        calls.fieldUnassigned,
        calls.fieldCoworkerLabor,
        calls.fieldCoworkerChange,
        calls.fieldLead,
        calls.fieldJobDetails,
      ],
    ],
  ));
  check(
    'crew caller is denied on an unassigned same-account job',
    fieldUnassigned.errorCode === '42501'
      && fieldDeniedState.unassigned_scope === 'Unassigned scope'
      && fieldDeniedState.denied_action_count === 0,
    fieldUnassigned.errorCode ?? 'no error',
  );
  check(
    'crew caller cannot attribute labor to a coworker',
    fieldCoworkerLabor.errorCode === '42501'
      && fieldDeniedState.cost_count === 0
      && fieldDeniedState.denied_action_count === 0,
    fieldCoworkerLabor.errorCode ?? 'no error',
  );
  check(
    'crew caller cannot attribute a change order to a coworker',
    fieldCoworkerChange.errorCode === '42501'
      && fieldDeniedState.change_order_count === 0
      && fieldDeniedState.denied_action_count === 0,
    fieldCoworkerChange.errorCode ?? 'no error',
  );
  check(
    'crew caller cannot mutate lead office records',
    fieldLead.errorCode === '42501'
      && fieldDeniedState.lead_name === 'Workspace A Lead'
      && fieldDeniedState.denied_action_count === 0,
    fieldLead.errorCode ?? 'no error',
  );
  check(
    'crew caller cannot mutate job-detail office records',
    fieldJobDetails.errorCode === '42501'
      && fieldDeniedState.assigned_scope === 'Original scope\n\nAuthorized exact scope'
      && fieldDeniedState.denied_action_count === 0,
    fieldJobDetails.errorCode ?? 'no error',
  );

  const crossJob = await invoke({
    providerCallId: calls.crossJob,
    callerNumber: ownerPhoneA,
    functionName: 'update_job_details',
    targetJobId: jobB,
    payload: { scope_append: 'Cross-tenant job write' },
  });
  const crossCrew = await invoke({
    providerCallId: calls.crossCrew,
    callerNumber: ownerPhoneA,
    functionName: 'log_crew_time_and_materials',
    targetJobId: jobA,
    payload: { hours: 2, crew_id: crossTenantCrew },
  });
  const crossLead = await invoke({
    providerCallId: calls.crossLead,
    callerNumber: ownerPhoneA,
    functionName: 'create_or_update_lead',
    targetLeadId: leadB,
    payload: { operation: 'update', name: 'Cross-tenant lead write' },
  });
  const crossState = one(await client.query(
    `select
       (select scope from public.jobs where id = $1) as tenant_b_scope,
       (select name from public.leads where id = $2) as tenant_b_lead_name,
       (select pg_catalog.count(*)::integer from public.costs) as cost_count,
       (select pg_catalog.count(*)::integer from public.voice_tool_actions
         where provider_call_id = any($3::text[])) as action_count`,
    [jobB, leadB, [calls.crossJob, calls.crossCrew, calls.crossLead]],
  ));
  check(
    'cross-tenant job target is denied',
    crossJob.errorCode === 'P0002' && crossState.tenant_b_scope === 'Tenant B scope',
    crossJob.errorCode ?? 'no error',
  );
  check(
    'cross-tenant crew target is denied without a cost',
    crossCrew.errorCode === 'P0002' && crossState.cost_count === 0,
    crossCrew.errorCode ?? 'no error',
  );
  check(
    'cross-tenant lead target is denied',
    crossLead.errorCode === 'P0002' && crossState.tenant_b_lead_name === 'Workspace B Lead',
    crossLead.errorCode ?? 'no error',
  );
  check('cross-tenant failures leave no action-ledger rows', crossState.action_count === 0, String(crossState.action_count));

  const beforeAtomic = one(await client.query('select scope from public.jobs where id = $1', [jobA])).scope;
  const atomic = await invoke({
    providerCallId: calls.atomic,
    callerNumber: ownerPhoneA,
    functionName: 'update_job_details',
    targetJobId: jobA,
    payload: { scope_append: 'force rollback' },
  });
  const atomicState = one(await client.query(
    `select
       (select scope from public.jobs where id = $1) as scope,
       (select pg_catalog.count(*)::integer from public.voice_tool_actions
         where provider_call_id = $2) as action_count,
       (select pg_catalog.count(*)::integer from public.job_feed
         where meta->>'providerCallId' = $2) as feed_count`,
    [jobA, calls.atomic],
  ));
  check(
    'late feed failure rolls back the earlier job and ledger writes in a single transaction',
    atomic.errorCode === '23514'
      && atomicState.scope === beforeAtomic
      && atomicState.action_count === 0
      && atomicState.feed_count === 0,
    atomic.errorCode ?? JSON.stringify(atomicState),
  );
} catch (error) {
  fatalError = error;
  console.error(`FATAL  ${errorText(error)}`);
} finally {
  if (client) {
    try {
      await bounded('close PostgreSQL client', 5_000, () => client.end());
    } catch (error) {
      console.error(`CLEANUP  ${errorText(error)}`);
      if (!fatalError) fatalError = error;
    }
  }

  const stopped = await stopPostgresBounded(pg);
  if (!stopped.ok) {
    console.error(`CLEANUP  ${stopped.details.join('; ')}`);
    if (!fatalError) fatalError = new Error('PostgreSQL did not stop cleanly.');
  }

  const tempRoot = `${resolve(tmpdir())}${sep}`;
  const resolvedDataDir = resolve(dataDir);
  if (!resolvedDataDir.startsWith(tempRoot)) {
    const error = new Error(`Refusing to remove non-temporary data directory: ${resolvedDataDir}`);
    console.error(`CLEANUP  ${error.message}`);
    if (!fatalError) fatalError = error;
  } else {
    try {
      rmSync(resolvedDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`CLEANUP  ${errorText(error)}`);
      if (!fatalError) fatalError = error;
    }
  }
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0 || fatalError) process.exitCode = 1;
