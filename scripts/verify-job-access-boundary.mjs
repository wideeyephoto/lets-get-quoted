// Disposable PostgreSQL (PGlite) tests. No network, .env file or live database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.LGQ_PGLITE_MODULE || '@electric-sql/pglite';
const {PGlite}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const db=new PGlite();let passed=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [a,b,ownerA,ownerB,officeA,clientA,clientB,jobA,jobB]=Array.from({length:9},(_,n)=>id(n+1));
const q=(s,p=[])=>db.query(s,p);
async function as(actor,fn){await db.exec('begin');try{await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,role:'authenticated'})]);await db.exec('set local role authenticated');return await fn();}finally{await db.exec('rollback');}}
async function deny(actor,sql,p=[]){await as(actor,async()=>{let error;try{await q(sql,p)}catch(e){error=e}assert(error,'Expected a database rejection');assert(['42501','23503','23514'].includes(error.code),error.message);});}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    create table accounts(id uuid primary key,suspended_at timestamptz);
    create table memberships(account_id uuid references accounts,user_id uuid,role text,deactivated_at timestamptz,primary key(account_id,user_id));
    create table office_capabilities(capability text primary key,enabled boolean);
    create table office_member_capabilities(account_id uuid,user_id uuid,capability text);
    create function office_can(acc uuid,cap text) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.memberships m join public.accounts a on a.id=m.account_id
      where m.account_id=acc and m.user_id=auth.uid() and m.deactivated_at is null and a.suspended_at is null and
      (m.role='owner' or (m.role='office' and exists(select 1 from public.office_capabilities c join public.office_member_capabilities g on g.capability=c.capability
        where c.capability=cap and c.enabled and g.account_id=acc and g.user_id=auth.uid()))))$$;
    create table clients(id uuid primary key default gen_random_uuid(),account_id uuid not null references accounts,name text);
    create table jobs(id uuid primary key default gen_random_uuid(),account_id uuid not null references accounts,
      client_id uuid constraint jobs_client_id_fkey references clients(id) on delete set null,ref text not null,
      scope text,status text not null default 'in_progress',quoted_amount numeric(12,2) not null default 0,quote_items jsonb,
      deposit_gate text,reschedule_discount_percent numeric,reschedule_discount_note text,reschedule_discount_agreed_at timestamptz,
      quote_signer_name text,quote_signed_at timestamptz,quote_signature_path text,quote_signature_method text,
      created_at timestamptz not null default now());
    alter table jobs enable row level security;
    create policy job_read on jobs for select to authenticated using(office_can(account_id,'jobs.read'));
    create policy job_insert on jobs for insert to authenticated with check(office_can(account_id,'jobs.write'));
    create policy job_update on jobs for update to authenticated using(office_can(account_id,'jobs.write')) with check(office_can(account_id,'jobs.write'));
    create policy job_delete on jobs for delete to authenticated using(office_can(account_id,'jobs.write'));
    grant select,insert,update,delete on jobs to authenticated,service_role;
    insert into office_capabilities values('jobs.read',true),('jobs.write',true),('quotes.read',true),('quotes.write',true),('reports.read',true);
  `);
  await q('insert into accounts(id) values($1),($2)',[a,b]);
  await q("insert into memberships values($1,$2,'owner',null),($3,$4,'owner',null),($1,$5,'office',null)",[a,ownerA,b,ownerB,officeA]);
  await q('insert into clients(id,account_id,name) values($1,$2,$3),($4,$5,$6)',[clientA,a,'A',clientB,b,'B']);
  await q("insert into jobs(id,account_id,client_id,ref,scope,quoted_amount,quote_items) values($1,$2,$3,'A','original',17351.69,'[{\"amount\":17351.69}]'),($4,$5,$6,'B','foreign',28463.72,'[]')",[jobA,a,clientA,jobB,b,clientB]);
  await q("insert into office_member_capabilities values($1,$2,'jobs.read')",[a,officeA]);
  for(const file of ['20260909212204_job_access_financial_boundary.sql','20260909212423_revoke_raw_job_financial_reads.sql'])await db.exec(readFileSync(resolve('migrations',file),'utf8'));
  await test('raw quote projection, wildcard, row conversion and financial-filter oracle denied',async()=>{
    for(const sql of ['select quoted_amount from jobs','select * from jobs','select to_jsonb(jobs) from jobs','select count(*) from jobs where quoted_amount>0'])await deny(officeA,sql);
  });
  await test('ordinary raw operational fields remain readable',async()=>{await as(officeA,async()=>{const r=await q('select id,scope from jobs');assert.deepEqual(r.rows,[{id:jobA,scope:'original'}]);});});
  await test('reader view preserves rows but masks amounts/items',async()=>{await as(officeA,async()=>{const r=await q('select id,scope,quoted_amount,quote_items from job_access');assert.deepEqual(r.rows,[{id:jobA,scope:'original',quoted_amount:'0.00',quote_items:null}]);});});
  await test('owner view preserves exact price and only own workspace',async()=>{await as(ownerA,async()=>{const r=await q('select id,quoted_amount from job_access');assert.equal(r.rows.length,1);assert.equal(r.rows[0].quoted_amount,'17351.69');});});
  await test('read-only view update returns no changed row',async()=>{await as(officeA,async()=>{const r=await q("update job_access set scope='denied' where id=$1 returning id",[jobA]);assert.equal(r.rows.length,0);});});
  await q("insert into office_member_capabilities values($1,$2,'jobs.write')",[a,officeA]);
  await test('writer view edit preserves hidden stored quote and returns masked result',async()=>{await as(officeA,async()=>{const r=await q("update job_access set scope='allowed' where id=$1 returning *",[jobA]);assert.equal(r.rows[0].scope,'allowed');assert.equal(r.rows[0].quoted_amount,'0.00');await db.exec('reset role');assert.equal((await q('select quoted_amount from jobs where id=$1',[jobA])).rows[0].quoted_amount,'17351.69');});});
  await test('writer cannot alter financial fields through raw table or safe view',async()=>{
    for(const table of ['jobs','job_access'])for(const patch of ["quoted_amount=1", "quote_items='[]'", "deposit_gate='before_schedule'", "reschedule_discount_percent=10", "quote_signature_path='forged'"])
      await deny(officeA,`update ${table} set scope='smuggled',${patch} where id=$1`,[jobA]);
    assert.equal((await q('select scope from jobs where id=$1',[jobA])).rows[0].scope,'original');
  });
  await test('zero-priced operational insertion preserves defaults and returns usable row',async()=>{await as(officeA,async()=>{const r=await q('insert into job_access(account_id,client_id,ref,scope) values($1,$2,$3,$4) returning *',[a,clientA,'NEW','safe']);assert(r.rows[0].id);assert.equal(r.rows[0].status,'in_progress');assert.equal(r.rows[0].quoted_amount,'0.00');});});
  await test('financial insertion rejected on raw and view surfaces',async()=>{for(const table of ['jobs','job_access'])await deny(officeA,`insert into ${table}(account_id,ref,quoted_amount) values($1,'BAD',9)`,[a]);});
  await test('cross-workspace parent insertion and update rejected for writer and owner',async()=>{
    for(const actor of [officeA,ownerA])for(const table of ['jobs','job_access']){
      await deny(actor,`update ${table} set client_id=$1 where id=$2`,[clientB,jobA]);
      await deny(actor,`insert into ${table}(account_id,client_id,ref) values($1,$2,'FOREIGN')`,[a,clientB]);
    }
  });
  await test('upsert cannot smuggle price or foreign parent',async()=>{
    await deny(officeA,"insert into jobs(id,account_id,client_id,ref) values($1,$2,$3,'A') on conflict(id) do update set client_id=excluded.client_id",[jobA,a,clientB]);
    await deny(officeA,"insert into jobs(id,account_id,ref,quoted_amount) values($1,$2,'A',4) on conflict(id) do update set quoted_amount=excluded.quoted_amount",[jobA,a]);
  });
  await test('owner can write price through view and receives exact saved value',async()=>{await as(ownerA,async()=>{const r=await q('update job_access set quoted_amount=52.25 where id=$1 returning quoted_amount',[jobA]);assert.equal(r.rows[0].quoted_amount,'52.25');});});
  await test('explicit quote read is independently granted and revoked',async()=>{
    await q("insert into office_member_capabilities values($1,$2,'quotes.read')",[a,officeA]);
    await as(officeA,async()=>assert.equal((await q('select quoted_amount from job_access where id=$1',[jobA])).rows[0].quoted_amount,'17351.69'));
    await q("delete from office_member_capabilities where capability='quotes.read'");
    await as(officeA,async()=>assert.equal((await q('select quoted_amount from job_access where id=$1',[jobA])).rows[0].quoted_amount,'0.00'));
  });
  await test('dual membership preserves per-workspace financial authority',async()=>{
    await q("insert into memberships values($1,$2,'owner',null)",[b,officeA]);
    await as(officeA,async()=>{const r=await q('select id,quoted_amount from job_access order by id');assert.deepEqual(r.rows,[{id:jobA,quoted_amount:'0.00'},{id:jobB,quoted_amount:'28463.72'}]);});
  });
  await test('deactivated office cannot read A even with retained grants',async()=>{
    await q('update memberships set deactivated_at=now() where account_id=$1 and user_id=$2',[a,officeA]);
    await as(officeA,async()=>assert.equal((await q('select id from job_access where id=$1',[jobA])).rows.length,0));
  });
  await test('view is invoker and only one composite client relationship remains',async()=>{
    const view=(await q("select reloptions from pg_class where oid='public.job_access'::regclass")).rows[0];assert(view.reloptions.includes('security_invoker=true'));
    const constraints=(await q("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='jobs'::regclass and confrelid='clients'::regclass")).rows;
    assert.equal(constraints.length,1);assert(constraints[0].definition.includes('FOREIGN KEY (account_id, client_id)'));
  });
  await test('client deletion nulls client_id without nulling account_id',async()=>{
    await q('delete from clients where id=$1',[clientA]);const row=(await q('select client_id,account_id from jobs where id=$1',[jobA])).rows[0];assert.equal(row.client_id,null);assert.equal(row.account_id,a);
  });
  console.log(`${passed} PostgreSQL boundary scenarios passed`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
