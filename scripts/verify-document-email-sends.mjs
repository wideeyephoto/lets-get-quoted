// Actual migration, disposable PostgreSQL 17, synthetic identities only.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:net';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-document-email-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {}, onError: () => {} });
let db, other, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('documents');
  db = pg.getPgClient('documents'); await db.connect(); other = pg.getPgClient('documents'); await other.connect();
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table accounts(id uuid primary key default gen_random_uuid(),test_marker text,suspended_at timestamptz);
    create table jobs(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id) on delete cascade,
      ref text default 'JOB-1',client_name text default 'Client',client_email text default 'client@example.com',scope text,
      quoted_amount numeric default 100,quote_items jsonb,status text default 'new_lead',deleted_at timestamptz);
    create table invoices(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id) on delete cascade,
      job_id uuid references jobs(id) on delete cascade,ref text default 'INV-1',total numeric default 100,
      discount_percent numeric default 0,tax_rate numeric default 0,status text default 'draft');
    create table invoice_items(id uuid primary key default gen_random_uuid(),invoice_id uuid references invoices(id) on delete cascade,
      description text default 'Work',amount numeric default 100,sort_order int default 0);
    create table email_suppression(account_id uuid,email text,reason text);
    grant all on accounts,jobs,invoices,invoice_items,email_suppression to service_role;`);
  const migration = readFileSync(join(root, 'migrations/20260914135714_document_email_send_ledger.sql'), 'utf8');
  assert.ok(readFileSync(join(root, 'schema.sql'), 'utf8').replace(/\r\n/g, '\n').includes(migration.replace(/\r\n/g, '\n').trim()));
  await db.query(migration); passed('actual migration and fresh schema agree and apply');
  const signatures = ['claim_document_email_send(uuid,uuid,uuid,uuid,uuid,jsonb,text)',
    'fallback_document_email_send(uuid,uuid,uuid,text,text)', 'finish_document_email_send(uuid,uuid,uuid,text,text)',
    'confirm_document_email_send(uuid,uuid,text,text,text)', 'resolve_document_email_send(uuid,uuid,text,text,text)'];
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'document_email_sends','select,insert,update,delete') ok", [role])).rows[0].ok, false);
    for (const signature of signatures) assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok", [role, signature])).rows[0].ok, false);
    await db.query(`set role ${role}`); await assert.rejects(db.query('select * from document_email_sends'), /permission denied/); await db.query('reset role');
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='document_email_sends'::regclass")).rows[0].relrowsecurity, true);
  for (const signature of [...signatures, 'bump_job_email_revision()', 'bump_invoice_email_revision()', 'touch_invoice_email_revision()']) {
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
    assert.equal(row.prosecdef, false); assert.ok(row.proconfig.some(value => value.startsWith('search_path=')));
  }
  passed('RLS, private RPC grants, invoker rights and fixed search paths');
  await db.query('set role service_role'); await other.query('set role service_role');
  const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const foreignAccount = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const job = async () => (await db.query('insert into jobs(account_id) values($1) returning *', [account])).rows[0];
  const invoice = async j => (await db.query('insert into invoices(account_id,job_id) values($1,$2) returning *', [account, j.id])).rows[0];
  const refresh = async (table, id) => (await db.query(`select * from ${table} where id=$1`, [id])).rows[0];
  const payload = { from: 'Builder <quotes@builder.example>',to: 'client@example.com',reply_to: 'owner@example.com',
    subject: 'Quote',html: 'Saved client link',attachments: [{ filename: 'invoice.pdf',content: 'cGRm' }],tags: [] };
  const claim = async (client, j, inv = null, message = payload, scope = 'a'.repeat(64), accountId = account) =>
    (await client.query('select claim_document_email_send($1,$2,$3,$4,$5,$6,$7) result',
      [accountId, j.id, inv?.id ?? null, j.document_email_revision, inv?.document_email_revision ?? null, message, scope])).rows[0].result;
  const finish = async (c, provider = null) => (await db.query('select finish_document_email_send($1,$2,$3,$4,$5) ok',
    [c.id, account, c.token, provider, provider ? null : 'timeout'])).rows[0].ok;
  const fallback = async (c, message = 'The builder.example domain is not verified.', name = 'validation_error') =>
    (await db.query('select fallback_document_email_send($1,$2,$3,$4,$5) result', [c.id, account, c.token, name, message])).rows[0].result;
  const confirm = async (c, options = {}) => (await db.query('select confirm_document_email_send($1,$2,$3,$4,$5) ok',
    [c.id, options.account ?? account, options.recipient ?? payload.to, options.provider ?? 'confirmed-id', options.phase ?? c.phase])).rows[0].ok;

  let j = await job(); const originalRevision = j.document_email_revision;
  await db.query("update jobs set status='in_progress',document_email_revision=gen_random_uuid() where id=$1", [j.id]);
  assert.equal((await refresh('jobs', j.id)).document_email_revision, originalRevision);
  await db.query("update jobs set quoted_amount=200 where id=$1", [j.id]);
  j = await refresh('jobs', j.id); assert.notEqual(j.document_email_revision, originalRevision);
  await db.query("update jobs set quoted_amount=100 where id=$1", [j.id]);
  j = await refresh('jobs', j.id); assert.notEqual(j.document_email_revision, originalRevision);
  passed('only meaningful quote edits advance revision, including edits back to earlier values');
  let inv = await invoice(j); let previous = inv.document_email_revision;
  await db.query("update invoices set status='sent',document_email_revision=gen_random_uuid() where id=$1", [inv.id]);
  assert.equal((await refresh('invoices', inv.id)).document_email_revision, previous);
  const item = (await db.query('insert into invoice_items(invoice_id) values($1) returning id', [inv.id])).rows[0].id;
  inv = await refresh('invoices', inv.id); assert.notEqual(inv.document_email_revision, previous); previous = inv.document_email_revision;
  await db.query("update invoice_items set description='Different scope, same total' where id=$1", [item]);
  inv = await refresh('invoices', inv.id); assert.notEqual(inv.document_email_revision, previous); previous = inv.document_email_revision;
  await db.query("update invoice_items set description=description where id=$1", [item]);
  assert.equal((await refresh('invoices', inv.id)).document_email_revision, previous);
  await db.query('delete from invoice_items where id=$1', [item]);
  inv = await refresh('invoices', inv.id); assert.notEqual(inv.document_email_revision, previous);
  passed('invoice line insert/edit/delete advances revision; status and no-op edits do not');

  assert.equal((await claim(db, j, inv, payload, 'a'.repeat(64), foreignAccount)).action, 'blocked');
  const unrelated = await job(); assert.equal((await claim(db, unrelated, inv)).action, 'blocked');
  assert.equal((await claim(db, j, null, { ...payload,to: 'someone-else@example.com' })).action, 'blocked');
  assert.equal((await claim(db, { ...j,document_email_revision: originalRevision })).action, 'blocked');
  passed('workspace, nested document, recipient and stale revision mismatches cannot claim');
  const concurrent = await Promise.all([claim(db, j), claim(other, j)]);
  assert.deepEqual(concurrent.map(c => c.action).sort(), ['busy','send']);
  const first = concurrent.find(c => c.action === 'send');
  assert.equal(first.payload.tags.find(tag => tag.name==='account_id').value, account);
  passed('concurrent duplicate submissions have one provider-send winner');
  await db.query('update jobs set deleted_at=now() where id=$1', [j.id]);
  assert.equal((await claim(db, j)).action, 'blocked');
  assert.equal(await fallback(first), null);
  await db.query('update jobs set deleted_at=null where id=$1', [j.id]);
  assert.equal(await fallback(first, 'The other.example domain is not verified.'), null);
  assert.equal(await fallback(first, 'Too many requests.', 'rate_limit_exceeded'), null);
  await db.query("insert into email_suppression values($1,'client@example.com','complaint')", [account]);
  assert.equal(await fallback(first), null);
  await db.query('delete from email_suppression');
  await db.query('update accounts set suspended_at=now() where id=$1', [account]);
  assert.equal(await fallback(first), null);
  await db.query('update accounts set suspended_at=null where id=$1', [account]);
  const changed = await fallback(first);
  assert.equal(changed.phase, 'fallback'); assert.notEqual(changed.key, first.key);
  assert.equal(changed.payload.from, 'Builder <hello@letsgetquoted.com>');
  for (const field of ['html','to','reply_to','attachments']) assert.deepEqual(changed.payload[field], first.payload[field]);
  assert.equal(await fallback(first), null);
  passed('exact domain rejection persists one fallback with distinct key and otherwise identical content');
  await db.query("update document_email_sends set lease_until=now()-interval '1 minute' where id=$1", [first.id]);
  const retry = await claim(db, j, null, { ...payload, html: 'Different token' });
  assert.equal(retry.phase, 'fallback'); assert.equal(retry.key, changed.key); assert.deepEqual(retry.payload, changed.payload);
  assert.equal(retry.retry_before, first.retry_before); assert.equal(await finish(first, 'stale-worker'), false);
  assert.equal(await finish(retry, 'provider-accepted'), true);
  await db.query("update document_email_sends set first_attempt_at=now()-interval '4 days' where id=$1", [first.id]);
  assert.equal((await claim(db, j)).action, 'already_sent');
  passed('crash recovery retains fallback snapshot/key, fences old workers and preserves acceptance beyond provider expiry');
  await db.query("update jobs set scope='Edited scope' where id=$1", [j.id]); j = await refresh('jobs', j.id);
  const newRevision = await claim(db, j); assert.equal(newRevision.action, 'send'); assert.notEqual(newRevision.id, first.id);
  assert.equal(await finish(newRevision), true);
  assert.equal((await claim(db, j)).action, 'busy');
  await db.query("update jobs set scope='Another edit' where id=$1", [j.id]); j = await refresh('jobs', j.id);
  assert.equal((await claim(db, j)).reason, 'previous_revision_unresolved');
  passed('accepted revisions allow edited documents; unresolved revisions block edits from bypassing recovery');
  await db.query("update document_email_sends set first_attempt_at=now()-interval '24 hours' where id=$1", [newRevision.id]);
  assert.equal((await claim(db, j)).action, 'review');
  assert.equal((await refresh('document_email_sends', newRevision.id)).state, 'manual_review');
  assert.equal(await confirm(newRevision, { account: foreignAccount }), false);
  assert.equal(await confirm(newRevision, { recipient: 'other@example.com' }), false);
  assert.equal(await confirm(newRevision, { phase: 'fallback' }), false);
  assert.equal(await confirm(newRevision), true); assert.equal(await confirm(newRevision), true);
  assert.equal(await confirm(newRevision, { provider: 'different-id' }), false);
  passed('expired uncertainty stops; signed callbacks recover only exact workspace, recipient, phase and provider');

  const limitedJob = await job(); let limited = await claim(db, limitedJob);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await finish(limited); await db.query("update document_email_sends set next_retry_at=now()-interval '1 minute' where id=$1", [limited.id]);
    const next = await claim(db, limitedJob);
    assert.equal(next.action, attempt<3 ? 'send' : 'review'); if (attempt<3) limited = next;
  }
  const rotatedJob = await job(); const rotated = await claim(db, rotatedJob); await finish(rotated);
  assert.equal((await claim(db, rotatedJob, null, payload, 'b'.repeat(64))).action, 'review');
  passed('attempt limit and provider-credential changes prevent unsafe replays');
  await assert.rejects(db.query('select resolve_document_email_send($1,$2,$3,$4)', [limited.id, account,'op','done']), /evidence are required/);
  assert.equal((await db.query('select resolve_document_email_send($1,$2,$3,$4) ok',
    [limited.id,account,'operator','Reviewed provider records; cancel this document message.'])).rows[0].ok, true);
  assert.equal((await claim(db, limitedJob)).action, 'review');
  assert.equal(await confirm(limited, { provider: 'late-cancelled' }), true);
  assert.equal((await refresh('document_email_sends', limited.id)).state, 'cancelled');
  passed('evidence-based closeout never rearms a revision; late callbacks preserve cancellation');

  const blockedJob = await job();
  await db.query("insert into email_suppression values($1,'client@example.com','one_click_unsubscribe')", [account]);
  const transactional = await claim(db, blockedJob); assert.equal(transactional.action, 'send'); await finish(transactional, 'transactional-id');
  await db.query("update email_suppression set reason='hard_bounce' where account_id=$1", [account]);
  assert.equal((await claim(db, j, inv)).reason, 'recipient_delivery_block');
  await db.query('delete from email_suppression');
  await db.query("update invoices set status='paid' where id=$1", [inv.id]);
  assert.equal((await claim(db, j, inv)).reason, 'invoice_closed');
  await db.query('update accounts set suspended_at=now() where id=$1', [account]);
  assert.equal((await claim(db, blockedJob)).reason, 'account_ineligible');
  await db.query('update accounts set suspended_at=null where id=$1', [account]);
  passed('transactional opt-outs remain eligible; delivery blocks, paid invoices and suspended accounts stop sends');
  const invoiceJob = await job(); const invoiceRow = await invoice(invoiceJob);
  const invoiceClaim = await claim(db, invoiceJob, invoiceRow); assert.equal(invoiceClaim.action, 'send'); await finish(invoiceClaim, 'invoice-provider');
  assert.equal((await claim(db, invoiceJob, invoiceRow)).action, 'already_sent');
  await db.query('delete from invoices where id=$1', [invoiceRow.id]);
  assert.equal(await refresh('document_email_sends', invoiceClaim.id), undefined);
  assert.ok(await refresh('document_email_sends', first.id));
  await db.query('delete from accounts where id=$1', [account]);
  assert.equal((await db.query('select count(*)::int n from document_email_sends')).rows[0].n, 0);
  passed('invoice acceptance is durable and document/account cleanup cascades correctly');
  await (await import('./verify-email-recovery-worker-checks.mjs')).verifyRecoveryWorker(db, other, root, passed);
  await (await import('./verify-platform-email-policy-checks.mjs')).verifyPlatformEmailPolicy(db, other, root, passed);
  await (await import('./verify-lifecycle-suppression-checks.mjs')).verifyLifecycleSuppression(db, root, passed);
  if (process.env.LGQ_SUPABASE_CLI) {
    await db.query('reset role');
    console.log(execFileSync(process.env.LGQ_SUPABASE_CLI, ['db','advisors','--db-url',
      `postgresql://postgres:postgres@127.0.0.1:${port}/documents?sslmode=disable`,'--type','security','--level','warn','--fail-on','none'],
    { windowsHide: true,encoding: 'utf8',timeout: 30000 }));
  }
  console.log(`${checks}/${checks} PostgreSQL checks passed`);
} finally {
  if (other) await other.end(); if (db) await db.end();
  if (process.platform==='win32' && pg.process) {
    execFileSync(join(root,'node_modules/@embedded-postgres',platform,'native/bin/pg_ctl.exe'), ['-D',dataDir,'stop','-m','fast','-w'],
      { windowsHide: true,stdio: 'ignore',timeout: 15000 }); pg.process = undefined;
  } else await pg.stop();
  const target = resolve(dataDir), allowed = resolve(os.tmpdir())+sep;
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-document-email-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target,{ recursive: true,force: true });
}
