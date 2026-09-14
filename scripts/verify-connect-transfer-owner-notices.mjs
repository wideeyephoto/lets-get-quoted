import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyConnectTransferNotices(db, other, root, passed) {
  await db.query('reset role');
  await db.query('alter table accounts add column stripe_connect_id text, add column connect_onboarded boolean default false, add column connect_disabled_at timestamptz');
  const sql=readFileSync(join(root,'migrations/20260914191924_connect_transfer_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));
  await db.query(sql); await db.query('set role service_role'); await other.query('set role service_role');
  const make=async(active=true)=>(await db.query("insert into accounts(stripe_connect_id,connect_onboarded) values('acct_connect_test',$1) returning id",[active])).rows[0].id;
  const account=await make();
  const disable=(client,id,oldEvent=null)=>client.query("update accounts set connect_onboarded=false,connect_disabled_at=clock_timestamp(),connect_notice_event_id=$2 where id=$1 and stripe_connect_id='acct_connect_test' and connect_onboarded=true and connect_disabled_at is null and connect_notice_event_id is not distinct from $3::uuid returning connect_notice_event_id",[id,randomUUID(),oldEvent]);
  const results=await Promise.all([disable(db,account),disable(other,account)]);
  assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  const notices=async()=>(await db.query("select * from owner_event_notices where account_id=$1 and source_type='account_connect' order by created_at",[account])).rows;
  let saved=await notices(); assert.equal(saved.length,1);
  assert.equal(saved[0].source_payload.title,'Payment collection needs attention');
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[saved[0].id])).rows[0].ok,true);
  assert.equal((await disable(db,account)).rowCount,0);
  passed('competing Connect interruptions save one notice atomically and repeated inactivity stays silent');

  await db.query('update accounts set connect_onboarded=true,connect_disabled_at=null where id=$1',[account]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[saved[0].source_id,account])).rowCount,0);
  assert.equal((await db.query('select state from owner_event_notices where id=$1',[saved[0].id])).rows[0].state,'cancelled');
  assert.equal((await disable(db,account)).rowCount,0); // An observation from before recovery cannot reuse the original null marker.
  assert.equal((await disable(db,account,saved[0].source_id)).rowCount,1);
  saved=await notices(); assert.equal(saved.length,2); assert.notEqual(saved[0].source_id,saved[1].source_id);
  passed('Connect recovery cancels pending alerts, fences older observations and allows a distinct later interruption');

  await db.query("update accounts set stripe_connect_id='acct_replacement' where id=$1",[account]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[saved[1].source_id,account])).rowCount,0);
  await db.query('update accounts set connect_onboarded=true,connect_disabled_at=null where id=$1',[account]);
  assert.equal((await disable(db,account,saved[1].source_id)).rowCount,0);
  const never=await make(false);
  await db.query('update accounts set connect_onboarded=false where id=$1',[never]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where account_id=$1',[never])).rows[0].c,0);
  await assert.rejects(db.query('update accounts set connect_notice_event_id=$2,connect_disabled_at=now() where id=$1',[never,randomUUID()]),/Invalid connected/);
  passed('replacement Stripe accounts invalidate pending notices and never-onboarded accounts cannot emit interruption notices');

  const observed=await make();
  const version=randomUUID();
  await db.query('update accounts set connect_status_version=$2 where id=$1 and connect_status_version is null',[observed,version]);
  assert.equal((await db.query('update accounts set connect_onboarded=false,connect_disabled_at=now(),connect_notice_event_id=$2,connect_status_version=$3 where id=$1 and connect_onboarded=true and connect_status_version is null returning id',[observed,randomUUID(),randomUUID()])).rowCount,0);
  assert.equal((await db.query('select connect_onboarded from accounts where id=$1',[observed])).rows[0].connect_onboarded,true);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where account_id=$1',[observed])).rows[0].c,0);
  passed('an unchanged active observation fences a delayed inactive result without creating a notice');

  const rollback=await make();
  await db.query('reset role'); await db.query("alter table owner_event_notices add constraint test_reject_connect check(event_kind<>'connect_transfers_inactive') not valid"); await db.query('set role service_role');
  await assert.rejects(disable(db,rollback),/test_reject_connect/);
  const unchanged=(await db.query('select connect_onboarded,connect_disabled_at,connect_notice_event_id from accounts where id=$1',[rollback])).rows[0];
  assert.deepEqual(unchanged,{connect_onboarded:true,connect_disabled_at:null,connect_notice_event_id:null});
  for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'record_connect_transfer_owner_notice()','execute') ok",[role])).rows[0].ok,false);
  await db.query('reset role'); await db.query('alter table owner_event_notices drop constraint test_reject_connect'); await db.query('set role service_role');
  passed('Connect notice write failures roll back the account change and public roles cannot invoke the trigger');
}
