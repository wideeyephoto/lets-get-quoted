-- Migration: Navigation Preferences

create table if not exists public.navigation_preferences (
  account_id uuid not null,
  user_id uuid not null,
  schema_version integer not null default 1,
  catalog_version text not null default '1',
  selected_view text not null default 'balanced',
  favorite_ids jsonb not null default '[]'::jsonb,
  custom_layout jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id),
  foreign key (account_id, user_id) references public.memberships (account_id, user_id) on delete cascade
);

alter table public.navigation_preferences enable row level security;

create policy "Users can view their own preferences for active memberships"
  on public.navigation_preferences for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.memberships
      where memberships.account_id = navigation_preferences.account_id
      and memberships.user_id = auth.uid()
      and memberships.deactivated_at is null
    )
  );

create policy "Users can insert their own preferences for active memberships"
  on public.navigation_preferences for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.memberships
      where memberships.account_id = navigation_preferences.account_id
      and memberships.user_id = auth.uid()
      and memberships.deactivated_at is null
    )
  );

create policy "Users can update their own preferences for active memberships"
  on public.navigation_preferences for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.memberships
      where memberships.account_id = navigation_preferences.account_id
      and memberships.user_id = auth.uid()
      and memberships.deactivated_at is null
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.memberships
      where memberships.account_id = navigation_preferences.account_id
      and memberships.user_id = auth.uid()
      and memberships.deactivated_at is null
    )
  );

create policy "Users can delete their own preferences for active memberships"
  on public.navigation_preferences for delete
  to authenticated
  using (
    auth.uid() = user_id
  );
