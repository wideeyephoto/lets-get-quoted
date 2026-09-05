import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const haloMigration = readFileSync(
  join(process.cwd(), 'migrations', '20260905180000_neighborhood_halo_campaigns.sql'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('Neighborhood Halo Database Migration', () => {
  it('creates neighborhood_halo_settings table with RLS and fields', () => {
    expect(haloMigration).toContain('create table if not exists public.neighborhood_halo_settings');
    expect(haloMigration).toContain('account_id uuid primary key references public.accounts(id) on delete cascade');
    expect(haloMigration).toContain('auto_launch_enabled boolean not null default false');
    expect(haloMigration).toContain('default_radius_miles numeric(4, 2) not null default 1.00');
    expect(haloMigration).toContain('per_job_budget_dollars numeric(10, 2) not null default 25.00');
    expect(haloMigration).toContain('monthly_spend_cap_dollars numeric(10, 2) not null default 250.00');
    expect(haloMigration).toContain('alter table public.neighborhood_halo_settings enable row level security');
  });

  it('creates neighborhood_halo_campaigns table with all operational columns and constraints', () => {
    expect(haloMigration).toContain('create table if not exists public.neighborhood_halo_campaigns');
    expect(haloMigration).toContain('id uuid primary key default gen_random_uuid()');
    expect(haloMigration).toContain('account_id uuid not null references public.accounts(id) on delete cascade');
    expect(haloMigration).toContain('job_id uuid references public.jobs(id) on delete set null');
    expect(haloMigration).toContain("status in ('draft', 'pending_provisioning', 'active', 'paused', 'completed', 'killed', 'simulated_sandbox', 'failed')");
    expect(haloMigration).toContain('street_name text not null');
    expect(haloMigration).toContain('radius_miles numeric(4, 2) not null default 1.00');
    expect(haloMigration).toContain('budget_dollars numeric(10, 2) not null default 25.00');
    expect(haloMigration).toContain('daily_budget_dollars numeric(10, 2) not null default 5.00');
    expect(haloMigration).toContain('ad_copy jsonb not null default');
    expect(haloMigration).toContain('landing_page_url text not null');
    expect(haloMigration).toContain('auto_killed_at timestamptz');
    expect(haloMigration).toContain('alter table public.neighborhood_halo_campaigns enable row level security');
  });

  it('defines performance indexes for fast dashboard queries and pacing workers', () => {
    expect(haloMigration).toContain('idx_halo_campaigns_account_status');
    expect(haloMigration).toContain('idx_halo_campaigns_job');
    expect(haloMigration).toContain('idx_halo_campaigns_created');
    expect(haloMigration).toContain('idx_halo_campaigns_pacing');
  });

  it('enforces least-privilege RLS for marketing.read and marketing.write', () => {
    expect(haloMigration).toContain("public.office_can(account_id, 'marketing.read')");
    expect(haloMigration).toContain("public.office_can(account_id, 'marketing.write')");
  });
});
