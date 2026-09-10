import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyRecovery({ q, pg, ck, repo }) {
  await q(`create table public.workspace_overage_accrual_events (
    account_id uuid, period_start timestamptz, resource_code text,
    released_at timestamptz, settled_at timestamptz)`);
  await q(readFileSync(join(repo,'migrations/20260910121506_overage_recovery_guards.sql'),'utf8'));
  ck('recovery migration applies to existing settlements',true);
  const fail = async (sql,args) => { try { await q(sql,args); return false; } catch { return true; } };
  const fixture = async () => {
    const a=(await q('insert into public.accounts values(gen_random_uuid()) returning id')).rows[0].id;
    await q('insert into public.workspace_overage_settings(account_id,enabled,cap_cents) values($1,true,5000)',[a]);
    return (await q(`insert into public.workspace_overage_settlements(account_id,period_start,period_end,lines,
      total_millicents,chargeable_cents,residual_millicents) values($1,'2026-01-01','2026-02-01','[]',100000,100,0) returning *`,[a])).rows[0];
  };
  const key=`lgq:billing:v1:overage.settle:${'b'.repeat(64)}`;
  const payload=(s)=>({customer:'cus_recovery123',amount:100,currency:'usd',description:'original description',
    metadata:{lgq_settlement_id:s.id,lgq_account_id:s.account_id}});
  const claim=async (s,p=payload(s))=>(await q('select public.claim_overage_settlement_v2($1,$2,false,$3,$4::jsonb) as r',
    [s.id,key,'acct_recovery123',JSON.stringify(p)])).rows[0].r;
  const get=async(s)=>(await q('select * from public.workspace_overage_settlements where id=$1',[s.id])).rows[0];
  const expire=async(s)=>q(`update public.workspace_overage_settlements set lease_expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1`,[s.id]);
  const reap=()=>q('select public.reap_overage_settlement_leases(500)');
  const reject=(s,t)=>q('select public.fail_overage_settlement($1,$2,$3,true)',[s.id,t,'stripe_connection_error']);

  const s=await fixture(); const a=await claim(s); const first=await get(s);
  ck('claim persists complete request and original deadline',a?.payload?.description==='original description' && first.first_submitted_at &&
    first.retry_deadline_at-first.first_submitted_at===23*3600000);
  ck('legacy claim endpoint cannot bypass guards',await fail('select public.claim_overage_settlement($1,$2,false,$3)',[s.id,key,'cus_recovery123']));
  await reject(s,a.claim_token);
  ck('direct claim rejects a live indeterminate lease',await claim(s)===null);
  await expire(s); const b=await claim(s);
  const second=await get(s);
  ck('reclaim changes ownership but preserves first time, key and payload',b.claim_token!==a.claim_token &&
    +second.first_submitted_at===+first.first_submitted_at && second.stripe_idempotency_key===key && JSON.stringify(second.request_payload)===JSON.stringify(first.request_payload));
  ck('stale completion rejected after reclaim',await fail('select public.complete_overage_settlement($1,$2,$3)',[s.id,a.claim_token,'ii_recovery123']));
  ck('stale failure rejected after reclaim',await fail('select public.fail_overage_settlement($1,$2,$3,false)',[s.id,a.claim_token,'invalid_request']));
  await q('select public.observe_overage_invoice_item($1,$2,$3)',[s.id,a.claim_token,'ii_recovery123']);
  ck('late provider evidence survives stale ownership',(await q(`select count(*)::int n from public.overage_settlement_evidence where settlement_id=$1 and kind='provider_success'`,[s.id])).rows[0].n===1);
  await q('select public.complete_overage_settlement($1,$2,$3)',[s.id,b.claim_token,'ii_recovery123']);
  ck('same-item completion is idempotent',(await q('select public.complete_overage_settlement($1,$2,$3) r',[s.id,b.claim_token,'ii_recovery123'])).rows[0].r===true);
  ck('null-token failure cannot overwrite charged',await fail('select public.fail_overage_settlement($1,null,$2,false)',[s.id,'no_stripe_customer']));
  ck('conflicting completion is rejected',await fail('select public.complete_overage_settlement($1,$2,$3)',[s.id,b.claim_token,'ii_different123']));
  ck('snapshot amount cannot change',await fail('update public.workspace_overage_settlements set chargeable_cents=101,total_millicents=101000 where id=$1',[s.id]));

  const recent=await fixture(); const recentClaim=await claim(recent); await expire(recent); await reap();
  ck('original owner can finish after reap before reclaim',(await q('select public.complete_overage_settlement($1,$2,$3) r',[recent.id,recentClaim.claim_token,'ii_afterreap123'])).rows[0].r===true);
  const mismatch=await fixture(); const mt=await claim(mismatch); await reject(mismatch,mt.claim_token); await expire(mismatch);
  ck('changed retry payload is held',await claim(mismatch,{...payload(mismatch),description:'changed'})===null && (await get(mismatch)).recovery_reason==='request_identity_mismatch');

  const old=await fixture(); await claim(old);
  // Fixture time travel only; application writes cannot alter original timing.
  await q('alter table public.workspace_overage_settlements disable trigger overage_settlement_guard');
  await q(`update public.workspace_overage_settlements set first_submitted_at=now()-interval '2 days',
    retry_deadline_at=now()-interval '25 hours',lease_expires_at=now()-interval '1 hour' where id=$1`,[old.id]);
  await q('alter table public.workspace_overage_settlements enable trigger overage_settlement_guard');
  await reap();
  ck('expired provider retention is held, never reclaimed',(await get(old)).recovery_reason==='retry_window_exhausted' && await claim(old)===null);
  const legacy=(await q(`select count(*)::int n from public.workspace_overage_settlements where first_submitted_at is null and state in ('submitted','indeterminate') and recovery_reason is not null`)).rows[0].n;
  ck('legacy ambiguous attempts are quarantined',legacy>0);

  const fresh=await fixture();
  await q(`insert into public.workspace_overage_settlements(account_id,period_start,period_end,lines,
      total_millicents,chargeable_cents,residual_millicents,next_attempt_at)
    select $1,'2010-01-01'::timestamptz + i * interval '1 day','2010-01-02'::timestamptz + i * interval '1 day',
      '[]'::jsonb,100000,100,0,now()+interval '1 day' from generate_series(1,30) i`,[fresh.account_id]);
  const eligible=(await q('select * from public.list_claimable_overage_settlements(1,$1::uuid[])',[[fresh.account_id]])).rows;
  ck('candidate filtering skips more than a batch of delayed rows before limit',eligible.length===1 && eligible[0].id===fresh.id);
  const missing=await fixture();
  ck('verified missing customer can fail a never-submitted row',(await q('select public.fail_overage_settlement($1,null,$2,false) r',[missing.id,'no_stripe_customer'])).rows[0].r===true);

  // Two genuine database sessions contend on the same row. Only one can claim.
  const c2=pg.getPgClient('lgq_settle'); await c2.connect();
  try {
    const concurrent=await fixture();
    const args=[concurrent.id,key,'acct_recovery123',JSON.stringify(payload(concurrent))];
    const sql='select public.claim_overage_settlement_v2($1,$2,false,$3,$4::jsonb) r';
    const results=await Promise.all([q(sql,args),c2.query(sql,args)]);
    ck('two sessions produce exactly one claim',results.filter(r=>r.rows[0].r).length===1);
    const ac=(await q('insert into public.accounts values(gen_random_uuid()) returning id')).rows[0].id;
    await q('insert into public.workspace_overage_settings(account_id) values($1)',[ac]);
    await q(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
      values($1,'2026-03-01','2026-04-01','text_segments',1000)`,[ac]);
    const closeSql=`select public.close_overage_period($1,'2026-03-01','2026-04-01') r`;
    const closes=await Promise.all([q(closeSql,[ac]),c2.query(closeSql,[ac])]);
    ck('concurrent first closes return the same snapshot',closes[0].rows[0].r.id===closes[1].rows[0].r.id &&
      closes.filter(r=>r.rows[0].r.already_closed).length===1);
    ck('late resource insertion is rejected',await fail(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
      values($1,'2026-03-01','2026-04-01','new_resource',1000)`,[ac]));
    ck('future close rejected by RPC',await fail(`select public.close_overage_period($1,now(),now()+interval '1 day')`,[ac]));
    await q(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
      values($1,'2026-04-01','2026-05-01','voice_minutes',1000)`,[ac]);
    await q(`insert into public.workspace_overage_accrual_events(account_id,period_start,resource_code) values($1,'2026-04-01','voice_minutes')`,[ac]);
    ck('pending voice finalization defers close',(await q(`select public.close_overage_period($1,'2026-04-01','2026-05-01') r`,[ac])).rows[0].r.deferred===true);
    await q(`update public.workspace_overage_accrual_events set settled_at=now() where account_id=$1`,[ac]);
    ck('finalized voice period can close',(await q(`select public.close_overage_period($1,'2026-04-01','2026-05-01') r`,[ac])).rows[0].r.state==='closed');
    await q(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
      values($1,'2026-05-01','2026-06-01','text_segments',1000)`,[ac]);
    await q(`insert into public.workspace_overage_accrual_events(account_id,period_start,resource_code) values($1,'2026-05-01','text_segments')`,[ac]);
    ck('pending text finalization also defers close',(await q(`select public.close_overage_period($1,'2026-05-01','2026-06-01') r`,[ac])).rows[0].r.deferred===true);
    await q(`update public.workspace_overage_accrual_events set settled_at=now() where account_id=$1`,[ac]);
    await q('begin');
    await q('select 1 from public.workspace_overage_settings where account_id=$1 for update',[ac]);
    const lateInsert=c2.query(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
      values($1,'2026-05-01','2026-06-01','late_resource',999000)`,[ac]).then(()=>false,()=>true);
    await q(`select public.close_overage_period($1,'2026-05-01','2026-06-01')`,[ac]);
    await q('commit');
    ck('concurrent new-resource insert cannot pass a winning close',await lateInsert);
  } finally { await c2.end(); }

  const rec=await fixture(); await claim(rec); await expire(rec); await reap();
  let recRow=await get(rec); const item={...payload(rec),id:'ii_reconciled123',livemode:false};
  ck('reconciliation rejects stale revision',(await q('select public.reconcile_overage_invoice_item($1,$2,$3,$4) r',
    [rec.id,recRow.revision-1,JSON.stringify(item),'acct_recovery123'])).rows[0].r===false);
  ck('reconciliation checks item amount',await fail('select public.reconcile_overage_invoice_item($1,$2,$3,$4)',
    [rec.id,recRow.revision,JSON.stringify({...item,amount:999}),'acct_recovery123']));
  ck('verified reconciliation links existing item',(await q('select public.reconcile_overage_invoice_item($1,$2,$3,$4) r',
    [rec.id,recRow.revision,JSON.stringify(item),'acct_recovery123'])).rows[0].r===true);
  for (const role of ['anon','authenticated']) {
    const allowed=(await q(`select has_function_privilege($1,'public.claim_overage_settlement_v2(uuid,text,boolean,text,jsonb)','execute') as a,
      has_function_privilege($1,'public.reconcile_overage_invoice_item(uuid,bigint,jsonb,text)','execute') as b,
      has_table_privilege($1,'public.overage_settlement_evidence','insert') as c`,[role])).rows[0];
    ck(`${role} cannot claim, reconcile, or forge evidence`,!allowed.a&&!allowed.b&&!allowed.c);
  }

  // Exercise the alert scanner itself, preserving unrelated source categories.
  await q(`
    create table public.webhook_failures(id uuid default gen_random_uuid(),created_at timestamptz default now(),resolved_at timestamptz);
    create table public.billing_event_operational_classifications(id uuid,processing_status text,event_scope text,attempt_count int,
      received_at timestamptz,projection_lease_expires_at timestamptz,requires_billing_action boolean,
      projection_result text,case_key text,requires_configuration_review boolean);
    create table public.sms_events(id uuid,status text,failed_at timestamptz,indeterminate_at timestamptz,created_at timestamptz);
    create table public.sms_delivery_tasks(sms_event_id uuid,task_state text,failed_at timestamptz,indeterminate_at timestamptz,
      available_at timestamptz,lease_expires_at timestamptz,attempt_count int,last_error_code text);
    create table public.payments(id uuid,status text,stripe_dispute_id text,disputed_at timestamptz,requested_at timestamptz,
      dispute_due_by timestamptz,dispute_status text);
    create table public.cron_runs(id uuid,job text,started_at timestamptz,ok boolean);
    create table public.operational_alert_findings(source_key text primary key,category text,reference text,
      occurred_at timestamptz,detail text,action_required text,admin_path text,last_seen_at timestamptz,
      resolved_at timestamptz,delivery_id uuid,detected_at timestamptz default now());
    insert into public.webhook_failures default values;
  `);
  await q('select public.scan_operational_failures()');
  ck('held settlement reaches the operational alert sink',(await q(`select count(*)::int n from public.operational_alert_findings
    where source_key=$1 and resolved_at is null`,['settlement:'+old.id])).rows[0].n===1);
  ck('existing webhook alerts survive scanner extension',(await q(`select count(*)::int n from public.operational_alert_findings where category='webhook'`)).rows[0].n===1);
  await q('select public.scan_operational_failures()');
  ck('repeat scans deduplicate settlement alerts',(await q(`select count(*)::int n from public.operational_alert_findings where source_key=$1`,['settlement:'+old.id])).rows[0].n===1);
  const backlogAccount=(await q('insert into public.accounts values(gen_random_uuid()) returning id')).rows[0].id;
  await q(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
    values($1,'2026-04-01','2026-05-01','text_segments',1000)`,[backlogAccount]);
  await q('select public.scan_operational_failures()');
  ck('persistent unclosed backlog alerts',(await q(`select count(*)::int n from public.operational_alert_findings where source_key=$1 and resolved_at is null`,['overage-backlog:'+backlogAccount])).rows[0].n===1);
  await q(`select public.close_overage_period($1,'2026-04-01','2026-05-01')`,[backlogAccount]);
  await q('select public.scan_operational_failures()');
  ck('durable close resolves backlog finding',(await q(`select resolved_at from public.operational_alert_findings where source_key=$1`,['overage-backlog:'+backlogAccount])).rows[0].resolved_at!==null);

  const scaleAccount=(await q('insert into public.accounts values(gen_random_uuid()) returning id')).rows[0].id;
  await q(`insert into public.workspace_overage_accruals(account_id,period_start,period_end,resource_code,millicents)
    select $1,'2010-01-01'::timestamptz+i*interval '1 day','2010-01-02'::timestamptz+i*interval '1 day','text_segments',1000
    from generate_series(1,2001) i`,[scaleAccount]);
  await q(`insert into public.workspace_overage_settlements(account_id,period_start,period_end,lines,total_millicents,chargeable_cents,residual_millicents)
    select account_id,period_start,period_end,'[]',1000,1,0 from public.workspace_overage_accruals
    where account_id=$1 order by period_start limit 2000`,[scaleAccount]);
  const scaleCandidates=(await q('select * from public.list_unclosed_overage_periods(100)')).rows;
  ck('new period survives two thousand closed periods',scaleCandidates.some(r=>r.account_id===scaleAccount));
  await q('analyze public.workspace_overage_accruals; analyze public.workspace_overage_settlements');
  const plan=(await q(`explain (analyze,buffers,format json)
    select a.account_id,a.period_start,max(a.period_end) from public.workspace_overage_accruals a
    where not exists(select 1 from public.workspace_overage_settlements s where s.account_id=a.account_id and s.period_start=a.period_start)
      and not exists(select 1 from public.workspace_overage_accrual_events e where e.account_id=a.account_id and e.period_start=a.period_start
        and e.resource_code in ('voice_minutes','text_segments') and e.released_at is null and e.settled_at is null)
    group by a.account_id,a.period_start having max(a.period_end)<=clock_timestamp()
    order by max(a.period_end),a.account_id,a.period_start limit 100`)).rows[0]['QUERY PLAN'][0];
  ck(`period query measured on 2,001-period history (${plan['Execution Time']} ms)`,Number.isFinite(plan['Execution Time']));
}
