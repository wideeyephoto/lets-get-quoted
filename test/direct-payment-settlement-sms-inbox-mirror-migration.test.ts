import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816084500_direct_payment_settlement_sms_inbox_mirror.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be replaced`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('dark direct payment settlement SMS inbox mirror migration', () => {
  it('is a transactional follow-up with no activation or exposure widening', () => {
    expect(migrationPath).toContain('20260816084500_');
    expect(compact.startsWith('-- dark direct-payment settlement sms inbox mirror')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact.match(/create or replace function public\./g)).toHaveLength(2);
    for (const forbidden of [
      'cron.schedule', 'net.http', 'create table',
      'alter table', 'references public.sms_messages',
      'lgq_direct_payment_settlement_enabled', 'vercel.json',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
  });

  it('keeps the owner-visible SMS ledger server-write-only during settlement', () => {
    expect(compact).toContain('drop policy if exists sms_event_all on public.sms_events');
    expect(compact).toContain(
      'create policy sms_event_owner_read on public.sms_events '
      + 'for select to authenticated using ((select public.is_owner(account_id)))',
    );
    expect(compact).toContain(
      'revoke all on table public.sms_events '
      + 'from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant select on table public.sms_events to authenticated',
    );
    expect(compact).toContain(
      'grant select, insert, update, delete on table public.sms_events to service_role',
    );
    expect(compact).not.toContain('grant insert on table public.sms_events');
    expect(compact).not.toContain('grant update on table public.sms_events');
    expect(compact).not.toContain('grant delete on table public.sms_events');
    expect(compact).not.toContain('drop policy if exists sms_messages_all');
    expect(compact).not.toContain('revoke all on table public.sms_messages');
    expect(compact).not.toContain('create policy sms_messages');
  });

  it('mirrors a provider success before task or attempt completion in a single transaction', () => {
    const complete = functionDefinition('complete_direct_payment_settlement_sms');
    const eventUpdate = complete.indexOf('update public.sms_events s');
    const mirrorInsert = complete.indexOf('insert into public.sms_messages');
    const mirrorProof = complete.indexOf('from public.sms_messages m');
    const taskUpdate = complete.indexOf(
      'update public.billing_direct_payment_settlement_tasks t',
    );
    const attemptUpdate = complete.indexOf(
      'update public.billing_direct_payment_settlement_attempts a',
    );

    expect(eventUpdate).toBeGreaterThanOrEqual(0);
    expect(eventUpdate).toBeLessThan(mirrorInsert);
    expect(mirrorInsert).toBeLessThan(mirrorProof);
    expect(mirrorProof).toBeLessThan(taskUpdate);
    expect(taskUpdate).toBeLessThan(attemptUpdate);
    expect(complete).toContain('returning s.* into v_sms');
    expect(complete).toContain("s.context = 'payment'");
    expect(complete).toContain("s.event_type = 'payment_paid'");
    expect(complete).toContain("s.status = 'pending'");
    expect(complete).toContain("sms_status = 'sent'");
    expect(complete).toContain("outcome_status = 'completed'");
  });

  it('uses the SMS event UUID as an idempotent mirror identity and never overwrites a conflict', () => {
    for (const name of [
      'stage_direct_payment_settlement_sms',
      'complete_direct_payment_settlement_sms',
    ]) {
      const definition = functionDefinition(name);
      expect(definition).toContain('insert into public.sms_messages');
      expect(definition).toContain(
        "v_sms.id, v_task.account_id, v_sms.phone_number, 'outbound'",
      );
      expect(definition).toContain('on conflict (id) do nothing');
      expect(definition).not.toContain('on conflict (id) do update');
      expect(definition).not.toContain('delete from public.sms_messages');
      for (const proof of [
        'm.id = v_sms.id',
        'v_message.account_id is distinct from v_task.account_id',
        'v_message.phone_number is distinct from v_sms.phone_number',
        "v_message.direction is distinct from 'outbound'",
        'v_message.body is distinct from v_sms.body',
        'v_message.provider_id is distinct from',
        'v_message.media_urls is not null',
      ]) {
        expect(definition).toContain(proof);
      }
    }
  });

  it('repairs or proves an already-sent event before returning without egress', () => {
    const stage = functionDefinition('stage_direct_payment_settlement_sms');
    const sentStart = stage.indexOf("if v_sms.status = 'sent' then");
    const optedOutStart = stage.indexOf("if v_sms.status = 'opted_out' then", sentStart);
    const sentEnd = optedOutStart;
    const optedOutEnd = stage.indexOf(
      "raise exception 'existing settlement sms has an unsupported terminal status'",
      optedOutStart,
    );
    const sentBranch = stage.slice(sentStart, sentEnd);
    const optedOutBranch = stage.slice(optedOutStart, optedOutEnd);
    const currentConsent = stage.indexOf(
      'if v_payment.sms_consent is distinct from true',
    );

    expect(sentStart).toBeGreaterThanOrEqual(0);
    expect(sentEnd).toBeGreaterThan(sentStart);
    expect(sentStart).toBeLessThan(currentConsent);
    expect(optedOutStart).toBeLessThan(currentConsent);
    expect(optedOutEnd).toBeLessThan(currentConsent);
    expect(sentBranch).toContain('insert into public.sms_messages');
    expect(sentBranch).toContain('from public.sms_messages m');
    expect(sentBranch).toContain(
      'update public.billing_direct_payment_settlement_tasks t',
    );
    expect(sentBranch.indexOf('insert into public.sms_messages')).toBeLessThan(
      sentBranch.indexOf('update public.billing_direct_payment_settlement_tasks t'),
    );
    expect(sentBranch).toContain("return query select 'already_sent'::text");
    expect(sentBranch).not.toContain('sendprovidermessage');
    expect(sentBranch).not.toContain('p_normalized_phone');
    expect(sentBranch).not.toContain('p_body');
    expect(optedOutBranch).toContain("sms_status = 'skipped_opted_out'");
    expect(optedOutBranch).toContain(
      "return query select 'skipped_opted_out'::text",
    );
  });

  it('fails closed on incomplete sent evidence and preserves outbound read-time parity', () => {
    const stage = functionDefinition('stage_direct_payment_settlement_sms');
    const sentStart = stage.indexOf("if v_sms.status = 'sent' then");
    const sentEnd = stage.indexOf("if v_sms.status = 'opted_out' then", sentStart);
    const sentBranch = stage.slice(sentStart, sentEnd);
    const complete = functionDefinition('complete_direct_payment_settlement_sms');

    for (const evidence of [
      "v_sms.context is distinct from 'payment'",
      "v_sms.phone_number !~ '^\\+[0-9]{10,15}$'",
      'v_sms.body is null',
      'v_sms.provider_id is null',
      'v_sms.sent_at is null',
      'v_sms.sent_at < v_sms.created_at',
    ]) {
      expect(sentBranch).toContain(evidence);
    }
    expect(sentBranch).toContain('v_mirror_timestamp := v_sms.sent_at');
    expect(sentBranch).not.toContain('coalesce(v_sms.sent_at');
    expect(sentBranch).toContain(
      'v_message.read_at is distinct from v_mirror_timestamp',
    );
    expect(sentBranch).toContain(
      'v_message.created_at is distinct from v_mirror_timestamp',
    );
    expect(complete).toContain(
      'v_message.read_at is distinct from v_now',
    );
    expect(complete).toContain(
      'v_message.created_at is distinct from v_now',
    );
  });

  it('binds every mirror to the leased task, tenant, payment, and exact event', () => {
    const stage = functionDefinition('stage_direct_payment_settlement_sms');
    const complete = functionDefinition('complete_direct_payment_settlement_sms');

    for (const binding of [
      't.id = p_task_id',
      'v_task.claim_token is distinct from p_claim_token',
      'p.id = v_task.payment_id',
      'p.account_id = v_task.account_id',
      's.payment_id = v_task.payment_id',
      "s.event_type = 'payment_paid'",
      'v_sms.account_id is distinct from v_task.account_id',
    ]) {
      expect(stage).toContain(binding);
    }
    for (const binding of [
      't.id = p_task_id',
      'v_task.claim_token is distinct from p_claim_token',
      'v_task.sms_event_id is distinct from p_sms_event_id',
      's.id = p_sms_event_id',
      's.account_id = v_task.account_id',
      's.payment_id = v_task.payment_id',
      "s.context = 'payment'",
      "s.event_type = 'payment_paid'",
      "s.status = 'pending'",
    ]) {
      expect(complete).toContain(binding);
    }
  });

  it('keeps the RPC boundary service-role only', () => {
    for (const signature of [
      'public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)',
      'public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)',
    ]) {
      expect(compact).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`,
      );
      expect(compact).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(2);
    expect(sql.match(/set timezone to 'utc'/g)).toHaveLength(2);
  });
});
