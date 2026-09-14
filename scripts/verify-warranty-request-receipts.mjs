import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyWarrantyReceipts(db,other,root,passed){
  await db.query('reset role');await db.query("alter table warranties add column starts_on date default '2020-01-01',add column ends_on date default '2030-01-01'");
  const migration=readFileSync(join(root,'migrations/20260914182236_warranty_request_receipts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,'warranty_request_receipts','select,insert,update,delete') ok",[role])).rows[0].ok,false);
  await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const warranty=(await db.query('insert into warranties(account_id,job_id) values($1,$2) returning id',[account,job])).rows[0].id;
  const request='55555555-5555-4555-8555-555555555555';
  const submit=(client,hash='a'.repeat(64),accountId=account)=>client.query('select submit_warranty_request($1,$2,$3,$4,$5,$6,$7) result',[accountId,job,warranty,request,hash,'Leaking fixture',[]]).then(r=>r.rows[0].result);
  const results=await Promise.all([submit(db),submit(other)]);
  assert.equal(results[0].claim_id,results[1].claim_id);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[results[0].claim_id])).rows[0].c,1);
  await assert.rejects(submit(db,'b'.repeat(64)),/different content/);
  await assert.rejects(submit(db,'a'.repeat(64),'00000000-0000-0000-0000-000000000000'),/Warranty not found/);
  passed('warranty request receipts serialize concurrent retries, reject changed content and preserve account binding');
  await db.query('delete from warranty_claims where id=$1',[results[0].claim_id]);
  assert.deepEqual(await submit(db),{claim_id:null,replayed:true});
  assert.equal((await db.query('select count(*)::int c from warranty_claims where warranty_id=$1',[warranty])).rows[0].c,0);
  await assert.rejects(db.query('update warranty_request_receipts set payload_hash=$1 where account_id=$2',['b'.repeat(64),account]),/permission denied/);
  passed('deleted warranty claims retain immutable request tombstones and cannot be recreated by retries');
}
