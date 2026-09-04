import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260903232815_voice_staff_step_up_authorization.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function definition(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf('\n$fn$;', start);
  expect(end, `${name} must use the $fn$ boundary`).toBeGreaterThan(start);
  return migration.slice(start, end + '\n$fn$;'.length);
}

const issue = definition('issue_voice_staff_step_up_challenge');
const markProviderAccepted = definition('mark_voice_staff_step_up_provider_accepted');
const verify = definition('verify_voice_staff_step_up_challenge');
const invalidate = definition('invalidate_voice_staff_step_up_challenge');
const status = definition('get_voice_staff_step_up_status');
const closeProviderStatus = definition('close_voice_staff_step_up_from_provider_status');
const callEnd = definition('invalidate_voice_staff_step_up_on_call_end');
const applyAction = definition('apply_voice_contractor_action');

describe('AI Voice staff-call step-up migration', () => {
  it('stores only an exact six-digit-code HMAC representation', () => {
    const tableStart = migration.indexOf(
      'create table if not exists public.voice_staff_step_up_challenges',
    );
    const tableEnd = migration.indexOf('\n);', tableStart);
    const table = migration.slice(tableStart, tableEnd);

    expect(table).toContain('code_digits smallint not null default 6 check (code_digits = 6)');
    expect(table).toContain("code_hmac text not null check (code_hmac ~ '^[a-f0-9]{64}$')");
    expect(table).not.toMatch(/\b(?:plaintext|plain_code|otp_code|verification_code)\b/i);
    expect(status).not.toContain('code_hmac');
    expect(invalidate).not.toContain('code_hmac');
  });

  it('binds challenges to one exact workspace, admission, provider call, and staff caller', () => {
    expect(migration).toContain('admission_id uuid not null unique');
    expect(migration).toContain('voice_staff_step_up_call_identity_uidx');
    for (const rpc of [issue, markProviderAccepted, verify, status, applyAction]) {
      expect(rpc).toMatch(/a\.account_id = p_account_id/i);
      expect(rpc).toMatch(/a\.provider = 'signalwire'/i);
      expect(rpc).toMatch(/a\.provider_call_id = p_provider_call_id/i);
      expect(rpc).toMatch(/a\.caller_number = p_caller_number/i);
      expect(rpc).toMatch(/a\.caller_kind in \('owner', 'office', 'crew'\)/i);
      expect(rpc).toMatch(/a\.admission_state = 'admitted'/i);
      expect(rpc).toMatch(/a\.provider_terminal_at is null/i);
      expect(rpc).toMatch(/not exists \([\s\S]*from public\.voice_events e/i);
    }
  });

  it('closes exact provider-terminal liveness without settling the billing receipt', () => {
    expect(closeProviderStatus).toContain(
      "p_call_status in ('completed', 'busy', 'failed', 'no-answer', 'canceled')",
    );
    expect(closeProviderStatus).toContain("'signalwire:' || p_provider_call_id, 63190215");
    expect(closeProviderStatus).toContain('insert into public.voice_provider_terminal_call_tombstones');
    expect(closeProviderStatus).toContain('on conflict (provider, provider_call_id) do nothing');
    expect(closeProviderStatus).toContain("'tombstoned'::text");
    expect(closeProviderStatus).toContain("invalidation_reason = 'provider_terminal'");
    expect(closeProviderStatus).not.toMatch(/settle|reservation_id|reserved_minutes/i);
  });

  it('enforces expiry, resend cooldown, bounded sends, attempts, and verification', () => {
    expect(migration).toContain("code_expires_at <= last_sent_at + interval '10 minutes'");
    expect(migration).toContain("verified_until <= verified_at + interval '30 minutes'");
    expect(migration).toContain('send_count between 1 and 3');
    expect(migration).toContain('attempt_count between 0 and 5');
    expect(issue).toContain("last_sent_at + interval '60 seconds'");
    expect(issue).toMatch(/send_count >= 3 or v_challenge\.attempt_count >= 5/i);
    expect(verify).toMatch(/set attempt_count = c\.attempt_count \+ 1/i);
    expect(verify).toMatch(/c\.attempt_count \+ 1 >= 5 then 'locked'/i);
    expect(verify).toContain("verified_until = v_now + interval '30 minutes'");
    expect(migration).toContain("state in ('provider_pending', 'pending', 'verified', 'invalidated', 'locked')");
    expect(markProviderAccepted).toMatch(/v_challenge\.id is distinct from p_challenge_id/i);
    expect(markProviderAccepted).toMatch(/v_challenge\.code_hmac is distinct from p_code_hmac/i);
    expect(markProviderAccepted).toMatch(/v_challenge\.code_key_id is distinct from p_code_key_id/i);
    expect(markProviderAccepted).toMatch(/v_challenge\.send_count is distinct from p_send_count/i);
    expect(markProviderAccepted).toContain("'stale_ack'::text");
    expect(markProviderAccepted).toMatch(/set state = 'pending', provider_message_id = p_provider_message_id/i);
    expect(markProviderAccepted).toContain('provider_accepted_at = v_now');
    expect(verify).toContain("v_challenge.state = 'provider_pending'");
    expect(verify).toContain("'not_provider_accepted'");
  });

  it('enforces a durable recipient budget across spoofed provider call IDs', () => {
    expect(migration).toContain('create table if not exists public.voice_staff_step_up_send_events');
    expect(migration).toContain("p_account_id::text || ':voice-step-up-recipient:' || p_caller_number");
    expect(issue).toContain("e.sent_at > v_now - interval '15 minutes'");
    expect(issue).toContain("e.sent_at > v_now - interval '24 hours'");
    expect(issue).toMatch(/v_15_count >= 3/i);
    expect(issue).toMatch(/v_24_count >= 10/i);
    expect(issue).toContain("'rate_limited'::text");
    expect(migration).toContain('voice_staff_step_up_provider_message_uidx');
    expect(migration).toContain('Voice staff step-up send identity and provider acceptance are immutable');
  });

  it('gates the existing privileged mutation implementation and revokes its bypass', () => {
    expect(migration).toContain(
      'rename to apply_voice_contractor_action_after_step_up',
    );
    expect(migration).toMatch(
      /revoke all on function public\.apply_voice_contractor_action_after_step_up\([\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(applyAction).toMatch(/c\.admission_id = v_admission\.id/i);
    expect(applyAction).toMatch(/c\.state = 'verified'/i);
    expect(applyAction).toMatch(/c\.verified_until > v_now/i);
    expect(applyAction).toContain('public.apply_voice_contractor_action_after_step_up(');
    expect(migration).toContain('Unchecked voice contractor action remains executable by service_role');
  });

  it('invalidates at call end under the same serialization lock', () => {
    expect(migration).toContain('after insert on public.voice_events');
    expect(callEnd).toContain('pg_catalog.pg_advisory_xact_lock(');
    expect(callEnd).toContain("invalidation_reason = case when state = 'locked' then invalidation_reason else 'call_ended' end");
    expect(callEnd).toMatch(/where provider = new\.provider[\s\S]*provider_call_id = new\.provider_call_id/i);
  });

  it('is force-RLS, has no direct DML surface, and exposes only pinned service RPCs', () => {
    expect(migration).toContain(
      'alter table public.voice_staff_step_up_challenges force row level security',
    );
    expect(migration).toMatch(
      /revoke all on table public\.voice_staff_step_up_challenges[\s\S]{0,100}from public, anon, authenticated, service_role/i,
    );
    expect(migration).not.toMatch(
      /grant (?:select|insert|update|delete|all) on table public\.voice_staff_step_up_challenges/i,
    );

    for (const rpc of [
      issue, markProviderAccepted, verify, invalidate, status,
      closeProviderStatus, callEnd, applyAction,
    ]) {
      expect(rpc).toContain('security definer');
      expect(rpc).toContain('set search_path = pg_catalog, pg_temp');
      expect(rpc).toContain("set timezone to 'UTC'");
    }
    expect(migration).not.toMatch(/grant execute[^;]*to (?:anon|authenticated)/i);
  });
});
