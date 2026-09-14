import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyWebsiteCallbacks(db, other, root, passed) {
  await db.query('reset role');
  const migration = readFileSync(join(root,'migrations/20260914173622_website_domain_notice_callbacks.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  await db.query('set role service_role');
  const signatures = ['confirm_website_domain_connection_notice(uuid,uuid,text,text,text,timestamptz,text)',
    'finish_website_domain_connection_notice(uuid,uuid,timestamptz,text,text)'];
  for (const fn of signatures) {
    for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role,fn])).rows[0].ok, false);
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [fn])).rows[0];
    assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes('search_path=""'));
  }
  passed('website callback and completion RPCs remain service-only invoker functions');
  const fixture = async (prepared = true) => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const site = (await db.query('insert into sites(account_id,custom_domain,custom_domain_verified_at) values($1,$2,clock_timestamp()) returning id',[account,account+'.test'])).rows[0];
    const n = (await db.query("insert into website_domain_connection_notices(account_id,site_id,domain,verified_at,state,attempted_at,recipient) select account_id,id,custom_domain,custom_domain_verified_at,'sending',clock_timestamp(),'owner@example.test' from sites where id=$1 returning *,attempted_at::text claim_time",[site.id])).rows[0];
    if (prepared) await db.query('select prepare_website_domain_notice_snapshot($1,$2,$3,$4,$5,$6)', [n.id,account,n.claim_time,
      { from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Action needed', html: 'Original content', tags: [
        { name: 'kind', value: 'custom_domain_connected' }, { name: 'account_id', value: account }, { name: 'website_domain_notice_id', value: n.id },
        { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
      ] }, 'a'.repeat(64), `website-domain-connected:v1:${n.id}`]);
    return n;
  };
  const row = n => db.query('select * from website_domain_connection_notices where id=$1', [n.id]).then(r => r.rows[0]);
  const confirm = (client,n,status='delivered',override={}) => client.query('select confirm_website_domain_connection_notice($1,$2,$3,$4,$5,$6,$7) result',
    [override.id ?? n.id,override.account ?? n.account_id,override.recipient ?? 'owner@example.test',override.provider ?? `provider-${n.id}`,status,override.time ?? '2026-09-14T12:00:00Z',override.event ?? `event-${status}`]).then(r => r.rows[0].result);
  const finish = (client,n,provider=`provider-${n.id}`,error=null) => client.query('select finish_website_domain_connection_notice($1,$2,$3,$4,$5) ok',
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
  n = await fixture(); await db.query("update website_domain_connection_notices set state='manual_review',last_error='send_outcome_unknown' where id=$1", [n.id]);
  await confirm(db,n,'sent'); assert.equal((await row(n)).state,'accepted');
  await db.query('select * from claim_website_domain_connection_notices(1)');
  assert.equal((await row(n)).state,'manual_review'); assert.equal((await row(n)).last_error,'delivery_unconfirmed');
  await confirm(db,n,'delivered'); assert.equal((await row(n)).state,'resolved');
  passed('lost acknowledgements and expired observation windows recover from bound delivery without resending');
  n = await fixture(); await finish(db,n,null,'send_failed_or_outcome_unknown');
  await db.query("select resolve_website_domain_connection_notice($1,$2,'operator','Verified customer support recovery and provider evidence')",[n.id,n.account_id]);
  await confirm(db,n,'complained'); assert.equal((await row(n)).state,'resolved'); assert.equal((await row(n)).resolved_by,'operator');
  assert.equal((await row(n)).callback_status,'complained');
  passed('operator closeout remains intact while later callback evidence is retained');
  const snapshot = (await db.query('select * from website_domain_notice_snapshots where notice_id=$1',[n.id])).rows[0];
  await confirm(db,n,'sent');
  assert.deepEqual((await db.query('select * from website_domain_notice_snapshots where notice_id=$1',[n.id])).rows[0],snapshot);
  passed('callbacks never modify snapshots or retry keys');
}
