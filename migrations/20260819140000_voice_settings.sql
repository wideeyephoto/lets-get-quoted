-- What a contractor configures about their AI receptionist.
--
-- ONE ROW PER WORKSPACE, and its absence means off. There is no backfill: a
-- workspace with no row has not set this up, which is exactly true of every
-- workspace today, and inventing a default row for all six would make "never
-- configured" and "configured to the defaults" the same state.
--
-- WHAT IS NOT HERE, deliberately:
--   * the minute allowance and concurrency limit, which are entitlements and
--     belong to the plan rather than to a preference;
--   * the spending cap, which lives in workspace_overage_settings because it
--     governs money across every meter, not just this one;
--   * the timezone, which is already `accounts.timezone` and must not fork —
--     a business has one timezone, and two would eventually disagree.
--
-- RECORDING IS OFF AND CANNOT BE TURNED ON QUIETLY. Recording a call requires
-- telling the caller, so the CHECK below makes "recording on, disclosure never
-- accepted" unrepresentable rather than merely discouraged. Same shape as the
-- overage authorization: if the rule matters, the table should not be able to
-- hold a row that breaks it.

begin;

create table if not exists public.voice_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,

  -- `paused` is distinct from `off` on purpose. Off is "never set this up";
  -- paused is "set up, and stop for now" -- which a contractor reaches for
  -- during a holiday and expects to undo without reconfiguring anything.
  status text not null default 'off' check (status in ('off', 'active', 'paused')),

  -- When the AI answers. `after_hours` is the common case: the contractor takes
  -- their own calls during the day and wants the evenings covered.
  answer_mode text not null default 'after_hours'
    check (answer_mode in ('always', 'after_hours')),

  -- Per-weekday open and close in the ACCOUNT'S timezone, keyed 0=Sun..6=Sat.
  -- A missing key is a closed day, so an empty object means closed always --
  -- which under `after_hours` means the AI answers everything, and is the right
  -- reading of "we have no set hours".
  business_hours jsonb not null default
    '{"1":["08:00","17:00"],"2":["08:00","17:00"],"3":["08:00","17:00"],"4":["08:00","17:00"],"5":["08:00","17:00"]}'::jsonb
    check (pg_catalog.jsonb_typeof(business_hours) = 'object'),

  greeting text check (greeting is null or pg_catalog.length(greeting) <= 1000),

  -- Where the agent hands off. Null means it cannot transfer, which is a valid
  -- configuration and not a broken one.
  transfer_number text,
  emergency_transfer_number text,

  recording_enabled boolean not null default false,
  recording_disclosure_accepted_at timestamptz,
  recording_disclosure_accepted_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint voice_settings_recording_requires_disclosure check (
    recording_enabled = false or recording_disclosure_accepted_at is not null
  )
);

-- The owner surface reads and writes this; nothing else should.
alter table public.voice_settings enable row level security;

drop policy if exists voice_settings_owner_all on public.voice_settings;
create policy voice_settings_owner_all
  on public.voice_settings
  for all
  to authenticated
  using ((select public.is_owner(account_id)))
  with check ((select public.is_owner(account_id)));

-- `is_owner` and not `has_office_access`. Deciding what a business's phone says
-- to its customers, and whether calls are recorded, is an owner decision until
-- somebody says otherwise -- see docs/office-seat-activation.md.

create or replace function public.touch_voice_settings_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists touch_voice_settings_updated_at_trigger on public.voice_settings;
create trigger touch_voice_settings_updated_at_trigger
before update on public.voice_settings
for each row execute function public.touch_voice_settings_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_settings' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on voice_settings';
  end if;

  -- The rule that matters: prove the table itself refuses the bad row, rather
  -- than trusting that the CHECK was written correctly.
  begin
    insert into public.voice_settings (account_id, recording_enabled)
    values ('00000000-0000-4000-8000-000000000000', true);
    raise exception 'voice_settings accepted recording without a disclosure';
  exception
    when check_violation then null;      -- what must happen
    when foreign_key_violation then
      raise exception 'the disclosure CHECK was not reached: the account FK failed first';
  end;
end $$;

commit;
