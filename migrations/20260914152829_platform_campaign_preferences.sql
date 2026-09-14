-- Platform campaign preferences have no tenant foreign key. Never copy tenant
-- opt-outs here: their original scope must remain intact.
create table public.platform_email_suppression (
  email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 320),
  reason text not null check (reason in ('unsubscribe_link','one_click_unsubscribe','provider_suppressed','hard_bounce','complaint')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_email_suppression enable row level security;
revoke all on public.platform_email_suppression from public,anon,authenticated;
grant select,insert,update on public.platform_email_suppression to service_role;

create function public.record_platform_email_suppression(p_email text,p_reason text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.platform_email_suppression as existing(email,reason)
  values(lower(btrim(p_email)),p_reason)
  on conflict(email) do update set reason=excluded.reason,updated_at=now()
  where array_position(array['unsubscribe_link','one_click_unsubscribe','provider_suppressed','hard_bounce','complaint'],excluded.reason)
      > array_position(array['unsubscribe_link','one_click_unsubscribe','provider_suppressed','hard_bounce','complaint'],existing.reason);
  return true;
end;
$$;

-- One result for every exact (workspace,recipient) pair. Small JSON batches avoid
-- REST row caps and unrelated suppression rows without global tenant unions.
create function public.platform_campaign_recipient_status(p_recipients jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_recipients is null or jsonb_typeof(p_recipients)<>'array' then
    raise exception 'Recipient array required';
  end if;
  if jsonb_array_length(p_recipients)>100 then raise exception 'Recipient batch exceeds 100'; end if;
  if exists(select 1 from jsonb_array_elements(p_recipients) r
    where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'email') is distinct from 'string'
      or not (r ? 'account_id') or jsonb_typeof(r->'account_id') not in ('string','null')
      or coalesce(r->>'email','')='' or r->>'email'<>lower(btrim(r->>'email'))) then
    raise exception 'Normalized recipient required';
  end if;
  -- Validate scope even if a platform block would short-circuit the tenant test.
  perform (r->>'account_id')::uuid from jsonb_array_elements(p_recipients) r;
  select coalesce(jsonb_agg(jsonb_build_object('email',r->>'email','account_id',r->>'account_id',
    'blocked',exists(select 1 from public.platform_email_suppression p where p.email=r->>'email')
      or exists(select 1 from public.email_suppression s
        where s.account_id=(r->>'account_id')::uuid and lower(s.email)=r->>'email')) order by ordinal),'[]'::jsonb)
  into result from jsonb_array_elements(p_recipients) with ordinality as candidates(r,ordinal);
  return result;
end;
$$;
revoke all on function public.record_platform_email_suppression(text,text) from public,anon,authenticated;
revoke all on function public.platform_campaign_recipient_status(jsonb) from public,anon,authenticated;
grant execute on function public.record_platform_email_suppression(text,text) to service_role;
grant execute on function public.platform_campaign_recipient_status(jsonb) to service_role;
