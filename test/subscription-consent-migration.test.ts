import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816054500_base_plan_recurring_consent_evidence.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('base-plan recurring consent evidence migration', () => {
  it('creates immutable, forced-RLS evidence with no direct owner write surface', () => {
    expect(compact).toContain('create table public.billing_subscription_consent_acceptances');
    expect(compact).toContain('enable row level security');
    expect(compact).toContain('force row level security');
    expect(compact).toContain('recurring subscription consent evidence is immutable');
    expect(compact).toContain('recurring subscription consent evidence cannot be deleted');
    expect(compact).toContain(
      'revoke all on table public.billing_subscription_consent_acceptances from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant select on table public.billing_subscription_consent_acceptances to service_role',
    );
  });

  it('records the authenticated non-anonymous owner instead of accepting an actor from input', () => {
    const recordSignature = sql.slice(
      sql.indexOf('create function public.record_base_plan_recurring_consent'),
      sql.indexOf('revoke all on function public.record_base_plan_recurring_consent'),
    );
    expect(recordSignature).toContain('v_actor uuid := auth.uid()');
    expect(recordSignature).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(recordSignature).toContain("m.user_id = v_actor");
    expect(recordSignature).toContain("m.role = 'owner'");
    expect(recordSignature).not.toContain('p_accepted_by');
    expect(compact).toContain(
      'grant execute on function public.record_base_plan_recurring_consent( uuid, text, text, text, text, bigint, text, text, text, text ) to authenticated',
    );
  });

  it('binds consent to the exact operation, plan, cadence, price, currency, Terms, version, and hash', () => {
    for (const value of [
      "catalog_version = '2026-08-15-preview'",
      "terms_version = '2026-08-16'",
      "recurring_consent_version = 'base-plan-recurring-2026-08-16'",
      "currency = 'usd'",
      'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75',
      "plan_code = 'solo' and billing_interval = 'monthly' and unit_amount_cents = 3900",
      "plan_code = 'solo' and billing_interval = 'annual' and unit_amount_cents = 42000",
      "plan_code = 'growth' and billing_interval = 'monthly' and unit_amount_cents = 12900",
      "plan_code = 'growth' and billing_interval = 'annual' and unit_amount_cents = 118800",
      "plan_code = 'scale' and billing_interval = 'monthly' and unit_amount_cents = 32900",
      "plan_code = 'scale' and billing_interval = 'annual' and unit_amount_cents = 358800",
    ]) {
      expect(compact).toContain(value);
    }
    expect(compact).toContain("expires_at = accepted_at + interval '30 minutes'");
    for (const match of [
      'a.account_id = p_account_id',
      'a.operation_id = pg_catalog.btrim(p_operation_id)',
      'a.plan_code = p_plan_code',
      'a.billing_interval = p_billing_interval',
      'a.catalog_version = p_catalog_version',
      'a.unit_amount_cents = p_unit_amount_cents',
      'a.currency = p_currency',
      'a.terms_version = p_terms_version',
      'a.recurring_consent_version = p_recurring_consent_version',
      'a.recurring_consent_text_sha256 = p_recurring_consent_text_sha256',
    ]) {
      expect(compact).toContain(match);
    }
    expect(compact).toContain('if v_acceptance.expires_at <= pg_catalog.now() then');
    expect(compact).toContain('recurring consent evidence expired before checkout was claimed');
  });

  it('makes evidence single-use while allowing only an immutable replay of that same operation', () => {
    expect(compact).toContain(
      'unique (recurring_consent_acceptance_id)',
    );
    expect(compact).toContain(
      'recurring consent evidence was already used by another operation',
    );
    expect(compact).toContain(
      'operation id was already claimed with different immutable subscription input',
    );
    expect(compact).toContain('v_operation.recurring_consent_acceptance_id is distinct from p_recurring_consent_acceptance_id');
    expect(compact).toContain('v_operation.plan_code is distinct from p_plan_code');
    expect(compact).toContain('v_operation.billing_interval is distinct from p_billing_interval');
    expect(compact).toContain('v_operation.unit_amount_cents is distinct from p_unit_amount_cents');
    expect(compact).toContain('v_operation.recurring_consent_text_sha256 is distinct from p_recurring_consent_text_sha256');
    expect(compact).toContain("if v_operation.state = 'checkout_created' then");

    const existingOperation = sql.indexOf('select o.*\n    into v_operation');
    const expiryCheck = sql.indexOf('if v_acceptance.expires_at <= pg_catalog.now() then');
    expect(existingOperation).toBeGreaterThan(-1);
    expect(expiryCheck).toBeGreaterThan(existingOperation);
  });

  it('copies authenticated evidence into the immutable operation before provider submission', () => {
    expect(compact).toContain('add column recurring_consent_accepted_by uuid not null');
    expect(compact).toContain('add column recurring_consent_accepted_at timestamptz not null');
    expect(compact).toContain('add column recurring_consent_text_sha256 text not null');
    expect(compact).toContain('add constraint billing_subscription_checkout_consent_binding_fk foreign key');
    expect(compact).toContain('v_acceptance.accepted_by');
    expect(compact).toContain('v_acceptance.accepted_at');
    expect(compact).toContain('old.recurring_consent_accepted_by is distinct from new.recurring_consent_accepted_by');
    expect(compact).toContain('old.recurring_consent_accepted_at is distinct from new.recurring_consent_accepted_at');
  });

  it('replaces the legacy claim signature and fails if an unexpected dark operation exists', () => {
    expect(sql).toMatch(/lock table public\.billing_subscription_checkout_operations in access exclusive mode;[\s\S]*if exists \(select 1 from public\.billing_subscription_checkout_operations\)/);
    expect(compact).toContain('drop function public.claim_stripe_billing_subscription_checkout');
    expect(compact).toContain('p_recurring_consent_text_sha256 text');
    expect(compact).toContain('p_recurring_consent_acceptance_id uuid');
    expect(compact).toContain(
      'grant execute on function public.claim_stripe_billing_subscription_checkout( uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text, uuid, text ) to service_role',
    );
    expect(compact).toContain(
      'revoke all on function public.claim_stripe_billing_subscription_checkout( uuid, text, text, text, text, boolean, text, text, text, bigint, text, text, text, uuid, text ) from public, anon, authenticated, service_role',
    );
  });
});
