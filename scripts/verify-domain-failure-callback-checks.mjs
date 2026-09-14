import assert from 'node:assert/strict';

export async function verifyDomainFailureCallbacks(db, other, passed) {
  const signatures = ['confirm_email_domain_failure_notice(uuid,uuid,text,text,text,timestamptz,text)',
    'finish_email_domain_failure_notice(uuid,uuid,timestamptz,text,text)', 'review_email_domain_failure_notice(uuid,uuid)'];
  for (const fn of signatures) {
    for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role,fn])).rows[0].ok, false);
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [fn])).rows[0];
    assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes('search_path=""'));
  }
  passed('callback, completion and review RPCs remain service-only invoker functions');
  const fixture = async (prepared = true) => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const domain = (await db.query("insert into email_sending_domains(account_id,domain,status) values($1,$2,'failed') returning id", [account,`${account}.test`])).rows[0].id;
    const n = (await db.query("insert into email_domain_failure_notices(account_id,domain_id,domain,state,attempted_at) values($1,$2,$3,'sending',clock_timestamp()) returning *,attempted_at::text claim_time", [account,domain,`${account}.test`])).rows[0];
    if (prepared) await db.query('select prepare_email_domain_failure_snapshot($1,$2,$3,$4,$5,$6)', [n.id,account,n.claim_time,
      { from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Action needed', html: 'Original content', tags: [
        { name: 'kind', value: 'sending_domain_failed' }, { name: 'account_id', value: account }, { name: 'domain_failure_notice_id', value: n.id },
        { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
      ] }, 'a'.repeat(64), `domain-failure:v1:${n.id}`]);
    return n;
  };
  const row = n => db.query('select * from email_domain_failure_notices where id=$1', [n.id]).then(r => r.rows[0]);
  const confirm = (client,n,status='delivered',override={}) => client.query('select confirm_email_domain_failure_notice($1,$2,$3,$4,$5,$6,$7) result',
    [override.id ?? n.id,override.account ?? n.account_id,override.recipient ?? 'owner@example.test',override.provider ?? `provider-${n.id}`,status,override.time ?? '2026-09-14T12:00:00Z',override.event ?? `event-${status}`]).then(r => r.rows[0].result);
  const finish = (client,n,provider=`provider-${n.id}`,error=null) => client.query('select finish_email_domain_failure_notice($1,$2,$3,$4,$5) ok',
    [n.id,n.account_id,n.claim_time,provider,error]).then(r => r.rows[0].ok);
  let n = await fixture();
  for (const override of [{ account: '00000000-0000-0000-0000-000000000000' }, { recipient: 'other@example.test' }, { provider: ' ' }]) assert.equal(await confirm(db,n,'delivered',override), 'conflict');
  assert.equal((await row(n)).provider_id, null);
  assert.equal(await confirm(db,n,'delivered',{ id: '00000000-0000-0000-0000-000000000000' }), 'missing');
  assert.equal(await confirm(db,await fixture(false)), 'unprepared');
  passed('wrong bindings never repair acceptance; missing and unprepared notices are distinguishable');
  assert.equal(await confirm(db,n), 'confirmed');
  assert.equal((await row(n)).state, 'resolved');
  assert.equal(await finish(db,n), true); assert.equal(await finish(db,n,null,'send_failed_or_outcome_unknown'), true);
  assert.equal((await row(n)).state, 'resolved');
  assert.equal(await finish(db,n,'conflicting-provider'), false);
  passed('early delivery repairs acceptance and survives delayed acknowledgement or timeout');
  assert.equal(await confirm(db,n,'sent',{ time: '2026-09-15T12:00:00Z' }), 'confirmed');
  assert.equal((await row(n)).callback_status, 'delivered');
  assert.equal(await confirm(db,n,'complained',{ time: '2026-09-13T12:00:00Z' }), 'confirmed');
  assert.equal(await confirm(db,n,'delivered',{ time: '2026-09-16T12:00:00Z' }), 'confirmed');
  assert.equal((await row(n)).state, 'manual_review'); assert.equal((await row(n)).last_error, 'delivery_complained');
  assert.equal((await row(n)).callback_event_id, 'event-complained');
  passed('stronger negative evidence survives older and newer delivery or sent callbacks');
  const another = await fixture();
  assert.equal(await confirm(db,another,'delivered',{ provider: `provider-${n.id}` }), 'conflict');
  assert.equal((await row(another)).provider_id, null);
  assert.equal(await confirm(db,n,'delivered',{ provider: 'replacement-provider' }), 'conflict');
  passed('provider IDs cannot move between incidents or replace an existing binding');
  n = await fixture();
  const race = await Promise.all([confirm(db,n,'bounced'),finish(other,n)]);
  assert.deepEqual(race,['confirmed',true]); assert.equal((await row(n)).state,'manual_review');
  const reversed = await fixture(); await finish(db,reversed); await confirm(other,reversed,'suppressed');
  assert.equal((await row(reversed)).last_error,'delivery_suppressed');
  passed('concurrent callback and acceptance bookkeeping preserve the negative result in both arrival orders');
  n = await fixture(); await finish(db,n,null,'send_failed_or_outcome_unknown'); await confirm(db,n,'delivered');
  assert.equal((await row(n)).state,'resolved'); assert.equal((await row(n)).last_error,'send_failed_or_outcome_unknown');
  n = await fixture(); await db.query("update email_domain_failure_notices set state='manual_review',last_error='send_outcome_unknown' where id=$1", [n.id]);
  await confirm(db,n,'sent'); assert.equal((await row(n)).state,'accepted');
  await db.query('select review_email_domain_failure_notice($1,$2)',[n.id,n.account_id]);
  assert.equal((await row(n)).state,'manual_review'); assert.equal((await row(n)).last_error,'delivery_unconfirmed');
  await confirm(db,n,'delivered'); assert.equal((await row(n)).state,'resolved');
  passed('lost acknowledgements and expired observation windows recover from bound delivery without resending');
  n = await fixture(); await finish(db,n,null,'send_failed_or_outcome_unknown');
  await db.query("select resolve_email_domain_failure_notice($1,$2,'operator','Verified customer support recovery and provider evidence')",[n.id,n.account_id]);
  await confirm(db,n,'complained'); assert.equal((await row(n)).state,'resolved'); assert.equal((await row(n)).resolved_by,'operator');
  assert.equal((await row(n)).callback_status,'complained');
  passed('operator closeout remains intact while later callback evidence is retained');
  const legacy = await fixture(false);
  assert.equal((await db.query('select review_email_domain_failure_notice($1,$2) ok',[legacy.id,legacy.account_id])).rows[0].ok,false);
  const snapshot = (await db.query('select * from email_domain_failure_snapshots where notice_id=$1',[n.id])).rows[0];
  await confirm(db,n,'sent');
  assert.deepEqual((await db.query('select * from email_domain_failure_snapshots where notice_id=$1',[n.id])).rows[0],snapshot);
  passed('legacy observation remains available and callbacks never modify snapshots or retry keys');
}
