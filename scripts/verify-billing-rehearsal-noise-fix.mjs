// Disposable PostgreSQL verification for billing rehearsal noise fix (Work Package B)
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

try { os.userInfo(); } catch {
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}

const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-billing-ops-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54419,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});

let db, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ops');
  db = pg.getPgClient('ops');
  await db.connect();

  // Create base roles and required prerequisite tables
  await db.query(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;

    create table webhook_failures(id uuid default gen_random_uuid(), created_at timestamptz default now(), resolved_at timestamptz);
    create table billing_events(
      id uuid primary key default gen_random_uuid(),
      provider text default 'stripe',
      provider_event_id text,
      event_type text,
      event_scope text,
      livemode boolean not null default false,
      payload_sha256 text,
      received_at timestamptz default now(),
      processing_status text default 'received',
      attempt_count int default 0,
      next_attempt_at timestamptz,
      last_error text,
      projection_applied boolean,
      account_id uuid,
      billing_subscription_id uuid,
      projection_result text,
      processing_started_at timestamptz,
      provider_account_id text,
      api_version text,
      provider_created_at timestamptz,
      payload jsonb,
      projection_schema_version text,
      processed_at timestamptz,
      projection_claim_token uuid,
      projection_lease_expires_at timestamptz
    );
    create table sms_delivery_tasks(sms_event_id uuid default gen_random_uuid(), task_state text, attempt_count int, last_error_code text, created_at timestamptz default now(), available_at timestamptz, failed_at timestamptz, indeterminate_at timestamptz, lease_expires_at timestamptz);
    create table sms_events(id uuid default gen_random_uuid(), status text, created_at timestamptz default now(), failed_at timestamptz, indeterminate_at timestamptz);
    create table payments(id uuid default gen_random_uuid(), stripe_dispute_id text, disputed_at timestamptz, requested_at timestamptz default now(), dispute_due_by timestamptz, status text, dispute_status text);
    create table cron_runs(id uuid default gen_random_uuid(), job text, started_at timestamptz default now(), ok boolean);

    grant usage on schema public to service_role, anon, authenticated;
    grant select on billing_events to service_role;
    grant select on webhook_failures, sms_delivery_tasks, sms_events, payments, cron_runs to service_role;
  `);

  // Apply prerequisite migration 20260909133220_operational_alert_delivery.sql
  await db.query(readFileSync(join(root, 'migrations/20260909133220_operational_alert_delivery.sql'), 'utf8'));
  passed('prerequisite operational_alert_delivery migration applies');

  const evidence = JSON.parse(readFileSync(join(root, 'docs/evidence/billing-rehearsal-noise-investigation-2026-09-09.json'), 'utf8'));
  for (const c of evidence.contracts[0].evidence.constraints.filter(c => c.conname.includes('projection_'))) {
    await db.query('alter table billing_events add constraint "' + c.conname + '" ' + c.definition);
  }
  await db.query(evidence.installed_function_definitions.find(f => f.proname === 'protect_billing_event').definition);
  await db.query('create trigger preserve_billing_event before update or delete on billing_events for each row execute function protect_billing_event()');
  await db.query(readFileSync(join(root, 'migrations/20260909130000_ignore_test_mode_subscription_rehearsals.sql'), 'utf8'));
  passed('actual production projection constraints and immutable-event guard installed');

  // Apply new migration 20260909160000_billing_event_operational_reviews.sql
  await db.query(readFileSync(join(root, 'migrations/20260909160000_billing_event_operational_reviews.sql'), 'utf8'));
  passed('billing_event_operational_reviews migration applies cleanly');

  // Check RLS & privileges on operational reviews
  for (const role of ['anon', 'authenticated']) {
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select * from public.billing_event_operational_reviews'), /permission denied/);
    await assert.rejects(db.query('select * from public.billing_event_operational_classifications'), /permission denied/);
    await assert.rejects(db.query("select apply_billing_event_operational_reviews('[]'::jsonb, 'actor', gen_random_uuid(), 'k', 'ref')"), /permission denied/);
    await db.query('reset role');
  }
  passed('anon and authenticated cannot read or modify reviews or classifications');

  // Load manifest file to seed exact 185 test items
  const manifest = JSON.parse(readFileSync(join(root, 'docs/evidence/billing-rehearsal-noise-manifest-2026-09-09.json'), 'utf8'));
  assert.equal(manifest.events.length, 185);

  // Seed 185 manifest rows into billing_events
  for (const ev of manifest.events) {
    await db.query(`
      insert into public.billing_events(
        id, provider, provider_event_id, event_type, event_scope, livemode, payload_sha256,
        received_at, processing_status, attempt_count, next_attempt_at, last_error,
        projection_applied, account_id, billing_subscription_id, payload
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        jsonb_build_object('data_object',jsonb_build_object('object',$16::text,'id',$17::text)))
    `, [
      ev.id, ev.provider, ev.provider_event_id, ev.event_type, ev.event_scope, ev.livemode, ev.payload_sha256,
      ev.received_at, ev.processing_status, ev.attempt_count, ev.next_attempt_at, ev.last_error,
      ev.projection_applied, ev.account_id, ev.billing_subscription_id, ev.provider_object_type, ev.provider_object_id
    ]);
  }

  // Seed single live sentinel failure (13eb0d53-2433-4cea-b7ae-0529d8878909)
  const liveSentinelId = '13eb0d53-2433-4cea-b7ae-0529d8878909';
  await db.query(`
    insert into public.billing_events(
      id, provider, provider_event_id, event_type, event_scope, livemode, payload_sha256,
      received_at, processing_status, attempt_count, next_attempt_at, last_error,
      projection_applied, account_id, billing_subscription_id
    ) values (
      $1, 'stripe', 'evt_1U9nSQGqh5LFKuTCeXUjIBq7', 'customer.subscription.updated', 'platform_subscription',
      true, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '2026-08-29 14:42:11.04799+00', 'failed', 1, null, 'provider_object_contract_mismatch',
      null, null, null
    )
  `, [liveSentinelId]);

  passed('seeded 185 test manifest events and 1 live sentinel event');

  // Baseline scan: 186 billing failures (185 test + 1 live)
  await db.query('set role service_role');
  const initialScan = (await db.query('select scan_operational_failures() n')).rows[0].n;
  assert.equal(initialScan, 186);

  // Queue initial alert digest: 1 delivery with 186 findings
  const initialQueue = (await db.query("select queue_operational_alerts('ops@example.com', 'System <sys@example.com>') n")).rows[0].n;
  assert.equal(initialQueue, 1);
  const initialDelivery = (await db.query('select * from public.operational_alert_deliveries')).rows[0];
  assert.equal(initialDelivery.category, 'billing');

  // Check that all 186 findings are bound to this delivery
  const linkedFindings = (await db.query('select count(*)::int c from public.operational_alert_findings where delivery_id=$1', [initialDelivery.id])).rows[0].c;
  assert.equal(linkedFindings, 186);
  passed('baseline scan and queue link all 186 failures into historical delivery');

  // Verify guardrails of apply_billing_event_operational_reviews:
  // 1. Cannot classify live sentinel
  await assert.rejects(
    db.query("select apply_billing_event_operational_reviews($1::jsonb, 'admin@example.com', gen_random_uuid(), 'k1', 'ref1')", [
      JSON.stringify([{ ...manifest.events[0], id: liveSentinelId, livemode: true }])
    ]),
    /cannot_classify_live_or_foreign_event/
  );
  passed('apply RPC strictly blocks classifying live sentinel');

  // 2. Contract violations reject review
  const testId1 = manifest.events[0].id;
  await db.query('reset role');
  // Temporarily corrupt attempt_count on one row to test contract enforcement
  await db.query("update public.billing_events set next_attempt_at=now() where id=$1", [testId1]);
  await db.query('set role service_role');
  await assert.rejects(
    db.query("select apply_billing_event_operational_reviews($1::jsonb, 'admin@example.com', gen_random_uuid(), 'k2', 'ref2')", [
      JSON.stringify([manifest.events[0]])
    ]),
    /source state drift|contract violation/
  );
  await db.query('reset role');
  await db.query("update public.billing_events set next_attempt_at=null where id=$1", [testId1]);
  await db.query('set role service_role');
  passed('apply RPC enforces exact contract attributes');

  // Reproduce the legacy transition that landed in production during completion.
  await db.query('reset role');
  await db.query("update billing_events set processing_status='ignored',processed_at=now(),last_error=null,projection_applied=false,projection_result='test_mode_rehearsal_ignored',projection_schema_version='stripe_subscription_projection_v1' where livemode=false");
  const sourceBefore = (await db.query('select jsonb_agg(to_jsonb(b) order by id) rows from billing_events b')).rows[0].rows;
  await db.query('set role service_role');
  // 3. Apply full manifest of 185 items
  const batchId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const idempotencyKey = 'lgq:batch:rehearsal:2026-09-09';
  const applyResult = (await db.query(
    "select apply_billing_event_operational_reviews($1::jsonb, 'admin@example.com', $2, $3, 'docs/evidence/billing-rehearsal-noise-manifest-2026-09-09.json')",
    [JSON.stringify(manifest.events), batchId, idempotencyKey]
  )).rows[0].apply_billing_event_operational_reviews;

  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.applied_count, 185);
  assert.equal(applyResult.batch_id, batchId);

  // Idempotency: re-running identical batch returns existing result without error
  const rerunResult = (await db.query(
    "select apply_billing_event_operational_reviews($1::jsonb, 'admin@example.com', $2, $3, 'docs/evidence/billing-rehearsal-noise-manifest-2026-09-09.json')",
    [JSON.stringify(manifest.events), batchId, idempotencyKey]
  )).rows[0].apply_billing_event_operational_reviews;
  assert.equal(rerunResult.idempotent, true);
  assert.equal(rerunResult.applied_count, 185);
  passed('apply RPC successfully classified 185 items and is idempotent');

  // Verify privileges and append-only trigger on reviews table
  const sampleReview = (await db.query('select * from public.billing_event_operational_reviews limit 1')).rows[0];
  await assert.rejects(
    db.query('update public.billing_event_operational_reviews set reason_code=$1 where id=$2', ['tampered', sampleReview.id]),
    /permission denied/
  );
  await assert.rejects(
    db.query('delete from public.billing_event_operational_reviews where id=$1', [sampleReview.id]),
    /permission denied/
  );
  passed('service_role is denied update and delete on review records');

  await db.query('reset role');
  await assert.rejects(
    db.query('update public.billing_event_operational_reviews set reason_code=$1 where id=$2', ['tampered', sampleReview.id]),
    /append-only/
  );
  await assert.rejects(
    db.query('delete from public.billing_event_operational_reviews where id=$1', [sampleReview.id]),
    /append-only/
  );
  await db.query('set role service_role');
  passed('append-only trigger prevents updates and deletes even for table owner');

  // Check classification view
  const classifications = (await db.query(`
    select operational_class, requires_billing_action, requires_configuration_review, count(*)::int c
    from public.billing_event_operational_classifications
    group by operational_class, requires_billing_action, requires_configuration_review
    order by operational_class
  `)).rows;

  assert.deepEqual(classifications, [
    {
      operational_class: 'actionable_billing',
      requires_billing_action: true,
      requires_configuration_review: false,
      c: 1
    },
    {
      operational_class: 'non_live_configuration_rejection',
      requires_billing_action: false,
      requires_configuration_review: true,
      c: 185
    }
  ]);
  passed('classification reader correctly partitions into 1 actionable billing + 185 configuration review');

  // Scan after classification:
  // - 1 live billing failure (actionable)
  // - 1 billing_configuration case
  // Total active signals = 2
  const postScan = (await db.query('select scan_operational_failures() n')).rows[0].n;
  assert.equal(postScan, 2);

  // In operational_alert_findings:
  // - 185 test findings must now have resolved_at IS NOT NULL
  // - 1 live finding has resolved_at IS NULL
  // - 1 configuration case finding has resolved_at IS NULL
  const openFindings = (await db.query('select category, count(*)::int c from public.operational_alert_findings where resolved_at is null group by category order by category')).rows;
  assert.deepEqual(openFindings, [
    { category: 'billing', c: 1 },
    { category: 'billing_configuration', c: 1 }
  ]);

  const resolvedFindings = (await db.query('select category, count(*)::int c from public.operational_alert_findings where resolved_at is not null group by category order by category')).rows;
  assert.deepEqual(resolvedFindings, [
    { category: 'billing', c: 185 }
  ]);
  passed('scanner resolved 185 historical findings and created 1 billing_configuration finding');

  // Verify queue eligibility:
  // In category 'billing', the 1 live failure ALREADY has a delivery_id from before.
  // The 185 resolved findings have delivery_id, but even if delivery_id were NULL, resolved_at is NOT NULL.
  // So NO new 'billing' alerts must be queued.
  // Exactly 1 new alert for 'billing_configuration' should be queued!
  const postQueue = (await db.query("select queue_operational_alerts('ops@example.com', 'System <sys@example.com>') n")).rows[0].n;
  assert.equal(postQueue, 1);

  const deliveries = (await db.query('select category, count(*)::int c from public.operational_alert_deliveries group by category order by category')).rows;
  assert.deepEqual(deliveries, [
    { category: 'billing', c: 1 },
    { category: 'billing_configuration', c: 1 }
  ]);
  passed('queue alert selector created only 1 new delivery for billing_configuration and 0 duplicate billing alerts');

  // Verify resolved unqueued bug scenario:
  // If an unqueued finding is resolved (delivery_id IS NULL and resolved_at IS NOT NULL), it must NOT be selected!
  await db.query(`
    insert into public.operational_alert_findings(
      source_key, category, reference, occurred_at, detail, action_required, admin_path, delivery_id, resolved_at
    ) values (
      'billing:test_resolved_unqueued', 'billing', 'test_resolved_unqueued', now(), 'detail', 'action', '/admin', null, now()
    )
  `);
  const queueCheck = (await db.query("select queue_operational_alerts('ops@example.com', 'System <sys@example.com>') n")).rows[0].n;
  assert.equal(queueCheck, 0);
  passed('resolved finding with delivery_id IS NULL is never queued');

  // Verify raw billing_events remain untouched
  const countFailed = (await db.query("select count(*)::int c from public.billing_events where processing_status='failed'")).rows[0].c;
  assert.equal(countFailed, 1);
  assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(b) order by id) rows from billing_events b')).rows[0].rows, sourceBefore);
  const countApplied = (await db.query("select count(*)::int c from public.billing_events where projection_applied=true")).rows[0].c;
  assert.equal(countApplied, 0);
  passed('review does not mutate any source row after the legacy transition; original failure snapshots retained');
  assert.equal((await db.query("select count(*)::int c from billing_event_operational_reviews where source_snapshot->>'last_error'='billing_mode_configuration_invalid'")).rows[0].c,185);
  assert.deepEqual((await db.query('select payload from operational_alert_deliveries where id=$1',[initialDelivery.id])).rows[0].payload,initialDelivery.payload);

  // Batch identity, completeness and transactional rejection.
  const apply = (rows, batch, key = 'guards', kind = 'non_live_configuration_rejection') =>
    db.query("select apply_billing_event_operational_reviews($1::jsonb,'admin@example.com',$2,$3,'ref','billing_config:platform_subscription:non_live',$4)",[JSON.stringify(rows),batch,key,kind]);
  const {randomUUID} = await import('node:crypto');
  await assert.rejects(apply(manifest.events.map((e,i)=>i ? e : {...e,payload_sha256:'changed'}),batchId),/idempotency conflict/);
  await assert.rejects(apply([manifest.events[0],manifest.events[0]],randomUUID()),/duplicate/);
  await assert.rejects(apply([{id:testId1}],randomUUID()),/complete source snapshot/);
  await assert.rejects(apply([manifest.events[0],{...manifest.events[1],payload_sha256:'stale'}],randomUUID()),/source state drift/);
  assert.equal((await db.query('select count(*)::int c from billing_event_operational_reviews')).rows[0].c,185);
  passed('incomplete, duplicate, stale and different same-count batches fail without partial audit writes');

  // Reopen an ignored event operationally without violating its terminal source state.
  const currentSnapshot=(await db.query('select billing_event_review_snapshot(b) s from billing_events b where id=$1',[testId1])).rows[0].s;
  await apply([currentSnapshot],randomUUID(),'reopen','reopened');
  await db.query('select scan_operational_failures()');
  assert.equal((await db.query("select count(*)::int c from operational_alert_findings where category='billing' and resolved_at is null")).rows[0].c,2);
  passed('append-only reversal restores an ignored event to actionable findings');

  // Source drift automatically invalidates a prior review and both readers agree.
  await db.query('reset role');
  await db.query("update billing_events set last_error='new_condition' where id=$1",[manifest.events[1].id]);
  await db.query('set role service_role');
  assert.equal((await db.query('select requires_billing_action from billing_event_operational_classifications where id=$1',[manifest.events[1].id])).rows[0].requires_billing_action,true);
  await db.query('select scan_operational_failures()');
  assert.equal((await db.query("select count(*)::int c from operational_alert_findings where category='billing' and resolved_at is null")).rows[0].c,3);
  passed('state drift invalidates suppression and restores billing visibility');

  // Runtime mode rejection is atomic with its audit and protects ALL live events.
  await db.query('reset role');
  const liveId=randomUUID(), testId=randomUUID(), token=randomUUID();
  for (const [id,live] of [[liveId,true],[testId,false]]) {
    await db.query("insert into billing_events(id,provider,provider_event_id,event_scope,event_type,livemode,processing_status,attempt_count,projection_claim_token,projection_lease_expires_at,processing_started_at) values($1,'stripe',$2,'platform_subscription','customer.subscription.updated',$3,'processing',1,$4,now()+interval '5 minutes',now())",[id,'evt_'+id,live,token]);
  }
  await db.query('set role service_role');
  await assert.rejects(db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[liveId,token]),/not owned or eligible/);
  await assert.rejects(db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[testId,randomUUID()]),/not owned or eligible/);
  await db.query('reset role');
  await db.query("update billing_events set projection_lease_expires_at=now()-interval '1 minute' where id=$1",[testId]);
  await db.query('set role service_role');
  await assert.rejects(db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[testId,token]),/not owned or eligible/);
  await db.query('reset role');
  await db.query("update billing_events set projection_lease_expires_at=now()+interval '5 minutes' where id=$1",[testId]);
  // Force an audit insert failure to prove the preceding source transition rolls back.
  await db.query("create function reject_runtime_review() returns trigger language plpgsql as $$ begin if new.operator_actor='subscription_projection_worker' then raise exception 'audit storage unavailable'; end if; return new; end $$; create trigger reject_runtime before insert on billing_event_operational_reviews for each row execute function reject_runtime_review()");
  await db.query('set role service_role');
  await assert.rejects(db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[testId,token]),/audit storage unavailable/);
  assert.equal((await db.query('select processing_status from billing_events where id=$1',[testId])).rows[0].processing_status,'processing');
  await db.query('reset role');
  await db.query('drop trigger reject_runtime on billing_event_operational_reviews');
  await db.query('set role service_role');
  await db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[testId,token]);
  assert.deepEqual((await db.query('select processing_status,last_error,requires_configuration_review from billing_event_operational_classifications where id=$1',[testId])).rows[0],
    {processing_status:'ignored',last_error:'billing_mode_mismatch_rejected',requires_configuration_review:true});
  await assert.rejects(db.query('select ignore_test_mode_stripe_billing_subscription_event($1,$2)',[testId,token]),/not owned or eligible/);
  passed('runtime rejection protects live events, wrong/expired tokens and replays; audit failure rolls back transition');

  // Transaction lock serializes the scanner and reviewers; release to let queued work finish.
  const other=pg.getPgClient('ops'); await other.connect();
  try {
    await db.query('begin'); await db.query('select pg_advisory_xact_lock(782321905)');
    await other.query("set lock_timeout='100ms'");
    await assert.rejects(other.query('select scan_operational_failures()'),/lock timeout/);
    await assert.rejects(other.query("select queue_operational_alerts('ops@example.com','System <sys@example.com>')"),/lock timeout/);
    await db.query('commit');
    await other.query('select scan_operational_failures()');
  } finally {await other.end();}
  passed('scanner and queue serialize with review transactions');


  console.log(`\nALL ${checks}/${checks} VERIFICATION CHECKS PASSED!`);
} finally {
  if (db) await db.end();
  if (process.platform === 'win32' && pg.process) {
    execFileSync(join(root, 'node_modules/@embedded-postgres', platform, 'native/bin/pg_ctl.exe'), ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
    pg.process = undefined;
  } else await pg.stop();
  const target = resolve(dataDir), allowed = resolve(os.tmpdir()) + (process.platform === 'win32' ? '\\' : '/');
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-billing-ops-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target, { recursive: true, force: true });
}
