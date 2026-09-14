import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyPlatformEmailPolicy(db, other, root, passed) {
  await db.query('reset role');
  const sql = readFileSync(join(root, 'migrations/20260914152829_platform_campaign_preferences.sql'), 'utf8');
  assert.ok(readFileSync(join(root, 'schema.sql'), 'utf8').replace(/\r\n/g, '\n').includes(sql.replace(/\r\n/g, '\n').trim()));
  await db.query(sql);
  const signatures = ['record_platform_email_suppression(text,text)', 'platform_campaign_recipient_status(jsonb)'];
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'platform_email_suppression','select,insert,update,delete') ok", [role])).rows[0].ok, false);
    for (const signature of signatures) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role, signature])).rows[0].ok, false);
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select * from platform_email_suppression'), /permission denied/);
    await assert.rejects(db.query("select record_platform_email_suppression('x@example.com','complaint')"), /permission denied/);
    await db.query('reset role');
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='platform_email_suppression'::regclass")).rows[0].relrowsecurity, true);
  for (const signature of signatures) {
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
    assert.equal(row.prosecdef, false);
    assert.ok(row.proconfig.some(value => value.startsWith('search_path=')));
  }
  passed('platform preference migration, schema mirror, RLS and private invoker RPCs');
  await db.query('set role service_role');
  await other.query('set role service_role');
  const a = 'a0000000-0000-4000-8000-000000000001', b = 'a0000000-0000-4000-8000-000000000002';
  const pair = (account_id, email='scope@example.com') => ({ account_id, email });
  const status = async pairs => (await db.query('select platform_campaign_recipient_status($1::jsonb) result', [JSON.stringify(pairs)])).rows[0].result;
  await db.query("insert into email_suppression(account_id,email,reason) values($1,'scope@example.com','one_click_unsubscribe')", [a]);
  const candidates = [pair(a), pair(b), pair(null)];
  assert.deepEqual((await status(candidates)).map(r => r.blocked), [true,false,false]);
  assert.deepEqual(await status(candidates), candidates.map((r,i)=>({...r,blocked:i===0})));
  await db.query("select record_platform_email_suppression(' SCOPE@Example.com ','unsubscribe_link')");
  assert.deepEqual((await status(candidates)).map(r=>r.blocked), [true,true,true]);
  passed('tenant preferences stay local; explicit normalized platform opt-out blocks all campaign occurrences');
  await Promise.all([
    db.query("select record_platform_email_suppression('scope@example.com','complaint')"),
    other.query("select record_platform_email_suppression('scope@example.com','one_click_unsubscribe')"),
  ]);
  for (const reason of ['unsubscribe_link','one_click_unsubscribe','provider_suppressed','hard_bounce']) {
    await db.query('select record_platform_email_suppression($1,$2)', ['scope@example.com',reason]);
  }
  assert.deepEqual((await db.query("select email,reason from platform_email_suppression where email='scope@example.com'")).rows,
    [{ email:'scope@example.com',reason:'complaint' }]);
  passed('concurrent opt-out and delivery events retain one row and cannot downgrade a complaint');
  await db.query("insert into email_suppression(account_id,email,reason) select $1,'other'||n||'@example.com','hard_bounce' from generate_series(1,1201) n", [b]);
  await db.query("insert into email_suppression(account_id,email,reason) values($1,'literal_%@example.com','complaint')", [b]);
  assert.deepEqual((await status([pair(b,'literal_%@example.com'),pair(b,'literal_AB@example.com'.toLowerCase()),pair(a,'other1201@example.com')])).map(r=>r.blocked), [true,false,false]);
  const hundred = Array.from({length:100},(_,i)=>pair(b,`other${i+1100}@example.com`));
  assert.equal((await status(hundred)).length,100);
  assert.ok((await status(hundred)).every(r=>r.blocked));
  await assert.rejects(status([...hundred,pair(b)]), /exceeds 100/);
  await assert.rejects(status([pair('platform')]), /uuid/);
  await assert.rejects(db.query("select record_platform_email_suppression('x@example.com','unknown')"), /check constraint/);
  passed('exact indexed recipient checks cover large suppression tables without wildcards or truncated batches');
}
