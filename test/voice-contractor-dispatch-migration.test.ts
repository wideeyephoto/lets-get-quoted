import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260903215831_voice_contractor_dispatch_hardening.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function functionDefinition(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must exist in the migration`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf('\n$fn$;', start);
  expect(end, `${name} must use the hardened $fn$ function boundary`).toBeGreaterThan(start);
  return migration.slice(start, end + '\n$fn$;'.length);
}

const claim = functionDefinition('claim_voice_call_admission_v2');
const applyAction = functionDefinition('apply_voice_contractor_action');

describe('AI Voice contractor-dispatch migration', () => {
  it('requires and persists the signed caller identity on every v2 admission', () => {
    expect(claim).toMatch(/or p_caller_kind is null\s+or p_caller_kind not in/i);
    expect(claim).toMatch(/caller_number, caller_kind[\s\S]*p_caller_number, p_caller_kind/i);
    expect(claim).toMatch(/v_existing\.caller_number is distinct from p_caller_number/i);
    expect(claim).toMatch(/v_existing\.caller_kind is distinct from p_caller_kind/i);
  });

  it('uses the Supabase pgcrypto schema and a canonical database-generated fingerprint', () => {
    expect(applyAction).toContain('extensions.digest(');
    expect(applyAction).not.toContain('public.digest(');
    expect(applyAction).toMatch(/or v_function is null\s+or v_function not in/i);
    expect(applyAction).toMatch(/p_payload::text[\s\S]*'sha256'/i);
    expect(migration).toMatch(
      /unique \(\s*account_id, provider, provider_call_id, function_name, request_hash\s*\)/i,
    );
    expect(applyAction).toContain('pg_advisory_xact_lock');
  });

  it('does not replay an action outcome to a different asserted caller', () => {
    const actionLookupStart = applyAction.indexOf('from public.voice_tool_actions a');
    const replayReturn = applyAction.indexOf('return v_action.outcome', actionLookupStart);
    expect(actionLookupStart).toBeGreaterThanOrEqual(0);
    expect(replayReturn).toBeGreaterThan(actionLookupStart);

    const replayRail = applyAction.slice(actionLookupStart, replayReturn);
    expect(replayRail).toMatch(
      /a\.caller_number\s*=\s*p_caller_number|v_action\.caller_number\s+is\s+distinct\s+from\s+p_caller_number/i,
    );
  });

  it('re-authorizes an admitted live staff caller and exact tenant-owned targets before writes', () => {
    expect(applyAction).toMatch(/a\.suspended_at is null[\s\S]*for share/i);
    expect(applyAction).toMatch(
      /a\.admission_state = 'admitted'[\s\S]*a\.caller_number = p_caller_number/i,
    );
    expect(applyAction).toMatch(/v_admission\.caller_kind not in \('owner', 'office', 'crew'\)/i);
    expect(applyAction).toMatch(
      /from public\.jobs j[\s\S]*j\.id = p_target_job_id[\s\S]*j\.account_id = p_account_id[\s\S]*j\.deleted_at is null[\s\S]*for update/i,
    );
    expect(applyAction).toMatch(
      /from public\.leads l[\s\S]*l\.id = p_target_lead_id[\s\S]*l\.account_id = p_account_id[\s\S]*l\.deleted_at is null[\s\S]*for update/i,
    );
  });

  it('keeps crew callers on their assigned jobs and prevents coworker attribution', () => {
    expect(applyAction).toMatch(/v_caller_crew public\.crew%rowtype/i);
    expect(applyAction).toMatch(
      /select c\.\* into v_caller_crew[\s\S]*public\.voice_normalize_us_phone\(c\.phone\) = p_caller_number[\s\S]*for share/i,
    );
    expect(applyAction).toMatch(
      /v_admission\.caller_kind = 'crew'[\s\S]*from public\.crew_assignments ca[\s\S]*ca\.account_id = p_account_id[\s\S]*ca\.job_id = v_job\.id[\s\S]*ca\.crew_id = v_caller_crew\.id/i,
    );

    const costsStart = applyAction.indexOf("elsif v_function = 'log_crew_time_and_materials'");
    const costsEnd = applyAction.indexOf("elsif v_function = 'create_job_change_order'", costsStart);
    const costsRail = applyAction.slice(costsStart, costsEnd);
    expect(costsRail).toMatch(
      /v_admission\.caller_kind = 'crew'[\s\S]*v_crew\.id is distinct from v_caller_crew\.id[\s\S]*raise exception/i,
    );

    const changeOrderStart = applyAction.indexOf("elsif v_function = 'create_job_change_order'");
    const changeOrderEnd = applyAction.indexOf("elsif v_function = 'append_job_caution_or_note'", changeOrderStart);
    const changeOrderRail = applyAction.slice(changeOrderStart, changeOrderEnd);
    expect(changeOrderRail).toMatch(
      /v_admission\.caller_kind = 'crew'[\s\S]*v_crew\.id is distinct from v_caller_crew\.id[\s\S]*raise exception/i,
    );
  });

  it('rejects malformed or caller-timestamped quote visits and keeps create/update targets explicit', () => {
    const leadStart = applyAction.indexOf("elsif v_function = 'create_or_update_lead'");
    const leadEnd = applyAction.indexOf("elsif v_function = 'log_crew_time_and_materials'", leadStart);
    const leadRail = applyAction.slice(leadStart, leadEnd);

    expect(leadRail).toMatch(/jsonb_typeof\(p_payload->'quote_visit'\)\s*<>\s*'object'/i);
    expect(leadRail).toMatch(/\(?p_payload->'quote_visit'\)?\s*\?\s*'scheduledAt'[\s\S]*raise exception/i);
    expect(leadRail).toMatch(
      /v_operation = 'create'[\s\S]{0,500}p_target_lead_id is not null[\s\S]{0,250}raise exception/i,
    );
    expect(leadRail).toMatch(
      /v_operation = 'update'[\s\S]*p_target_lead_id is null[\s\S]*voice lead update requires an exact lead id/i,
    );
  });

  it('cannot attach a cross-workspace crew identity to a voice change order', () => {
    const changeOrderStart = applyAction.indexOf("elsif v_function = 'create_job_change_order'");
    const changeOrderEnd = applyAction.indexOf("elsif v_function = 'append_job_caution_or_note'", changeOrderStart);
    const changeOrderRail = applyAction.slice(changeOrderStart, changeOrderEnd);

    expect(changeOrderRail).toMatch(
      /from public\.crew c[\s\S]*c\.id\s*=\s*\(p_payload->>'crew_id'\)::uuid[\s\S]*c\.account_id\s*=\s*p_account_id/i,
    );
  });

  it('keeps the ledger dark and exposes only narrow service-role RPC execution', () => {
    expect(migration).toContain('alter table public.voice_tool_actions enable row level security');
    expect(migration).toContain('alter table public.voice_tool_actions force row level security');
    expect(migration).toMatch(
      /revoke all on table public\.voice_tool_actions from public, anon, authenticated, service_role/i,
    );
    expect(migration).not.toMatch(
      /grant[^;]*(insert|update|delete)[^;]*on table public\.voice_tool_actions[^;]*to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.apply_voice_contractor_action\(uuid,text,text,text,uuid,uuid,jsonb\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to service_role/i,
    );
    expect(migration).toMatch(
      /grantee in \('PUBLIC', 'anon', 'authenticated'(?:, 'service_role')?\)/i,
    );
    expect(migration).not.toMatch(/grant execute[\s\S]{0,250}to (anon|authenticated)/i);
  });
});
