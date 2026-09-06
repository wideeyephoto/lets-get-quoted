import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationName = '20260906120000_sms_campaign_wide_stop.sql';
const migration = readFileSync(
  fileURLToPath(new URL(`../migrations/${migrationName}`, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const compact = migration.replace(/\s+/g, ' ');
const schemaSync = readFileSync(
  fileURLToPath(new URL('../scripts/sync-messaging-schema.mjs', import.meta.url)),
  'utf8',
);

function definition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('campaign-wide SMS keyword suppression migration', () => {
  it('is transactional and part of the generated messaging schema', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(schemaSync).toContain(`'migrations/${migrationName}'`);
  });

  it('creates one canonical private preference per provider, Campaign, and recipient', () => {
    expect(compact).toContain('create table if not exists public.sms_campaign_keyword_preferences');
    expect(compact).toContain('primary key (provider, campaign_id, phone_number)');
    expect(compact).toContain("campaign_id = pg_catalog.lower(pg_catalog.btrim(campaign_id))");
    expect(compact).toContain("phone_number ~ '^\\+[1-9][0-9]{7,14}$'");
    expect(compact).toContain('alter table public.sms_campaign_keyword_preferences enable row level security');
    expect(compact).toContain('alter table public.sms_campaign_keyword_preferences force row level security');
    expect(compact).toContain(
      'revoke all on table public.sms_campaign_keyword_preferences from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant select on table public.sms_campaign_keyword_preferences to service_role',
    );
  });

  it('backfills the latest authenticated keyword across existing Campaign numbers', () => {
    expect(compact).toContain('with ranked_preferences as');
    expect(compact).toContain('partition by sender.provider, pg_catalog.lower(pg_catalog.btrim(sender.campaign_id)), preference.phone_number');
    expect(compact).toContain('preference.updated_at desc');
    expect(compact).toContain("case when preference.status = 'opted_out' then 0 else 1 end");
    expect(compact).toContain('ranked.status, ranked.source, ranked.opted_out_at');
    expect(compact).toContain('on conflict (provider, campaign_id, phone_number) do nothing');
  });

  it('projects each exact inbound STOP or START under the Campaign advisory lock', () => {
    const trigger = definition('sync_sms_campaign_keyword_preference');
    expect(trigger).toContain("pg_catalog.lower(pg_catalog.btrim(sender.campaign_id))");
    expect(trigger).toContain("'sms-campaign-consent:' || v_provider || ':' || v_campaign_id || ':' || new.phone_number");
    expect(trigger).toContain('20260906');
    expect(trigger).toContain('new.status, new.source');
    expect(trigger).toContain("when new.status = 'opted_out' then coalesce(new.opted_out_at, v_now)");
    expect(trigger).toContain('on conflict (provider, campaign_id, phone_number) do update');
    expect(compact).toContain('create trigger sms_sender_keyword_preferences_sync_campaign');
    expect(compact).toContain('after insert or update of status, source, opted_out_at, updated_at on public.sms_sender_keyword_preferences');
    expect(compact).toContain('for each row execute function public.sync_sms_campaign_keyword_preference()');
  });

  it('uses Campaign authority when present and exact-sender authority otherwise', () => {
    const effective = definition('sms_recipient_keyword_opted_out');
    expect(effective).toContain('if v_campaign_id is not null then return exists');
    expect(effective).toContain('from public.sms_campaign_keyword_preferences preference');
    expect(effective).toContain('preference.provider = v_sender.provider');
    expect(effective).toContain('preference.campaign_id = v_campaign_id');
    expect(effective).toContain('preference.phone_number = p_phone_number');
    expect(effective).toContain('from public.sms_sender_keyword_preferences preference');
    expect(effective).toContain('preference.sender_number_id = v_sender.id');
    expect(effective.indexOf('from public.sms_campaign_keyword_preferences preference'))
      .toBeLessThan(effective.indexOf('from public.sms_sender_keyword_preferences preference'));
    expect(effective).toContain("using errcode = '22023'");
  });

  it('provides the service-only account producer precheck over every relevant active sender', () => {
    const account = definition('sms_account_recipient_opted_out');
    expect(account).toContain('from public.sms_consent consent');
    expect(account).toContain("consent.status = 'opted_out'");
    expect(account).toContain("sender.purpose = 'contractor_dedicated' and sender.account_id = p_account_id");
    expect(account).toContain("sender.purpose in ('lgq_shared', 'lgq_dispatch') and sender.account_id is null");
    expect(account).toContain("sender.provisioning_status = 'active'");
    expect(account).toContain("sender.assignment_state = 'assigned'");
    expect(account).toContain('public.sms_recipient_keyword_opted_out(sender.id, p_phone_number)');
    for (const name of ['sms_recipient_keyword_opted_out', 'sms_account_recipient_opted_out']) {
      expect(compact).toContain(
        `revoke all on function public.${name}(uuid, text) from public, anon, authenticated, service_role`,
      );
      expect(compact).toContain(
        `grant execute on function public.${name}(uuid, text) to service_role`,
      );
    }
  });

  it('repairs staging without losing TTL, suspension, scope, or exact-purpose selection', () => {
    const stage = definition('stage_sms_delivery');
    expect(stage).toContain("interval '24 hours'");
    expect(stage).toContain("error_reason = 'sms_delivery_expired'");
    expect(stage).toContain('account.suspended_at is not null');
    expect(stage).toContain("error_reason = 'account_suspended_closed'");
    expect(stage).toContain("when 'customer_message' then 'customer'");
    expect(stage).toContain("when 'crew_message' then 'crew'");
    expect(stage).toContain("when 'owner_alert' then 'owner'");
    expect(stage).toContain('from public.sms_consent_scopes scope');
    expect(stage).toContain('sender.purpose = v_event.sender_purpose');
    expect(stage).not.toContain('sender.purpose = v_event.sender_purpose or');
    expect(stage).toContain('public.sms_recipient_keyword_opted_out(v_sender.id, v_event.phone_number)');
    expect(stage).toContain("v_sender.purpose = 'lgq_dispatch'");
    expect(stage).toContain("'blocked_sender'::text");
  });

  it('serializes the no-return boundary sender then Campaign and rechecks effective suppression', () => {
    const started = definition('mark_sms_delivery_request_started_with_usage');
    expect(started).toContain('sender.purpose = v_event.sender_purpose');
    expect(started).not.toContain('sender.purpose = v_event.sender_purpose or');
    expect(started).toContain('from public.sms_consent_scopes scope');
    expect(started).toContain('account.suspended_at is null');
    const senderLock = started.indexOf("'sms-sender-consent:'");
    const campaignLock = started.indexOf("'sms-campaign-consent:'");
    const effectiveCheck = started.indexOf(
      'public.sms_recipient_keyword_opted_out(v_sender.id, v_event.phone_number)',
    );
    expect(senderLock).toBeGreaterThanOrEqual(0);
    expect(campaignLock).toBeGreaterThan(senderLock);
    expect(effectiveCheck).toBeGreaterThan(campaignLock);
    expect(started).toContain("using errcode = 'p5103'");
    expect(started).toContain('perform public.mark_sms_delivery_request_started(');
  });

  it('makes the courtesy reply claim Campaign-aware under the same lock order', () => {
    const notice = definition('record_sms_shared_notice_reply');
    const senderLock = notice.indexOf("'sms-sender-consent:'");
    const campaignLock = notice.indexOf("'sms-campaign-consent:'");
    const effectiveCheck = notice.indexOf('public.sms_recipient_keyword_opted_out(');
    expect(senderLock).toBeGreaterThanOrEqual(0);
    expect(campaignLock).toBeGreaterThan(senderLock);
    expect(effectiveCheck).toBeGreaterThan(campaignLock);
    expect(notice).toContain('public.sms_inbound_recipient_lock_key(');
    expect(notice).toContain("v_effective_egress_result := 'suppressed'");
    expect(notice).toContain('f94774d9eace296b75aeb622792d92dd74b7873a3b10ade1f415c0d399cfac07');
  });
});
