import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyReviewLinkFeedback(db,other,root,passed){
  await db.query('reset role');await db.query(`create table review_invites(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),job_id uuid references jobs(id),token text unique,client_name text,rating integer,feedback text,feedback_at timestamptz,routed_to text,responded_at timestamptz);
    grant select,insert,update,delete on review_invites to service_role;`);
  const migration=readFileSync(join(root,'migrations/20260914182814_review_link_feedback_requests.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  await db.query("insert into review_invites(account_id,job_id,token,client_name,rating) values($1,$2,'review-test','Customer',2)",[account,job]);
  const submit=(client,hash='a'.repeat(64),token='review-test')=>client.query("select submit_review_link_feedback($1,'88888888-8888-4888-8888-888888888888',$2,'Please call me') result",[token,hash]).then(r=>r.rows[0].result);
  const results=await Promise.all([submit(db),submit(other)]);assert.equal(results[0].source_id,results[1].source_id);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[results[0].source_id])).rows[0].c,1);
  const feed=(await db.query('select * from job_feed where account_id=$1',[account])).rows;assert.equal(feed.length,1);assert.equal(feed[0].visibility,'internal');
  await assert.rejects(submit(db,'b'.repeat(64)),/different content/);await assert.rejects(submit(db,'a'.repeat(64),'missing'),/Review link not found/);
  passed('review-link feedback atomically creates one private event/notice across concurrent retries and rejects changed content');
  await db.query("insert into review_invites(account_id,token,rating) values($1,'no-job',5)",[account]);
  const noJob=await submit(db,'a'.repeat(64),'no-job');const notice=(await db.query('select * from owner_event_notices where source_id=$1',[noJob.source_id])).rows[0];assert.equal(notice.source_payload.job_id,null);
  assert.equal((await db.query('select count(*)::int c from job_feed where account_id=$1',[account])).rows[0].c,1);
  await db.query("delete from review_invites where token='no-job'");await db.query('select * from claim_owner_event_notices(1,$1,$2)',[noJob.source_id,account]);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[noJob.source_id])).rows[0].state,'cancelled');
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'submit_review_link_feedback(text,uuid,text,text)','execute') ok",[role])).rows[0].ok,false);
  passed('jobless review links retain their notice, deleted invites cancel pending mail, and submission is service-only');
}
