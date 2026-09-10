// Owner-confirmed September 9 voice rehearsal only. Default rolls back.
// No provider API, message replay, usage adjustment, or account setting change.
import assert from 'node:assert/strict';
import pg from 'pg';

const eventId = '16b5a5ce-535d-4899-840d-ffee452ca817';
const accountId = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6';
const callId = 'c223a77c-6321-4e9c-977e-9ca90810e8ce';
const eventKey = `missed-call:signalwire:${callId}`;
const auditKey = `operational-cleanup-20260910:confirmed-rehearsal:${eventId}`;
const reasonCode = 'owner_confirmed_prelaunch_rehearsal';
const action = 'operational.rehearsal_sms_cancelled';
const apply = process.argv.includes('--apply');
assert(process.argv.slice(2).every(arg => arg === '--apply'), 'Unknown argument');
assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

async function snapshot() {
  // Hash the full source and all fields except the explicitly changed ones.
  // Only an allowlist of operational fields leaves the database in plain text.
  const { rows: [event] } = await db.query(`select id,account_id,context,event_type,
    message_kind,billing_category,sender_purpose,idempotency_key,status,created_at,
    queued_at,updated_at,cancelled_at,error_reason,provider,provider_id,sender_number_id,
    send_started_at,sent_at,provider_accepted_at,delivered_at,failed_at,indeterminate_at,
    text_usage_kind,text_usage_state,text_usage_reservation_id,text_usage_finalization_key,
    text_usage_overage_key,text_usage_last_error,
    encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') source_fingerprint,
    encode(sha256(convert_to((to_jsonb(e)-array['status','error_reason','cancelled_at','updated_at'])::text,'UTF8')),'hex') preserved_fields_fingerprint
    from public.sms_events e where id=$1`, [eventId]);
  const { rows: [task] } = await db.query(`select t.*,
    encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') source_fingerprint,
    encode(sha256(convert_to((to_jsonb(t)-array['task_state','last_error_code','cancelled_at','updated_at'])::text,'UTF8')),'hex') preserved_fields_fingerprint
    from public.sms_delivery_tasks t where sms_event_id=$1`, [eventId]);
  const { rows: [history] } = await db.query(`select count(*)::int records,
    count(*) filter(where request_started_at is not null)::int provider_requests_started,
    count(*) filter(where outcome is null or finished_at is null)::int unfinished,
    count(*) filter(where outcome is distinct from 'deferred'
      or error_code is distinct from 'sms_sender_not_ready')::int unexpected_outcomes,
    encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb)::text,'UTF8')),'hex') fingerprint
    from public.sms_delivery_attempts a where sms_event_id=$1`, [eventId]);
  const { rows: [usage] } = await db.query(`select
    (select count(*)::int from public.usage_reservations where account_id=$1 and resource_code='text_segments'
      and (position($2 in idempotency_key)>0 or position($3 in idempotency_key)>0
        or position($2 in metadata::text)>0 or position($3 in metadata::text)>0)) reservations,
    (select count(*)::int from public.workspace_overage_accrual_events where account_id=$1 and resource_code='text_segments'
      and (position($2 in idempotency_key)>0 or position($3 in idempotency_key)>0)) overage_events`,
    [accountId,eventId,callId]);
  const { rows: [voiceUsage] } = await db.query(`select count(*)::int records,
    coalesce(sum(committed_units),0)::int committed_minutes,
    encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb)::text,'UTF8')),'hex') fingerprint
    from public.usage_reservations r where account_id=$1 and resource_code='voice_minutes'
      and idempotency_key=$2`, [accountId,`ai-voice:v1:${callId}`]);
  return { event, task, history, usage, voice_usage: voiceUsage };
}

function assertUnsent(s) {
  assert.equal(s.event?.account_id, accountId);
  assert.equal(s.event.idempotency_key, eventKey);
  assert.equal(s.event.context, 'automation');
  assert.equal(s.event.event_type, 'missed_call');
  assert.equal(s.event.message_kind, 'missed-call');
  assert.equal(s.event.billing_category, 'customer_message');
  assert.equal(s.event.sender_purpose, 'contractor_dedicated');
  for (const key of ['provider','provider_id','sender_number_id','send_started_at','sent_at',
    'provider_accepted_at','delivered_at','failed_at','indeterminate_at','text_usage_kind',
    'text_usage_state','text_usage_reservation_id','text_usage_finalization_key',
    'text_usage_overage_key','text_usage_last_error']) assert.equal(s.event[key], null, key);
  assert.equal(s.task?.sms_event_id, eventId);
  assert.equal(s.task.attempt_count, 0);
  for (const key of ['request_started_at','claim_token','lease_expires_at',
    'completed_at','failed_at','indeterminate_at']) assert.equal(s.task[key], null, key);
  assert.equal(s.history.provider_requests_started, 0);
  assert.equal(s.history.unfinished, 0);
  assert.equal(s.history.unexpected_outcomes, 0);
  assert.equal(s.history.records, s.task.lease_sequence);
  assert.deepEqual(s.usage, { reservations: 0, overage_events: 0 });
}

