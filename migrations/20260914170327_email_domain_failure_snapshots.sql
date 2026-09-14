-- One immutable snapshot per existing failure episode. This is not a retry grant.
create table public.email_domain_failure_snapshots (
  notice_id uuid primary key references public.email_domain_failure_notices(id) on delete cascade,
  attempted_at timestamptz not null,
  prepared_at timestamptz not null default clock_timestamp(),
  payload jsonb not null,
  provider_fingerprint text not null check (provider_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (idempotency_key = 'domain-failure:v1:' || notice_id::text)
);
alter table public.email_domain_failure_snapshots enable row level security;
revoke all on public.email_domain_failure_snapshots from public, anon, authenticated, service_role;
grant select, insert on public.email_domain_failure_snapshots to service_role;

create function public.guard_email_domain_failure_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare n public.email_domain_failure_notices;
begin
  if tg_op = 'UPDATE' then raise exception 'Domain failure snapshot is immutable'; end if;
  select * into n from public.email_domain_failure_notices where id=new.notice_id for update;
  if not found or n.state <> 'sending' or n.attempted_at is distinct from new.attempted_at
    or n.attempted_at < clock_timestamp()-interval '5 minutes' or n.attempted_at > clock_timestamp() then
    raise exception 'Domain failure claim is not eligible';
  end if;
  perform 1 from public.email_sending_domains d where d.id=n.domain_id and d.account_id=n.account_id
    and d.domain=n.domain and d.status in ('pending','failed') for share;
  if not found then raise exception 'Domain failure notice is obsolete'; end if;
  if jsonb_typeof(new.payload) is distinct from 'object' or octet_length(new.payload::text)>200000
    or jsonb_typeof(new.payload->'to') is distinct from 'string'
    or coalesce(new.payload->>'to','') !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'
    or new.payload->>'from' is distinct from 'Let''s Get Quoted <hello@letsgetquoted.com>'
    or new.payload->>'reply_to' is distinct from 'hello@letsgetquoted.com'
    or jsonb_typeof(new.payload->'subject') is distinct from 'string'
    or length(btrim(coalesce(new.payload->>'subject',''))) not between 1 and 998
    or jsonb_typeof(new.payload->'html') is distinct from 'string'
    or length(btrim(coalesce(new.payload->>'html','')))=0
    or jsonb_typeof(new.payload->'tags') is distinct from 'array' then
    raise exception 'Invalid domain failure message';
  end if;
  if exists(select 1 from jsonb_object_keys(new.payload) k where k not in ('from','to','reply_to','subject','html','tags'))
    or jsonb_array_length(new.payload->'tags')<>5
    or exists(select 1 from jsonb_array_elements(new.payload->'tags') t
      where jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'value') is distinct from 'string'
        or coalesce(t->>'name','') not in ('account_id','domain_failure_notice_id','kind','theme','template_version'))
    or (select count(distinct t->>'name') from jsonb_array_elements(new.payload->'tags') t)<>5
    or not (new.payload->'tags' @> jsonb_build_array(
      jsonb_build_object('name','account_id','value',n.account_id::text),
      jsonb_build_object('name','domain_failure_notice_id','value',n.id::text),
      jsonb_build_object('name','kind','value','sending_domain_failed'))) then
    raise exception 'Invalid domain failure message binding';
  end if;
  new.prepared_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_email_domain_failure_snapshot() from public, anon, authenticated;
create trigger guard_email_domain_failure_snapshot before insert or update on public.email_domain_failure_snapshots
  for each row execute function public.guard_email_domain_failure_snapshot();

create function public.guard_email_domain_failure_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id,new.account_id,new.domain,new.reason) is distinct from row(old.id,old.account_id,old.domain,old.reason)
    and exists(select 1 from public.email_domain_failure_snapshots where notice_id=old.id) then
    raise exception 'Prepared domain failure identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.guard_email_domain_failure_identity() from public, anon, authenticated;
create trigger guard_email_domain_failure_identity before update of id,account_id,domain,reason on public.email_domain_failure_notices
  for each row execute function public.guard_email_domain_failure_identity();

create function public.prepare_email_domain_failure_snapshot(
  p_id uuid, p_account_id uuid, p_attempted_at timestamptz, p_payload jsonb,
  p_provider_fingerprint text, p_idempotency_key text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.email_domain_failure_notices;
begin
  select * into n from public.email_domain_failure_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.attempted_at is distinct from p_attempted_at
    or exists(select 1 from public.email_domain_failure_snapshots where notice_id=p_id) then return false; end if;
  insert into public.email_domain_failure_snapshots(notice_id,attempted_at,payload,provider_fingerprint,idempotency_key)
    values(p_id,p_attempted_at,p_payload,p_provider_fingerprint,p_idempotency_key);
  return true;
end $$;
revoke all on function public.prepare_email_domain_failure_snapshot(uuid,uuid,timestamptz,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.prepare_email_domain_failure_snapshot(uuid,uuid,timestamptz,jsonb,text,text) to service_role;
notify pgrst, 'reload schema';
