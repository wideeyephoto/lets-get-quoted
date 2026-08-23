-- Enable office access for marketing campaigns and recipients under settings.write.

begin;

-- 1. campaigns
alter table if exists public.campaigns enable row level security;
drop policy if exists campaigns_owner on public.campaigns;
drop policy if exists campaigns_select on public.campaigns;
drop policy if exists campaigns_insert on public.campaigns;
drop policy if exists campaigns_update on public.campaigns;
drop policy if exists campaigns_delete on public.campaigns;

create policy campaigns_select
  on public.campaigns
  for select using (
    public.office_can(account_id, 'settings.write')
  );

create policy campaigns_insert
  on public.campaigns
  for insert with check (
    public.office_can(account_id, 'settings.write')
  );

create policy campaigns_update
  on public.campaigns
  for update using (
    public.office_can(account_id, 'settings.write')
  ) with check (
    public.office_can(account_id, 'settings.write')
  );

create policy campaigns_delete
  on public.campaigns
  for delete using (
    public.office_can(account_id, 'settings.write')
  );

-- 2. campaign_recipients (if exists)
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'campaign_recipients'
  ) then
    execute 'alter table public.campaign_recipients enable row level security';
    execute 'drop policy if exists campaign_recipients_owner on public.campaign_recipients';
    execute 'drop policy if exists campaign_recipients_select on public.campaign_recipients';
    execute 'drop policy if exists campaign_recipients_insert on public.campaign_recipients';
    execute $pol$
      create policy campaign_recipients_select
        on public.campaign_recipients
        for select using (
          public.office_can(account_id, 'settings.write')
        );
      create policy campaign_recipients_insert
        on public.campaign_recipients
        for insert with check (
          public.office_can(account_id, 'settings.write')
        );
    $pol$;
  end if;
end $$;

commit;
