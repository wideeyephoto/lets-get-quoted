import assert from 'node:assert/strict';

export async function verifyDomainFailureSnapshots(db, other, passed) {
  const signature = 'prepare_email_domain_failure_snapshot(uuid,uuid,timestamptz,jsonb,text,text)';
  await db.query('reset role');
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'email_domain_failure_snapshots','select,insert,update,delete') ok", [role])).rows[0].ok, false);
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role, signature])).rows[0].ok, false);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='email_domain_failure_snapshots'::regclass")).rows[0].relrowsecurity, true);
  for (const fn of [signature, 'guard_email_domain_failure_snapshot()', 'guard_email_domain_failure_identity()']) {
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [fn])).rows[0];
    assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes('search_path=""'));
  }
  passed('snapshot RLS, private grants, invoker rights and fixed search paths');
  await db.query('set role service_role'); await other.query('set role service_role');
  const fixture = async () => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const domain = (await db.query("insert into email_sending_domains(account_id,domain,status) values($1,$2,'failed') returning id", [account, `${account}.example`])).rows[0].id;
    return (await db.query("insert into email_domain_failure_notices(account_id,domain_id,domain,reason,state,attempted_at) values($1,$2,$3,'DNS missing','sending',clock_timestamp()) returning *,attempted_at::text claim_time", [account, domain, `${account}.example`])).rows[0];
  };
  const payload = n => ({ from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Action needed', html: '<p>Saved settings link</p>', tags: [
    { name: 'account_id', value: n.account_id }, { name: 'domain_failure_notice_id', value: n.id },
    { name: 'kind', value: 'sending_domain_failed' }, { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
  ] });
  const prepare = (client, n, overrides = {}) => client.query(`select ${signature.split('(')[0]}($1,$2,$3,$4,$5,$6) ok`, [n.id, overrides.account ?? n.account_id, overrides.time ?? n.claim_time, overrides.payload ?? payload(n), overrides.fingerprint ?? 'a'.repeat(64), overrides.key ?? `domain-failure:v1:${n.id}`]).then(r => r.rows[0].ok);
  const saved = n => db.query('select * from email_domain_failure_snapshots where notice_id=$1', [n.id]).then(r => r.rows[0]);
  const n = await fixture();
  assert.equal(await prepare(db, n, { account: '00000000-0000-0000-0000-000000000000' }), false);
  assert.equal(await prepare(db, n, { time: '2000-01-01T00:00:00Z' }), false);
  assert.equal(await saved(n), undefined);
  passed('wrong workspace and stale claim cannot prepare a message');
  for (const message of [
    { ...payload(n), to: ['owner@example.test','other@example.test'] },
    { ...payload(n), cc: 'other@example.test' }, { ...payload(n), bcc: 'other@example.test' },
    { ...payload(n), from: 'Builder <owner@builder.test>' }, { ...payload(n), html: '' },
    { ...payload(n), tags: [] }, { ...payload(n), tags: [...payload(n).tags, payload(n).tags[0]] },
    { ...payload(n), tags: payload(n).tags.map(t => t.name === 'account_id' ? { ...t, value: 'wrong-account' } : t) },
    { ...payload(n), tags: payload(n).tags.map(t => t.name === 'domain_failure_notice_id' ? { ...t, value: 'wrong-notice' } : t) },
  ]) await assert.rejects(prepare(db, n, { payload: message }), /Invalid domain failure/);
  await assert.rejects(prepare(db, n, { fingerprint: 'secret' }), /check constraint/);
  await assert.rejects(prepare(db, n, { key: `replacement:${n.id}` }), /check constraint/);
  assert.equal(await saved(n), undefined);
  passed('invalid recipient sets, payload bindings, provider scope and keys are rejected atomically');
  const results = await Promise.all([prepare(db, n), prepare(other, n)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual((await saved(n)).payload, payload(n));
  assert.equal((await saved(n)).provider_fingerprint, 'a'.repeat(64));
  assert.equal(await prepare(db, n, { payload: { ...payload(n), to: 'new-owner@example.test' } }), false);
  assert.equal(await prepare(db, n, { fingerprint: 'b'.repeat(64) }), false);
  assert.deepEqual((await saved(n)).payload, payload(n));
  passed('concurrent preparation has one winner and never replaces saved content or credentials');
  await assert.rejects(db.query("update email_domain_failure_snapshots set payload='{}' where notice_id=$1", [n.id]), /permission denied/);
  await assert.rejects(db.query('delete from email_domain_failure_snapshots where notice_id=$1', [n.id]), /permission denied/);
  await assert.rejects(db.query('update email_domain_failure_notices set account_id=gen_random_uuid() where id=$1', [n.id]), /identity is immutable/);
  await assert.rejects(db.query("update email_domain_failure_notices set domain='changed.example' where id=$1", [n.id]), /identity is immutable/);
  await db.query('reset role');
  await assert.rejects(db.query("update email_domain_failure_snapshots set payload='{}' where notice_id=$1", [n.id]), /snapshot is immutable/);
  await db.query('set role service_role');
  passed('saved snapshots and episode binding resist mutation');
  await db.query("update email_domain_failure_notices set state='accepted',provider_id='snapshot-provider',accepted_at=now() where id=$1", [n.id]);
  assert.equal(await prepare(db, n), false);
  assert.deepEqual((await saved(n)).payload, payload(n));
  passed('acceptance bookkeeping preserves the snapshot and cannot reauthorize submission');
  for (const condition of ['verified', 'disabled', 'deleted', 'expired', 'manual_review']) {
    const row = await fixture();
    if (condition === 'expired') {
      const expired = (await db.query("update email_domain_failure_notices set attempted_at=now()-interval '6 minutes' where id=$1 returning attempted_at::text claim_time", [row.id])).rows[0];
      row.claim_time = expired.claim_time;
    } else if (condition === 'manual_review') await db.query("update email_domain_failure_notices set state='manual_review' where id=$1", [row.id]);
    else if (condition === 'deleted') await db.query('delete from email_sending_domains where id=$1', [row.domain_id]);
    else await db.query('update email_sending_domains set status=$2 where id=$1', [row.domain_id, condition]);
    if (condition === 'manual_review') assert.equal(await prepare(db, row), false);
    else await assert.rejects(prepare(db, row), /obsolete|not eligible/);
    assert.equal(await saved(row), undefined);
  }
  passed('recovery, holds, disconnection, expiration and reviewed incidents cannot prepare a send');
  const lost = await fixture(); await prepare(db, lost);
  await db.query("update email_domain_failure_notices set attempted_at=now()-interval '6 minutes' where id=$1", [lost.id]);
  await db.query('select * from claim_email_domain_failure_notices(1)');
  assert.equal((await db.query('select state from email_domain_failure_notices where id=$1', [lost.id])).rows[0].state, 'manual_review');
  assert.equal(await prepare(db, lost), false); assert.ok(await saved(lost));
  passed('a crash after snapshot persistence retains evidence and never grants a retry');
  await db.query('delete from email_sending_domains where id=$1', [n.domain_id]);
  assert.ok(await saved(n));
  await db.query('delete from accounts where id=$1', [n.account_id]);
  assert.equal(await saved(n), undefined); assert.ok(await saved(lost));
  passed('domain deletion retains evidence; account cleanup remains scoped');
}
