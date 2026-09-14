import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyWarrantyClaimNotices(db,other,root,passed) {
  await db.query('reset role');
  await db.query(`create table warranties(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),job_id uuid references jobs(id));
    create table warranty_claims(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),job_id uuid references jobs(id),warranty_id uuid references warranties(id),status text default 'open',description text,photo_paths text[] default '{}',in_warranty_at_claim boolean default true);
    grant select,insert,update,delete on warranties,warranty_claims to service_role;`);
  const migration=readFileSync(join(root,'migrations/20260914182041_warranty_claim_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const warranty=(await db.query('insert into warranties(account_id,job_id) values($1,$2) returning id',[account,job])).rows[0].id;
  const create=(a=account,description='Leak reported')=>db.query("insert into warranty_claims(account_id,job_id,warranty_id,description,photo_paths,in_warranty_at_claim) values($1,$2,$3,$4,ARRAY['saved-photo.jpg'],false) returning id",[a,job,warranty,description]).then(r=>r.rows[0].id);
  const id=await create();const saved=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];
  assert.equal(saved.event_kind,'warranty_claim');assert.equal(saved.source_payload.in_warranty,'false');
  assert.ok(saved.source_payload.body.includes('cover had already ended'));assert.deepEqual(saved.source_payload.photo_paths,['saved-photo.jpg']);
  const claims=await Promise.all([db.query('select * from claim_owner_event_notices(1,$1,$2)',[id,account]),other.query('select * from claim_owner_event_notices(1,$1,$2)',[id,account])]);
  assert.equal(claims.reduce((n,r)=>n+r.rowCount,0),1);
  passed('warranty creation saves coverage and attachments atomically with a one-winner owner notice');
  const foreign=(await db.query('insert into accounts default values returning id')).rows[0].id;
  await assert.rejects(create(foreign),/source is invalid/);
  await assert.rejects(create(account,'x'.repeat(25000)),/check constraint/);
  assert.equal((await db.query('select count(*)::int c from warranty_claims where account_id=$1',[account])).rows[0].c,1);
  passed('foreign warranty ownership and failed notice writes roll back the claim');
  for (const change of ["status='resolved'","description='Changed'","photo_paths=ARRAY['replacement.jpg']"]) {
    const next=await create();await db.query(`update warranty_claims set ${change} where id=$1`,[next]);
    assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[next,account])).rowCount,0);
    assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[next])).rows[0].state,'cancelled');
  }
  const removed=await create();await db.query('delete from warranty_claims where id=$1',[removed]);
  await db.query('select * from claim_owner_event_notices(1,$1,$2)',[removed,account]);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[removed])).rows[0].state,'cancelled');
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'record_warranty_claim_owner_notice()','execute') ok",[role])).rows[0].ok,false);
  passed('resolved, changed or deleted claims cancel pending notices and the trigger is not a public RPC');
}