try {
  await db.connect();
  await db.query('begin');
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='15s'");
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [auditKey]);
  // Same row-lock order as stage_sms_delivery; refuse a leased or started task.
  assert.equal((await db.query('select sms_event_id from public.sms_delivery_tasks where sms_event_id=$1 for update', [eventId])).rowCount, 1);
  assert.equal((await db.query('select id from public.sms_events where id=$1 for update', [eventId])).rowCount, 1);
  const before = await snapshot();
  assertUnsent(before);
  const existing = await db.query(`select id,after_value from public.admin_actions
    where action=$1 and meta->>'idempotency_key'=$2`, [action,auditKey]);
  assert(existing.rowCount <= 1, 'Duplicate cancellation audit');
  let auditId;
  let after;
  let changed = false;
  if (existing.rowCount) {
    auditId = existing.rows[0].id;
    assert.equal(before.event.status, 'cancelled');
    assert.equal(before.event.error_reason, reasonCode);
    assert.equal(before.task.task_state, 'cancelled');
    assert.equal(before.task.last_error_code, reasonCode);
    assert(before.event.cancelled_at && before.task.cancelled_at);
    after = before;
    assert.deepEqual(JSON.parse(JSON.stringify(after)), existing.rows[0].after_value,
      'Previously cancelled source or history changed');
  } else {
    assert.equal(before.event.status, 'queued');
    assert.equal(before.event.error_reason, null);
    assert.equal(before.event.cancelled_at, null);
    assert.equal(before.task.task_state, 'queued');
    assert.equal(before.task.cancelled_at, null);
    assert.equal(before.task.last_error_code, 'sms_sender_not_ready');
    const { rows: [{ at }] } = await db.query('select clock_timestamp() at');
    assert.equal((await db.query(`update public.sms_events set status='cancelled',
      error_reason=$2,cancelled_at=$3,updated_at=$3 where id=$1`, [eventId,reasonCode,at])).rowCount, 1);
    assert.equal((await db.query(`update public.sms_delivery_tasks set task_state='cancelled',
      last_error_code=$2,cancelled_at=$3,updated_at=$3 where sms_event_id=$1`, [eventId,reasonCode,at])).rowCount, 1);
    after = await snapshot();
    assertUnsent(after);
    assert.equal(after.event.preserved_fields_fingerprint, before.event.preserved_fields_fingerprint);
    assert.equal(after.task.preserved_fields_fingerprint, before.task.preserved_fields_fingerprint);
    assert.deepEqual(after.history, before.history);
    assert.deepEqual(after.usage, before.usage);
    assert.deepEqual(after.voice_usage, before.voice_usage);
    const { rows: [audit] } = await db.query(`insert into public.admin_actions
      (admin_email,action,account_id,target_type,target_id,reason,meta,before_value,after_value)
      values($1,$2,$3,'sms_events',$4,$5,$6,$7,$8) returning id`,
      ['brett.arnold@live.com',action,accountId,eventId,
        'Owner confirmed the September 9 21:57 UTC transfer-attempt call was a prelaunch test. Cancel its unsent missed-call SMS; retain the source and deferred attempt history.',
        { idempotency_key: auditKey, performed_by: 'Codex, acting on owner confirmation',
          owner_confirmation: 'Yes, a prelaunch test', owner_confirmation_date: '2026-09-10',
          task_id: '01a087bb-d6ec-7891-a1d7-c7b94209d43d', source_provider_call_id: callId,
          evidence_reference: 'docs/evidence/operational-cleanup-rehearsal-sms-cancellation-2026-09-10.json',
          original_221_record_batch_unchanged: true, provider_requests: 0, usage_mutations: 0 },
        before,after]);
    auditId = audit.id;
    changed = true;
  }
  await db.query(apply ? 'commit' : 'rollback');
  console.log(JSON.stringify({ observed_at: new Date().toISOString(), committed: apply,
    event_id: eventId, audit_id: auditId, source_rows_changed: apply && changed ? 2 : 0,
    audit_rows_inserted: apply && changed ? 1 : 0, rolled_back_source_updates: !apply && changed ? 2 : 0,
    provider_requests: 0, usage_mutations: 0, original_221_record_batch_unchanged: true,
    before, after }, null, 2));
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally {
  await db.end();
}
