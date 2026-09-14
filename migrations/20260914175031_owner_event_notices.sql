create table public.owner_event_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source_type text not null default 'job_feed' check (source_type='job_feed'),
  source_id uuid not null,
  event_kind text not null check (event_kind in ('client_question','client_followup','rebook_requested')),
  source_payload jsonb not null check (jsonb_typeof(source_payload)='object' and octet_length(source_payload::text)<=20000),
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
  unique(source_type,source_id,event_kind),
  check (state<>'sending' or attempted_at is not null),
  check (state<>'accepted' or (provider_id is not null and accepted_at is not null and recipient is not null)),
  check (state<>'resolved' or (resolved_at is not null and resolved_by is not null and resolution is not null))
);
alter table public.owner_event_notices enable row level security;
revoke all on public.owner_event_notices from public,anon,authenticated;
grant select,insert,update,delete on public.owner_event_notices to service_role;
create index owner_event_notices_account_idx on public.owner_event_notices(account_id);
create index owner_event_notices_open_idx on public.owner_event_notices(state,created_at)
  where state in ('pending','sending','accepted','manual_review');

-- Opt-in on the source event avoids duplicate sends from older application workers.
create function public.record_owner_event_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.owner_event_notices(account_id,source_id,event_kind,source_payload)
    values(new.account_id,new.id,new.kind,jsonb_build_object('title',new.title,'body',coalesce(new.body,''),'job_id',new.job_id));
  return new;
end $$;
revoke all on function public.record_owner_event_notice() from public,anon,authenticated;
create trigger record_owner_event_notice after insert on public.job_feed
  for each row when (new.kind in ('client_question','client_followup','rebook_requested')
    and new.meta->>'owner_email_notice'='v1') execute function public.record_owner_event_notice();

create function public.guard_owner_event_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if row(new.id,new.account_id,new.source_type,new.source_id,new.event_kind,new.source_payload)
    is distinct from row(old.id,old.account_id,old.source_type,old.source_id,old.event_kind,old.source_payload) then
    raise exception 'Owner notice source is immutable'; end if;
  return new;
end $$;
revoke all on function public.guard_owner_event_source() from public,anon,authenticated;
create trigger guard_owner_event_source before update on public.owner_event_notices
  for each row execute function public.guard_owner_event_source();

create function public.claim_owner_event_notices(p_limit integer default 5,p_source_id uuid default null,p_account_id uuid default null)
returns setof public.owner_event_notices language plpgsql security invoker set search_path='' as $$
begin
  update public.owner_event_notices set state='manual_review',last_error='send_outcome_unknown'
    where state='sending' and attempted_at<clock_timestamp()-interval '5 minutes';
  update public.owner_event_notices set state='manual_review',last_error='delivery_unconfirmed'
    where state='accepted' and accepted_at<clock_timestamp()-interval '30 minutes';
  update public.owner_event_notices n set state='cancelled',resolution='Source event is no longer available.'
    where state='pending' and not exists(select 1 from public.job_feed s where s.id=n.source_id and s.account_id=n.account_id and s.kind=n.event_kind);
  return query with picked as (
    select n.id from public.owner_event_notices n where n.state='pending' and n.attempted_at is null
      and (p_source_id is null or n.source_id=p_source_id) and (p_account_id is null or n.account_id=p_account_id)
      order by n.created_at,n.id for update skip locked limit greatest(1,least(coalesce(p_limit,5),10))
  ) update public.owner_event_notices n set state='sending',attempted_at=clock_timestamp()
    from picked where n.id=picked.id returning n.*;
