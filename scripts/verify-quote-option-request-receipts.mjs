import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyQuoteOptionRequests(db,other,root,passed){
  await db.query('reset role');
  const sql=readFileSync(join(root,'migrations/20260914200549_quote_option_request_receipts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));
  await db.query(sql);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const expected={status:'in_progress',started_at:null,scheduled_for:null,quote_items:[],quoted_amount:100};
  const request=randomUUID();const hash='a'.repeat(64);
  const save=(conn,requestId=request,payloadHash=hash)=>conn.query("select save_client_quote_option_request($1,$2,$3,$4,$5,'[{\"id\":\"extra\",\"selected\":true}]',150,'Options changed','Added work.') r",[account,job,requestId,payloadHash,expected]);
  const race=await Promise.all([save(db),save(other)]);
  assert.equal(race[0].rows[0].r.event_id,race[1].rows[0].r.event_id);
  assert.equal(race.filter(r=>r.rows[0].r.replayed).length,1);
  assert.equal((await db.query('select count(*)::int c from quote_option_request_receipts where account_id=$1',[account])).rows[0].c,1);
  passed('concurrent quote-option request retries return the same receipt and saved owner event');
  await db.query("update jobs set quoted_amount=180,quote_items='[]' where id=$1",[job]);
  assert.equal((await save(db)).rows[0].r.total,150);
  assert.equal((await db.query('select quoted_amount from jobs where id=$1',[job])).rows[0].quoted_amount,'180');
  await assert.rejects(save(db,request,'b'.repeat(64)),/different content/);
  await assert.rejects(save(db,randomUUID()),/Quote changed/);
  passed('delayed quote retries preserve newer changes, while changed request content and stale new requests are rejected');
  await db.query('delete from jobs where id=$1',[job]);assert.equal((await save(db)).rows[0].r.total,150);
  assert.equal((await db.query('select job_id from quote_option_request_receipts where request_id=$1',[request])).rows[0].job_id,null);
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query("select has_table_privilege($1,'quote_option_request_receipts','select') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,'save_client_quote_option_request(uuid,uuid,uuid,text,jsonb,jsonb,numeric,text,text)','execute') ok",[role])).rows[0].ok,false);
  }
  passed('quote-option receipts survive job deletion and remain inaccessible to public roles');
  const rollbackJob=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  await db.query('reset role');await db.query('alter table quote_option_request_receipts add constraint test_reject_receipt check(false) not valid');await db.query('set role service_role');
  await assert.rejects(db.query("select save_client_quote_option_request($1,$2,$3,$4,$5,'[{\"id\":\"extra\",\"selected\":true}]',150,'Options changed','Added work.')",[account,rollbackJob,randomUUID(),hash,expected]),/test_reject_receipt/);
  assert.equal((await db.query('select quoted_amount from jobs where id=$1',[rollbackJob])).rows[0].quoted_amount,'100');
  assert.equal((await db.query('select count(*)::int c from job_feed where job_id=$1',[rollbackJob])).rows[0].c,0);
  await db.query('reset role');await db.query('alter table quote_option_request_receipts drop constraint test_reject_receipt');await db.query('set role service_role');
  passed('failed quote receipt storage rolls back the quote, history and owner notice');
}
