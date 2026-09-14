import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyLifecycleSuppression(db,root,passed) {
  await db.query('reset role');
  const sql=readFileSync(join(root,'migrations/20260914155952_lifecycle_recipient_suppression.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));
  await db.query(sql);
  const signature='lifecycle_recipient_suppression(jsonb)';
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,signature])).rows[0].ok,false);
    await db.query(`set role ${role}`);
    await assert.rejects(db.query("select lifecycle_recipient_suppression('[]')"),/permission denied/);
    await db.query('reset role');
  }
  const fn=(await db.query('select prosecdef,proconfig,provolatile from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(fn.provolatile,'s');
  assert.equal(fn.prosecdef,false); assert.ok(fn.proconfig.some(v=>v.startsWith('search_path=')));
  passed('lifecycle preflight migration, schema mirror and private invoker permissions');
  await db.query('set role service_role');
  const a='b0000000-0000-4000-8000-000000000001',b='b0000000-0000-4000-8000-000000000002';
  const email='literal_%*\\tag@example.com';
  await db.query("insert into email_suppression(account_id,email,reason) select $1,'unrelated'||n||'@example.com','unsubscribe_link' from generate_series(1,1201) n",[a]);
  await db.query("insert into email_suppression(account_id,email,reason) values($1,$2,'complaint')",[a,email.toUpperCase()]);
  const status=async pairs=>(await db.query('select lifecycle_recipient_suppression($1::jsonb) result',[JSON.stringify(pairs)])).rows[0].result;
  const pairs=[{account_id:a,email},{account_id:b,email},{account_id:a,email:'literal_ABtag@example.com'.toLowerCase()}];
  assert.deepEqual((await status(pairs)).map(r=>r.blocked),[true,false,false]);
  await db.query("select record_platform_email_suppression($1,'complaint')",[pairs[2].email]);
  assert.deepEqual((await status(pairs)).map(r=>r.blocked),[true,false,false]);
  passed('lifecycle lookup handles large tables, mixed case and literal wildcard characters without crossing scopes');
  assert.equal((await status(Array.from({length:100},()=>pairs[0]))).length,100);
  await assert.rejects(status(Array.from({length:101},()=>pairs[0])),/exceeds 100/);
  await assert.rejects(status([{account_id:null,email}]),/workspace recipient/);
  await assert.rejects(status([{account_id:'platform',email}]),/uuid/);
  passed('lifecycle recipient limits and missing or invalid workspace scope fail closed');
}
