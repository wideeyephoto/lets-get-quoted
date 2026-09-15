begin;

-- Records only a SHA-256 review fingerprint and authenticated actor ID, never EIN.
create function public.record_messaging_managed_review(
  p_application_id uuid, p_account_id uuid, p_revision integer, p_digest text,
  p_actor_type text, p_actor_id uuid
) returns void language plpgsql security definer
set search_path = ''
as $$
declare a public.messaging_registration_applications%rowtype;
begin
  select * into strict a from public.messaging_registration_applications
    where id=p_application_id and account_id=p_account_id for update;
  if a.status <> 'under_review' or a.revision is distinct from p_revision
    or p_actor_type is null or p_actor_type not in ('staff','owner')
    or p_actor_id is null or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'Managed review is invalid' using errcode='23514';
  end if;
  if p_actor_type='owner' and not exists (
    select 1 from public.messaging_registration_events where application_id=a.id
      and account_id=a.account_id and event_type='managed_staff_preflight' and actor_type='staff'
      and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_digest
  ) then raise exception 'Current staff preflight required' using errcode='23514'; end if;
  if exists(select 1 from public.messaging_registration_events where application_id=a.id
    and event_type=case when p_actor_type='staff' then 'managed_staff_preflight' else 'managed_owner_authorization' end
    and actor_reference=p_actor_id::text and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_digest) then return; end if;
  insert into public.messaging_registration_events(application_id,account_id,event_type,actor_type,actor_reference,metadata)
    values(a.id,a.account_id,case when p_actor_type='staff' then 'managed_staff_preflight' else 'managed_owner_authorization' end,
      p_actor_type,p_actor_id::text,jsonb_build_object('revision',a.revision,'digest',p_digest,'version','managed-v1'));
end;
$$;
revoke all on function public.record_messaging_managed_review(uuid,uuid,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_messaging_managed_review(uuid,uuid,integer,text,text,uuid) to service_role;

alter function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text)
  rename to claim_messaging_managed_registration_unreviewed;
revoke all on function public.claim_messaging_managed_registration_unreviewed(uuid,uuid,integer,text,text,uuid,boolean,text)
  from public,anon,authenticated,service_role;

create function public.claim_messaging_managed_registration(
  p_application_id uuid, p_account_id uuid, p_revision integer, p_kind text,
  p_space_origin text, p_project_id uuid, p_authorized boolean, p_ein_last_four text,
  p_review_digest text
) returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare a public.messaging_registration_applications%rowtype;
begin
  select * into strict a from public.messaging_registration_applications
    where id=p_application_id and account_id=p_account_id for update;
  if p_review_digest is null or p_review_digest !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
      and event_type='managed_staff_preflight' and actor_type='staff'
      and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest)
    or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
      and event_type='managed_owner_authorization' and actor_type='owner'
      and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest) then
    raise exception 'Current managed authorization required' using errcode='23514';
  end if;
  return public.claim_messaging_managed_registration_unreviewed(
    p_application_id,p_account_id,p_revision,p_kind,p_space_origin,p_project_id,p_authorized,p_ein_last_four);
end;
$$;
revoke all on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text,text) to service_role;
commit;

;
