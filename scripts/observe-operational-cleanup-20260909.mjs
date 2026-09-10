// Read-only checkpoint for the fixed September 9 operational observation.
// DATABASE_URL is supplied by the operator; reports omit recipients and message bodies.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import pg from 'pg';
const { Client } = pg;
assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
const root=fileURLToPath(new URL('..',import.meta.url));
const baseline=JSON.parse(fs.readFileSync(root+'/docs/evidence/operational-cleanup-observation-start-2026-09-09.json'));
const manifest=JSON.parse(fs.readFileSync(root+'/docs/evidence/operational-cleanup-manifest-2026-09-09.json'));
const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
(async()=>{
 await db.connect();await db.query('begin isolation level repeatable read read only');
 const now=(await db.query('select clock_timestamp() observed_at')).rows[0].observed_at;
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const report={observation_id:baseline.observation_id,observed_at:now,window_started_at:baseline.started_at,minimum_end_at:baseline.minimum_end_at,elapsed_minutes:(now-new Date(baseline.started_at))/60000};
 report.cron_cycles=await q(`with runs as(select job,id,started_at,finished_at,ok,summary,error,lag(started_at) over(partition by job order by started_at) prior from cron_runs where job=any($2) and started_at>=$1::timestamptz-interval '15 minutes')
 select job,count(*) filter(where started_at>=$1) cycles_since_start,count(*) filter(where started_at>=$1 and ok is false) failed_cycles,count(*) filter(where started_at>=$1 and ok is null) unfinished_cycles,max(started_at) latest_started,max(finished_at) latest_finished,max(extract(epoch from started_at-prior)) filter(where started_at>=$1) maximum_gap_seconds from runs group by job order by job`,[baseline.started_at,['operational-alerts','billing-subscription-projection','sms-delivery']]);
 report.failed_cron_cycles=await q("select id,job,started_at,finished_at,summary from cron_runs where started_at >= $1 and job=any($2) and ok is false order by started_at",[baseline.started_at,['operational-alerts','billing-subscription-projection','sms-delivery']]);
 report.additional_worker_cycles=await q("select job,count(*) cycles,count(*) filter(where ok is false) failed,count(*) filter(where ok is null) unfinished,max(started_at) latest_started from cron_runs where started_at >= $1 and job=any($2) group by job order by job",[baseline.started_at,['addon-refunds','overage-settlement','overage-period-close','account-closure','direct-payment-settlement','voice-allowance']]);
 report.additional_worker_failures=await q("select id,job,started_at,finished_at,summary,error from cron_runs where started_at >= $1 and job=any($2) and ok is false order by started_at",[baseline.started_at,['addon-refunds','overage-settlement','overage-period-close','account-closure','direct-payment-settlement','voice-allowance']]);
 // An absent completion can be a telemetry write failure; it is not proof of a hung worker.
 report.unfinished_run_records=await q("select id,job,started_at,finished_at from cron_runs where started_at >= $1 and ok is null order by started_at",[baseline.started_at]);
 report.live_failed_billing=await q("select id,provider_event_id,event_type,processing_status,last_error,received_at,attempt_count from billing_events where livemode and processing_status='failed'");
 report.post_containment_test_ingress=await q("select id,provider_event_id,event_type,processing_status,last_error,received_at from billing_events where livemode=false and received_at>='2026-09-09T20:23:58Z' order by received_at");
 report.active_findings=await q('select category,count(*) records from operational_alert_findings where resolved_at is null group by category order by category');
 report.active_finding_references=await q('select source_key,category,reference,occurred_at,detected_at,delivery_id from operational_alert_findings where resolved_at is null order by category,source_key');
 report.webhook_failures_since_start=await q('select id,source,event_type,reference_id,error_message,created_at,resolved_at from webhook_failures where created_at >= $1 order by created_at',[baseline.started_at]);
 report.unconfirmed_alerts=await q("select id,category,state,provider_id,created_at,accepted_at,last_error from operational_alert_deliveries where state <> 'delivered' order by created_at");
 report.delivered_alerts_since_start=await q("select id,category,provider_id,created_at,delivered_at from operational_alert_deliveries where delivered_at >= $1 order by delivered_at",[baseline.started_at]);
 report.paging_ledger=await q('select page_key,state,provider_id,provider_status,error_code,started_at,delivered_at from operational_sms_pages order by started_at');
 report.audit_integrity=await q("select count(*) records,count(distinct target_id) unique_sources from admin_actions where action='operational.backlog_disposition' and meta->>'batch'='operational-cleanup-20260909'");
 report.source_integrity=await q(`with wanted as(select * from jsonb_to_recordset($1) as x(source_table text,source_id uuid,source_fingerprint text)), actual as(
 select w.*,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') actual_fingerprint from wanted w left join billing_events s on s.id=w.source_id where w.source_table='billing_events'
 union all select w.*,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from wanted w left join webhook_failures s on s.id=w.source_id where w.source_table='webhook_failures'
 union all select w.*,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') from wanted w left join sms_events s on s.id=w.source_id where w.source_table='sms_events')
 select source_table,count(*) expected,count(*) filter(where actual_fingerprint=source_fingerprint) unchanged,coalesce(jsonb_agg(source_id) filter(where actual_fingerprint is distinct from source_fingerprint),'[]') changed_ids from actual group by source_table order by source_table`,[JSON.stringify(manifest.records.map(({source_table,source_id,source_fingerprint})=>({source_table,source_id,source_fingerprint})))]);
 report.duplicate_new_sms_identities=await q('select account_id,idempotency_key,count(*) copies from sms_events where idempotency_key is not null group by account_id,idempotency_key having count(*)>1 and max(created_at)>=$1',[baseline.started_at]);
 report.duplicate_new_usage_grant_identities=await q('select account_id,resource_code,idempotency_key,count(*) copies from usage_credit_lots where idempotency_key is not null group by account_id,resource_code,idempotency_key having count(*)>1 and max(created_at)>=$1',[baseline.started_at]);
 report.new_sms_failure_ids=await q("select id,status,provider_id,created_at,failed_at from sms_events where (created_at >= $1 or failed_at >= $1) and status in ('failed','indeterminate') order by created_at",[baseline.started_at]);
 report.pending_sms=await q("select e.id,e.account_id,e.message_kind,e.status,e.created_at,e.provider_id,e.text_usage_state,t.task_state,t.last_error_code,t.lease_sequence,t.request_started_at,t.attempt_count,t.available_at from sms_events e left join sms_delivery_tasks t on t.sms_event_id=e.id where e.status in ('pending','queued','sending','indeterminate') or t.task_state in ('queued','leased') order by e.created_at");
 report.sms_deferred_work=await q("select coalesce(sum((summary->>'claimed')::int),0) claimed,coalesce(sum((summary->>'completed')::int),0) completed,coalesce(sum((summary->>'deferred')::int),0) deferred,coalesce(sum((summary->>'indeterminate')::int),0) indeterminate,coalesce(sum((summary->>'failed')::int),0) failed from cron_runs where job='sms-delivery' and started_at >= $1",[baseline.started_at]);
 await db.query('commit');await db.end();
 const health=await fetch('https://app.letsgetquoted.com/api/health',{signal:AbortSignal.timeout(15000),cache:'no-store'});const body=await health.json();
 report.public_health={http_status:health.status,status:body.status,timestamp:body.timestamp,services:body.services?.map(({id,status})=>({id,status}))};
 const name='operational-cleanup-observation-'+now.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z.json';
 fs.writeFileSync(root+'/docs/evidence/'+name,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({evidence:name,...report},null,2));
})().catch(async e=>{console.error(e.message);await db.end().catch(()=>{});process.exitCode=1});
