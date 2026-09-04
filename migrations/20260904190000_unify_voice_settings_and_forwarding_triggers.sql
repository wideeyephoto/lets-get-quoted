-- Migration: 20260904190000_unify_voice_settings_and_forwarding_triggers.sql
--
-- Harmonize accounts.call_forward_number and voice_settings.transfer_number permanently with
-- bidirectional triggers, backfill default voice_settings for all workspaces, register BrokePipes
-- dedicated canary in workspace_purchased_capacity, and add test_marker to voice_call_admissions.

begin;

-- 1. Update workspace_purchased_capacity catalog binding check constraint to include voice recurring SKUs
alter table public.workspace_purchased_capacity
  drop constraint if exists workspace_purchased_capacity_catalog_binding_check;

alter table public.workspace_purchased_capacity
  add constraint workspace_purchased_capacity_catalog_binding_check check (
    (top_up_id = 'crew_user' and resource_code = 'crew_users'
      and units = 1 and unit_amount_cents = 500)
    or (top_up_id = 'office_user' and resource_code = 'office_users'
      and units = 1 and unit_amount_cents = 1500)
    or (top_up_id = 'storage_100gb' and resource_code = 'storage_gb'
      and units = 100 and unit_amount_cents = 1500)
    or (top_up_id = 'ai_voice_flex' and resource_code = 'voice_minutes'
      and units = 100 and unit_amount_cents = 6900)
    or (top_up_id = 'ai_voice_solo' and resource_code = 'voice_minutes'
      and units = 100 and unit_amount_cents = 5900)
    or (top_up_id = 'ai_voice_growth' and resource_code = 'voice_minutes'
      and units = 200 and unit_amount_cents = 5500)
  );

-- 2. Provision BrokePipes canary capacity legitimately in workspace_purchased_capacity
insert into public.workspace_purchased_capacity (
  account_id,
  top_up_id,
  resource_code,
  units,
  unit_amount_cents,
  catalog_version,
  livemode,
  stripe_subscription_id,
  status
) values (
  'c63293b4-138e-45c2-8e11-0f4e6d7e08e6',
  'ai_voice_solo',
  'voice_minutes',
  100,
  5900,
  '2026-08-18-preview',
  true,
  'sub_brokepipesdedicatedcanary',
  'active'
)
on conflict (livemode, stripe_subscription_id) do update
  set status = 'active',
      units = 100,
      updated_at = pg_catalog.now();

-- 3. Backfill voice_settings for all accounts lacking a voice_settings row
insert into public.voice_settings (
  account_id,
  status,
  answer_mode,
  business_hours,
  greeting,
  transfer_number,
  voice_tone
)
select
  a.id,
  'active',
  'always',
  '{"1": ["08:00", "17:00"], "2": ["08:00", "17:00"], "3": ["08:00", "17:00"], "4": ["08:00", "17:00"], "5": ["08:00", "17:00"]}'::jsonb,
  null,
  a.call_forward_number,
  'professional'
from public.accounts a
where not exists (
  select 1 from public.voice_settings vs where vs.account_id = a.id
);

-- Synchronize any existing accounts where one table had a number and the other was null
update public.accounts a
   set call_forward_number = vs.transfer_number
  from public.voice_settings vs
 where vs.account_id = a.id
   and a.call_forward_number is null
   and vs.transfer_number is not null;

update public.voice_settings vs
   set transfer_number = a.call_forward_number
  from public.accounts a
 where a.id = vs.account_id
   and vs.transfer_number is null
   and a.call_forward_number is not null;

-- 4. Bidirectional Postgres triggers to permanently prevent drift between accounts and voice_settings
create or replace function public.sync_account_call_forward_to_voice_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.call_forward_number is distinct from old.call_forward_number then
    insert into public.voice_settings (account_id, transfer_number)
    values (new.id, new.call_forward_number)
    on conflict (account_id)
    do update set transfer_number = excluded.transfer_number,
                  updated_at = pg_catalog.clock_timestamp()
    where public.voice_settings.transfer_number is distinct from excluded.transfer_number;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_account_call_forward_to_voice_settings_trigger on public.accounts;
create trigger sync_account_call_forward_to_voice_settings_trigger
after insert or update of call_forward_number on public.accounts
for each row execute function public.sync_account_call_forward_to_voice_settings();

create or replace function public.sync_voice_settings_transfer_to_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transfer_number is distinct from old.transfer_number then
    update public.accounts
       set call_forward_number = new.transfer_number
     where id = new.account_id
       and call_forward_number is distinct from new.transfer_number;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_voice_settings_transfer_to_accounts_trigger on public.voice_settings;
create trigger sync_voice_settings_transfer_to_accounts_trigger
after insert or update of transfer_number on public.voice_settings
for each row execute function public.sync_voice_settings_transfer_to_accounts();

-- 5. Add test_marker to voice_call_admissions and stamp manual test rows
alter table public.voice_call_admissions
  add column if not exists test_marker text;

comment on column public.voice_call_admissions.test_marker is
  'Distinguishes manual test and probe call admissions from real carrier calls.';

drop trigger if exists inherit_account_test_marker_trigger on public.voice_call_admissions;
create trigger inherit_account_test_marker_trigger
before insert or update of account_id on public.voice_call_admissions
for each row execute function public.inherit_account_test_marker();

update public.voice_call_admissions
   set test_marker = 'manual_test'
 where provider_call_id in ('test-call-1788521283320', 'test-call-1788521339536');

commit;
