import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816220000_legacy_destination_checkout_session_adoption.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
/** Wrapped SQL means contract assertions must not depend on line breaks. */
const flat = sql.replace(/\s+/g, ' ');
/** Executable SQL only. The header prose discusses what is deliberately absent. */
const code = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

const table = 'legacy_destination_checkout_session_adoptions';
const rpcNames = [
  'record_legacy_destination_checkout_session_adoption',
  'legacy_destination_checkout_unadopted_pointer_count',
] as const;

function flatSliceBetween(start: string, end: string): string {
  const startAt = flat.indexOf(start);
  const endAt = flat.indexOf(end, startAt + start.length);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(startAt);
  return flat.slice(startAt, endAt);
}

describe('legacy destination Checkout Session adoption migration', () => {
  it('is a dark additive transaction that never mutates a payment or calls a provider', () => {
    expect(sql.startsWith('-- dark audited adoption record')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    // The whole point of the audit record is that it observes, never repairs.
    expect(flat).not.toMatch(/update public\.payments/);
    expect(flat).not.toMatch(/insert into public\.payments/);
    expect(flat).not.toMatch(/delete from|truncate table|drop table/);
    expect(flat).not.toMatch(/https?:\/\/|net\.http|stripe\.checkout\.sessions/);
    expect(flat).not.toMatch(/create extension|alter role|set app\./);
    expect(flat).not.toMatch(/insert into (?:cron\.|vault\.|supabase_migrations\.)/);
    expect(flat).not.toMatch(/lgq_legacy_destination_checkout_generation_enabled/);
    expect(flat).not.toContain('pg_catalog.pg_get_functiondef');
  });

  it('is ordered before the generation foundation it unblocks', () => {
    // 20260816220000 < 20260816221500. The foundation's preflight is atomic with
    // its own ledger, so the audit record can only ever be written beforehand.
    expect(migrationPath).toContain('20260816220000');
    expect(Number('20260816220000')).toBeLessThan(Number('20260816221500'));
  });

  it('uses a private FORCE-RLS append-only adoption ledger', () => {
    expect(flat).toContain(`create table public.${table}`);
    expect(flat).toContain(`alter table public.${table} enable row level security`);
    expect(flat).toContain(`alter table public.${table} force row level security`);
    expect(flat).toContain(
      `revoke all on table public.${table} from public, anon, authenticated, service_role;`,
    );
    expect(flat).not.toMatch(new RegExp(`create policy[^;]+on public\\.${table}`));
    expect(flat).not.toMatch(new RegExp(
      `grant (?:select|insert|update|delete|all)[^;]*on (?:table )?public\\.${table}`,
    ));
    expect(flat).toContain('legacy destination checkout session adoptions are append-only');
    const guard = flatSliceBetween(
      'create function public.protect_legacy_destination_checkout_session_adoption()',
      'create trigger protect_legacy_destination_checkout_session_adoption_trigger',
    );
    expect(guard).toContain('security invoker');
    expect(guard).not.toContain('security definer');
    expect(flat).toContain(`before update or delete on public.${table}`);
  });

  it('offers only terminal dispositions and no recovery path', () => {
    expect(flat).toContain(
      "disposition in ('frozen_paid', 'frozen_unsafe', 'inert_terminal')",
    );
    // A disposition that re-opens an unaudited Session would let an unsafe
    // pre-ledger Session look collectible. There must not be one.
    for (const forbidden of ['recoverable', 'reclaim', 'resume', 'adopt_active']) {
      expect(code).not.toContain(forbidden);
    }
    expect(flat).toContain('recovery remains an explicit human operation');
  });

  it('binds every disposition to provider and payment truth', () => {
    expect(flat).toContain(
      "(provider_payment_status = 'paid') = (disposition = 'frozen_paid')",
    );
    expect(flat).toContain(
      "provider_sibling_open_session_count = 0 or disposition = 'frozen_unsafe'",
    );
    for (const refusal of [
      'legacy destination checkout adoption with sibling sessions must be unsafe',
      'legacy destination checkout adoption does not match the recorded session pointer',
      'legacy destination checkout adoption amount does not match payment truth',
      'legacy destination checkout adoption destination account does not match the recipient',
      'legacy destination checkout adoption paid truth conflicts with the payment',
      'legacy destination checkout adoption inert truth conflicts with the payment',
    ]) expect(flat).toContain(refusal);
    expect(flat).toContain("v_payment.charge_model <> 'destination'");
    expect(flat).toContain(
      'v_payment.stripe_checkout_session is distinct from p_checkout_session_id',
    );
  });

  it('replays an identical audit exactly and refuses changed evidence', () => {
    const body = flatSliceBetween(
      'create function public.record_legacy_destination_checkout_session_adoption(',
      'create function public.legacy_destination_checkout_unadopted_pointer_count()',
    );
    for (const field of [
      'disposition',
      'provider_session_status',
      'provider_payment_status',
      'provider_amount_total_cents',
      'provider_currency',
      'provider_livemode',
      'provider_expires_at',
      'provider_payment_intent_id',
      'provider_charge_id',
      'provider_application_fee_cents',
      'provider_destination_account_id',
      'provider_sibling_open_session_count',
      'evidence_digest',
    ]) expect(body).toContain(`v_existing.${field} is distinct from p_${field}`);
    expect(body).toContain('legacy destination checkout adoption replay evidence changed');
    expect(body).toContain("return query select 'replay'::text");
    expect(body).toContain("return query select 'recorded'::text");
    expect(body).toContain('for update');
  });

  it('exposes only two fixed service-role RPC contracts', () => {
    for (const rpc of rpcNames) {
      const signature = flat.indexOf(`create function public.${rpc}(`);
      expect(signature).toBeGreaterThanOrEqual(0);
      const header = flat.slice(signature, flat.indexOf('as $$', signature));
      expect(header).toContain('security definer');
      expect(header).toContain("set search_path = ''");
      expect(header).toContain("set timezone to 'utc'");
      expect(flat).toContain(`grant execute on function public.${rpc}(`);
    }
    expect(sql.match(/^grant execute on function public\./gm)).toHaveLength(2);
    expect(flat).not.toMatch(
      /grant execute on function public\.[^;]+\bto (?:public|anon|authenticated)\b/,
    );
  });

  it('counts outstanding pointers without granting any table read', () => {
    const counter = flatSliceBetween(
      'create function public.legacy_destination_checkout_unadopted_pointer_count()',
      'revoke all on function public.record_legacy_destination_checkout_session_adoption(',
    );
    expect(counter).toContain("where p.charge_model = 'destination'");
    expect(counter).toContain('and p.stripe_checkout_session is not null');
    expect(counter).toContain('not exists');
    expect(counter).toContain('stable');
    expect(counter).not.toMatch(/ update | insert | delete /);
  });
});
