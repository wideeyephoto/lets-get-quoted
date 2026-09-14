import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyChangeOrderNotices(db,other,root,passed) {
  await db.query('reset role');
  await db.query(`create table change_orders(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),job_id uuid references jobs(id),status text default 'sent',title text default 'Additional work',amount numeric default 125.50,responded_at timestamptz,signature_name text,decline_reason text);
    grant select,insert,update,delete on change_orders to service_role;`);
  const migration=readFileSync(join(root,'migrations/20260914181805_change_order_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const make=async()=> (await db.query('insert into change_orders(account_id,job_id) values($1,$2) returning id',[account,job])).rows[0].id;
  const respond=(client,id,status='approved')=> client.query("update change_orders set status=$2,signature_name='Customer',responded_at=clock_timestamp() where id=$1 and status='sent' returning id",[id,status]);
  const id=await make();const results=await Promise.all([respond(db,id),respond(other,id)]);
  assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];
  assert.equal(notice.event_kind,'change_order_approved');assert.ok(notice.source_payload.body.includes('$125.50'));
  assert.equal((await respond(db,id)).rowCount,0);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[id])).rows[0].c,1);
  passed('concurrent and repeated change-order decisions create exactly one owner notice atomically');
  const denied=await make();
  await assert.rejects(db.query("update change_orders set status='approved' where id=$1",[denied]),/source is invalid/);
  assert.equal((await db.query('select status from change_orders where id=$1',[denied])).rows[0].status,'sent');
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[denied])).rows[0].c,0);
  await db.query("set timezone='Pacific/Auckland'");
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,true);
  await db.query("set timezone='UTC'");
  const claim=(await db.query('select *,attempted_at::text claim_time from claim_owner_event_notices(1,$1,$2)',[id,account])).rows[0];
  assert.equal((await db.query('select prepare_owner_event_notice($1,$2,$3,$4) ok',[claim.id,account,claim.claim_time,'owner@example.test'])).rows[0].ok,true);
  passed('invalid decisions roll back and saved decision timestamps survive timezone changes');
  const declined=await make();await respond(db,declined,'declined');
  await db.query("update change_orders set decline_reason='Changed notes' where id=$1",[declined]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[declined,account])).rowCount,0);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[declined])).rows[0].state,'cancelled');
  const deleted=await make();await respond(db,deleted);await db.query('delete from change_orders where id=$1',[deleted]);
  await db.query('select * from claim_owner_event_notices(1,$1,$2)',[deleted,account]);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[deleted])).rows[0].state,'cancelled');
  passed('changed and deleted change-order sources cancel pending notices without recreating them');
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_function_privilege($1,'record_change_order_owner_notice()','execute') ok",[role])).rows[0].ok,false);
  }
  passed('the change-order trigger is unavailable as a public RPC');
}
