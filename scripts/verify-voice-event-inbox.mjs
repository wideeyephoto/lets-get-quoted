/**
 * Prove the AI Voice receipt boundary against a real PostgreSQL 17.
 *
 * The receipt arrives with no signature and no authentication beyond dedicated
 * Basic credentials configured in SignalWire's post-prompt auth fields
 * (docs/ai-voice-v1-decisions.md §11). So the property under test is not "the
 * row was inserted". It is that a receipt LGQ cannot tie to a call it admitted
 * binds to NO workspace and reaches no ledger function — because that, and not
 * the transport, is what stops a leaked credential turning into an invoice.
 *
 * The payload used here is the one measured from a live scratch agent, trimmed
 * to the fields the boundary reads, so the shape is observed rather than
 * imagined.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.LGQ_VOICE_INBOX_PORT || 54343);
const PG_DEBUG = process.env.LGQ_PG17_DEBUG === '1';
const HARNESS_STARTED_AT = Date.now();

function errorText(value) {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}

function progress(message) {
  const elapsed = String(Date.now() - HARNESS_STARTED_AT).padStart(6);
  console.error(`[voice-pg17 +${elapsed}ms] ${message}`);
}

async function bounded(label, timeoutMs, action) {
  let timer;
  progress(`${label}: start`);
  try {
    const result = await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out after ${timeoutMs}ms`);
          error.code = 'LGQ_PG17_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
    progress(`${label}: done`);
    return result;
  } catch (error) {
    progress(`${label}: failed: ${errorText(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function embeddedLog(value) {
  if (!PG_DEBUG) return;
  for (const line of String(value).trimEnd().split(/\r?\n/)) {
    if (line) console.error(`[voice-pg17:postgres] ${line}`);
  }
}

function childExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child) {
  if (childExited(child)) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

async function stopPostgresBounded(instance) {
  const child = instance.process;
  const pid = child?.pid;
  const failures = [];

  if (childExited(child)) {
    if (instance.process === child) instance.process = undefined;
    return { ok: true, details: [] };
  }

  try {
    await bounded('stop PostgreSQL', 10_000, () => instance.stop());
    return { ok: true, details: [] };
  } catch (error) {
    progress(`normal PostgreSQL stop needs fallback: ${errorText(error)}`);
  }

  if (!childExited(child) && pid) {
    try {
      if (process.platform === 'win32') {
        await bounded('force-stop PostgreSQL process tree', 8_000, () =>
          execFileAsync('taskkill', ['/pid', String(pid), '/f', '/t'], {
            windowsHide: true,
          }));
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

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  os.userInfo();
} catch (error) {
  if (!(error && typeof error === 'object' && error.code === 'ERR_SYSTEM_ERROR')) throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
for (const dir of [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
]) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. To run this check:\n\n'
    + '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n',
  );
  process.exit(2);
}

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const LEDGER = m('20260815213142_pricing_entitlements.sql');
const INBOX = m('20260819120000_voice_event_inbox.sql');
const SETTINGS = m('20260819140000_voice_settings.sql');
const CALLS = m('20260819150000_voice_calls.sql');
const TRUNCATE_FIX = m('20260819160000_voice_settings_truncate.sql');
const HARDENING = m('20260821190000_voice_runtime_hardening.sql');
const ADMISSION_CONCURRENCY = m('20260821191000_voice_admission_concurrency.sql');
const DEDICATED_NUMBER_INVARIANT = m('20260821221223_voice_dedicated_number_invariant.sql');
const TRANSCRIPT_RETENTION = m('20260821230000_voice_transcript_retention.sql');

function liftTable(name) {
  const start = LEDGER.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`table ${name} not found`);
  const end = LEDGER.indexOf('\n);', start);
  return LEDGER.slice(start, end + 3);
}

/** The measured receipt, trimmed to what the boundary reads. */
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const PROJECT = '2687f308-939e-4e73-97bd-4edfc0d7fd5a';
const SPACE = '7e9a4752-2bfc-4cd1-a66f-fb3bd902a4ac';
const receipt = (over = {}) => ({
  project_id: PROJECT,
  space_id: SPACE,
  call_id: CALL,
  action: 'post_conversation',
  conversation_type: 'voice',
  call_start_date: 1787171665880654,
  call_answer_date: 1787171666607564,
  call_end_date: 1787171699845567,
  ai_start_date: 1787171667036808,
  ai_end_date: 1787171699843237,
  ...over,
});

const R = [];

function detailText(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function ck(n, ok, d) {
  const result = { n, ok: Boolean(ok), d };
  R.push(result);
  console.log(
    `${result.ok ? 'ok  ' : 'FAIL'} ${n}`
      + `${result.ok || d == null ? '' : `\n       ${detailText(d)}`}`,
  );
}
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-voicebox-'));
progress(`disposable cluster: ${dataDir}; port ${PORT}`);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: PORT, persistent: false, onLog: embeddedLog,
  onError: (value) => progress(`embedded PostgreSQL error: ${errorText(value)}`),
});

