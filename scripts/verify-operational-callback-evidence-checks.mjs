import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyOperationalCallbackEvidence(db, other, root, passed) {
 await db.query('reset role'); await other.query('reset role');
 await db.query(readFileSync(join(root,'migrations/20260909133220_operational_alert_delivery.sql'),'utf8'));
 const sql=readFileSync(join(root,'migrations/20260914164359_operational_callback_evidence.sql'),'utf8');
 assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));
 await db.query(sql);
 const functions=['record_operational_callback_evidence(text,text,text,text,timestamptz)','reconcile_operational_callback(text)','reconcile_operational_acceptance_callback()'];
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query("select has_table_privilege($1,'operational_callback_evidence','select,insert,update,delete') ok",[role])).rows[0].ok,false);
  for(const fn of functions) assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok,false);
 }
 for(const fn of functions){const r=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn])).rows[0];assert.equal(r.prosecdef,false);assert.ok(r.proconfig.includes('search_path=""'));}
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='operational_callback_evidence'::regclass")).rows[0].relrowsecurity,true);
 passed('operational evidence actual migration/schema, RLS and private invoker functions');
 await db.query('set role service_role'); await other.query('set role service_role');
 const evidence=async(client,id,email,reason='hard_bounce',event='evt-1')=>(await client.query('select record_operational_callback_evidence($1,$2,$3,$4,$5) ok',[id,email,reason,event,'2026-09-14T12:00:00Z'])).rows[0].ok;
 const alert=async(client,id,email,payload={to:[email]})=>(await client.query("insert into operational_alert_deliveries(category,payload,provider_id) values('fixture',$1,$2) returning id,payload",[payload,id])).rows[0];
 const blocked=async email=>(await db.query('select reason from platform_email_suppression where email=$1',[email])).rows[0]?.reason;
 await evidence(db,'early-id','early@ops.test'); assert.equal(await blocked('early@ops.test'),undefined);
 const early=await alert(db,null,'early@ops.test',{to:['early@ops.test'],text:'Exact saved body'});
 await db.query("update operational_alert_deliveries set provider_id='early-id',state='accepted' where id=$1",[early.id]);
 assert.equal(await blocked('early@ops.test'),'hard_bounce');
 assert.deepEqual((await db.query('select payload from operational_alert_deliveries where id=$1',[early.id])).rows[0].payload,early.payload);
 passed('early permanent bounce reconciles on acceptance with unchanged saved payload');
 await alert(db,'late-id','late@ops.test'); await evidence(db,'late-id','late@ops.test','provider_suppressed');
 assert.equal(await blocked('late@ops.test'),'provider_suppressed');
 await evidence(db,'late-id','LATE@ops.test','complaint','evt-strong'); await evidence(db,'late-id','late@ops.test','hard_bounce','evt-weaker');
 assert.equal(await blocked('late@ops.test'),'complaint');
 const retained=(await db.query("select reason,event_id from operational_callback_evidence where provider_id='late-id'")).rows[0];
 assert.deepEqual(retained,{reason:'complaint',event_id:'evt-strong'});
 await assert.rejects(evidence(db,'late-id','different@ops.test'),/Conflicting/);
 passed('late callbacks, duplicates and stronger reason provenance are stable');
 for(const [id,payload] of [['mismatch',{to:['different@ops.test']}],['extra',{to:['bad@ops.test'],bcc:['hidden@ops.test']}],['tenant',{to:['bad@ops.test'],tags:[{name:'account_id',value:'tenant'}]}],['tenant-object',{to:['bad@ops.test'],tags:{account_id:'tenant'}}],['multi',{to:['bad@ops.test','extra@ops.test']}],['malformed',{to:[42]}]]){
  await evidence(db,id,'bad@ops.test');await alert(db,id,'bad@ops.test',payload);
  assert.equal(await blocked('bad@ops.test'),undefined);
 }
 await assert.rejects(evidence(db,'invalid','bad@ops.test','unsubscribe_link'),/Invalid/);
 passed('unknown, mismatched, tenant, extra and malformed destinations never gain platform scope');
 const waitForLock=async()=>{
  const pid=(await other.query('select pg_backend_pid() pid')).rows[0].pid; return pid;
 };
 const otherPid=await waitForLock();
 const waitBlocked=async()=>{
  for(let i=0;i<100;i++){
   const count=(await db.query("select count(*)::int n from pg_locks where pid=$1 and locktype='advisory' and not granted",[otherPid])).rows[0].n;
   if(count) return;
   await new Promise(resolve=>setTimeout(resolve,10));
  }throw Error('Concurrent transaction did not reach the expected lock');
 };
 await db.query('begin'); await evidence(db,'race-callback-first','race1@ops.test');
 const insertRace=alert(other,'race-callback-first','race1@ops.test');
 await waitBlocked();await db.query('commit');await insertRace;
 assert.equal(await blocked('race1@ops.test'),'hard_bounce');
 await db.query('begin'); await alert(db,'race-acceptance-first','race2@ops.test');
 const eventRace=evidence(other,'race-acceptance-first','race2@ops.test','complaint');
 await waitBlocked();await db.query('commit');await eventRace;
 assert.equal(await blocked('race2@ops.test'),'complaint');
 passed('two-session callback/acceptance overlap reconciles in both lock orders');
 await evidence(db,'rollback-id','rollback@ops.test');
 const row=await alert(db,null,'rollback@ops.test');
 await db.query('reset role');
 await db.query(`create function reject_test_block() returns trigger language plpgsql set search_path='' as $$begin if new.email='rollback@ops.test' then raise exception 'fixture write unavailable'; end if; return new; end$$;
  create trigger reject_test_block before insert on platform_email_suppression for each row execute function reject_test_block();`);
 await db.query('set role service_role');
 await assert.rejects(db.query("update operational_alert_deliveries set provider_id='rollback-id' where id=$1",[row.id]),/fixture write unavailable/);
 assert.equal((await db.query('select provider_id from operational_alert_deliveries where id=$1',[row.id])).rows[0].provider_id,null);
 await db.query('reset role');await db.query('drop trigger reject_test_block on platform_email_suppression;drop function reject_test_block()');await db.query('set role service_role');
 await db.query("update operational_alert_deliveries set provider_id='rollback-id' where id=$1",[row.id]);
 assert.equal(await blocked('rollback@ops.test'),'hard_bounce');
 passed('failed block persistence rolls back acceptance and retained evidence reconciles on retry');
}
