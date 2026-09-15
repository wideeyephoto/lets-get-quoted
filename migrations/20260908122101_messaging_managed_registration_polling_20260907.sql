begin;
alter table public.messaging_setup_payment_policy
  add column managed_polling_enabled boolean not null default false;
alter table public.messaging_managed_registration_operations
  add column poll_state text not null default 'active' check (poll_state in ('active','paused','complete')),
  add column poll_next_at timestamptz default now(),
  add column poll_lease_id uuid,
  add column poll_lease_until timestamptz,
  add column poll_checked_at timestamptz,
  add column poll_result text check (poll_result in ('pending','complete','review')),
  add constraint managed_poll_lease_pair check ((poll_lease_id is null) = (poll_lease_until is null));
create index messaging_managed_poll_due_idx on public.messaging_managed_registration_operations(poll_next_at,application_id)
  where kind='brand' and state='recorded' and poll_state='active';

-- Application lock first, like registration claims/receipts. No network inside
-- transactions. Lease recovery resumes observation, never reclaims a provider POST.
create function public.claim_messaging_managed_poll(p_space_origin text,p_project_id uuid)
returns table(operation_id uuid,application_id uuid,account_id uuid,lease_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare a public.messaging_registration_applications%rowtype;
  o public.messaging_managed_registration_operations%rowtype;
  token uuid := gen_random_uuid();
begin
  if not exists(select 1 from public.messaging_setup_payment_policy where managed_polling_enabled
    and managed_registration_enabled and livemode is true
    and signalwire_space_origin=p_space_origin and signalwire_project_id=p_project_id) then return; end if;
  select app.* into a from public.messaging_registration_applications app
    join public.messaging_managed_registration_operations b on b.application_id=app.id and b.account_id=app.account_id and b.kind='brand'
    join public.accounts acc on acc.id=app.account_id
    join public.messaging_setup_orders pay on pay.application_id=app.id and pay.account_id=app.account_id
    where app.status='under_review' and acc.suspended_at is null and pay.state='paid' and pay.livemode is true
      and b.state='recorded' and b.provider_object_id::text=app.provider_brand_id and b.application_revision=app.revision
      and b.poll_state='active' and b.poll_next_at<=now() and (b.poll_lease_until is null or b.poll_lease_until<=now())
      and not exists(select 1 from public.messaging_managed_registration_operations bad where bad.application_id=app.id
        and (bad.state<>'recorded' or bad.provider_state in ('failed','rejected','suspended','declined')))
      and not exists(select 1 from public.messaging_managed_registration_operations done where done.application_id=app.id
        and done.kind='campaign' and done.provider_state='complete' and b.provider_state='complete')
      and exists(select 1 from public.messaging_registration_events e where e.application_id=app.id
        and e.event_type='managed_owner_authorization' and e.actor_type='owner' and e.metadata->>'revision'=app.revision::text)
    order by b.poll_next_at,app.id limit 1 for update of app skip locked;
  if not found then return; end if;
  select * into strict o from public.messaging_managed_registration_operations b where b.application_id=a.id and b.kind='brand' for update;
  -- Recheck the joined row after locking: a concurrent transaction may have
  -- changed its lease after the candidate query took its READ COMMITTED snapshot.
  if o.poll_state<>'active' or o.state<>'recorded' or o.poll_next_at is null or o.poll_next_at>now()
    or o.poll_lease_until>now() then return; end if;
  update public.messaging_managed_registration_operations set poll_lease_id=token,poll_lease_until=now()+interval '10 minutes',
    poll_next_at=now()+interval '15 minutes' where id=o.id;
  return query select o.id,a.id,a.account_id,token;
end;
$$;
revoke all on function public.claim_messaging_managed_poll(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_messaging_managed_poll(text,uuid) to service_role;

create function public.finish_messaging_managed_poll(
  p_operation_id uuid,p_application_id uuid,p_account_id uuid,p_lease_id uuid,p_result text
) returns boolean language plpgsql security definer
set search_path = ''
as $$
begin
  if p_result is null or p_result not in ('pending','complete','review') then
    raise exception 'Invalid polling result' using errcode='23514'; end if;
  perform 1 from public.messaging_registration_applications where id=p_application_id and account_id=p_account_id for update;
  if not found then return false; end if;
  update public.messaging_managed_registration_operations set
    poll_state=case p_result when 'complete' then 'complete' when 'review' then 'paused' else 'active' end,
    poll_result=p_result,poll_checked_at=now(),poll_next_at=case when p_result='pending' then now()+interval '15 minutes' end,
    poll_lease_id=null,poll_lease_until=null
    where id=p_operation_id and application_id=p_application_id and account_id=p_account_id and kind='brand'
      and poll_lease_id=p_lease_id and poll_lease_until>now();
  return found;
end;
$$;
revoke all on function public.finish_messaging_managed_poll(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_messaging_managed_poll(uuid,uuid,uuid,uuid,text) to service_role;
commit;

;
