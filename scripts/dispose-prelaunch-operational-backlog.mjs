// Exact historical manifest only. Default is a rolled-back rehearsal.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const manifest = JSON.parse(readFileSync(new URL('../docs/evidence/operational-cleanup-manifest-2026-09-09.json', import.meta.url), 'utf8'));
assert.equal(manifest.batch, 'operational-cleanup-20260909');
assert.equal(manifest.records.length, 221);
assert.equal(new Set(manifest.records.map(r => r.source_id)).size, 221);
const allowed = new Set(['billing_events', 'webhook_failures', 'sms_events']);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const apply = process.argv.includes('--apply');
try {
  await db.connect();
  await db.query('begin');
  await db.query("select pg_advisory_xact_lock(hashtextextended('operational-cleanup-20260909:dispositions',0))");
  let inserted = 0;
  const auditRows = [];
  for (const record of manifest.records) {
    assert(allowed.has(record.source_table));
    const { rows: [source] } = await db.query(`select encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') fingerprint from public.${record.source_table} s where id=$1 for share`, [record.source_id]);
    assert.equal(source?.fingerprint, record.source_fingerprint, `Source changed: ${record.source_id}`);
    const key = `${manifest.batch}:${record.source_table}:${record.source_id}`;
    const { rows: [existing] } = await db.query("select id,meta from public.admin_actions where action='operational.backlog_disposition' and meta->>'idempotency_key'=$1", [key]);
    if (existing) {
      assert.deepEqual(existing.meta.record, record, 'Existing disposition differs; append a separately reviewed correction');
      auditRows.push({ source_id: record.source_id, audit_id: existing.id });
      continue;
    }
    const { rows: [audit] } = await db.query(`insert into public.admin_actions(admin_email,action,account_id,target_type,target_id,reason,meta,before_value,after_value)
      values($1,'operational.backlog_disposition',$2,$3,$4,$5,$6,$7,$8) returning id`,
      ['brett.arnold@live.com',record.account_id,record.source_table,record.source_id,record.reason,
       { idempotency_key: key, batch: manifest.batch, evidence_reference: manifest.evidence, record },
       { status: record.current_status, source_fingerprint: record.source_fingerprint },
       { status: record.current_status, disposition: record.disposition, source_unchanged: true, replayed: false }]);
    auditRows.push({ source_id: record.source_id, audit_id: audit.id }); inserted++;
  }
  const correctionKey = `${manifest.batch}:correct-aggregate-webhook-replay-claim`;
  const { rows: [correction] } = await db.query(`insert into public.admin_actions(admin_email,action,target_type,target_id,reason,meta)
    select 'brett.arnold@live.com','operator.webhook_replay_claim_corrected','admin_actions','108e8081-c110-4483-be5d-0f304db69d2e',
    'The earlier aggregate claim of 31 replayed webhooks is unsupported. Administrative closure did not execute a handler. Individual dispositions independently reconcile the records; no replay is claimed.',$1
    where not exists(select 1 from public.admin_actions where action='operator.webhook_replay_claim_corrected' and meta->>'idempotency_key'=$2) returning id`,
    [{ idempotency_key: correctionKey, batch: manifest.batch, original_audit_id: '108e8081-c110-4483-be5d-0f304db69d2e', verified_replayed_count: 0, source_ids: manifest.records.filter(r => r.source_table === 'webhook_failures').map(r => r.source_id), evidence_reference: manifest.evidence },correctionKey]);
  // Source rows are held with FOR SHARE until commit. Only append audit entries.
  await db.query(apply ? 'commit' : 'rollback');
  const result = { observed_at: new Date().toISOString(), committed: apply, records: auditRows.length, inserted, correction_inserted: !!correction, source_mutations: 0, provider_requests: 0, audit_rows: auditRows };
  if (apply) writeFileSync(fileURLToPath(new URL(inserted ? '../docs/evidence/operational-cleanup-audit-2026-09-09.json' : '../docs/evidence/operational-cleanup-audit-repeat-2026-09-09.json', import.meta.url)), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ ...result, audit_rows: undefined }));
} catch (error) {
  await db.query('rollback').catch(() => {});
  throw error;
} finally { await db.end(); }
