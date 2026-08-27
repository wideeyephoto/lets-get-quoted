-- Expand voice_calls with granular provider outcomes, provisional admission tracking,
-- recording metadata, and introduce dedicated workflow and note tables for the Voice Calls workspace.

begin;

-- 1. Expand outcome constraints and add operational fields on public.voice_calls
alter table public.voice_calls
  drop constraint if exists voice_calls_outcome_check;

alter table public.voice_calls
  add constraint voice_calls_outcome_check
  check (
    outcome in (
      'in_progress',
      'ai_handled',
      'transfer_attempted',
      'transferred_and_answered',
      'caller_abandoned',
      'no_input',
      'voicemail_fallback',
      'provider_failure',
      'completed',
      'transferred',
      'voicemail',
      'abandoned',
      'failed',
      'unknown'
    )
  );

alter table public.voice_calls
  add column if not exists outcome_source text
    check (outcome_source is null or outcome_source in ('provisional_admission', 'swml_post_prompt', 'reconciliation', 'manual', 'legacy')),
  add column if not exists outcome_observed_at timestamptz,
  add column if not exists is_provisional boolean not null default false,
  add column if not exists recording_status text not null default 'none'
    check (recording_status in ('none', 'pending', 'ready', 'failed', 'expired')),
  add column if not exists recording_storage_path text,
  add column if not exists recording_duration_seconds integer
    check (recording_duration_seconds is null or recording_duration_seconds >= 0),
  add column if not exists recording_size_bytes bigint
    check (recording_size_bytes is null or recording_size_bytes >= 0),
  add column if not exists recording_content_type text,
  add column if not exists recording_captured_at timestamptz;

-- 2. Upgrade voice_calls RLS policy to office_can(account_id, 'leads.read')
create or replace function public.voice_transcript_retention_interval(
  p_account_id uuid
)
returns interval
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
  select pg_catalog.make_interval(
    days => coalesce((
      select public.voice_history_retention_days(w.feature_limits)
        from public.workspace_entitlements w
       where w.account_id = p_account_id
    ), 30)
  )
$fn$;

drop policy if exists voice_calls_owner_read on public.voice_calls;
drop policy if exists voice_calls_office_read on public.voice_calls;

create policy voice_calls_office_read
  on public.voice_calls
  for select
  to authenticated
  using (
    public.office_can(account_id, 'leads.read')
    and (
      started_at is null
      or started_at >= now() - public.voice_transcript_retention_interval(account_id)
    )
  );

-- Indexes for fast workspace queue queries
create index if not exists voice_calls_account_outcome_started_idx
  on public.voice_calls (account_id, outcome, started_at desc nulls last);

create index if not exists voice_calls_lead_idx
  on public.voice_calls (lead_id)
  where lead_id is not null;

-- 3. Create public.voice_call_workflows table
create table if not exists public.voice_call_workflows (
  call_id uuid primary key references public.voice_calls(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  disposition text not null default 'unreviewed'
    check (disposition in ('unreviewed', 'needs_callback', 'callback_scheduled', 'contacted', 'qualified', 'converted', 'not_a_fit', 'spam', 'resolved')),
  urgency text not null default 'normal'
    check (urgency in ('normal', 'urgent', 'emergency')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  callback_due_at timestamptz,
  callback_completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_call_workflows_account_disp_idx
  on public.voice_call_workflows (account_id, disposition, callback_due_at);

create index if not exists voice_call_workflows_assigned_user_idx
  on public.voice_call_workflows (account_id, assigned_user_id)
  where assigned_user_id is not null;

alter table public.voice_call_workflows enable row level security;
revoke all on table public.voice_call_workflows from public, anon, authenticated;
grant select, insert, update on table public.voice_call_workflows to authenticated;

create policy voice_call_workflows_read
  on public.voice_call_workflows
  for select
  to authenticated
  using (public.office_can(account_id, 'leads.read'));

create policy voice_call_workflows_insert
  on public.voice_call_workflows
  for insert
  to authenticated
  with check (public.office_can(account_id, 'leads.write'));

create policy voice_call_workflows_update
  on public.voice_call_workflows
  for update
  to authenticated
  using (public.office_can(account_id, 'leads.write'))
  with check (public.office_can(account_id, 'leads.write'));

drop trigger if exists touch_voice_call_workflows_updated_at_trigger on public.voice_call_workflows;
create trigger touch_voice_call_workflows_updated_at_trigger
  before update on public.voice_call_workflows
  for each row execute function public.touch_voice_settings_updated_at();

-- 4. Create public.voice_call_notes table
create table if not exists public.voice_call_notes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  note text not null check (pg_catalog.length(pg_catalog.btrim(note)) > 0 and pg_catalog.length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_call_notes_call_created_idx
  on public.voice_call_notes (call_id, created_at desc);

create index if not exists voice_call_notes_account_idx
  on public.voice_call_notes (account_id, created_at desc);

alter table public.voice_call_notes enable row level security;
revoke all on table public.voice_call_notes from public, anon, authenticated;
grant select, insert, update on table public.voice_call_notes to authenticated;

create policy voice_call_notes_read
  on public.voice_call_notes
  for select
  to authenticated
  using (public.office_can(account_id, 'leads.read'));

create policy voice_call_notes_insert
  on public.voice_call_notes
  for insert
  to authenticated
  with check (public.office_can(account_id, 'leads.write'));

create policy voice_call_notes_update
  on public.voice_call_notes
  for update
  to authenticated
  using (public.office_can(account_id, 'leads.write'))
  with check (public.office_can(account_id, 'leads.write'));

drop trigger if exists touch_voice_call_notes_updated_at_trigger on public.voice_call_notes;
create trigger touch_voice_call_notes_updated_at_trigger
  before update on public.voice_call_notes
  for each row execute function public.touch_voice_settings_updated_at();

-- 5. Safety verification assertion block
do $$
declare
  v_writable text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_call_workflows' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on voice_call_workflows';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_call_notes' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on voice_call_notes';
  end if;

  select string_agg(grantee || ':' || privilege_type, ', ')
    into v_writable
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('voice_call_workflows', 'voice_call_notes')
     and privilege_type = 'TRUNCATE'
     and grantee in ('public', 'anon', 'authenticated');

  if v_writable is not null then
    raise exception 'voice tables have dangerous truncate grants: %', v_writable;
  end if;
end $$;

commit;
