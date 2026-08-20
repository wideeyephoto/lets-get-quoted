/**
 * Prove the AI Voice receipt boundary against a real PostgreSQL 17.
 *
 * The receipt arrives with no signature and no authentication beyond Basic
 * credentials in a URL that stay readable in the provider dashboard for ever
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
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
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
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });
const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-voicebox-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_VOICE_INBOX_PORT || 54343),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice');
  c = pg.getPgClient('lgq_voice');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
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
  // 8c. Call history: readable by its owner, writable by nobody in a browser.
  // -------------------------------------------------------------------
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
  // 8d. TRUNCATE, which row level security does not cover.
  // -------------------------------------------------------------------
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

  // -------------------------------------------------------------------
  // 8. The billable interval, computed from the measured receipt.
  // -------------------------------------------------------------------
  const billed = (await q(`
    select ((payload->>'ai_end_date')::bigint - (payload->>'ai_start_date')::bigint) as ai_us,
           ((payload->>'call_answer_date')::bigint - (payload->>'call_start_date')::bigint) as ring_us
      from public.voice_events where provider_call_id = $1`, [other])).rows[0];
  ck('AI-connected time reads back as measured, excluding ringing',
    Number(billed.ai_us) === 32806429 && Number(billed.ring_us) === 726910, billed);
  ck('and rounds up to one whole minute, never zero',
    Math.ceil(Number(billed.ai_us) / 6e7) === 1);

  await c.end();
} catch (error) {
  ck('harness ran to completion', false, error.message ?? String(error));
} finally {
  try { await pg.stop(); } catch { /* already down */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* leave it */ }
}

let failed = 0;
for (const { n, ok, d } of R) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok || d == null ? '' : `\n       ${typeof d === 'string' ? d : JSON.stringify(d)}`}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
