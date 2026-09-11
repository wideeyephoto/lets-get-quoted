// Setup credentials are confined to fixture setup, grant changes and cleanup.
// Browser/API assertions must use the user's actual Auth-issued session.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

export const options = Object.fromEntries(process.argv.filter(a => a.startsWith('--') && a.includes('=')).map(a => {
  const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)];
}));
assert(options['--env-file'] && options['--project'] && options['--origin'] && options['--private-dir'],
  'Required: --env-file=... --project=... --origin=... --private-dir=...');
export const env = parseEnv(readFileSync(options['--env-file'], 'utf8'));
export const project = options['--project'];
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, `${project}.supabase.co`);
assert.equal(new URL(env.DATABASE_URL).hostname, `db.${project}.supabase.co`);
export const origin = new URL(options['--origin']).origin;
assert(origin.startsWith('https://') || new URL(origin).hostname === 'localhost');
if(project==='mfuvvtrkipkigwqqtcal') assert.equal(origin,'https://app.letsgetquoted.com');
export const privateDir = resolve(options['--private-dir']);
mkdirSync(privateDir, { recursive: true });
export const manifestPath = resolve(privateDir, 'manifest.json');
export const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
export const db = new pg.Client({ connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 15000 });
export function save(manifest) { writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); }
export function read() {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(m.project, project); assert.equal(m.origin, origin);
  assert.match(m.marker, /^tenant-office-browser-/);
  return m;
}
export async function snapshot(m) {
  const {rows}=await db.query(`select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public' and c.column_name='account_id' and c.udt_name='uuid' and t.table_type='BASE TABLE'
    order by c.table_name`);
  const tables=rows.map(r=>r.table_name);assert(tables.every(t=>/^[a-z_][a-z0-9_]*$/.test(t)));
  const result=await db.query(tables.map(t=>`select '${t}'::text as table_name,count(*)::int as rows from public."${t}" where account_id=any($1::uuid[])`).join(' union all '),[m.accounts.map(a=>a.id)]);
  return Object.fromEntries(result.rows.map(r=>[r.table_name,r.rows]));
}
export async function grants(m, keys) {
  const a = m.accounts[0].id, u = m.actors.officeA.id;
  // Use the real owner-authorized RPC in the scored run. This helper is setup only.
  await db.query('begin');
  try {
    await db.query('delete from office_member_capabilities where account_id=$1 and user_id=$2', [a, u]);
    for (const key of keys) await db.query('insert into office_member_capabilities(account_id,user_id,capability,granted_by) values($1,$2,$3,$4)', [a,u,key,m.actors.ownerA.id]);
    await db.query('commit');
  } catch(e) { await db.query('rollback'); throw e; }
}
export async function prepare() {
  assert(!existsSync(manifestPath),'An audit manifest already exists; use a new private directory to preserve cleanup ownership');
  const marker = `tenant-office-browser-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
  const m = { marker, project, origin, createdAt: new Date().toISOString(), actors: {}, accounts: [] };
  save(m);
  for (const label of ['ownerA','ownerB','officeA']) {
    const email = `${marker}-${label.toLowerCase()}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true,
      app_metadata: { test_marker: marker }, user_metadata: { name: `${marker} ${label}` } });
    if (error) throw error;
    m.actors[label] = { id: data.user.id, email }; save(m);
  }
  await db.query('begin');
  try {
    for (const [i,label] of ['A','B'].entries()) {
      const a = { id: randomUUID(), name: `${marker} ${label}`, client: randomUUID(), job: randomUUID(),
        clientName: `${marker} Customer ${label}`, ref: `ACCESS-${marker.slice(-8)}-${label}`,
        amount: i ? 28463.72 : 17351.69, quoteLabel: `CONFIDENTIAL-QUOTE-${label}-${marker.slice(-8)}` };
      await db.query(`insert into accounts(id,business_name,test_marker,terms_accepted_at,terms_version,
        auto_review_request,quote_followups_enabled,deposit_on_approval)
        values($1,$2,$3,now(),'2026-08-29',false,false,false)`, [a.id,a.name,marker]);
      await db.query("insert into memberships(account_id,user_id,role) values($1,$2,'owner')", [a.id,m.actors[i?'ownerB':'ownerA'].id]);
      await db.query('insert into clients(id,account_id,name,test_marker,notes) values($1,$2,$3,$4,$5)', [a.client,a.id,a.clientName,marker,'Disposable access verification record; no contact destination.']);
      await db.query(`insert into jobs(id,account_id,client_id,ref,client_name,scope,quoted_amount,quote_items,test_marker)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [a.job,a.id,a.client,a.ref,a.clientName,`Operational scope ${label}`,a.amount,
        JSON.stringify([{description:a.quoteLabel,quantity:1,unit_price:a.amount}]),marker]);
      m.accounts.push(a);
    }
    await db.query("insert into memberships(account_id,user_id,role) values($1,$2,'office')", [m.accounts[0].id,m.actors.officeA.id]);
    await db.query('commit'); save(m);
  } catch(e) { await db.query('rollback'); throw e; }
  return m;
}
export async function cleanup(m) {
  const ids=m.accounts.map(a=>a.id), users=Object.values(m.actors).map(a=>a.id);
  // Revoke sessions before deleting identities; retain only suspended, marked accounts
  // when dependent audit/ledger records intentionally prevent account deletion.
  for (const actor of Object.values(m.actors)) {
    const {data,error}=await admin.auth.admin.getUserById(actor.id);
    if(error) throw error;
    assert.equal(data.user.app_metadata.test_marker,m.marker);
  }
  let recordsRemoved=0;
  await db.query('begin');
  try {
    const {rows}=await db.query('select id,test_marker from accounts where id=any($1::uuid[])',[ids]);
    assert.equal(rows.length,ids.length); assert(rows.every(r=>r.test_marker===m.marker));
    await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[users]);
    await db.query('delete from office_member_capabilities where account_id=any($1::uuid[]) and user_id=any($2::uuid[])',[ids,users]);
    await db.query('update memberships set deactivated_at=now() where account_id=any($1::uuid[]) and user_id=any($2::uuid[])',[ids,users]);
    recordsRemoved+=(await db.query('delete from jobs where id=any($1::uuid[]) and test_marker=$2',[m.accounts.map(a=>a.job),m.marker])).rowCount;
    recordsRemoved+=(await db.query('delete from clients where id=any($1::uuid[]) and test_marker=$2',[m.accounts.map(a=>a.client),m.marker])).rowCount;
    await db.query('update accounts set suspended_at=now() where id=any($1::uuid[]) and test_marker=$2',[ids,m.marker]);
    await db.query('commit');
  } catch(e) { await db.query('rollback'); throw e; }
  m.cleanedAt=new Date().toISOString(); save(m);
  const remaining=(await db.query(`select
    (select count(*)::int from memberships where account_id=any($1::uuid[]) and user_id=any($2::uuid[]) and deactivated_at is null) as active_memberships,
    (select count(*)::int from auth.sessions where user_id=any($2::uuid[])) as sessions,
    (select count(*)::int from office_member_capabilities where account_id=any($1::uuid[]) and user_id=any($2::uuid[])) as grants`,[ids,users])).rows[0];
  assert.deepEqual(remaining,{active_memberships:0,sessions:0,grants:0});
  return { cleanedAt:m.cleanedAt, recordsRemoved, verified:remaining, membershipsDeactivated:true, grantsRemoved:true,
    sessionsRevoked:true, retained:'Two suspended marked workspaces and three test identities retained for audit; no active memberships.' };
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await db.connect();
    if(options['--mode']==='prepare') {
      const m=await prepare(); console.log(JSON.stringify({marker:m.marker,actors:Object.keys(m.actors),accounts:m.accounts.length}));
    } else if(options['--mode']==='reset') {
      const m=read(); assert(!m.cleanedAt,'Cannot reset a cleaned audit');
      const {rows}=await db.query('select id from accounts where id=any($1::uuid[]) and test_marker=$2',[m.accounts.map(a=>a.id),m.marker]);
      assert.equal(rows.length,2);
      await db.query('delete from memberships where account_id=$1 and user_id=$2',[m.accounts[1].id,m.actors.officeA.id]);
      await db.query("insert into memberships(account_id,user_id,role) values($1,$2,'office') on conflict(account_id,user_id) do update set deactivated_at=null",[m.accounts[0].id,m.actors.officeA.id]);
      await grants(m,[]);console.log('Reset only marked fixture office membership and grants');
      await db.query('update jobs set scope=$2,quoted_amount=$3,client_id=$4 where id=$1 and test_marker=$5',
        [m.accounts[0].job,'Operational scope A',m.accounts[0].amount,m.accounts[0].client,m.marker]);
    } else if(options['--mode']==='cleanup') console.log(JSON.stringify(await cleanup(read())));
    else throw new Error('Required --mode=prepare|reset|cleanup');
  } catch(e) {console.error(e.message);process.exitCode=1;} finally {await db.end();}
}
