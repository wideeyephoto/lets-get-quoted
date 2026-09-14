-- One immutable snapshot per existing connection event. This is not a retry grant.
create table public.website_domain_notice_snapshots (
  notice_id uuid primary key references public.website_domain_connection_notices(id) on delete cascade,
  attempted_at timestamptz not null,
  prepared_at timestamptz not null default clock_timestamp(),
  payload jsonb not null,
  provider_fingerprint text not null check (provider_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (idempotency_key = 'website-domain-connected:v1:' || notice_id::text)
);
alter table public.website_domain_notice_snapshots enable row level security;
revoke all on public.website_domain_notice_snapshots from public, anon, authenticated, service_role;
grant select, insert on public.website_domain_notice_snapshots to service_role;

create function public.guard_website_domain_notice_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare n public.website_domain_connection_notices;
begin
  if tg_op = 'UPDATE' then raise exception 'Website connection snapshot is immutable'; end if;
  select * into n from public.website_domain_connection_notices where id=new.notice_id for update;
  if not found or n.state <> 'sending' or n.attempted_at is distinct from new.attempted_at
    or n.attempted_at < clock_timestamp()-interval '5 minutes' or n.attempted_at > clock_timestamp() then
    raise exception 'Website connection claim is not eligible';
  end if;
  perform 1 from public.sites d where d.id=n.site_id and d.account_id=n.account_id
    and d.custom_domain=n.domain and d.custom_domain_verified_at=n.verified_at for share;
  if not found then raise exception 'Website connection notice is obsolete'; end if;
  if jsonb_typeof(new.payload) is distinct from 'object' or octet_length(new.payload::text)>200000
    or jsonb_typeof(new.payload->'to') is distinct from 'string'
    or coalesce(new.payload->>'to','') !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'
    or new.payload->>'to' is distinct from n.recipient
    or new.payload->>'from' is distinct from 'Let''s Get Quoted <hello@letsgetquoted.com>'
    or new.payload->>'reply_to' is distinct from 'hello@letsgetquoted.com'
    or jsonb_typeof(new.payload->'subject') is distinct from 'string'
    or length(btrim(coalesce(new.payload->>'subject',''))) not between 1 and 998
    or jsonb_typeof(new.payload->'html') is distinct from 'string'
    or length(btrim(coalesce(new.payload->>'html','')))=0
    or jsonb_typeof(new.payload->'tags') is distinct from 'array' then
    raise exception 'Invalid website connection message';
  end if;
  if exists(select 1 from jsonb_object_keys(new.payload) k where k not in ('from','to','reply_to','subject','html','tags'))
    or jsonb_array_length(new.payload->'tags')<>5
    or exists(select 1 from jsonb_array_elements(new.payload->'tags') t
      where jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'value') is distinct from 'string'
        or coalesce(t->>'name','') not in ('account_id','website_domain_notice_id','kind','theme','template_version'))
    or (select count(distinct t->>'name') from jsonb_array_elements(new.payload->'tags') t)<>5
    or not (new.payload->'tags' @> jsonb_build_array(
      jsonb_build_object('name','account_id','value',n.account_id::text),
      jsonb_build_object('name','website_domain_notice_id','value',n.id::text),
      jsonb_build_object('name','kind','value','custom_domain_connected'))) then
    raise exception 'Invalid website connection message binding';
  end if;
  new.prepared_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_website_domain_notice_snapshot() from public, anon, authenticated;
create trigger guard_website_domain_notice_snapshot before insert or update on public.website_domain_notice_snapshots
  for each row execute function public.guard_website_domain_notice_snapshot();

create function public.guard_website_domain_notice_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id,new.account_id,new.domain,new.verified_at,new.recipient) is distinct from row(old.id,old.account_id,old.domain,old.verified_at,old.recipient)
    and exists(select 1 from public.website_domain_notice_snapshots where notice_id=old.id) then
    raise exception 'Prepared website connection identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.guard_website_domain_notice_identity() from public, anon, authenticated;
create trigger guard_website_domain_notice_identity before update of id,account_id,domain,verified_at,recipient on public.website_domain_connection_notices
  for each row execute function public.guard_website_domain_notice_identity();

create function public.prepare_website_domain_notice_snapshot(
  p_id uuid, p_account_id uuid, p_attempted_at timestamptz, p_payload jsonb,
  p_provider_fingerprint text, p_idempotency_key text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.website_domain_connection_notices;
begin
  select * into n from public.website_domain_connection_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.attempted_at is distinct from p_attempted_at
    or exists(select 1 from public.website_domain_notice_snapshots where notice_id=p_id) then return false; end if;
  insert into public.website_domain_notice_snapshots(notice_id,attempted_at,payload,provider_fingerprint,idempotency_key)
    values(p_id,p_attempted_at,p_payload,p_provider_fingerprint,p_idempotency_key);
  return true;
end $$;
revoke all on function public.prepare_website_domain_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.prepare_website_domain_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text) to service_role;
notify pgrst, 'reload schema';
