-- Only the reconciler requests an email. Interactive verification and legacy
-- workers do not enqueue a second message during an additive migration rollout.
alter table public.sites add column custom_domain_notice_requested_at timestamptz;
create table public.website_domain_connection_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  domain text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check (state in ('pending','sending','accepted','manual_review','resolved','cancelled')),
  attempted_at timestamptz,
  recipient text,
  provider_id text unique,
  accepted_at timestamptz,
  last_error text,
  resolved_at timestamptz,
  resolved_by text,
  resolution text,
  unique(site_id,verified_at),
  check (state<>'sending' or attempted_at is not null),
  check (state<>'accepted' or (provider_id is not null and accepted_at is not null and recipient is not null)),
  check (state<>'resolved' or (resolved_at is not null and resolved_by is not null and resolution is not null))
);
alter table public.website_domain_connection_notices enable row level security;
revoke all on public.website_domain_connection_notices from public,anon,authenticated;
grant select,insert,update,delete on public.website_domain_connection_notices to service_role;
create index website_domain_connection_notices_account_idx on public.website_domain_connection_notices(account_id);
create index website_domain_connection_notices_open_idx on public.website_domain_connection_notices(state,created_at)
  where state in ('pending','sending','accepted','manual_review');

create function public.record_website_domain_connection_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.website_domain_connection_notices(account_id,site_id,domain,verified_at)
    values(new.account_id,new.id,new.custom_domain,new.custom_domain_verified_at);
  return new;
end $$;
revoke all on function public.record_website_domain_connection_notice() from public,anon,authenticated;
create trigger record_website_domain_connection_notice after update of custom_domain_verified_at on public.sites
  for each row when (old.custom_domain_verified_at is null and new.custom_domain_verified_at is not null
    and new.custom_domain is not null and new.custom_domain_notice_requested_at=new.custom_domain_verified_at
    and new.custom_domain_notice_requested_at is distinct from old.custom_domain_notice_requested_at)
  execute function public.record_website_domain_connection_notice();

create function public.claim_website_domain_connection_notices(p_limit integer default 5)
returns setof public.website_domain_connection_notices language plpgsql security invoker set search_path='' as $$
begin
  update public.website_domain_connection_notices set state='manual_review',last_error='send_outcome_unknown'
    where state='sending' and attempted_at<clock_timestamp()-interval '5 minutes';
  update public.website_domain_connection_notices set state='manual_review',last_error='delivery_unconfirmed'
    where state='accepted' and accepted_at<clock_timestamp()-interval '30 minutes';
  update public.website_domain_connection_notices n set state='cancelled',resolution='Website connection has changed.'
    where state='pending' and not exists(select 1 from public.sites s where s.id=n.site_id and s.account_id=n.account_id
      and s.custom_domain=n.domain and s.custom_domain_verified_at=n.verified_at);
  return query with picked as (
    select n.id from public.website_domain_connection_notices n where n.state='pending' and n.attempted_at is null
      order by n.created_at,n.id for update skip locked limit greatest(1,least(coalesce(p_limit,5),10))
  ) update public.website_domain_connection_notices n set state='sending',attempted_at=clock_timestamp()
    from picked where n.id=picked.id returning n.*;
end $$;
revoke all on function public.claim_website_domain_connection_notices(integer) from public,anon,authenticated;
grant execute on function public.claim_website_domain_connection_notices(integer) to service_role;

create function public.prepare_website_domain_connection_notice(p_id uuid,p_account_id uuid,p_attempted_at timestamptz,p_recipient text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n public.website_domain_connection_notices;
begin
  select * into n from public.website_domain_connection_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.recipient is not null or n.attempted_at is distinct from p_attempted_at
    or n.attempted_at<clock_timestamp()-interval '5 minutes' then return false; end if;
  if p_recipient is null or p_recipient<>lower(btrim(p_recipient))
    or p_recipient !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$' then return false; end if;
  perform 1 from public.sites s where s.id=n.site_id and s.account_id=n.account_id
    and s.custom_domain=n.domain and s.custom_domain_verified_at=n.verified_at for share;
  if not found then return false; end if;
  update public.website_domain_connection_notices set recipient=p_recipient where id=p_id;
  return true;
end $$;
revoke all on function public.prepare_website_domain_connection_notice(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.prepare_website_domain_connection_notice(uuid,uuid,timestamptz,text) to service_role;

create function public.finish_website_domain_connection_notice(p_id uuid,p_account_id uuid,p_attempted_at timestamptz,p_provider_id text,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n public.website_domain_connection_notices;
begin
  select * into n from public.website_domain_connection_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.attempted_at is distinct from p_attempted_at then return false; end if;
  if n.provider_id is not null then return n.provider_id=p_provider_id; end if;
  if n.state<>'sending' then return false; end if;
  if p_provider_id is not null then
    if n.recipient is null or length(btrim(p_provider_id)) not between 1 and 256 then return false; end if;
    update public.website_domain_connection_notices set state='accepted',provider_id=p_provider_id,accepted_at=clock_timestamp() where id=p_id;
  else
    if p_error is null or p_error not in ('owner_email_missing','owner_brand_unavailable','notice_prepare_failed','send_failed_or_outcome_unknown') then return false; end if;
    update public.website_domain_connection_notices set state='manual_review',last_error=p_error where id=p_id;
  end if;
  return true;
end $$;
revoke all on function public.finish_website_domain_connection_notice(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.finish_website_domain_connection_notice(uuid,uuid,timestamptz,text,text) to service_role;

create function public.resolve_website_domain_connection_notice(p_id uuid,p_account_id uuid,p_actor text,p_evidence text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
  if length(btrim(coalesce(p_actor,'')))<3 or length(btrim(coalesce(p_evidence,'')))<20 then
    raise exception 'Operator and verified recovery evidence are required'; end if;
  update public.website_domain_connection_notices set state='resolved',resolved_at=clock_timestamp(),
    resolved_by=left(btrim(p_actor),200),resolution=left(btrim(p_evidence),4000)
    where id=p_id and account_id=p_account_id and state='manual_review';
  get diagnostics affected = row_count;
  return affected=1;
end $$;
revoke all on function public.resolve_website_domain_connection_notice(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_website_domain_connection_notice(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
