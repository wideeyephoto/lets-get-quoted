import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyMarginEvaluationRequests(db,other,root,passed){
  await db.query('reset role');
  await db.query('alter table jobs add column deleted_at timestamptz');
  await db.query('alter table costs drop constraint costs_account_id_fkey,drop constraint costs_job_id_fkey; alter table costs add foreign key(account_id) references accounts(id) on delete cascade,add foreign key(job_id) references jobs(id) on delete cascade');
  const sql=readFileSync(join(root,'migrations/20260914201537_margin_evaluation_requests.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));await db.query(sql);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const add=conn=>conn.query("insert into costs(account_id,job_id,type,amount) values($1,$2,'material',90) returning id",[account,job]);
  const added=await Promise.all([add(db),add(other)]);
  assert.equal((await db.query('select count(*)::int c from margin_evaluation_requests where account_id=$1',[account])).rows[0].c,1);
  const claims=await Promise.all([db.query('select * from claim_margin_evaluations(5)'),other.query('select * from claim_margin_evaluations(5)')]);
  assert.equal(claims.flatMap(r=>r.rows).length,1);const claim=claims.flatMap(r=>r.rows)[0];
  passed('cost writes atomically leave one pending margin evaluation and concurrent workers have one lease winner');
  const finish=(row,ok=true)=>db.query('select finish_margin_evaluation($1,$2,$3,$4,$5) ok',[account,job,row.revision,row.lease_id,ok]);
  await db.query('update costs set amount=95 where id=$1',[added[0].rows[0].id]);
  assert.equal((await finish(claim)).rows[0].ok,true);
  const newer=(await db.query('select * from claim_margin_evaluations(5)')).rows[0];assert.notEqual(newer.revision,claim.revision);
  assert.equal((await finish(claim)).rows[0].ok,false);
  await finish(newer,false);assert.equal((await db.query('select last_error from margin_evaluation_requests where job_id=$1',[job])).rows[0].last_error,'evaluation_failed');
  const retry=(await db.query('select * from claim_margin_evaluations(5)')).rows[0];await finish(retry);
  assert.equal((await db.query('select count(*)::int c from margin_evaluation_requests where job_id=$1',[job])).rows[0].c,0);
  passed('finishing an older margin generation retains newer work; failed evaluation remains retryable and stale leases cannot clear it');
  await db.query('delete from costs where id=$1',[added[0].rows[0].id]);const expired=(await db.query('select * from claim_margin_evaluations(5)')).rows[0];
  await db.query("update margin_evaluation_requests set lease_until=clock_timestamp()-interval '1 second' where job_id=$1",[job]);
  const reclaimed=(await db.query('select * from claim_margin_evaluations(5)')).rows[0];assert.notEqual(reclaimed.lease_id,expired.lease_id);assert.equal((await finish(expired)).rows[0].ok,false);await finish(reclaimed);
  passed('cost deletion requests re-evaluation and interrupted workers can be reclaimed without trusting an old lease');
  await db.query('reset role');await db.query('alter table margin_evaluation_requests add constraint test_reject_evaluation check(false) not valid');await db.query('set role service_role');
  const before=(await db.query('select count(*)::int c from costs where job_id=$1',[job])).rows[0].c;
  await assert.rejects(add(db),/test_reject_evaluation/);assert.equal((await db.query('select count(*)::int c from costs where job_id=$1',[job])).rows[0].c,before);
  await db.query('reset role');await db.query('alter table margin_evaluation_requests drop constraint test_reject_evaluation');await db.query('set role service_role');
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query("select has_table_privilege($1,'margin_evaluation_requests','select') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,'claim_margin_evaluations(integer)','execute') ok",[role])).rows[0].ok,false);
  }
  await add(db);await db.query('update jobs set deleted_at=now() where id=$1',[job]);
  assert.equal((await db.query('select current_margin_warning($1,$2) snapshot',[account,job])).rows[0].snapshot,null);
  await db.query('delete from accounts where id=$1',[account]);
  assert.equal((await db.query('select count(*)::int c from margin_evaluation_requests where account_id=$1',[account])).rows[0].c,0);
  passed('failed work storage rolls back cost insertion, cleanup removes pending work and public roles cannot claim it');
}
