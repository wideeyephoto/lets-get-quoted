import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Extends the disposable account-closure verifier. Installs the actual notification
// table, grants and disposal triggers; unrelated application columns/RPCs are not
// needed for these checks. This never invokes a queue or a hosted service.
export async function verifyMessagingLifecycleDisposal({ db, other, source, section, passed }) {
  const tables = ['messaging_lifecycle_notifications', 'messaging_lifecycle_email_evidence'];
  await db.query(`create function public.is_owner(uuid) returns boolean language sql as 'select false';
    create table public.messaging_registration_applications (
      id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id));`);
  await db.query(section(source('20260908122000_messaging_lifecycle_notification_outbox_20260907.sql'),
    'create table public.messaging_lifecycle_notifications', '-- Trigger-only authority:'));
  await db.query(section(source('20260908122009_messaging_lifecycle_email_evidence_20260907.sql'),
    'alter table public.messaging_lifecycle_notifications', '-- Authenticate staff'));

  const fixture = async () => {
    const account = (await db.query('insert into accounts(suspended_at) values(now()) returning id')).rows[0].id;
    const application = (await db.query('insert into messaging_registration_applications(account_id) values($1) returning id', [account])).rows[0].id;
    const job = (await db.query(`insert into account_closure_jobs(closure_subject_id,account_id,requested_by_role,
      closure_state,recoverable_until,purge_eligible_at,lease_token,lease_expires_at,domain_cleanup_state)
      values($1,$1,'admin','processing',now()-interval '1 minute',now()-interval '1 minute',$2,
        now()+interval '5 minutes','not_applicable') returning id`, [account, randomUUID()])).rows[0].id;
    const notice = (await db.query(`insert into messaging_lifecycle_notifications(application_id,account_id,source_key,
      application_revision,kind,recipient_email,livemode)
      values($1,$2,$3,1,'application_received','owner@example.invalid',false) returning id`, [application, account, randomUUID()])).rows[0].id;
    await db.query(`insert into messaging_lifecycle_email_evidence(notification_id,account_id,event_key,provider_email_id,
      source,status,evidence_digest) values($1,$2,$3,'fixture-email','webhook','delivered','fixture-digest')`, [notice, account, randomUUID()]);
    return { account, application, job, notice };
  };
  const asRole = async (role, action) => {
    assert(['anon', 'authenticated', 'service_role'].includes(role));
    await db.query(`set role ${role}`);
    try { return await action(); } finally { await db.query('reset role'); }
  };
  const remaining = async (table, account) => {
    assert(tables.includes(table));
    return Number((await db.query(`select count(*) from ${table} where account_id=$1`, [account])).rows[0].count);
  };
  const dispose = (table, account) => {
    assert(tables.includes(table));
    return asRole('service_role', () => db.query(`delete from ${table} where account_id=$1`, [account]));
  };

  const browser = await fixture();
  for (const role of ['anon', 'authenticated']) {
    for (const table of tables) {
      await assert.rejects(asRole(role, () => db.query(`delete from ${table} where account_id=$1`, [browser.account])), { code: '42501' });
      assert.equal(await remaining(table, browser.account), 1);
    }
  }
  passed('lifecycle disposal uses existing service DELETE grants; browser roles cannot delete');

  const guards = [
    ['active account', 'update accounts set suspended_at=null where id=$1', 'account'],
    ['legal hold', 'update accounts set legal_hold=true where id=$1', 'account'],
    ['unclaimed closure', "update account_closure_jobs set closure_state='pending_grace_period' where id=$1", 'job'],
    ['recovery period', "update account_closure_jobs set recoverable_until=now()+interval '1 day',purge_eligible_at=now()+interval '1 day' where id=$1", 'job'],
    ['missing lease', 'update account_closure_jobs set lease_token=null where id=$1', 'job'],
    ['expired lease', "update account_closure_jobs set lease_expires_at=now()-interval '1 second' where id=$1", 'job'],
    ['completed closure', 'update account_closure_jobs set completed_at=now() where id=$1', 'job'],
  ];
  for (const [name, sql, key] of guards) {
    const f = await fixture();
    await db.query(sql, [f[key]]);
    for (const table of tables) {
      await assert.rejects(dispose(table, f.account), { code: '23514' }, name);
      assert.equal(await remaining(table, f.account), 1, name);
    }
  }
  passed('actual lifecycle triggers reject active/held accounts, unclaimed or recoverable closures, missing/expired leases and completed jobs');

  const closing = await fixture(), neighbor = await fixture();
  assert.equal((await dispose(tables[0], closing.account)).rowCount, 1);
  assert.equal(await remaining(tables[0], closing.account), 0);
  assert.equal(await remaining(tables[1], closing.account), 0, 'Actual notification FK must cascade through the evidence guard');
  for (const table of tables) {
    assert.equal(await remaining(table, neighbor.account), 1, 'Neighbor records must survive');
    assert.equal((await dispose(table, closing.account)).rowCount, 0, 'Repeating disposal must be harmless');
  }
  assert.equal((await db.query('select id from messaging_registration_applications where id=$1', [closing.application])).rowCount, 1);
  passed('eligible notification disposal cascades only its evidence, preserves the neighboring account and retained application, and replays safely');

  const direct = await fixture();
  assert.equal((await dispose(tables[1], direct.account)).rowCount, 1);
  assert.equal(await remaining(tables[0], direct.account), 1);
  assert.equal(await remaining(tables[1], neighbor.account), 1);
  assert.equal((await dispose(tables[1], direct.account)).rowCount, 0);
  passed('direct evidence cleanup is account-scoped and replay-safe without deleting its retained notification');

  const allowed = await fixture(), held = await fixture();
  await db.query('update accounts set legal_hold=true where id=$1', [held.account]);
  await assert.rejects(asRole('service_role', () => db.query('delete from messaging_lifecycle_notifications where account_id=any($1::uuid[])', [[allowed.account, held.account]])), { code: '23514' });
  for (const f of [allowed, held]) for (const table of tables) assert.equal(await remaining(table, f.account), 1);
  passed('a protected row rejects the entire mixed-account delete, preserving notifications and cascading evidence atomically');

  const racing = await fixture();
  await other.query("set statement_timeout='5s'; set role service_role");
  await db.query('begin');
  let pending;
  try {
    await db.query('update accounts set legal_hold=true where id=$1', [racing.account]);
    pending = other.query('delete from messaging_lifecycle_notifications where account_id=$1', [racing.account])
      .then(result => ({ result }), error => ({ error }));
    let blocked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      await db.query('select pg_stat_clear_snapshot()');
      const activity = (await db.query('select wait_event_type from pg_stat_activity where pid=$1', [other.processID])).rows[0];
      if (activity?.wait_event_type === 'Lock') { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(blocked, 'Disposal must actually wait behind the concurrent legal-hold update');
    await db.query('commit');
    assert.equal((await pending).error?.code, '23514');
  } finally {
    await db.query('rollback');
    if (pending) await pending;
    await other.query('reset role; reset statement_timeout');
  }
  for (const table of tables) assert.equal(await remaining(table, racing.account), 1);
  passed('a concurrent legal hold is observed after the account lock releases; no notification or evidence is lost');
}
