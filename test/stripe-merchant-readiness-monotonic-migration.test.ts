import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816035518_stripe_merchant_readiness_monotonic.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('Stripe Merchant monotonic readiness migration', () => {
  it('locks the exact workspace in a single transaction before its strict timestamp comparison', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('persist_stripe_merchant_readiness_evidence');
    expect(sql).toMatch(/select a\.\* into v_account[\s\S]*where a\.id = p_workspace_id[\s\S]*for update/);
    expect(sql.indexOf('for update;')).toBeLessThan(sql.indexOf('v_verified_at <= v_account.merchant_configuration_verified_at'));
    expect(compact).toContain('v_verified_at <= v_account.merchant_configuration_verified_at');
    expect(compact).toContain('return false;');
    expect(compact).toContain('return true;');
  });

  it('binds both validation and update to workspace, provider account, and livemode', () => {
    expect(compact).toContain('v_account.stripe_merchant_account_id is distinct from p_provider_account_id');
    expect(compact).toContain('v_account.merchant_livemode is distinct from p_expected_livemode');
    expect(compact).toContain("v_snapshot ->> 'account_id' is distinct from p_provider_account_id");
    expect(compact).toContain("(v_snapshot ->> 'livemode')::boolean is distinct from p_expected_livemode");
    expect(sql).toMatch(/update public\.accounts a[\s\S]*where a\.id = p_workspace_id[\s\S]*and a\.stripe_merchant_account_id = p_provider_account_id[\s\S]*and a\.merchant_livemode = p_expected_livemode/);
  });

  it('validates one coherent provider snapshot before any activation state is written', () => {
    expect(compact).toContain("v_snapshot ->> 'schema_version' is distinct from 'lgq.stripe-merchant.v1'");
    expect(compact).toContain("nullif(v_snapshot #>> '{verification,verified_at}', '')::timestamptz is distinct from v_verified_at");
    expect(compact).toContain("(v_snapshot #>> '{verification,ready}')::boolean is distinct from (v_state = 'ready')");
    expect(compact).toContain("v_verified_at > pg_catalog.clock_timestamp() + interval '5 minutes'");
    expect(compact).toContain("v_state not in ('pending', 'restricted', 'ready', 'disabled')");
    expect(compact).toContain("v_state = 'ready' and (v_ready_at is distinct from v_verified_at or v_disabled_at is not null)");
  });

  it('is a least-privilege service-role RPC with no browser or direct table grant', () => {
    expect(sql.match(/security definer/g)).toHaveLength(1);
    expect(compact).toContain('set search_path = pg_catalog, pg_temp');
    expect(compact).toContain('revoke all on function public.persist_stripe_merchant_readiness_evidence(uuid, text, boolean, jsonb) from public, anon, authenticated, service_role');
    expect(compact).toContain('grant execute on function public.persist_stripe_merchant_readiness_evidence(uuid, text, boolean, jsonb) to service_role');
    expect(compact).not.toContain('grant select on table public.accounts');
    expect(compact).not.toContain('grant update on table public.accounts');
  });

  it('does not touch the legacy Recipient or any active payment path', () => {
    expect(sql).not.toContain('stripe_connect_id');
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('destination');
    expect(sql).not.toContain('public.payments');
    expect(sql).not.toContain('billing_payment_operations');
  });
});
