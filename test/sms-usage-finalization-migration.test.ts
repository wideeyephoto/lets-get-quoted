import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'migrations', '20260821191500_sms_usage_finalization.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('SMS usage survives ambiguous provider outcomes', () => {
  it('persists the exact hold before the existing request-start transition', () => {
    expect(sql).toContain('create or replace function public.mark_sms_delivery_request_started_with_usage');
    expect(sql.indexOf('set text_usage_kind = p_usage_kind')).toBeLessThan(
      sql.indexOf('perform public.mark_sms_delivery_request_started'),
    );
    expect(sql).toContain("v_reservation.resource_code <> 'text_segments'");
    expect(sql).toContain("p_finalization_key <> v_reservation.idempotency_key || ':commit'");
  });

  it('commits accepted and indeterminate attempts but releases definite rejections', () => {
    expect(sql).toContain("v_should_commit := v_row.task_state in ('completed', 'indeterminate')");
    expect(sql).toContain('public.commit_usage_reservation');
    expect(sql).toContain('public.release_usage_reservation');
    expect(sql).toContain('public.release_usage_overage');
    expect(sql).toContain("text_usage_state = 'reconciliation_failed'");
  });

  it('can safely undo a committed marker when the provider socket never opened', () => {
    expect(sql).toContain('create or replace function public.rollback_sms_delivery_pre_request_boundary');
    expect(sql).toContain("'provider_request_not_opened'");
    expect(sql).toContain("set status = 'queued', send_started_at = null");
    expect(sql).toContain('set request_started_at = null, updated_at = v_now');
    expect(sql).toContain('where claim_token = p_claim_token and outcome is null');
  });

  it('uses row claims, bounded work, fixed search paths, and service-role-only execution', () => {
    expect(sql).toContain('limit p_batch_size\n     for update of e skip locked');
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(4);
    expect(sql.match(/from public, anon, authenticated, service_role/g)).toHaveLength(3);
  });
});
