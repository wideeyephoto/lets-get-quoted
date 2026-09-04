// Exercise staff-call step-up authorization on disposable PostgreSQL 17.
// No hosted credentials, SMS provider, or external service is used.

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

const CONTRACTOR_MIGRATION = 'migrations/20260903215831_voice_contractor_dispatch_hardening.sql';
const NUMBER_MIGRATION = 'migrations/20260903231235_ai_voice_number_provisioning.sql';
const STEP_UP_MIGRATION = 'migrations/20260903232815_voice_staff_step_up_authorization.sql';
const PORT = Number(process.env.LGQ_VOICE_STEP_UP_CHECK_PORT || 54384);
const EXPECTED_CHECKS = 21;
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
        execFileAsync(join(pgBin, 'pg_ctl.exe'), [
          'stop', '-D', instance.options.databaseDir, '-m', 'fast', '-w', '-t', '8',
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
    try { child.kill('SIGKILL'); } catch (error) {
      if (!childExited(child)) failures.push(errorText(error));
    }
    try { await bounded('wait for PostgreSQL exit', 5_000, () => waitForExit(child)); } catch (error) {
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

// Reuse the focused contractor-dispatch prerequisite schema so this harness
// exercises the real preceding migration without duplicating hundreds of
// lines of test-only DDL.
const contractorHarness = readFileSync(
  join(process.cwd(), 'scripts', 'verify-voice-contractor-dispatch.mjs'),
  'utf8',
).replace(/\r\n/g, '\n');
const baseStartMarker = 'const baseSchema = `\n';
const baseStart = contractorHarness.indexOf(baseStartMarker);
const baseEnd = contractorHarness.indexOf('\n`;\n\nconst dataDir', baseStart);
if (baseStart < 0 || baseEnd < 0) throw new Error('Contractor dispatch base schema could not be located.');
const baseSchema = contractorHarness.slice(baseStart + baseStartMarker.length, baseEnd);

// The voice-number migration is ordered after the dedicated-number messaging
// rail in production. The contractor harness intentionally carries only the
// tables needed by contractor dispatch, so reproduce the earlier messaging
// identity surface here before applying the voice-number migration. Keep this
// bootstrap limited to the columns the cross-rail guards read; the dedicated
// messaging migration has its own full PostgreSQL harness.
const messagingIdentitySchema = `
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
`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-voice-step-up-pg17-'));
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

let client;
let fatal;
async function roleQuery(role, sql, params = []) {
  await client.query(`set role ${role}`);
  try {
    return await client.query(sql, params);
  } finally {
    await client.query('reset role');
  }
}

async function rejected(role, sql, params = [], expectedCode = '42501') {
  try {
    await roleQuery(role, sql, params);
    return false;
  } catch (error) {
    return error?.code === expectedCode;
  }
}

const hmac = (character) => character.repeat(64);
const keyId = 'v1-0123456789abcdef';

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice_step_up_check');
  const { Client } = await import('pg');
  client = new Client({
    host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres',
    database: 'lgq_voice_step_up_check',
  });
  await client.connect();
  await client.query("set statement_timeout = '15s'");
  await client.query(baseSchema);
  await client.query(messagingIdentitySchema);
  await client.query(readFileSync(join(process.cwd(), CONTRACTOR_MIGRATION), 'utf8'));
  await client.query(readFileSync(join(process.cwd(), NUMBER_MIGRATION), 'utf8'));
  const migration = readFileSync(join(process.cwd(), STEP_UP_MIGRATION), 'utf8');
  await client.query(migration);
  await client.query(migration);
  check('migration applies twice on PostgreSQL 17', true);

  const columns = (await client.query(`
    select column_name
      from information_schema.columns
     where table_schema = 'public' and table_name = 'voice_staff_step_up_challenges'
     order by ordinal_position
  `)).rows.map((row) => row.column_name);
  const privilege = one(await client.query(`
    select c.relrowsecurity, c.relforcerowsecurity,
      pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
      pg_catalog.has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
      pg_catalog.has_function_privilege(
        'service_role','public.issue_voice_staff_step_up_challenge(uuid,text,text,text,text)','EXECUTE'
      ) as service_issue,
      pg_catalog.has_function_privilege(
        'service_role','public.mark_voice_staff_step_up_provider_accepted(uuid,text,text,uuid,text,text,integer,text)','EXECUTE'
      ) as service_mark_delivered,
      pg_catalog.has_function_privilege(
        'service_role','public.close_voice_staff_step_up_from_provider_status(text,text)','EXECUTE'
      ) as service_close_status,
      pg_catalog.has_function_privilege(
        'anon','public.issue_voice_staff_step_up_challenge(uuid,text,text,text,text)','EXECUTE'
      ) as anon_issue,
      pg_catalog.has_function_privilege(
        'service_role','public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)','EXECUTE'
      ) as unchecked_service
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_staff_step_up_challenges'
  `));
  check('only HMAC material is stored for the fixed six-digit code',
    columns.includes('code_hmac') && columns.includes('code_digits')
      && !columns.some((name) => ['code', 'otp', 'plaintext_code', 'verification_code'].includes(name)));
  check('challenge state is force-RLS and RPC-write only',
    privilege.relrowsecurity && privilege.relforcerowsecurity
      && !privilege.service_select && !privilege.service_insert);
  check('only the gated service RPC is exposed',
    privilege.service_issue && privilege.service_mark_delivered && privilege.service_close_status
      && !privilege.anon_issue && !privilege.unchecked_service);

  const accountId = randomUUID();
  const senderId = randomUUID();
  const jobId = randomUUID();
  const caller = '+18103042061';
  const dialed = '+12485550141';
  const calls = Object.fromEntries([
    'success', 'providerStatus', 'other', 'attempts', 'resend', 'delivery', 'expired', 'old',
    'rate1', 'rate2', 'rate3', 'rate4', 'rate24',
  ].map((name) => [name, `${name}-${randomUUID()}`]));

  await client.query(
    `insert into public.accounts(
       id,business_name,alert_phone,call_tracking_number,ai_voice_route_revision,default_burden_pct
     ) values($1,'Step-up Workspace',$2,$3,0,20)`,
    [accountId, caller, dialed],
  );
  await client.query(
    `insert into public.sms_sender_numbers(
       id,provider,e164_number,provider_number_id,purpose,account_id,
       provisioning_status,assignment_state,inbound_ready,activated_at
     ) values($1,'signalwire',$2,$3,'contractor_dedicated',$4,'active','assigned',true,pg_catalog.now())`,
    [senderId, dialed, randomUUID(), accountId],
  );
  await client.query(
    `insert into public.jobs(id,account_id,ref,client_name,scope,status,quoted_amount)
     values($1,$2,'STEP-100','Step-up Client','Original','in_progress',100)`,
    [jobId, accountId],
  );
  for (const [name, providerCallId] of Object.entries(calls)) {
    await client.query(
      `insert into public.voice_call_admissions(
         account_id,provider,provider_call_id,reserved_minutes,admission_state,
         sender_number_id,dialed_number,route_revision,caller_number,caller_kind,admitted_at
       ) values($1,'signalwire',$2,0,'admitted',$3,$4,0,$5,'owner',
         case when $6 = 'old' then pg_catalog.now() - interval '61 minutes' else pg_catalog.now() end)`,
      [accountId, providerCallId, senderId, dialed, caller, name],
    );
  }

  const issue = async (call, digest) => one(await roleQuery(
    'service_role',
    'select * from public.issue_voice_staff_step_up_challenge($1,$2,$3,$4,$5)',
    [accountId, call, caller, digest, keyId],
  ));
  const verify = async (call, digest) => one(await roleQuery(
    'service_role',
    'select * from public.verify_voice_staff_step_up_challenge($1,$2,$3,$4,$5)',
    [accountId, call, caller, digest, keyId],
  ));
  const markProviderAccepted = async (
    call,
    issuedRow,
    digest,
    generation = issuedRow.send_count,
    providerMessageId = `msg-${call}-${generation}`,
  ) => one(
    await roleQuery(
      'service_role',
      `select * from public.mark_voice_staff_step_up_provider_accepted(
         $1,$2,$3,$4,$5,$6,$7,$8
       )`,
      [accountId, call, caller, issuedRow.challenge_id, digest, keyId, generation, providerMessageId],
    ),
  );
  const status = async (call) => one(await roleQuery(
    'service_role',
    'select * from public.get_voice_staff_step_up_status($1,$2,$3)',
    [accountId, call, caller],
  ));
  const apply = async (call, note) => roleQuery(
    'service_role',
    `select public.apply_voice_contractor_action(
       $1,$2,$3,'append_job_caution_or_note',$4,null,$5::jsonb
     ) as outcome`,
    [accountId, call, caller, jobId, JSON.stringify({ note, is_caution: false })],
  );
  const ageForResend = (call) => client.query(
    `update public.voice_staff_step_up_challenges
        set last_sent_at = pg_catalog.now() - interval '61 seconds',
            code_expires_at = pg_catalog.now() + interval '5 minutes'
      where provider_call_id = $1`,
    [call],
  );

  const issued = await issue(calls.success, hmac('a'));
  const cooldownStatus = await status(calls.success);
  check('first issue remains unusable while provider acceptance is pending',
    issued.issue_status === 'provider_pending' && issued.should_send
      && issued.send_count === 1 && cooldownStatus.status === 'provider_pending'
      && cooldownStatus.retry_after_seconds > 0);
  check('privileged mutation is denied before exact verification',
    await rejected(
      'service_role',
      `select public.apply_voice_contractor_action(
         $1,$2,$3,'append_job_caution_or_note',$4,null,$5::jsonb
       )`,
      [accountId, calls.success, caller, jobId, JSON.stringify({ note: 'must not write' })],
    ));

  const notAccepted = await verify(calls.success, hmac('a'));
  const staleAck = await markProviderAccepted(calls.success, issued, hmac('a'), 2);
  const accepted = await markProviderAccepted(calls.success, issued, hmac('a'));
  const acceptedAgain = await markProviderAccepted(calls.success, issued, hmac('a'));
  check('only the exact current provider acknowledgement activates verification',
    notAccepted.verification_status === 'not_provider_accepted'
      && staleAck.delivery_status === 'stale_ack' && !staleAck.activated
      && accepted.delivery_status === 'provider_accepted' && accepted.activated
      && accepted.provider_message_id === `msg-${calls.success}-1`
      && acceptedAgain.delivery_status === 'already_provider_accepted' && acceptedAgain.activated);

  const otherIssued = await issue(calls.other, hmac('b'));
  await markProviderAccepted(calls.other, otherIssued, hmac('b'));
  const wrongCallDigest = await verify(calls.other, hmac('a'));
  const verified = await verify(calls.success, hmac('a'));
  const verifiedAgain = await verify(calls.success, hmac('a'));
  check('verification is exact-call bound and idempotent only on the exact call',
    wrongCallDigest.verification_status === 'invalid'
      && verified.verification_status === 'verified'
      && verifiedAgain.verification_status === 'already_verified');

  const action = one(await apply(calls.success, 'Verified staff note')).outcome;
  const durable = one(await client.query(`
    select code_digits, code_hmac, state,
      extract(epoch from (verified_until - verified_at))::integer as verified_seconds
    from public.voice_staff_step_up_challenges where provider_call_id = $1
  `, [calls.success]));
  check('verified exact call may perform a privileged mutation for at most thirty minutes',
    action.replayed === false && durable.code_digits === 6
      && durable.code_hmac === hmac('a') && durable.state === 'verified'
      && durable.verified_seconds > 0 && durable.verified_seconds <= 1800);

  await client.query(
    "insert into public.voice_events(provider,provider_call_id) values('signalwire',$1)",
    [calls.success],
  );
  const ended = one(await client.query(
    'select state,invalidation_reason from public.voice_staff_step_up_challenges where provider_call_id=$1',
    [calls.success],
  ));
  check('call completion invalidates authorization before any later mutation',
    ended.state === 'invalidated' && ended.invalidation_reason === 'call_ended'
      && await rejected(
        'service_role',
        `select public.apply_voice_contractor_action(
           $1,$2,$3,'append_job_caution_or_note',$4,null,$5::jsonb
         )`,
        [accountId, calls.success, caller, jobId, JSON.stringify({ note: 'after call end' })],
      ));

  const providerStatusIssued = await issue(calls.providerStatus, hmac('9'));
  await markProviderAccepted(calls.providerStatus, providerStatusIssued, hmac('9'));
  await verify(calls.providerStatus, hmac('9'));
  const nonterminalProviderStatus = one(await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [calls.providerStatus, 'ringing'],
  ));
  const closedProviderStatus = one(await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [calls.providerStatus, 'completed'],
  ));
  const duplicateProviderStatus = one(await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [calls.providerStatus, 'busy'],
  ));
  const providerClosed = one(await client.query(
    `select a.provider_terminal_status,a.provider_terminal_at,c.state,c.invalidation_reason
       from public.voice_call_admissions a
       join public.voice_staff_step_up_challenges c on c.admission_id=a.id
      where a.provider_call_id=$1`,
    [calls.providerStatus],
  ));
  check('signed provider terminal status closes liveness before receipt settlement',
    nonterminalProviderStatus.close_status === 'nonterminal'
      && closedProviderStatus.close_status === 'closed'
      && closedProviderStatus.challenge_invalidated
      && duplicateProviderStatus.close_status === 'already_closed'
      && duplicateProviderStatus.provider_terminal_status === 'completed'
      && providerClosed.provider_terminal_status === 'completed'
      && providerClosed.provider_terminal_at
      && providerClosed.state === 'invalidated'
      && providerClosed.invalidation_reason === 'provider_terminal'
      && await rejected(
        'service_role',
        `select public.apply_voice_contractor_action(
           $1,$2,$3,'append_job_caution_or_note',$4,null,$5::jsonb
         )`,
        [accountId, calls.providerStatus, caller, jobId,
          JSON.stringify({ note: 'after provider terminal' })],
      ));

  const preAdmissionCall = `pre-admission-${randomUUID()}`;
  const tombstonedBeforeAdmission = one(await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [preAdmissionCall, 'completed'],
  ));
  const outOfOrderTerminal = one(await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [preAdmissionCall, 'failed'],
  ));
  const refusedAdmission = one(await roleQuery(
    'service_role',
    `select * from public.claim_voice_call_admission_v2(
       $1,$2,$3,2,$4,'owner'
     )`,
    [accountId, preAdmissionCall, dialed, caller],
  ));
  const tombstone = one(await client.query(
    `select terminal_status,
            extract(epoch from (expires_at-terminal_at))::integer as retention_seconds
       from public.voice_provider_terminal_call_tombstones
      where provider='signalwire' and provider_call_id=$1`,
    [preAdmissionCall],
  ));
  check('terminal-before-admission is tombstoned and cannot be resurrected',
    tombstonedBeforeAdmission.close_status === 'tombstoned'
      && outOfOrderTerminal.close_status === 'tombstoned'
      && outOfOrderTerminal.provider_terminal_status === 'completed'
      && refusedAdmission.claim_status === 'call_terminal'
      && refusedAdmission.admission_id === null
      && tombstone.terminal_status === 'completed'
      && Number(tombstone.retention_seconds) === 7 * 24 * 60 * 60);

  const finalizeAccountId = randomUUID();
  const finalizeVoiceNumberId = randomUUID();
  const finalizeProviderNumberId = randomUUID();
  const finalizeNumber = '+12485550142';
  const finalizeCall = `finalize-race-${randomUUID()}`;
  await client.query(
    `insert into public.accounts(
       id,business_name,alert_phone,call_tracking_number,ai_voice_route_revision,default_burden_pct
     ) values($1,'Finalize Race Workspace',$2,$3,0,20)`,
    [finalizeAccountId, caller, finalizeNumber],
  );
  await client.query(
    `insert into public.voice_number_inventory(
       id,account_id,provider_number_id,e164_number,lifecycle_state,voice_capable,
       call_handler,call_request_url,call_request_method,
       call_status_callback_url,call_status_callback_method,
       provider_verified_at,last_provider_sync_at,provider_readiness_state,
       provider_readiness_changed_at,activated_at
     ) values($1,$2,$3,$4,'active',true,'laml_webhooks',
       'https://app.letsgetquoted.com/api/voice/ai','POST',
       'https://app.letsgetquoted.com/api/voice/provider-status','POST',
       pg_catalog.now(),pg_catalog.now(),'ready',pg_catalog.now(),pg_catalog.now())`,
    [finalizeVoiceNumberId, finalizeAccountId, finalizeProviderNumberId, finalizeNumber],
  );
  const claimedBeforeTerminal = one(await roleQuery(
    'service_role',
    `select * from public.claim_voice_call_admission_v2(
       $1,$2,$3,2,$4,'owner'
     )`,
    [finalizeAccountId, finalizeCall, finalizeNumber, caller],
  ));
  await roleQuery(
    'service_role',
    'select * from public.close_voice_staff_step_up_from_provider_status($1,$2)',
    [finalizeCall, 'completed'],
  );
  const terminalFinalize = one(await roleQuery(
    'service_role',
    'select public.finalize_voice_call_admission($1,$2,$3,null,0,null) as finalized',
    [claimedBeforeTerminal.admission_id, finalizeAccountId, finalizeCall],
  ));
  const finalizationRaceRow = one(await client.query(
    `select admission_state,provider_terminal_status
       from public.voice_call_admissions where id=$1`,
    [claimedBeforeTerminal.admission_id],
  ));
  check('provider terminal between claim and finalize cannot become admitted',
    claimedBeforeTerminal.claim_status === 'claimed'
      && terminalFinalize.finalized === false
      && finalizationRaceRow.admission_state === 'claimed'
      && finalizationRaceRow.provider_terminal_status === 'completed');

  await client.query('truncate table public.voice_staff_step_up_send_events');
  const attemptsIssued = await issue(calls.attempts, hmac('c'));
  await markProviderAccepted(calls.attempts, attemptsIssued, hmac('c'));
  const attemptStatuses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    attemptStatuses.push((await verify(calls.attempts, hmac('d'))).verification_status);
  }
  const lockedCorrect = await verify(calls.attempts, hmac('c'));
  check('five failed verifications permanently lock the challenge',
    attemptStatuses.slice(0, 4).every((value) => value === 'invalid')
      && attemptStatuses[4] === 'locked'
      && lockedCorrect.verification_status === 'locked');

  await client.query('truncate table public.voice_staff_step_up_send_events');
  const firstSend = await issue(calls.resend, hmac('e'));
  const cooled = await issue(calls.resend, hmac('f'));
  await ageForResend(calls.resend);
  const secondSend = await issue(calls.resend, hmac('f'));
  await ageForResend(calls.resend);
  const thirdSend = await issue(calls.resend, hmac('1'));
  await ageForResend(calls.resend);
  const fourthSend = await issue(calls.resend, hmac('2'));
  check('resends have a sixty-second cooldown and a hard three-send lockout',
    firstSend.should_send && cooled.issue_status === 'cooldown' && !cooled.should_send
      && secondSend.issue_status === 'provider_pending' && secondSend.send_count === 2
      && thirdSend.issue_status === 'provider_pending' && thirdSend.send_count === 3
      && fourthSend.issue_status === 'locked' && !fourthSend.should_send);

  await client.query('truncate table public.voice_staff_step_up_send_events');
  const deliveryIssued = await issue(calls.delivery, hmac('3'));
  const ambiguousVerify = await verify(calls.delivery, hmac('3'));
  const invalidated = one(await roleQuery(
    'service_role',
    `select public.invalidate_voice_staff_step_up_challenge(
       $1,$2,$3,'sms_delivery_failed'
     ) as invalidated`,
    [accountId, calls.delivery, caller],
  ));
  const invalidatedStatus = await status(calls.delivery);
  await ageForResend(calls.delivery);
  const reissued = await issue(calls.delivery, hmac('4'));
  const staleProviderAck = await markProviderAccepted(calls.delivery, deliveryIssued, hmac('3'));
  const reissueAccepted = await markProviderAccepted(calls.delivery, reissued, hmac('4'));
  const reverifed = await verify(calls.delivery, hmac('4'));
  check('delivery failure invalidation is safe and can reissue only within the send bound',
    ambiguousVerify.verification_status === 'not_provider_accepted'
      && invalidated.invalidated && invalidatedStatus.status === 'invalidated'
      && reissued.issue_status === 'provider_pending' && reissued.send_count === 2
      && staleProviderAck.delivery_status === 'stale_ack'
      && reissueAccepted.delivery_status === 'provider_accepted'
      && reverifed.verification_status === 'verified');

  await client.query('truncate table public.voice_staff_step_up_send_events');
  const expiredIssued = await issue(calls.expired, hmac('5'));
  await markProviderAccepted(calls.expired, expiredIssued, hmac('5'));
  await client.query(
    `update public.voice_staff_step_up_challenges
        set last_sent_at = pg_catalog.now() - interval '9 minutes',
            provider_accepted_at = pg_catalog.now() - interval '2 minutes',
            code_expires_at = pg_catalog.now() - interval '1 second'
      where provider_call_id = $1`,
    [calls.expired],
  );
  const expiredStatus = await status(calls.expired);
  const expiredVerify = await verify(calls.expired, hmac('5'));
  check('codes expire no later than ten minutes',
    expiredStatus.status === 'expired' && expiredVerify.verification_status === 'expired');

  const oldCall = await issue(calls.old, hmac('6'));
  const wrongCaller = one(await roleQuery(
    'service_role',
    'select * from public.issue_voice_staff_step_up_challenge($1,$2,$3,$4,$5)',
    [accountId, calls.other, '+18103042062', hmac('6'), keyId],
  ));
  check('non-live or mismatched call identity never creates a challenge',
    oldCall.issue_status === 'call_not_live' && !oldCall.should_send
      && wrongCaller.issue_status === 'call_not_live' && !wrongCaller.should_send);

  await client.query('truncate table public.voice_staff_step_up_send_events');
  const rateIssues = [];
  for (const name of ['rate1', 'rate2', 'rate3', 'rate4']) {
    rateIssues.push(await issue(calls[name], hmac('a')));
  }
  const rateEventCount = Number(one(await client.query(
    'select pg_catalog.count(*)::integer as count from public.voice_staff_step_up_send_events',
  )).count);
  check('new CallSids cannot reset the three-send rolling recipient budget',
    rateIssues.slice(0, 3).every((row) => row.issue_status === 'provider_pending' && row.should_send)
      && rateIssues[3].issue_status === 'rate_limited' && !rateIssues[3].should_send
      && rateIssues[3].retry_after_seconds > 0 && rateEventCount === 3);

  await client.query('truncate table public.voice_staff_step_up_send_events');
  await client.query(`
    with generations as (
      select c.account_id, c.admission_id, c.id as challenge_id, c.caller_number, g.send_count
        from public.voice_staff_step_up_challenges c
        cross join pg_catalog.generate_series(1, 3) as g(send_count)
       where c.account_id = $1 and c.caller_number = $2
       order by c.id, g.send_count
       limit 10
    )
    insert into public.voice_staff_step_up_send_events(
      account_id,admission_id,challenge_id,caller_number,send_count,sent_at
    )
    select account_id,admission_id,challenge_id,caller_number,send_count,
           pg_catalog.now() - interval '1 hour'
      from generations
  `, [accountId, caller]);
  const dailyLimited = await issue(calls.rate24, hmac('b'));
  check('recipient sends also stop at ten in a rolling day',
    dailyLimited.issue_status === 'rate_limited' && !dailyLimited.should_send
      && dailyLimited.retry_after_seconds > 80_000);

  check('browser roles and service code cannot bypass the RPC surface',
    await rejected(
      'anon',
      'select * from public.get_voice_staff_step_up_status($1,$2,$3)',
      [accountId, calls.other, caller],
    )
      && await rejected(
        'service_role',
        'select code_hmac from public.voice_staff_step_up_challenges limit 1',
      )
      && await rejected(
        'service_role',
        'select id from public.voice_staff_step_up_send_events limit 1',
      ));
} catch (error) {
  fatal = error ?? new Error('PostgreSQL harness failed without an error object.');
  console.error(fatal);
} finally {
  try { await client?.end(); } catch {}
  try {
    const stopped = await stopPostgresBounded(pg);
    if (!stopped.ok) console.error(`PostgreSQL cleanup warning: ${stopped.details.join('; ')}`);
  } catch (error) {
    console.error(`PostgreSQL cleanup warning: ${errorText(error)}`);
  }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (checks.length !== EXPECTED_CHECKS) {
  console.error(`Expected ${EXPECTED_CHECKS} checks, but executed ${checks.length}.`);
}
if (fatal || failed.length || checks.length !== EXPECTED_CHECKS) process.exitCode = 1;
