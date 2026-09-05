// Uses a disposable local PostgreSQL 17 database. Never reads hosted credentials.
// Install the same embedded-postgres packages as verify-sms-webhook-safety.mjs,
// or point LGQ_PG_TEST_TOOLS_ROOT at a workspace containing those packages.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

try { os.userInfo(); } catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'test', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
const toolsRoot = process.env.LGQ_PG_TEST_TOOLS_ROOT || process.cwd();
const requireTools = createRequire(join(toolsRoot, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireTools.resolve('embedded-postgres')).href);
const bin = join(toolsRoot, 'node_modules', '@embedded-postgres', `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`, 'native', 'bin');
process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
const port = Number(process.env.LGQ_SMS_HISTORY_CHECK_PORT || 54378);
const databaseDir = mkdtempSync(join(os.tmpdir(), 'lgq-sms-history-'));
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres', password: 'postgres', port, persistent: false,
});
const clients = [];
let checks = 0;
async function connect() {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'sms_history_check' });
  clients.push(client);
  await client.connect();
  await client.query("set statement_timeout = '10s'");
  return client;
}
function pass(name) { checks += 1; console.log(`PASS ${name}`); }

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('sms_history_check');
  const first = await connect();
  const second = await connect();
  const observer = await connect();
  await first.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.leads (
      id uuid primary key, account_id uuid not null, phone text,
      triage jsonb, status text default 'new',
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.sms_events (
      id uuid primary key, account_id uuid not null, phone_number text,
      status text, error_reason text
    );
    alter table public.leads enable row level security;
    alter table public.sms_events enable row level security;
  `);
  const normalizer = readFileSync('migrations/20260821192000_sms_inbound_action_outbox.sql', 'utf8')
    .match(/create or replace function public\.sms_normalize_recipient_phone\(p_phone text\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(normalizer);
  await first.query(normalizer);
  const migration = readFileSync('migrations/20260905153351_sms_lead_delivery_history.sql', 'utf8');
  await first.query(migration);
  await first.query(migration);
  pass('migration applies and replays');

  const account = randomUUID();
  const lead = randomUUID();
  const otherLead = randomUUID();
  await first.query('insert into leads(id,account_id,phone,triage) values ($1,$2,$3,$4)', [lead, account, '(212) 555-0123', { contactLog: [{ at: '2026-09-05T12:00:00Z', label: 'Existing note' }], customField: 'preserve me', archived: true }]);
  await first.query('insert into leads(id,account_id,phone,triage) values ($1,$2,$3,$4)', [otherLead, randomUUID(), '+12125550123', { contactLog: [] }]);
  async function event(status = 'delivered') {
    const id = randomUUID();
    await first.query('insert into sms_events(id,account_id,phone_number,status,error_reason) values ($1,$2,$3,$4,$5)', [id, account, '+12125550123', status, status === 'failed' ? '30003' : null]);
    return id;
  }
  const record = async (client, id) => (await client.query('select public.record_sms_lead_delivery_history($1) as recorded', [id])).rows[0].recorded;
  const triage = async () => (await first.query('select triage from leads where id=$1', [lead])).rows[0].triage;

  const delivered = await event();
  assert.equal(await record(first, delivered), true);
  assert.equal(await record(first, delivered), false);
  assert.equal((await triage()).contactLog.length, 2);
  assert.equal((await triage()).customField, 'preserve me');
  assert.equal((await triage()).archived, true);
  assert.equal((await first.query('select status from leads where id=$1', [lead])).rows[0].status, 'new');
  assert.equal((await first.query('select triage from leads where id=$1', [otherLead])).rows[0].triage.contactLog.length, 0);
  pass('duplicate callbacks append once, preserve triage/status, and stay in their account');

  const sameEvent = await event();
  const concurrent = await Promise.all([record(first, sameEvent), record(second, sameEvent)]);
  assert.deepEqual(concurrent.sort(), [false, true]);
  assert.equal((await triage()).contactLog.length, 3);
  pass('concurrent duplicate callbacks append only once');

  const eventA = await event();
  const eventB = await event('failed');
  assert.deepEqual(await Promise.all([record(first, eventA), record(second, eventB)]), [true, true]);
  assert.equal((await triage()).contactLog.length, 5);
  assert.equal((await triage()).contactLog.filter((entry) => entry.label === 'SMS Delivery Failed').length, 1);
  pass('concurrent distinct callbacks preserve both delivery entries');

  const waitingEvent = await event();
  await first.query('begin');
  await first.query(`update leads set triage=jsonb_set(triage,'{contactLog}',(triage->'contactLog') || $2::jsonb) where id=$1`, [lead, JSON.stringify([{ at: '2026-09-05T12:01:00Z', label: 'Concurrent customer note' }])]);
  const pending = record(second, waitingEvent);
  let waiting = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const locks = await observer.query('select cardinality(pg_blocking_pids($1)) > 0 as waiting', [second.processID]);
    if (locks.rows[0].waiting) { waiting = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await first.query('commit');
  assert.equal(await pending, true);
  assert.equal(waiting, true, 'callback must have waited on the concurrent note write');
  assert.deepEqual((await triage()).contactLog.slice(-2).map((entry) => entry.label), ['Concurrent customer note', 'SMS Delivered']);
  pass('a callback waiting on a note writer preserves the newly committed note');

  const retryEvent = await event();
  const before = (await triage()).contactLog.length;
  await first.query(`
    create function public.fail_sms_history_marker() returns trigger language plpgsql as $$
    begin raise exception 'test marker write failure'; end; $$;
    create trigger fail_sms_history_marker before update of lead_delivery_history_recorded_at
    on public.sms_events for each row execute function public.fail_sms_history_marker();
  `);
  await assert.rejects(record(first, retryEvent), /test marker write failure/);
  assert.equal((await triage()).contactLog.length, before);
  await first.query('drop trigger fail_sms_history_marker on public.sms_events');
  assert.equal(await record(first, retryEvent), true);
  assert.equal(await record(first, retryEvent), false);
  assert.equal((await triage()).contactLog.length, before + 1);
  pass('marker failures roll back the append and remain safely retryable');

  const notTerminal = await event('sent');
  assert.equal(await record(first, notTerminal), false);
  await first.query("update sms_events set status='delivered' where id=$1", [notTerminal]);
  assert.equal(await record(first, notTerminal), true);
  pass('nonterminal callbacks do not consume the delivery-history marker');

  await first.query("update leads set triage='{}'::jsonb where id=$1", [lead]);
  assert.equal(await record(first, delivered), false);
  assert.deepEqual(await triage(), {});
  pass('deduplication survives subsequent edits to triage');

  const grants = (await first.query(`select
    has_function_privilege('anon','public.record_sms_lead_delivery_history(uuid)','execute') as anon,
    has_function_privilege('authenticated','public.record_sms_lead_delivery_history(uuid)','execute') as authenticated,
    has_function_privilege('service_role','public.record_sms_lead_delivery_history(uuid)','execute') as service`)).rows[0];
  assert.deepEqual(grants, { anon: false, authenticated: false, service: true });
  await first.query('set role authenticated');
  await assert.rejects(record(first, delivered), /permission denied/);
  await first.query('reset role');
  await first.query('set role service_role');
  assert.equal(await record(first, delivered), false);
  await first.query('reset role');
  pass('only service_role can execute the history RPC');
} finally {
  for (const client of clients) { try { await client.end(); } catch { /* already closed */ } }
  const stopped = pg.stop();
  // The package's Windows taskkill can be blocked in restricted sessions. Its
  // exit observer is already attached; pg_ctl also lets our cluster stop cleanly.
  if (process.platform === 'win32') {
    await promisify(execFile)(join(bin, 'pg_ctl.exe'), ['-D', databaseDir, '-m', 'fast', '-w', 'stop'], {
      windowsHide: true, timeout: 15000,
    }).catch(() => { /* the package may have already stopped and removed it */ });
  }
  await stopped;
}
console.log(`${checks} PostgreSQL checks passed.`);
