import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationName = '20260906121036_register_signalwire_dispatch_sender.sql';
const migration = readFileSync(
  fileURLToPath(new URL(`../migrations/${migrationName}`, import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n').toLowerCase();
const compact = migration.replace(/\s+/g, ' ');
const insert = compact.slice(
  compact.indexOf('insert into public.sms_sender_numbers'),
  compact.indexOf('on conflict (provider, e164_number) do nothing')
    + 'on conflict (provider, e164_number) do nothing'.length,
);
const schemaSync = readFileSync(
  fileURLToPath(new URL('../scripts/sync-messaging-schema.mjs', import.meta.url)),
  'utf8',
);

describe('SignalWire dispatch sender registration migration', () => {
  it('is transactional and included in the deployable schema', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(schemaSync).toContain(`'migrations/${migrationName}'`);
    expect(compact).toContain('individual number assignment is completed');
    expect(compact).toContain('changes no runtime feature gate');
  });

  it('binds the exact provider phone, brand, Campaign, assignment, inbound resource, and platform purpose', () => {
    for (const value of [
      "'signalwire'",
      "'+18103208333'",
      "'b28fc2e0-3a92-43f0-a817-923defaf9c4c'",
      "'lgq_dispatch'",
      "'4a09f38f-2de4-48b7-aba5-dac76a398ccf'",
      "'19e7c875-3611-4b40-8429-7dae3b5e6553'",
      "'5d101ac6-955f-40cf-a0b8-18b5b5121a4b'",
      "'53ae4e4a-d03f-426b-9983-b09ba496fc43'",
      "'https://app.letsgetquoted.com/api/sms/inbound'",
    ]) expect(insert).toContain(value);
    expect(insert).toMatch(/purpose, account_id, brand_id, campaign_id,[\s\S]*?'lgq_dispatch', null, '4a09f38f/);
    expect(compact).toContain('v_sender.provisioning_application_id is not null');
  });

  it('records the complete hardened activation proof at migration execution', () => {
    expect(insert).toMatch(/assignment_state,[\s\S]*?provisioning_status,[\s\S]*?inbound_ready/);
    expect(insert).toMatch(/'assigned',[\s\S]*?'active',[\s\S]*?true/);
    for (const field of [
      'activated_at',
      'last_verified_at',
      'provider_verified_at',
      'provider_phone_verified_at',
    ]) expect(insert).toContain(field);
    expect(insert).toMatch(/'complete', 'complete',[\s\S]*?true, 'post', 'laml_webhooks'/);
    expect(compact).toContain("v_sender.assignment_state is distinct from 'assigned'");
    expect(compact).toContain("v_sender.provisioning_status is distinct from 'active'");
    expect(compact).toContain('v_sender.suspended_at is not null');
    expect(compact).toContain("using errcode = '55000'");
  });

  it('takes the global SignalWire identity lock first and never rewrites a collision', () => {
    const lockAt = compact.indexOf('pg_advisory_xact_lock(1280265031, 2108)');
    const insertAt = compact.indexOf('insert into public.sms_sender_numbers');
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(insertAt);
    expect(compact).not.toContain('lock table public.sms_sender_numbers');
    expect(compact).toContain('on conflict (provider, e164_number) do nothing');
    expect(compact).toContain("where sender.provider = 'signalwire' and sender.e164_number = '+18103208333' for update");
    for (const field of [
      'provider_number_id',
      'purpose',
      'account_id',
      'brand_id',
      'campaign_id',
      'assignment_id',
      'inbound_resource_id',
      'inbound_webhook_url',
      'provisioning_application_id',
    ]) expect(compact).toContain(`v_sender.${field}`);
    expect(compact).toContain("using errcode = '23505'");
    expect(compact).not.toMatch(/update\s+public\.sms_sender_numbers/);
    expect(compact).not.toMatch(/delete\s+from\s+public\.sms_sender_numbers/);
  });

  it('keeps assignment order evidence distinct from the individual assignment identity', () => {
    expect(compact).toContain('a2bac09b-99c8-4423-a1bc-0cacf02858fa');
    expect(compact).toContain('messaging_registry_callbacks.provider_order_id');
    expect(insert).not.toContain('a2bac09b-99c8-4423-a1bc-0cacf02858fa');
  });

  it('does not change feature gates or invoke a database HTTP client', () => {
    expect(compact).not.toContain('lgq_sms_dispatch_enabled');
    expect(compact).not.toContain('lgq_disable_outbound_sms');
    expect(compact).not.toContain('net.http_');
    expect(compact).not.toContain('extensions.http_');
    expect(compact).not.toContain('http_post(');
  });
});
