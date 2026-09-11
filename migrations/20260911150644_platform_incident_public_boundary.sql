-- Forward-only G5 public incident boundary. Safe for existing admin code:
-- old inserts remain drafts; service-role reads/writes retain every column.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.platform_incidents add column if not exists published boolean not null default false;
alter table public.platform_incidents add column if not exists published_at timestamptz;
alter table public.platform_incidents add column if not exists updated_at timestamptz not null default now();
alter table public.platform_incidents enable row level security;

drop policy if exists "Anon can read published incidents" on public.platform_incidents;
drop policy if exists "Public can read published incidents" on public.platform_incidents;
create policy "Public can read published incidents"
  on public.platform_incidents for select to anon, authenticated
  using (published = true);

-- Table grants override column restrictions. Remove both old table grants and
-- any explicit column grants before granting the intended public projection.
revoke all privileges on table public.platform_incidents from public, anon, authenticated;
do $columns$
declare column_list text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into column_list
    from pg_attribute
    where attrelid = 'public.platform_incidents'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all privileges (%s) on table public.platform_incidents from public, anon, authenticated', column_list);
end
$columns$;
grant select (
  id, kind, title, description, severity, started_at, resolved_at,
  affected_services, impact_summary, resolution_summary, published, published_at, updated_at
) on public.platform_incidents to anon, authenticated;
grant select, insert, update, delete on public.platform_incidents to service_role;

create or replace function public.touch_platform_incident_publication()
returns trigger language plpgsql security invoker set search_path = '' as $function$
begin
  new.updated_at := clock_timestamp();
  if not new.published then
    new.published_at := null;
  elsif tg_op = 'INSERT' then
    new.published_at := clock_timestamp();
  elsif not old.published then
    new.published_at := clock_timestamp();
  else
    new.published_at := old.published_at;
  end if;
  return new;
end;
$function$;
revoke all on function public.touch_platform_incident_publication() from public, anon, authenticated;
grant execute on function public.touch_platform_incident_publication() to service_role;
drop trigger if exists platform_incident_publication on public.platform_incidents;
create trigger platform_incident_publication before insert or update on public.platform_incidents
  for each row execute function public.touch_platform_incident_publication();

create index if not exists platform_incidents_public_active_idx
  on public.platform_incidents (started_at desc)
  where published and kind = 'incident' and resolved_at is null;
create index if not exists platform_incidents_public_history_idx
  on public.platform_incidents (started_at desc)
  where published and (resolved_at is not null or kind = 'release');

comment on column public.platform_incidents.description is 'Customer-facing text once explicitly published. Keep private investigation notes in root_cause.';
comment on column public.platform_incidents.root_cause is 'Internal investigation notes; unavailable to anon and authenticated API clients.';
notify pgrst, 'reload schema';
commit;
