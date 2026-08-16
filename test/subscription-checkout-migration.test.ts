import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816041255_stripe_billing_subscription_checkout_operations.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

const fkIndexMigrationPath = fileURLToPath(new URL(
  '../migrations/20260816050127_stripe_billing_subscription_customer_fk_indexes.sql',
  import.meta.url,
));
const fkIndexSql = readFileSync(fkIndexMigrationPath, 'utf8')
  .replace(/\r\n/g, '\n')
  .toLowerCase();
const fkIndexCompact = fkIndexSql.replace(/\s+/g, ' ');

describe('Stripe Billing subscription Checkout operation migration', () => {
  it('transactionally mode-scopes the confirmed-empty subscription ledger', () => {
    expect(compact).toContain('begin;');
    expect(sql).toMatch(/lock table public\.billing_subscriptions in access exclusive mode;[\s\S]*if exists \(select 1 from public\.billing_subscriptions\)/);
    expect(compact).toContain('add column livemode boolean not null');
    expect(compact).toContain('unique (provider, livemode, provider_subscription_id)');
    expect(compact).toContain('on public.billing_subscriptions (provider, livemode, provider_customer_id)');
    expect(compact).toContain('on public.billing_subscriptions (provider, livemode, provider_price_id)');
    expect(compact).toContain('on public.billing_subscriptions (provider, livemode, provider_subscription_item_id)');
    expect(compact.indexOf('commit;')).toBeGreaterThan(compact.indexOf('begin;'));
  });

  it('keeps one immutable platform Customer per workspace and Stripe mode', () => {
    expect(compact).toContain('create table public.billing_subscription_customers');
    expect(compact).toContain('primary key (account_id, provider, livemode)');
    expect(compact).toContain('unique (provider, livemode, provider_customer_id)');
    expect(compact).toContain('foreign key (account_id, provider, livemode, provider_customer_id)');
    expect(compact).toContain('references public.billing_subscription_customers ( account_id, provider, livemode, provider_customer_id )');
    expect(compact).toContain('platform billing customer identity is immutable');
    expect(compact).toContain('platform billing customer identities cannot be deleted');
  });

  it('hard-binds the six canonical USD Price contracts and consent versions', () => {
    for (const binding of [
      "plan_code = 'solo' and billing_interval = 'monthly' and unit_amount_cents = 3900",
      "plan_code = 'solo' and billing_interval = 'annual' and unit_amount_cents = 42000",
      "plan_code = 'growth' and billing_interval = 'monthly' and unit_amount_cents = 12900",
      "plan_code = 'growth' and billing_interval = 'annual' and unit_amount_cents = 118800",
      "plan_code = 'scale' and billing_interval = 'monthly' and unit_amount_cents = 32900",
      "plan_code = 'scale' and billing_interval = 'annual' and unit_amount_cents = 358800",
    ]) {
      expect(compact).toContain(binding);
    }
    expect(compact).toContain("currency text not null default 'usd' check (currency = 'usd')");
    expect(compact).toContain("terms_version text not null check (terms_version = '2026-08-03')");
    expect(compact).toContain('recurring_consent_version text not null');
    expect(compact).toContain("purpose text not null default 'base_plan_subscription'");
  });

  it('claims durably and binds the final request before any provider create can occur', () => {
    expect(compact).toContain('create function public.claim_stripe_billing_subscription_checkout');
    expect(compact).toContain('request_fingerprint text check');
    expect(compact).toContain('stripe_idempotency_key text not null');
    expect(compact).toContain('create function public.begin_stripe_billing_subscription_checkout_submission');
    expect(sql).toMatch(/set state = 'submitted',[\s\S]*checkout_expires_at = p_checkout_expires_at,[\s\S]*request_fingerprint = p_request_fingerprint/);
    expect(compact).toContain("p_checkout_expires_at < pg_catalog.now() + interval '30 minutes'");
    expect(compact).toContain("p_checkout_expires_at > pg_catalog.now() + interval '31 minutes'");
    expect(compact).toContain('subscription checkout request fingerprint is immutable after binding');
    expect(compact).toContain('subscription checkout expiration is immutable after binding');
    expect(compact).toContain("pg_catalog.date_part('epoch', v_operation.checkout_expires_at)");
    expect(compact).not.toContain('pg_catalog.extract(epoch from');
  });

  it('allows only one pending plan change and never reclaims submitted or indeterminate work', () => {
    expect(compact).toContain('create unique index billing_subscription_checkout_one_pending_per_account');
    expect(compact).toContain("where state in ('claimed', 'submitted', 'checkout_created', 'indeterminate')");
    expect(compact).toContain("v_operation.state = 'claimed' and v_operation.lease_expires_at <= pg_catalog.now()");
    expect(compact).not.toMatch(/v_operation\.state = 'submitted'[\s\S]{0,250}set claim_token = v_claim_token/);
    expect(compact).not.toMatch(/v_operation\.state = 'indeterminate'[\s\S]{0,250}set claim_token = v_claim_token/);
    expect(compact).toContain("state in ('activated', 'expired', 'canceled')");
    expect(compact).toContain("old.state in ('checkout_created', 'indeterminate') and new.state in ('activated', 'expired', 'canceled')");
  });

  it('keeps upgrades, downgrades, fulfillment, and entitlement mutation dark', () => {
    expect(compact).toContain('existing subscription history requires the future plan-change flow');
    expect(compact).toContain("v_entitlement.plan_code <> 'flex'");
    expect(compact).toContain("v_entitlement.billing_status <> 'free'");
    const rpcSection = sql.slice(
      sql.indexOf('create function public.claim_stripe_billing_subscription_checkout'),
      sql.indexOf('-- the service role can inspect this ledger'),
    );
    expect(rpcSection).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.billing_subscriptions\b/);
    expect(rpcSection).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.workspace_entitlements\b/);
  });

  it('mode-validates provider objects and exposes only service-role RPC writes', () => {
    expect(compact).toContain("livemode and provider_object_id ~ '^cs_live_[a-za-z0-9_]+$'");
    expect(compact).toContain("not livemode and provider_object_id ~ '^cs_test_[a-za-z0-9_]+$'");
    expect(compact).toContain('enable row level security');
    expect(compact).toContain('force row level security');
    expect(compact).toContain('revoke all on table public.billing_subscription_customers from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.billing_subscription_customers to service_role');
    expect(compact).toContain('revoke all on table public.billing_subscription_checkout_operations from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.billing_subscription_checkout_operations to service_role');
    expect(sql.match(/security definer/g)).toHaveLength(4);
    for (const rpc of [
      'claim_stripe_billing_subscription_checkout',
      'begin_stripe_billing_subscription_checkout_submission',
      'complete_stripe_billing_subscription_checkout',
      'mark_stripe_billing_subscription_checkout_indeterminate',
    ]) {
      expect(compact).toContain(`grant execute on function public.${rpc}`);
    }
    expect(compact).toContain('from public, anon, authenticated, service_role');
  });

  it('contains no connected-account charge rail and documents dependency-safe rollback order', () => {
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('on_behalf_of');
    expect(sql).not.toContain('application_fee');
    expect(sql).not.toContain('stripe_connect_id');

    const rollback = sql.slice(sql.indexOf('-- rollback'));
    expect(rollback.indexOf('drop table public.billing_subscription_checkout_operations'))
      .toBeLessThan(rollback.indexOf('drop function public.protect_billing_subscription_checkout_operation'));
    expect(rollback.indexOf('drop table public.billing_subscription_customers'))
      .toBeLessThan(rollback.indexOf('drop function public.protect_billing_subscription_customer_identity'));
    expect(rollback).toContain('drop column livemode');
  });

  it('covers both composite platform Customer foreign keys in a follow-up migration', () => {
    expect(fkIndexCompact).toContain('begin;');
    expect(fkIndexCompact).toContain(
      'create index if not exists billing_subscription_checkout_customer_mode_fk_idx on public.billing_subscription_checkout_operations ( account_id, livemode, provider_customer_id )',
    );
    expect(fkIndexCompact).toContain(
      'create index if not exists billing_subscriptions_customer_mode_fk_idx on public.billing_subscriptions ( account_id, provider, livemode, provider_customer_id )',
    );
    expect(fkIndexCompact.indexOf('commit;')).toBeGreaterThan(fkIndexCompact.indexOf('begin;'));
  });
});
