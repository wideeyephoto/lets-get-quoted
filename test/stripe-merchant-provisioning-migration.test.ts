import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816030805_stripe_merchant_provisioning_operations.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('Stripe Merchant provisioning operation migration', () => {
  it('is a transactional, one-workspace immutable create ledger', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact).toContain('create table public.stripe_merchant_provisioning_operations');
    expect(compact).toContain('workspace_id uuid not null unique');
    expect(compact).toContain('stripe_idempotency_key text not null unique');
    expect(compact).toContain('request_fingerprint text not null');
    expect(compact).toContain('stripe merchant provisioning request identity is immutable');
    expect(compact).toContain('stripe merchant provider account identity is immutable once observed');
    expect(compact).toContain('stripe merchant provisioning operations are append-only records');
  });

  it('reclaims only an expired pre-submission lease', () => {
    expect(compact).toContain("v_operation.state = 'claimed' and v_operation.lease_expires_at <= pg_catalog.now()");
    expect(compact).toContain("set state = 'submitted'");
    expect(compact).toContain("case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end");
    expect(compact).not.toMatch(/v_operation\.state = 'submitted'[\s\S]{0,240}set claim_token = v_claim_token/);
    expect(compact).not.toMatch(/v_operation\.state = 'indeterminate'[\s\S]{0,240}set claim_token = v_claim_token/);
    expect(compact).toContain("state in ('submitted', 'indeterminate')");
    expect(compact).toContain('never auto-reclaimed');
  });

  it('rejects changed inputs and only replays a reconciled provider mapping', () => {
    expect(compact).toContain('workspace merchant create was already claimed with different immutable input');
    expect(compact).toContain("if v_operation.state = 'succeeded' then");
    expect(compact).toContain("'replay'::text");
    expect(compact).toContain('v_account.stripe_merchant_account_id is distinct from v_operation.provider_account_id');
    expect(compact).toContain('v_account.merchant_livemode is distinct from v_operation.livemode');
  });

  it('atomically maps the operation-owned workspace and completes the provider ID', () => {
    expect(sql).toContain('complete_stripe_merchant_provisioning_operation');
    expect(sql).toMatch(/select a\.\* into v_account[\s\S]*where a\.id = v_operation\.workspace_id[\s\S]*for update/);
    expect(sql).toMatch(/update public\.accounts[\s\S]*stripe_merchant_account_id = p_provider_account_id[\s\S]*where a\.id = v_operation\.workspace_id[\s\S]*update public\.stripe_merchant_provisioning_operations[\s\S]*state = 'succeeded'/);
    const completionSignature = sql.match(/complete_stripe_merchant_provisioning_operation\(([\s\S]*?)\)\s*returns boolean/)?.[1];
    expect(completionSignature).toBeDefined();
    expect(completionSignature).not.toContain('workspace');
    expect(compact).toContain('mapping and provider completion commit or');
    expect(compact).toContain('roll back together in this one transaction');
  });

  it('exposes only claim-token RPCs to the service role', () => {
    expect(compact).toContain('enable row level security');
    expect(compact).toContain('revoke all on table public.stripe_merchant_provisioning_operations from public, anon, authenticated, service_role');
    expect(compact).not.toContain('grant select on table public.stripe_merchant_provisioning_operations');
    expect(sql.match(/security definer/g)).toHaveLength(4);
    for (const rpc of [
      'claim_stripe_merchant_provisioning_operation',
      'begin_stripe_merchant_provisioning_submission',
      'complete_stripe_merchant_provisioning_operation',
      'mark_stripe_merchant_provisioning_indeterminate',
    ]) {
      expect(compact).toContain(`grant execute on function public.${rpc}`);
    }
    expect(compact).toContain('from public, anon, authenticated, service_role');
  });

  it('does not touch the legacy Recipient/destination-charge rail', () => {
    expect(sql).not.toContain('stripe_connect_id');
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('destination');
  });
});