let c;
let c2;
try {
  await bounded('initialise PostgreSQL', 60_000, () => pg.initialise());
  await bounded('start PostgreSQL', 30_000, () => pg.start());
  await bounded('create lgq_voice database', 15_000,
    () => pg.createDatabase('lgq_voice'));

  const { Client } = await import('pg');
  const connection = {
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_voice', connectionTimeoutMillis: 10_000,
  };
  c = new Client({ ...connection, application_name: 'lgq-voice-control' });
  c2 = new Client({ ...connection, application_name: 'lgq-voice-concurrent' });
  await bounded('connect control client', 12_000, () => c.connect());
  await bounded('connect concurrent client', 12_000, () => c2.connect());
  for (const client of [c, c2]) {
    await client.query("set statement_timeout = '15s'");
    await client.query("set lock_timeout = '5s'");
  }
  const q = (sql, params) => c.query(sql, params);
  const q2 = (sql, params) => c2.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };
  const asRole = async (role, action) => {
    if (!['authenticated', 'service_role'].includes(role)) {
      throw new Error(`unsupported harness role: ${role}`);
    }
    await q(`set role ${role}`);
    try { return await action(); } finally { await q('reset role'); }
  };

  await q(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    create schema if not exists extensions;
    create schema if not exists auth;
    -- Reproduce Supabase's default privileges. Without this the harness creates
    -- tables with no grants at all, every "browser roles cannot write" check
    -- passes because the grant never existed, and the harness proves nothing
    -- about the environment it is standing in for. This line is what made the
    -- TRUNCATE checks below mean something.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create extension if not exists pgcrypto with schema extensions;
    create table auth.users (id uuid primary key);
    create table public.accounts (id uuid primary key);
    create table public.leads (id uuid primary key default gen_random_uuid());
    -- Lifted in shape from schema.sql: the settings policy is built on it.
    create table public.memberships (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null, user_id uuid not null, role text not null
    );
    create function auth.uid() returns uuid language sql stable as $u$
      select nullif(current_setting('lgq.actor', true), '')::uuid $u$;
    create function public.is_owner(acc uuid)
    returns boolean language sql stable security definer set search_path = public as $o$
      select exists (
        select 1 from memberships m
        where m.account_id = acc and m.user_id = auth.uid() and m.role = 'owner'
      ) $o$;
    create table public.billing_events (id uuid primary key, account_id uuid);
  `);
  for (const t of ['workspace_entitlements', 'usage_credit_lots', 'usage_reservations', 'usage_reservation_allocations']) {
    await q(liftTable(t));
  }
  await q('insert into public.accounts (id) values ($1)', [ACCOUNT]);
  progress('apply voice event inbox migration');
  await q(INBOX);
  ck('the inbox migration applies, post-conditions and all', true);

  const ingest = (payload, over = {}) => q(
    `select * from public.ingest_voice_event($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [over.callId ?? payload.call_id, over.type ?? 'post_conversation',
      over.project ?? payload.project_id, over.space ?? payload.space_id,
      PROJECT, SPACE, JSON.stringify(payload)]);

  // -------------------------------------------------------------------
  // 1. A receipt for a call nobody admitted. THE case this exists for.
  // -------------------------------------------------------------------
  const forged = (await ingest(receipt())).rows[0];
  ck('an unadmitted receipt binds to no workspace', forged.workspace_id === null, forged);
  ck('...and is marked not-admitted, so no settlement runs', forged.admitted === false, forged);
  ck('...but is still stored, because unexplained receipts are worth finding',
    (await q('select processing_status from public.voice_events where id = $1', [forged.voice_event_id]))
      .rows[0].processing_status === 'ignored');

  // -------------------------------------------------------------------
  // 2. A receipt for a call LGQ did admit.
  // -------------------------------------------------------------------
  const other = 'b26df1b1-bd88-4ff9-ce0f-6e0f617886cb';
  await q(`insert into public.voice_call_admissions
             (account_id, provider, provider_call_id, reserved_minutes)
           values ($1, 'signalwire', $2, 60)`, [ACCOUNT, other]);
  const good = (await ingest(receipt({ call_id: other }))).rows[0];
  ck('an admitted call resolves to its workspace', good.workspace_id === ACCOUNT, good);
  ck('...and is queued for settlement rather than ignored', good.admitted === true
    && (await q('select processing_status from public.voice_events where id = $1', [good.voice_event_id]))
      .rows[0].processing_status === 'received');

  // -------------------------------------------------------------------
  // 3. Replay. There is exactly one receipt per call, and it is money.
  // -------------------------------------------------------------------
  const again = (await ingest(receipt({ call_id: other }))).rows[0];
  ck('a byte-identical replay returns the same row and inserts nothing',
    again.inserted === false && again.voice_event_id === good.voice_event_id, again);
  ck('only one row exists for that call',
    Number((await q('select count(*)::int as n from public.voice_events where provider_call_id = $1', [other])).rows[0].n) === 1);

  const mutated = await fails(
    `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [other, 'post_conversation', PROJECT, SPACE, PROJECT, SPACE,
      JSON.stringify(receipt({ call_id: other, ai_end_date: 1787171799843237 }))]);
  ck('a receipt that CHANGED between deliveries is refused, not accepted as a retry',
    /different immutable input/.test(mutated ?? ''), mutated);

  // -------------------------------------------------------------------
  // 4. Identity checks -- nearly the only things checkable without a signature.
  // -------------------------------------------------------------------
  ck('a receipt from another SignalWire project is refused',
    /project does not match/.test(await fails(
      `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      ['c-1', 'post_conversation', 'someone-else', SPACE, PROJECT, SPACE,
        JSON.stringify(receipt({ call_id: 'c-1' }))]) ?? ''));
  ck('a receipt from another space is refused',
    /space does not match/.test(await fails(
      `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      ['c-2', 'post_conversation', PROJECT, 'someone-else', PROJECT, SPACE,
        JSON.stringify(receipt({ call_id: 'c-2' }))]) ?? ''));

  // -------------------------------------------------------------------
  // 5. Input the boundary must refuse rather than store.
  // -------------------------------------------------------------------
  ck('an unknown event type is refused by the FUNCTION as well as the table',
    /unsupported voice event type/.test(await fails(
      `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      ['c-3', 'call_started', PROJECT, SPACE, PROJECT, SPACE, JSON.stringify(receipt())]) ?? ''));
  ck('a blank call id is refused',
    /call id is required/.test(await fails(
      `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      ['   ', 'post_conversation', PROJECT, SPACE, PROJECT, SPACE, JSON.stringify(receipt())]) ?? ''));
  ck('a payload that is not an object is refused',
    /must be a JSON object/.test(await fails(
      `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      ['c-4', 'post_conversation', PROJECT, SPACE, PROJECT, SPACE, '[]']) ?? ''));

  // -------------------------------------------------------------------
  // 6. The dedupe key must not collide across event types on one call.
  // -------------------------------------------------------------------
  const stored = (await q(
    'select provider_event_id from public.voice_events where provider_call_id = $1', [other])).rows[0];
  ck('the dedupe key carries the event type, so a future type cannot collide',
    stored.provider_event_id === `${other}:post_conversation`, stored);

  // -------------------------------------------------------------------
  // 7. Reach. Payloads are full transcripts of a homeowner's phone call.
  // -------------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    ck(`${role} cannot read voice_events`,
      (await q('select has_table_privilege($1, $2, $3) as ok', [role, 'public.voice_events', 'SELECT']))
        .rows[0].ok === false);
    ck(`${role} cannot call the ingest RPC`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
        [role, 'public.ingest_voice_event(text,text,text,text,text,text,jsonb)', 'EXECUTE'])).rows[0].ok === false);
  }
  ck('service_role can call it, or the receipt route cannot work at all',
    (await q('select has_function_privilege($1, $2, $3) as ok',
      ['service_role', 'public.ingest_voice_event(text,text,text,text,text,text,jsonb)', 'EXECUTE'])).rows[0].ok === true);
  ck('row level security is on, with no policy, so a browser sees nothing',
    (await q(`select relrowsecurity from pg_class where relname = 'voice_events'`)).rows[0].relrowsecurity === true
    && Number((await q(`select count(*)::int as n from pg_policies where tablename = 'voice_events'`)).rows[0].n) === 0);

  // -------------------------------------------------------------------
  // 8b. Voice settings: the rule that must be unrepresentable.
  // -------------------------------------------------------------------
  progress('apply voice settings migration');
  await q(SETTINGS);
  ck('the settings migration applies, disclosure post-check included', true);

  const noDisclosure = await fails(
    `insert into public.voice_settings (account_id, recording_enabled) values ($1, true)`,
    [ACCOUNT]);
  ck('recording cannot be switched on without a disclosure',
    /voice_settings_recording_requires_disclosure/.test(noDisclosure ?? ''), noDisclosure);

  await q(`insert into public.voice_settings (account_id, recording_enabled, recording_disclosure_accepted_at)
           values ($1, true, now())`, [ACCOUNT]);
  ck('recording is allowed once somebody accepted the disclosure', true);

  const revoke = await fails(
    `update public.voice_settings set recording_disclosure_accepted_at = null where account_id = $1`,
    [ACCOUNT]);
  ck('...and the disclosure cannot be taken back while recording stays on',
    /voice_settings_recording_requires_disclosure/.test(revoke ?? ''), revoke);

  const before = (await q('select updated_at from public.voice_settings where account_id = $1', [ACCOUNT])).rows[0];
  await q(`update public.voice_settings set status = 'paused' where account_id = $1`, [ACCOUNT]);
  const after = (await q('select updated_at, status from public.voice_settings where account_id = $1', [ACCOUNT])).rows[0];
  ck('an edit stamps updated_at, so "when did this change" has an answer',
    after.updated_at > before.updated_at && after.status === 'paused', after);

  ck('a workspace that never configured this has no row, which is how off is stored',
    Number((await q('select count(*)::int as n from public.voice_settings')).rows[0].n) === 1);

  // -------------------------------------------------------------------
  // 8c. Receipt processing: one finite owner, resumable after failure.
  // -------------------------------------------------------------------
  progress('apply voice runtime hardening migration twice');
  await q(HARDENING);
  await q(HARDENING);
  ck('the receipt hardening migration applies twice without schema drift', true);

  const hardenedSettings = (await q(
    `select recording_enabled, emergency_transfer_number
       from public.voice_settings where account_id = $1`, [ACCOUNT])).rows[0];
  ck('hardening removes settings whose provider behavior does not exist',
    hardenedSettings.recording_enabled === false
      && hardenedSettings.emergency_transfer_number === null,
    hardenedSettings);

  // The production order adds this column in 20260820120000. This focused
  // harness stubs that one prerequisite so it can exercise the admission CAS
  // without loading the unrelated overage settlement ledger.
  await q(`alter table public.voice_call_admissions
             add column if not exists overage_key text`);
  progress('apply voice admission concurrency migration twice');
  await q(ADMISSION_CONCURRENCY);
  await q(ADMISSION_CONCURRENCY);
  ck('the atomic admission migration applies twice without schema drift', true);

  // The full production order already has these columns and sender inventory.
  // This focused harness creates only the prerequisite shape needed to prove
  // the later voice boundary, without loading the unrelated messaging queue.
  await q(`
    alter table public.accounts
      add column if not exists call_tracking_number text,
      add column if not exists call_tracking_verified_at timestamptz;
    create table public.sms_sender_numbers (
      id uuid primary key,
      provider text not null,
      e164_number text not null,
      provider_number_id text,
      purpose text not null,
      account_id uuid references public.accounts(id),
      assignment_state text not null,
      provisioning_status text not null,
      inbound_ready boolean not null default false,
      activated_at timestamptz,
      suspended_at timestamptz
    );
  `);
  progress('apply dedicated-number invariant migration twice');
  await q(DEDICATED_NUMBER_INVARIANT);
  await q(DEDICATED_NUMBER_INVARIANT);
  ck('the dedicated-number admission migration applies twice without schema drift', true);

  const concurrencyAccount = '22222222-2222-4222-8222-222222222222';
  const concurrencyNumber = '+12485550199';
  const concurrencySender = '33333333-3333-4333-8333-333333333333';
  const concurrencyProviderResource = '44444444-4444-4444-8444-444444444444';
  await q('insert into public.accounts (id, call_tracking_number) values ($1, $2)',
    [concurrencyAccount, concurrencyNumber]);
  await q(`insert into public.sms_sender_numbers (
      id, provider, e164_number, provider_number_id, purpose, account_id,
      assignment_state, provisioning_status, inbound_ready, activated_at
    ) values ($1, 'signalwire', $2, $3, 'contractor_dedicated', $4,
      'assigned', 'active', true, now())`,
  [concurrencySender, concurrencyNumber, concurrencyProviderResource, concurrencyAccount]);
  const callA = 'voice-concurrency-a';
  const callB = 'voice-concurrency-b';
  const simultaneous = await bounded('simultaneous admission race', 20_000,
    () => Promise.all([
      q(`select * from public.claim_voice_call_admission($1, $2, $3, 1)`,
        [concurrencyAccount, callA, concurrencyNumber]),
      q2(`select * from public.claim_voice_call_admission($1, $2, $3, 1)`,
        [concurrencyAccount, callB, concurrencyNumber]),
    ]));
  const slotRows = simultaneous.map((result) => result.rows[0]);
  const slotOwner = slotRows.find((row) => row.claim_status === 'claimed');
  const slotRejected = slotRows.find((row) => row.claim_status === 'at_capacity');
  const ownerCall = slotRows[0] === slotOwner ? callA : callB;
  ck('two simultaneous calls competing for one seat produce one atomic owner',
    slotOwner != null && slotRejected != null
      && slotRows.filter((row) => row.claim_status === 'claimed').length === 1,
    slotRows);

  const finalized = (await q(
    `select public.finalize_voice_call_admission($1, $2, $3, null, 0, null) as ok`,
    [slotOwner?.admission_id, concurrencyAccount, ownerCall])).rows[0];
  ck('the winning claim can be finalized exactly once', finalized.ok === true, finalized);

  const finalizedReplay = (await q(
    `select public.finalize_voice_call_admission($1, $2, $3, null, 0, null) as ok`,
    [slotOwner?.admission_id, concurrencyAccount, ownerCall])).rows[0];
  ck('a lost finalization response can be replayed safely', finalizedReplay.ok === true,
    finalizedReplay);

  const duplicateCall = (await q(
    `select * from public.claim_voice_call_admission($1, $2, $3, 1)`,
    [concurrencyAccount, ownerCall, concurrencyNumber])).rows[0];
  ck('a duplicate provider call id reuses its finalized admission',
    duplicateCall.claim_status === 'existing'
      && duplicateCall.admission_id === slotOwner?.admission_id,
    duplicateCall);

  await q(
    `insert into public.voice_events (
       provider_event_id, event_type, provider_call_id, account_id, payload,
       processing_status, processed_at
     ) values ($1, 'post_conversation', $2, $3, '{}'::jsonb, 'ignored', now())`,
    [`${ownerCall}:done`, ownerCall, concurrencyAccount]);
  const afterReceipt = (await q(
    `select * from public.claim_voice_call_admission($1, $2, $3, 1)`,
    [concurrencyAccount, 'voice-concurrency-after-receipt', concurrencyNumber])).rows[0];
  ck('a completed call stops consuming concurrency as soon as its receipt exists',
    afterReceipt.claim_status === 'claimed', afterReceipt);

  const releasedClaim = (await q(
    `select public.release_voice_call_admission_claim($1, $2, $3) as ok`,
    [afterReceipt.admission_id, concurrencyAccount, 'voice-concurrency-after-receipt'])).rows[0];
  ck('a pre-answer claim can be released without leaving a phantom seat',
    releasedClaim.ok === true, releasedClaim);

  for (const signature of [
    'public.claim_voice_call_admission(uuid,text,text,integer)',
    'public.finalize_voice_call_admission(uuid,uuid,text,uuid,integer,text)',
    'public.release_voice_call_admission_claim(uuid,uuid,text)',
  ]) {
    ck(`authenticated cannot execute ${signature}`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
        ['authenticated', signature, 'EXECUTE'])).rows[0].ok === false);
    ck(`service_role can execute ${signature}`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
      ['service_role', signature, 'EXECUTE'])).rows[0].ok === true);
  }

  const bound = (await q(`select sender_number_id, dialed_number, route_revision
      from public.voice_call_admissions where id = $1`, [slotOwner?.admission_id])).rows[0];
  ck('the atomic claim binds exact sender, dialed number, and current route revision',
    bound.sender_number_id === concurrencySender
      && bound.dialed_number === concurrencyNumber
      && Number(bound.route_revision) === 0,
    bound);

  await q(`update public.sms_sender_numbers
              set provisioning_status = 'suspended', suspended_at = now()
            where id = $1`, [concurrencySender]);
  const suspended = (await q(
    `select * from public.claim_voice_call_admission($1, $2, $3, 2)`,
    [concurrencyAccount, 'voice-number-suspended', concurrencyNumber])).rows[0];
  ck('a suspension immediately before the database boundary refuses without ownership detail',
    suspended.claim_status === 'number_not_ready' && suspended.admission_id === null,
    suspended);
  await q(`update public.sms_sender_numbers
              set provisioning_status = 'active', suspended_at = null
            where id = $1`, [concurrencySender]);

  const oldRevision = Number((await q(`select ai_voice_route_revision
      from public.accounts where id = $1`, [concurrencyAccount])).rows[0].ai_voice_route_revision);
  await q(`update public.accounts set call_tracking_number = '+12485550200' where id = $1`,
    [concurrencyAccount]);
  await q(`update public.accounts set call_tracking_number = $2 where id = $1`,
    [concurrencyAccount, concurrencyNumber]);
  const newRevision = Number((await q(`select ai_voice_route_revision
      from public.accounts where id = $1`, [concurrencyAccount])).rows[0].ai_voice_route_revision);
  ck('A to B to A advances the route epoch twice instead of reviving old evidence',
    newRevision === oldRevision + 2, { oldRevision, newRevision });

  for (const [label, args] of [
    ['missing expected project', ['voice-scope-1', 'post_conversation', PROJECT, SPACE, null, SPACE]],
    ['missing provider project', ['voice-scope-2', 'post_conversation', null, SPACE, PROJECT, SPACE]],
    ['missing expected space', ['voice-scope-3', 'post_conversation', PROJECT, SPACE, PROJECT, '']],
    ['missing provider space', ['voice-scope-4', 'post_conversation', PROJECT, null, PROJECT, SPACE]],
  ]) {
    ck(`${label} is rejected before receipt attribution`,
      /scope is required/.test(await fails(
        `select * from public.ingest_voice_event($1,$2,$3,$4,$5,$6,'{}'::jsonb)`, args,
      ) ?? ''));
  }
  ck('an exact configured project and space pair still ingests',
    (await q(`select * from public.ingest_voice_event(
      'voice-scope-exact','post_conversation',$1,$2,$1,$2,'{}'::jsonb
    )`, [PROJECT, SPACE])).rows[0].voice_event_id != null);

  // Both transactions race for the same admitted event. The row lock makes the
  // winner observable; after it commits, the other sees the active lease.
  const concurrentClaims = await bounded('simultaneous event claim race', 20_000,
    () => Promise.all([
      q(`select * from public.claim_voice_event_processing($1)`, [good.voice_event_id]),
      q2(`select * from public.claim_voice_event_processing($1)`, [good.voice_event_id]),
    ]));
  const claimRows = concurrentClaims.map((result) => result.rows[0]);
  const owner = claimRows.find((row) => row.claim_status === 'claimed');
  const contender = claimRows.find((row) => row.claim_status === 'busy');
  ck('two concurrent duplicate deliveries produce exactly one settlement owner',
    owner != null && contender != null
      && claimRows.filter((row) => row.claim_status === 'claimed').length === 1,
    claimRows);

  const firstFailure = (await q(
    `select * from public.fail_voice_event_processing($1, $2, 'settlement_failed', true)`,
    [good.voice_event_id, owner?.claim_token])).rows[0];
  ck('a retryable failure clears ownership and schedules bounded backoff',
    firstFailure.failure_status === 'retryable'
      && Number(firstFailure.retry_after_seconds) === 5,
    firstFailure);

  const deferred = (await q(
    `select * from public.claim_voice_event_processing($1)`, [good.voice_event_id])).rows[0];
  ck('a duplicate inside backoff does not settle again',
    deferred.claim_status === 'deferred'
      && Number(deferred.retry_after_seconds) >= 1,
    deferred);

  ck('a stale claim cannot finalize after its ownership was released',
    /stale or invalid/.test(await fails(
      `select public.complete_voice_event_processing($1, $2)`,
      [good.voice_event_id, owner?.claim_token]) ?? ''));

  await q(`update public.voice_events
              set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
            where id = $1`, [good.voice_event_id]);
  const resumed = (await q(
    `select * from public.claim_voice_event_processing($1)`, [good.voice_event_id])).rows[0];
  ck('the same inbox event can be reclaimed after its retry becomes due',
    resumed.claim_status === 'claimed'
      && Number(resumed.attempt_number) === 2
      && resumed.claim_token !== owner?.claim_token,
    resumed);

  await q(`select public.complete_voice_event_processing($1, $2)`,
    [good.voice_event_id, resumed.claim_token]);
  const processedReplay = (await q(
    `select * from public.claim_voice_event_processing($1)`, [good.voice_event_id])).rows[0];
  ck('a duplicate after completion is a stable no-op',
    processedReplay.claim_status === 'processed'
      && processedReplay.claim_token === null,
    processedReplay);

  const ignoredReplay = (await q(
    `select * from public.claim_voice_event_processing($1)`, [forged.voice_event_id])).rows[0];
  ck('an ignored unadmitted receipt can never become settlement work',
    ignoredReplay.claim_status === 'ignored', ignoredReplay);

  // Five actual claims, not five HTTP deliveries: busy and deferred deliveries
  // consume no attempt. The fifth retryable failure is parked permanently.
  const retryCall = 'c37ef1b1-bd88-4ff9-ce0f-6e0f617886cb';
  await q(`insert into public.voice_call_admissions
             (account_id, provider, provider_call_id, reserved_minutes)
           values ($1, 'signalwire', $2, 60)`, [ACCOUNT, retryCall]);
  const retryEvent = (await ingest(receipt({ call_id: retryCall }))).rows[0];
  const attempts = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const attemptClaim = (await q(
      `select * from public.claim_voice_event_processing($1)`, [retryEvent.voice_event_id])).rows[0];
    const attemptFailure = (await q(
      `select * from public.fail_voice_event_processing($1, $2, 'settlement_failed', true)`,
      [retryEvent.voice_event_id, attemptClaim.claim_token])).rows[0];
    attempts.push({ attemptClaim, attemptFailure });
    if (attempt < 5) {
      await q(`update public.voice_events
                  set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
                where id = $1`, [retryEvent.voice_event_id]);
    }
  }
  const exhausted = (await q(
    `select * from public.claim_voice_event_processing($1)`, [retryEvent.voice_event_id])).rows[0];
  ck('retryable processing is bounded to five claims and then exhausted',
    attempts.every(({ attemptClaim }, index) =>
      attemptClaim.claim_status === 'claimed'
        && Number(attemptClaim.attempt_number) === index + 1)
      && attempts.slice(0, 4).every(({ attemptFailure }) =>
        attemptFailure.failure_status === 'retryable')
      && attempts[4].attemptFailure.failure_status === 'exhausted'
      && exhausted.claim_status === 'exhausted',
    { attempts, exhausted });

  const leadRetryCall = 'd48ef1b1-bd88-4ff9-ce0f-6e0f617886cb';
  await q(`insert into public.voice_call_admissions
             (account_id, provider, provider_call_id, reserved_minutes)
           values ($1, 'signalwire', $2, 60)`, [ACCOUNT, leadRetryCall]);
  const leadRetryEvent = (await ingest(receipt({ call_id: leadRetryCall }))).rows[0];

  // Attempt one: the lead database fails before inserting anything.
  const beforeLead = (await q(
    `select * from public.claim_voice_event_processing($1)`,
    [leadRetryEvent.voice_event_id])).rows[0];
  await q(
    `select * from public.fail_voice_event_processing($1, $2, 'voice_receipt_handler_threw', true)`,
    [leadRetryEvent.voice_event_id, beforeLead.claim_token]);
  await q(`update public.voice_events
              set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
            where id = $1`, [leadRetryEvent.voice_event_id]);

  // Attempt two: the INSERT commits but the application loses its response.
  const afterLead = (await q(
    `select * from public.claim_voice_event_processing($1)`,
    [leadRetryEvent.voice_event_id])).rows[0];
  await q(`insert into public.leads (source_voice_event_id)
           values ($1) on conflict (source_voice_event_id) do nothing`,
    [leadRetryEvent.voice_event_id]);
  await q(
    `select * from public.fail_voice_event_processing($1, $2, 'voice_receipt_handler_threw', true)`,
    [leadRetryEvent.voice_event_id, afterLead.claim_token]);
  await q(`update public.voice_events
              set next_attempt_at = pg_catalog.clock_timestamp() - interval '1 second'
            where id = $1`, [leadRetryEvent.voice_event_id]);

  // Attempt three: insert-or-ignore observes the first row and completion wins.
  const leadRecovery = (await q(
    `select * from public.claim_voice_event_processing($1)`,
    [leadRetryEvent.voice_event_id])).rows[0];
  await q(`insert into public.leads (source_voice_event_id)
           values ($1) on conflict (source_voice_event_id) do nothing`,
    [leadRetryEvent.voice_event_id]);
  await q(`select public.complete_voice_event_processing($1, $2)`,
    [leadRetryEvent.voice_event_id, leadRecovery.claim_token]);
  const recovered = (await q(
    `select e.processing_status, e.attempt_count,
            count(l.id)::integer as lead_count
       from public.voice_events e
       left join public.leads l on l.source_voice_event_id = e.id
      where e.id = $1
      group by e.processing_status, e.attempt_count`,
    [leadRetryEvent.voice_event_id])).rows[0];
  ck('lead failure before and after INSERT retries to one lead and one processed event',
    recovered.processing_status === 'processed'
      && Number(recovered.attempt_count) === 3
      && Number(recovered.lead_count) === 1,
    recovered);

  await q(`insert into public.leads (source_voice_event_id) values ($1)`, [good.voice_event_id]);
  ck('one voice event can create at most one lead across ambiguous retries',
    /leads_source_voice_event_uidx/.test(await fails(
      `insert into public.leads (source_voice_event_id) values ($1)`,
      [good.voice_event_id]) ?? ''));

  for (const signature of [
    'public.claim_voice_event_processing(uuid)',
    'public.complete_voice_event_processing(uuid,uuid)',
    'public.fail_voice_event_processing(uuid,uuid,text,boolean)',
  ]) {
    ck(`authenticated cannot execute ${signature}`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
        ['authenticated', signature, 'EXECUTE'])).rows[0].ok === false);
    ck(`service_role can execute ${signature}`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
        ['service_role', signature, 'EXECUTE'])).rows[0].ok === true);
  }

  // -------------------------------------------------------------------
  // 8d. Call history: readable by its owner, writable by nobody in a browser.
  // -------------------------------------------------------------------
  progress('apply voice calls migration');
  await q(CALLS);
  ck('the call-history migration applies, write-guard post-check included', true);

  for (const role of ['anon', 'authenticated']) {
    const writes = (await q(
      `select has_table_privilege($1, 'public.voice_calls', 'INSERT') as ins,
              has_table_privilege($1, 'public.voice_calls', 'UPDATE') as upd,
              has_table_privilege($1, 'public.voice_calls', 'DELETE') as del`, [role])).rows[0];
    ck(`${role} cannot write call history`, !writes.ins && !writes.upd && !writes.del, writes);
  }
  ck('an owner may READ their own history, which is the whole point',
    Number((await q(`select count(*)::int as n from pg_policies
                     where tablename = 'voice_calls' and cmd = 'SELECT'`)).rows[0].n) === 1);

  // The separation the billing rule depends on: history is mutable, the receipt
  // is not, and nothing may compute a bill from the mutable one.
  await q(`insert into public.voice_calls
             (account_id, provider, provider_call_id, ai_seconds, billed_minutes, settlement)
           values ($1, 'signalwire', $2, 33, 1, 'allowance')`, [ACCOUNT, other]);
  const corrected = await fails(
    `update public.voice_calls set outcome = 'transferred' where provider_call_id = $1`, [other]);
  ck('a disposition can be corrected, which is why billing must not read it',
    corrected === null, corrected);

  ck('a call cannot be recorded twice for one provider call id',
    /voice_calls_provider_call_unique/.test(await fails(
      `insert into public.voice_calls (account_id, provider, provider_call_id)
       values ($1, 'signalwire', $2)`, [ACCOUNT, other]) ?? ''));

  ck('an impossible settlement state is refused',
    /voice_calls_settlement_check/.test(await fails(
      `update public.voice_calls set settlement = 'free' where provider_call_id = $1`, [other]) ?? ''));

  // -------------------------------------------------------------------
  // 8e. One transcript, entitlement-bounded visibility, durable deletion.
  // -------------------------------------------------------------------
  await q(`update public.voice_calls set voice_event_id = $1 where provider_call_id = $2`,
    [good.voice_event_id, other]);
  await q(`update public.voice_events
              set payload = payload || $2::jsonb
            where id = $1`, [good.voice_event_id, JSON.stringify({
    call_log: [
      { role: 'user', content: '  My basement is flooding.  ', timestamp: 1787171680000000 },
      { role: 'assistant', content: 'I will pass that along.' },
    ],
    raw_call_log: [{ role: 'user', content: 'duplicate raw transcript' }],
    call_timeline: [{ type: 'token', content: 'instrumented duplicate' }],
    post_prompt_data: { raw: 'Flooding basement.', substituted: 'Flooding basement.' },
  })]);

  progress('apply transcript-retention migration twice');
  await q(TRANSCRIPT_RETENTION);
  await q(TRANSCRIPT_RETENTION);
  ck('the transcript-retention migration applies twice', true);

  const minimized = (await q(`
    select c.transcript, e.payload,
           e.payload_sha256 = encode(
             extensions.digest(convert_to(e.payload::text, 'UTF8'), 'sha256'), 'hex'
           ) as hash_matches
      from public.voice_calls c
      join public.voice_events e on e.id = c.voice_event_id
     where c.provider_call_id = $1`, [other])).rows[0];

  const transcriptRows = Number((await q(
    `select count(*)::int as n from public.voice_calls where transcript is not null`,
  )).rows[0].n);
  const eventTranscriptRows = Number((await q(`
    select count(*)::int as n
      from public.voice_events
     where payload ?| array['call_log','raw_call_log','call_timeline','post_prompt_data']
  `)).rows[0].n);

  ck('exactly one normalized call_log resides in voice_calls',
    transcriptRows === 1
      && Array.isArray(minimized.transcript)
      && minimized.transcript.length === 2
      && minimized.transcript[0].content === 'My basement is flooding.',
    { transcriptRows, transcript: minimized.transcript });
  ck('no transcript-bearing keys remain in voice_events',
    eventTranscriptRows === 0, { eventTranscriptRows });
  ck('the minimized receipt payload hash is recomputed',
    minimized.hash_matches === true, minimized);

  // The minimized receipt must retain the timing evidence used for billing.
  // Prove that before retention purge removes the expired terminal event.
  const billed = (await q(`
    select ((payload->>'ai_end_date')::bigint - (payload->>'ai_start_date')::bigint) as ai_us,
           ((payload->>'call_answer_date')::bigint - (payload->>'call_start_date')::bigint) as ring_us
      from public.voice_events where provider_call_id = $1`, [other])).rows[0];
  ck('AI-connected time reads back as measured, excluding ringing',
    Number(billed.ai_us) === 32806429 && Number(billed.ring_us) === 726910, billed);
  ck('and rounds up to one whole minute, never zero',
    Math.ceil(Number(billed.ai_us) / 6e7) === 1);

  await q(`insert into public.workspace_entitlements (
             account_id, plan_code, billing_interval, billing_status,
             entitlement_state, catalog_version, platform_fee_bps,
             feature_limits, feature_flags
           ) values (
             $1, 'flex', 'none', 'free', 'active', 'retention-test', 500,
             '{"voice_history_days":30}'::jsonb, '{}'::jsonb
           )`, [ACCOUNT]);
  const ownerUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await q(`insert into auth.users(id) values ($1)`, [ownerUser]);
  await q(`insert into public.memberships(account_id,user_id,role)
           values ($1,$2,'owner')`, [ACCOUNT, ownerUser]);

  const recentCall = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await q(`insert into public.voice_calls (
             account_id, provider, provider_call_id, transcript, created_at
           ) values (
             $1, 'signalwire', $2, '[{"role":"user","content":"recent"}]'::jsonb,
             pg_catalog.now() - interval '29 days'
           )`, [ACCOUNT, recentCall]);
  await q(`update public.voice_calls
              set created_at = pg_catalog.now() - interval '31 days'
            where provider_call_id = $1`, [other]);

  await q(`set "lgq.actor" = '${ownerUser}'`);
  const visibleCalls = (await asRole('authenticated', () => q(`
    select provider_call_id from public.voice_calls
     where account_id = $1 order by provider_call_id`, [ACCOUNT])))
    .rows.map((row) => row.provider_call_id);
  ck('owner RLS hides expired history before the daily purge runs',
    visibleCalls.includes(recentCall) && !visibleCalls.includes(other), visibleCalls);

  await q(`update public.workspace_entitlements
              set feature_limits = jsonb_set(
                feature_limits, '{voice_history_days}', '90'::jsonb, true
              )
            where account_id = $1`, [ACCOUNT]);
  const visibleAtNinety = (await asRole('authenticated', () => q(`
    select provider_call_id from public.voice_calls
     where account_id = $1 order by provider_call_id`, [ACCOUNT])))
    .rows.map((row) => row.provider_call_id);
  ck('the 90-day entitlement keeps 31-day history visible',
    visibleAtNinety.includes(other), visibleAtNinety);
  await q(`update public.workspace_entitlements
              set feature_limits = jsonb_set(
                feature_limits, '{voice_history_days}', '30'::jsonb, true
              )
            where account_id = $1`, [ACCOUNT]);

  await q(`update public.voice_events
              set processing_status = 'processed', processed_at = pg_catalog.now() - interval '31 days',
                  received_at = pg_catalog.now() - interval '31 days',
                  processing_token = null, processing_lease_expires_at = null,
                  next_attempt_at = null
            where id = $1`, [good.voice_event_id]);
  const activeOld = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await q(`insert into public.voice_events (
             provider, provider_event_id, event_type, provider_call_id,
             provider_project_id, provider_space_id, account_id, payload,
             payload_sha256, processing_status, received_at
           ) values (
             'signalwire', $2::text || ':post_conversation', 'post_conversation', $2::text,
             $3::text, $4::text, $1::uuid,
             jsonb_build_object('action','post_conversation','call_id',$2::text,
               'project_id',$3::text,'space_id',$4::text),
               null, 'received', pg_catalog.now() - interval '31 days'
             )`, [ACCOUNT, activeOld, PROJECT, SPACE]);
  const retryableOld = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await q(`insert into public.voice_events (
             provider, provider_event_id, event_type, provider_call_id,
             provider_project_id, provider_space_id, account_id, payload,
             payload_sha256, processing_status, attempt_count,
             next_attempt_at, last_error, received_at
           ) values (
             'signalwire', $2::text || ':post_conversation', 'post_conversation', $2::text,
             $3::text, $4::text, $1::uuid,
             jsonb_build_object('action','post_conversation','call_id',$2::text,
               'project_id',$3::text,'space_id',$4::text),
             null, 'failed', 1, pg_catalog.now() + interval '5 minutes',
             'settlement_failed', pg_catalog.now() - interval '31 days'
           )`, [ACCOUNT, retryableOld, PROJECT, SPACE]);

  progress('execute retention purge');
  const purged = (await q(`select * from public.purge_expired_voice_history(10)`)).rows[0];
  const afterPurge = (await q(`select
      exists(select 1 from public.voice_calls where provider_call_id=$1) as old_call,
      exists(select 1 from public.voice_calls where provider_call_id=$2) as recent_call,
      exists(select 1 from public.voice_events where id=$3) as old_event,
      exists(select 1 from public.voice_events where provider_call_id=$4) as active_event,
      exists(select 1 from public.voice_events where provider_call_id=$5) as retryable_event`,
    [other, recentCall, good.voice_event_id, activeOld, retryableOld])).rows[0];
  ck('purge removes expired terminal call and receipt history',
    Number(purged.voice_calls_deleted) >= 1
      && Number(purged.voice_events_deleted) >= 1
      && afterPurge.old_call === false
      && afterPurge.old_event === false,
    { purged, afterPurge });
  ck('purge preserves unexpired calls plus active and retryable receipts',
    afterPurge.recent_call === true
      && afterPurge.active_event === true
      && afterPurge.retryable_event === true,
    afterPurge);

  const purgePrivileges = (await q(`select
      has_function_privilege(
        'authenticated','public.purge_expired_voice_history(integer)','EXECUTE'
      ) as authenticated_ok,
      has_function_privilege(
        'service_role','public.purge_expired_voice_history(integer)','EXECUTE'
      ) as service_ok`)).rows[0];
  const authenticatedPurgeError = await asRole(
    'authenticated', () => fails(`select * from public.purge_expired_voice_history(10)`),
  );
  const servicePurge = (await asRole(
    'service_role', () => q(`select * from public.purge_expired_voice_history(10)`),
  )).rows[0];
  ck('retention purge is executable only by service_role',
    purgePrivileges.authenticated_ok === false
      && purgePrivileges.service_ok === true
      && /permission denied for function purge_expired_voice_history/i
        .test(authenticatedPurgeError ?? '')
      && Number(servicePurge.voice_calls_deleted) === 0
      && Number(servicePurge.voice_events_deleted) === 0,
    { purgePrivileges, authenticatedPurgeError, servicePurge });

  // -------------------------------------------------------------------
  // 8f. TRUNCATE, which row level security does not cover.
  // -------------------------------------------------------------------
  progress('apply voice TRUNCATE hardening migration');
  await q(TRUNCATE_FIX);
  ck('the truncate revoke applies', true);

  // The whole class of mistake, checked across every voice table at once rather
  // than one at a time: a policy governs DML and says nothing about TRUNCATE, so
  // an RLS-enabled table with Supabase's default grants can be emptied by any
  // authenticated session -- every workspace, not just their own.
  const truncatable = (await q(`
    select c.relname, pg_get_userbyid(x.grantee) as who
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public'
      and c.relname in ('voice_events','voice_call_admissions','voice_settings','voice_calls')
      and x.privilege_type = 'TRUNCATE'
      and pg_get_userbyid(x.grantee) in ('anon','authenticated','public')
    order by c.relname`)).rows;
  ck('no browser role can TRUNCATE any voice table',
    truncatable.length === 0, JSON.stringify(truncatable));

  // Revoking everything must not have taken the owner's own access with it.
  ck('an owner can still reach their settings through the policy',
    Number((await q(`select count(*)::int as n
                     from information_schema.role_table_grants
                     where table_name = 'voice_settings' and grantee = 'authenticated'
                       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')`)).rows[0].n) === 4);

} catch (error) {
  ck('harness ran to completion', false, errorText(error));
} finally {
  const cleanupErrors = [];
  for (const [label, client] of [['concurrent client', c2], ['control client', c]]) {
    if (!client) continue;
    try {
      await bounded(`close ${label}`, 5_000, () => client.end());
    } catch (error) {
      cleanupErrors.push(errorText(error));
    }
  }

  const stopped = await stopPostgresBounded(pg);
  cleanupErrors.push(...stopped.details);
  if (stopped.ok) {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch (error) {
      cleanupErrors.push(errorText(error));
    }
  } else {
    cleanupErrors.push(`left disposable cluster at ${dataDir}`);
  }
  ck('disposable PostgreSQL cleanup completes within bounded time',
    cleanupErrors.length === 0, cleanupErrors);
}

const failed = R.filter(({ ok }) => !ok).length;
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
