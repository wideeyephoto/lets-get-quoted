begin;
alter table public.messaging_managed_registration_operations
  add column recovery_version integer not null default 0;

-- Keep the reviewed claim as a private implementation and add a database-level
-- pause barrier. A caller with an old page cannot bypass staff recovery controls.
alter function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text,text)
  rename to claim_messaging_managed_registration_reviewed;
revoke all on function public.claim_messaging_managed_registration_reviewed(uuid,uuid,integer,text,text,uuid,boolean,text,text)
  from public,anon,authenticated,service_role;
create function public.claim_messaging_managed_registration(
  p_application_id uuid,p_account_id uuid,p_revision integer,p_kind text,p_space_origin text,
  p_project_id uuid,p_authorized boolean,p_ein_last_four text,p_review_digest text
) returns jsonb language plpgsql security definer
set search_path = ''
as $$
begin
  perform 1 from public.messaging_registration_applications where id=p_application_id and account_id=p_account_id for update;
  if exists(select 1 from public.messaging_managed_registration_operations where application_id=p_application_id and poll_state='paused') then
    raise exception 'Managed registration paused for staff review' using errcode='23514'; end if;
  return public.claim_messaging_managed_registration_reviewed(p_application_id,p_account_id,p_revision,p_kind,
    p_space_origin,p_project_id,p_authorized,p_ein_last_four,p_review_digest);
end;
$$;
revoke all on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text,text) to service_role;

-- Service-only boundary called after MFA ops.manage. Actor ID comes from the
-- authenticated server context, never form input. Validate before provider GETs,
-- then revalidate/compare-and-set after them in a separate short transaction.
create function public.manage_messaging_managed_recovery(
  p_application_id uuid,p_account_id uuid,p_revision integer,p_actor_id uuid,
  p_action text,p_reason text,p_expected jsonb,p_review_digest text,
  p_space_origin text,p_project_id uuid,p_apply boolean
) returns void language plpgsql security definer
set search_path = ''
as $$
declare a public.messaging_registration_applications%rowtype; current_ops jsonb;
begin
  select * into strict a from public.messaging_registration_applications where id=p_application_id and account_id=p_account_id for update;
  perform 1 from public.messaging_managed_registration_operations where application_id=a.id order by kind for update;
  select jsonb_agg(jsonb_build_object('id',id,'state',state,'provider_object_id',provider_object_id,
    'provider_state',provider_state,'poll_state',poll_state,'poll_lease_id',poll_lease_id,'recovery_version',recovery_version) order by kind)
    into current_ops from public.messaging_managed_registration_operations where application_id=a.id;
  if a.status<>'under_review' or a.revision is distinct from p_revision or a.provider_number_id is not null
    or p_actor_id is null or p_action is null or p_action not in ('pause','resume','reject')
    or p_reason is null or p_reason not in ('staff_review','provider_support','owner_withdrawal','carrier_rejected')
    or p_apply is null or current_ops is null or p_expected is distinct from current_ops then
    raise exception 'Recovery request is stale or invalid' using errcode='23514'; end if;
  if p_action='resume' then
    if p_reason not in ('staff_review','provider_support')
      or not exists(select 1 from public.messaging_setup_payment_policy where managed_registration_enabled and livemode is true
        and signalwire_space_origin=p_space_origin and signalwire_project_id=p_project_id)
      or not exists(select 1 from public.messaging_setup_orders where application_id=a.id and account_id=a.account_id and state='paid' and livemode is true)
      or exists(select 1 from public.accounts where id=a.account_id and suspended_at is not null)
      or not exists(select 1 from public.messaging_managed_registration_operations where application_id=a.id and kind='brand' and poll_state='paused')
      or exists(select 1 from public.messaging_managed_registration_operations where application_id=a.id and
        (state<>'recorded' or provider_object_id is null or application_revision<>a.revision or account_id<>a.account_id
          or provider_state in ('failed','rejected','suspended','declined') or poll_lease_until>now()
          or kind='brand' and provider_object_id::text is distinct from a.provider_brand_id
          or kind='campaign' and provider_object_id::text is distinct from a.provider_campaign_id))
      or p_review_digest is null or p_review_digest !~ '^[a-f0-9]{64}$'
      or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
        and event_type='managed_staff_preflight' and actor_type='staff' and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest)
      or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
        and event_type='managed_owner_authorization' and actor_type='owner' and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest)
      or exists(select 1 from public.messaging_registration_events where application_id=a.id and event_type='managed_staff_pause'
        and metadata->>'reason'='owner_withdrawal') then
      raise exception 'Registration cannot safely resume' using errcode='23514'; end if;
  end if;
  if not p_apply then return; end if;
  update public.messaging_managed_registration_operations set poll_state=case when p_action='resume' then 'active' else 'paused' end,
    poll_next_at=case when p_action='resume' then now() end,poll_lease_id=null,poll_lease_until=null,
    recovery_version=recovery_version+1,updated_at=now() where application_id=a.id;
  if p_action='reject' then
    update public.messaging_registration_applications set status='rejected',
      status_detail='Registration closed by LGQ review. Contact support; do not submit again.',updated_at=now() where id=a.id;
  end if;
  insert into public.messaging_registration_events(application_id,account_id,event_type,actor_type,actor_reference,metadata)
    values(a.id,a.account_id,'managed_staff_'||p_action,'staff',p_actor_id::text,
      jsonb_build_object('revision',a.revision,'reason',p_reason,'version','managed-recovery-v1'));
end;
$$;
revoke all on function public.manage_messaging_managed_recovery(uuid,uuid,integer,uuid,text,text,jsonb,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.manage_messaging_managed_recovery(uuid,uuid,integer,uuid,text,text,jsonb,text,text,uuid,boolean) to service_role;
commit;

;