end $$;
revoke all on function public.claim_owner_event_notices(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_owner_event_notices(integer,uuid,uuid) to service_role;

create function public.prepare_owner_event_notice(p_id uuid,p_account_id uuid,p_attempted_at timestamptz,p_recipient text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n public.owner_event_notices;
begin
  select * into n from public.owner_event_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.recipient is not null or n.attempted_at is distinct from p_attempted_at
    or n.attempted_at<clock_timestamp()-interval '5 minutes' then return false; end if;
  if p_recipient is null or p_recipient<>lower(btrim(p_recipient))
    or p_recipient !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$' then return false; end if;
  perform 1 from public.job_feed s where s.id=n.source_id and s.account_id=n.account_id and s.kind=n.event_kind for share;
  if not found then return false; end if;
  update public.owner_event_notices set recipient=p_recipient where id=p_id;
  return true;
end $$;
revoke all on function public.prepare_owner_event_notice(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.prepare_owner_event_notice(uuid,uuid,timestamptz,text) to service_role;

create function public.resolve_owner_event_notice(p_id uuid,p_account_id uuid,p_actor text,p_evidence text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
  if length(btrim(coalesce(p_actor,'')))<3 or length(btrim(coalesce(p_evidence,'')))<20 then
    raise exception 'Operator and verified recovery evidence are required'; end if;
  update public.owner_event_notices set state='resolved',resolved_at=clock_timestamp(),
    resolved_by=left(btrim(p_actor),200),resolution=left(btrim(p_evidence),4000)
    where id=p_id and account_id=p_account_id and state='manual_review';
  get diagnostics affected = row_count;
  return affected=1;
end $$;
revoke all on function public.resolve_owner_event_notice(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_owner_event_notice(uuid,uuid,text,text) to service_role;
notify pgrst, 'reload schema';

-- One immutable snapshot per existing connection event. This is not a retry grant.
create table public.owner_event_notice_snapshots (
  notice_id uuid primary key references public.owner_event_notices(id) on delete cascade,
  attempted_at timestamptz not null,
  prepared_at timestamptz not null default clock_timestamp(),
  payload jsonb not null,
  provider_fingerprint text not null check (provider_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (idempotency_key = 'owner-event:v1:' || notice_id::text)
);
alter table public.owner_event_notice_snapshots enable row level security;
revoke all on public.owner_event_notice_snapshots from public, anon, authenticated, service_role;
grant select, insert on public.owner_event_notice_snapshots to service_role;

create function public.guard_owner_event_notice_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare n public.owner_event_notices;
begin
  if tg_op = 'UPDATE' then raise exception 'Owner event notice snapshot is immutable'; end if;
  select * into n from public.owner_event_notices where id=new.notice_id for update;
  if not found or n.state <> 'sending' or n.attempted_at is distinct from new.attempted_at
    or n.attempted_at < clock_timestamp()-interval '5 minutes' or n.attempted_at > clock_timestamp() then
    raise exception 'Owner event notice claim is not eligible';
  end if;
  perform 1 from public.job_feed d where d.id=n.source_id and d.account_id=n.account_id and d.kind=n.event_kind for share;
  if not found then raise exception 'Owner event notice notice is obsolete'; end if;
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
    raise exception 'Invalid owner event notice message';
  end if;
  if exists(select 1 from jsonb_object_keys(new.payload) k where k not in ('from','to','reply_to','subject','html','tags'))
    or jsonb_array_length(new.payload->'tags')<>5
    or exists(select 1 from jsonb_array_elements(new.payload->'tags') t
      where jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t->'value') is distinct from 'string'
        or coalesce(t->>'name','') not in ('account_id','owner_event_notice_id','kind','theme','template_version'))
    or (select count(distinct t->>'name') from jsonb_array_elements(new.payload->'tags') t)<>5
    or not (new.payload->'tags' @> jsonb_build_array(
      jsonb_build_object('name','account_id','value',n.account_id::text),
      jsonb_build_object('name','owner_event_notice_id','value',n.id::text),
      jsonb_build_object('name','kind','value','contractor_alert'))) then
    raise exception 'Invalid owner event notice message binding';
  end if;
  new.prepared_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_owner_event_notice_snapshot() from public, anon, authenticated;
create trigger guard_owner_event_notice_snapshot before insert or update on public.owner_event_notice_snapshots
  for each row execute function public.guard_owner_event_notice_snapshot();

create function public.guard_owner_event_notice_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.recipient) is distinct from row(old.recipient)
    and exists(select 1 from public.owner_event_notice_snapshots where notice_id=old.id) then
    raise exception 'Prepared owner event notice identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.guard_owner_event_notice_identity() from public, anon, authenticated;
create trigger guard_owner_event_notice_identity before update of recipient on public.owner_event_notices
  for each row execute function public.guard_owner_event_notice_identity();

create function public.prepare_owner_event_notice_snapshot(
  p_id uuid, p_account_id uuid, p_attempted_at timestamptz, p_payload jsonb,
  p_provider_fingerprint text, p_idempotency_key text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.owner_event_notices;
begin
  select * into n from public.owner_event_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.attempted_at is distinct from p_attempted_at
    or exists(select 1 from public.owner_event_notice_snapshots where notice_id=p_id) then return false; end if;
  insert into public.owner_event_notice_snapshots(notice_id,attempted_at,payload,provider_fingerprint,idempotency_key)
    values(p_id,p_attempted_at,p_payload,p_provider_fingerprint,p_idempotency_key);
  return true;
end $$;
revoke all on function public.prepare_owner_event_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.prepare_owner_event_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text) to service_role;
notify pgrst, 'reload schema';

-- Signed callback evidence repairs acceptance without another provider request.
alter table public.owner_event_notices
  add column callback_status text check (callback_status in ('sent','delayed','delivered','failed','bounced','suppressed','complained')),
  add column callback_at timestamptz,
  add column callback_event_id text;

create function public.confirm_owner_event_notice(
  p_id uuid, p_account_id uuid, p_recipient text, p_provider_id text,
  p_status text, p_occurred_at timestamptz, p_event_id text
) returns text language plpgsql security invoker set search_path = '' as $$
declare n public.owner_event_notices; s public.owner_event_notice_snapshots;
  ranks text[] := array['sent','delayed','delivered','failed','bounced','suppressed','complained'];
begin
  if p_provider_id is null or length(btrim(p_provider_id)) not between 1 and 256
    or p_provider_id<>btrim(p_provider_id) or p_recipient is null
    or p_event_id is null or length(btrim(p_event_id)) not between 1 and 256
    or p_occurred_at is null or not isfinite(p_occurred_at)
    or p_status is null or not p_status=any(ranks) then return 'conflict'; end if;
  select * into n from public.owner_event_notices where id=p_id for update;
  if not found then return 'missing'; end if;
  if n.account_id is distinct from p_account_id then return 'conflict'; end if;
  select * into s from public.owner_event_notice_snapshots where notice_id=p_id;
  if not found then return 'unprepared'; end if;
  if lower(s.payload->>'to') is distinct from lower(p_recipient)
    or n.state in ('pending','cancelled')
    or (n.provider_id is not null and n.provider_id<>p_provider_id) then return 'conflict'; end if;
  -- A unique provider ID can never be bound to a second failure episode.
  update public.owner_event_notices set provider_id=p_provider_id,
    accepted_at=coalesce(accepted_at,p_occurred_at) where id=p_id;
  if n.callback_status is not null and (
    array_position(ranks,p_status)<array_position(ranks,n.callback_status)
    or (p_status=n.callback_status and p_occurred_at<=n.callback_at)) then return 'confirmed'; end if;
  update public.owner_event_notices set callback_status=p_status,
    callback_at=p_occurred_at,callback_event_id=p_event_id where id=p_id;
  -- An operator's explicit closeout remains intact; retain subsequent evidence.
  if n.state='resolved' and n.resolved_by is distinct from 'signed_provider_webhook' then return 'confirmed'; end if;
  if p_status='delivered' then
    update public.owner_event_notices set state='resolved',resolved_at=clock_timestamp(),
      resolved_by='signed_provider_webhook',resolution='Provider '||p_provider_id||': delivered' where id=p_id;
  elsif p_status in ('failed','bounced','suppressed','complained') then
    update public.owner_event_notices set state='manual_review',last_error='delivery_'||p_status where id=p_id;
  elsif n.state='sending' or (n.state='manual_review' and n.last_error in ('send_outcome_unknown','send_failed_or_outcome_unknown')) then
    update public.owner_event_notices set state='accepted' where id=p_id;
  end if;
  return 'confirmed';
exception when unique_violation then return 'conflict';
end $$;
revoke all on function public.confirm_owner_event_notice(uuid,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.confirm_owner_event_notice(uuid,uuid,text,text,text,timestamptz,text) to service_role;

create or replace function public.finish_owner_event_notice(
  p_id uuid, p_account_id uuid, p_attempted_at timestamptz, p_provider_id text, p_error text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.owner_event_notices;
begin
  select * into n from public.owner_event_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.attempted_at is distinct from p_attempted_at then return false; end if;
  if n.provider_id is not null then
    -- Callback already won. Neither a delayed acknowledgement nor a timeout
    -- may overwrite its delivered/negative state or operator resolution.
    return p_provider_id is null or n.provider_id=p_provider_id;
  end if;
  if n.state<>'sending' and not (n.state='manual_review' and n.last_error='send_outcome_unknown') then return false; end if;
  if p_provider_id is not null then
    if length(btrim(p_provider_id)) not between 1 and 256 or p_provider_id<>btrim(p_provider_id)
      or not exists(select 1 from public.owner_event_notice_snapshots where notice_id=p_id) then return false; end if;
    update public.owner_event_notices set state='accepted',provider_id=p_provider_id,
      accepted_at=clock_timestamp() where id=p_id;
  else
    if p_error is null or p_error not in ('owner_email_missing','owner_brand_unavailable','notice_prepare_failed','send_failed_or_outcome_unknown') then return false; end if;
    update public.owner_event_notices set state='manual_review',last_error=p_error where id=p_id;
  end if;
  return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.finish_owner_event_notice(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.finish_owner_event_notice(uuid,uuid,timestamptz,text,text) to service_role;

notify pgrst, 'reload schema';
