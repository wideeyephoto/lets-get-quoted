import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const enumMigration = readFileSync(
  join(process.cwd(), 'migrations', '20260901031000_google_lsa_lead_source.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const foundationMigration = readFileSync(
  join(process.cwd(), 'migrations', '20260901040100_google_lsa_foundation.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const schema = readFileSync(join(process.cwd(), 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
const compact = foundationMigration.replace(/\s+/g, ' ').toLowerCase();

describe('Google Local Services Ads database foundation', () => {
  it('adds google_lsa in an isolated, catalog-guarded enum migration', () => {
    expect(enumMigration).toContain('do $google_lsa_lead_source$');
    expect(enumMigration).toContain("n.nspname = 'public'");
    expect(enumMigration).toContain("t.typname = 'lead_source'");
    expect(enumMigration).toContain("e.enumlabel = 'google_lsa'");
    expect(enumMigration).toContain("alter type public.lead_source add value 'google_lsa'");
    expect(enumMigration).not.toContain('create table');
  });

  it('creates all five dark provider tables with the expected identity fields', () => {
    for (const table of [
      'google_lsa_connections',
      'google_lsa_leads',
      'google_lsa_conversations',
      'google_lsa_spend',
      'google_lsa_feedback',
    ]) {
      expect(compact).toContain(`create table if not exists public.${table}`);
      expect(compact).toContain(`alter table public.${table} enable row level security`);
    }

    expect(compact).toContain('add column if not exists source_google_lsa_resource text');
    expect(compact).toContain(
      'on public.leads (account_id, source_google_lsa_resource)',
    );
    expect(compact).not.toContain(
      'on public.leads (account_id, source_google_lsa_resource) where source_google_lsa_resource is not null',
    );
    expect(compact).toContain('unique (account_id, customer_id, google_lead_id)');
    expect(compact).not.toContain(
      'constraint google_lsa_leads_account_google_lead_key unique (account_id, google_lead_id)',
    );
    expect(compact).toContain('unique (account_id, resource_name)');
  });

  it('stores connection credentials and a replay-safe stale sync claim', () => {
    for (const field of [
      'customer_id text',
      'login_customer_id text',
      'customer_time_zone text',
      'campaign_mode text',
      'access_token text not null',
      'refresh_token text not null',
      'access_expires_at timestamptz not null',
      "candidate_customers jsonb not null default '[]'::jsonb",
      'sync_started_at timestamptz',
      'last_sync_attempt_at timestamptz',
      'last_sync_at timestamptz',
      'last_full_rescan_at timestamptz',
      'last_sync_summary text',
      'last_error text',
      'disconnected_at timestamptz',
    ]) {
      expect(compact).toContain(field);
    }
    expect(compact).toContain("campaign_mode is null or campaign_mode in ('legacy', 'pmax')");
    expect(compact).toContain("pg_catalog.jsonb_typeof(candidate_customers) = 'array'");
    expect(compact).toContain('connected_by uuid references auth.users(id) on delete set null');
  });

  it('models provider leads, conversations, spend snapshots, and feedback truthfully', () => {
    for (const field of [
      'consumer_phone text',
      'consumer_phone_extension text',
      'lead_charged boolean not null default false',
      'credit_state text',
      'credit_state_updated_at timestamptz',
      'feedback_submitted boolean not null default false',
      'google_created_at timestamptz',
      "attachments jsonb not null default '[]'::jsonb",
      'call_duration_seconds integer',
      'recording_url text',
      'gross_cost_micros bigint not null default 0',
      'connected_phone_calls integer not null default 0',
      'credit_issuance_decision text',
      "submission_status text not null default 'succeeded'",
    ]) {
      expect(compact).toContain(field);
    }
    expect(compact).not.toContain('consumer_email');
    expect(compact).toContain(
      'foreign key (account_id, customer_id, google_lead_id) references public.google_lsa_leads(account_id, customer_id, google_lead_id) on delete cascade',
    );
    expect(compact).toContain('unique (account_id, customer_id, google_conversation_id)');
    expect(compact).toContain('customer_id text not null');
    expect(compact).toContain(
      "source in ('google_ads_api', 'local_services_account_report')",
    );
    expect(compact).toContain(
      'constraint google_lsa_spend_snapshot_key unique nulls not distinct',
    );
    expect(compact).toContain('submitted_by uuid references auth.users(id) on delete set null');
  });

  it('keeps browser roles out and grants only explicit CRUD to service_role', () => {
    expect(compact).toContain('from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select, insert, update, delete on table');
    expect(compact).toContain('to service_role');
    expect(compact).not.toContain('create policy');
    expect(compact).not.toContain('grant all');
  });

  it('mirrors both migrations in schema.sql for a fresh bootstrap', () => {
    expect(schema).toContain(enumMigration.trim());
    expect(schema).toContain(foundationMigration.trim());
    expect(schema).toContain(
      "create type lead_source as enum ('website_form', 'missed_call', 'manual', 'referral', 'ai_voice', 'google_lsa')",
    );
  });
});
