import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyPrivateFeedback(db,other,root,passed){
  await db.query('reset role');
  const migration=readFileSync(join(root,'migrations/20260914182551_private_feedback_owner_requests.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const submit=(client,hash='a'.repeat(64))=>client.query("select submit_client_owner_request($1,$2,'77777777-7777-4777-8777-777777777777',$3,'review_feedback','Private feedback (2 of 5 stars)','Please call me','{\"rating\":2}') result",[account,job,hash]).then(r=>r.rows[0].result);
  const results=await Promise.all([submit(db),submit(other)]);assert.equal(results[0].feed_id,results[1].feed_id);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
  const feed=(await db.query('select * from job_feed where id=$1',[results[0].feed_id])).rows[0];assert.equal(feed.visibility,'internal');assert.equal(feed.meta.rating,2);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[feed.id])).rows[0].c,1);
  await assert.rejects(submit(db,'b'.repeat(64)),/different content/);
  passed('private feedback stays internal and concurrent/repeated requests create one source and owner notice');
  await db.query('delete from job_feed where id=$1',[feed.id]);assert.deepEqual(await submit(db),{feed_id:null,replayed:true});
  const next=(await db.query("select submit_client_owner_request($1,$2,gen_random_uuid(),$3,'client_question','Question','Help','{}') result",[account,job,'c'.repeat(64)])).rows[0].result;
  assert.equal((await db.query('select visibility from job_feed where id=$1',[next.feed_id])).rows[0].visibility,'client');
  passed('feedback deletion tombstones survive and existing customer questions retain client visibility');
}
