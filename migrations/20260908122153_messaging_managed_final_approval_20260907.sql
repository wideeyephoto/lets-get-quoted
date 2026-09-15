begin;
-- Narrow managed-only handoff. Existing manual review/compliance RPCs retain
-- their immutable carrier-binding checks. Provider calls happen outside SQL.
create function public.approve_messaging_managed_registration(
  p_application_id uuid,p_account_id uuid,p_revision integer,p_actor_id uuid,
  p_expected jsonb,p_review_digest text,p_space_origin text,p_project_id uuid,
  p_ein_last_four text,p_verification_reference text,p_tax_confirmed boolean,
  p_provider_proof jsonb,p_apply boolean
) returns void language plpgsql security definer
set search_path = ''
as $$
declare a public.messaging_registration_applications%rowtype; b public.messaging_managed_registration_operations%rowtype;
  c public.messaging_managed_registration_operations%rowtype; current_ops jsonb; checked_at timestamptz;
  expected_host text; ts timestamptz := clock_timestamp();
begin
  select * into strict a from public.messaging_registration_applications where id=p_application_id and account_id=p_account_id for update;
  perform 1 from public.messaging_managed_registration_operations where application_id=a.id order by kind for update;
  select jsonb_agg(jsonb_build_object('id',id,'state',state,'provider_object_id',provider_object_id,
    'provider_state',provider_state,'poll_state',poll_state,'poll_lease_id',poll_lease_id,'recovery_version',recovery_version) order by kind)
    into current_ops from public.messaging_managed_registration_operations where application_id=a.id;
  select * into b from public.messaging_managed_registration_operations where application_id=a.id and kind='brand';
  select * into c from public.messaging_managed_registration_operations where application_id=a.id and kind='campaign';
  if a.status<>'under_review' or a.revision is distinct from p_revision or p_actor_id is null
    or a.business_type not in ('llc','partnership','nonprofit') or a.provider_number_id is not null or a.purchased_number is not null
    or exists(select 1 from public.messaging_number_provisioning_operations where application_id=a.id)
    or current_ops is null or p_expected is distinct from current_ops or jsonb_array_length(current_ops)<>2
    or b.id is null or c.id is null or b.provider_object_id::text is distinct from a.provider_brand_id
    or c.provider_object_id::text is distinct from a.provider_campaign_id
    or exists(select 1 from public.messaging_managed_registration_operations where application_id=a.id and
      (state<>'recorded' or provider_object_id is null or provider_state is distinct from 'complete'
        or application_revision<>a.revision or account_id<>a.account_id or poll_state='paused' or poll_lease_until>ts))
    or p_tax_confirmed is distinct from true or p_apply is null or coalesce(p_ein_last_four,'') !~ '^[0-9]{4}$'
    or p_ein_last_four is distinct from b.ein_last_four
    or length(btrim(coalesce(p_verification_reference,''))) not between 4 and 255
    or p_verification_reference ~ '(^|[^0-9])[0-9]{2}-?[0-9]{7}([^0-9]|$)'
    or length(regexp_replace(p_verification_reference,'[^0-9]','','g'))=9
    or not exists(select 1 from public.messaging_setup_payment_policy where managed_registration_enabled and livemode is true
      and signalwire_space_origin=p_space_origin and signalwire_project_id=p_project_id)
    or not exists(select 1 from public.messaging_setup_orders where application_id=a.id and account_id=a.account_id and state='paid' and livemode is true)
    or exists(select 1 from public.accounts where id=a.account_id and suspended_at is not null)
    or p_review_digest is null or p_review_digest !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
      and event_type='managed_staff_preflight' and actor_type='staff' and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest)
    or not exists(select 1 from public.messaging_registration_events where application_id=a.id and account_id=a.account_id
      and event_type='managed_owner_authorization' and actor_type='owner' and metadata->>'revision'=a.revision::text and metadata->>'digest'=p_review_digest)
    or exists(select 1 from public.messaging_registration_events where application_id=a.id and event_type in ('managed_staff_pause','managed_staff_reject') and metadata->>'reason'='owner_withdrawal') then
    raise exception 'Managed final approval is not authorized or state changed' using errcode='23514'; end if;
  if not p_apply then return; end if;
  checked_at := (p_provider_proof->>'verifiedAt')::timestamptz;
  expected_host := regexp_replace(lower(split_part(split_part(regexp_replace(a.website_url,'^https?://','','i'),'/',1),':',1)),'^www\.','');
  if p_provider_proof is null or p_provider_proof->>'brandId' is distinct from a.provider_brand_id
    or p_provider_proof->>'campaignId' is distinct from a.provider_campaign_id
    or p_provider_proof->>'brandState' is distinct from 'complete' or p_provider_proof->>'campaignState' is distinct from 'complete'
    or p_provider_proof->>'campaignUseCase' is distinct from 'CUSTOMER_CARE'
    or p_provider_proof->>'verifiedLegalBusinessName' is distinct from a.legal_business_name
    or p_provider_proof->>'verifiedDbaName' is distinct from a.dba_name
    or p_provider_proof->>'verifiedWebsiteHost' is distinct from expected_host
    or p_provider_proof->>'verifiedEinLastFour' is distinct from p_ein_last_four
    or checked_at is null or checked_at<ts-interval '10 minutes' or checked_at>ts+interval '2 minutes' then
    raise exception 'Fresh exact carrier verification required' using errcode='23514'; end if;
  insert into public.messaging_compliance_verifications(application_id,account_id,application_revision,verification_method,
    ein_last_four,verification_reference,otp_reference,verified_at,verified_by,created_at,updated_at)
    values(a.id,a.account_id,a.revision,'ein',p_ein_last_four,btrim(p_verification_reference),null,ts,p_actor_id::text,ts,ts)
    on conflict(application_id) do update set application_revision=excluded.application_revision,verification_method='ein',
      ein_last_four=excluded.ein_last_four,verification_reference=excluded.verification_reference,otp_reference=null,
      verified_at=excluded.verified_at,verified_by=excluded.verified_by,updated_at=excluded.updated_at;
  update public.messaging_registration_applications set status='approved',
    status_detail='Staff verification complete. Number purchase and SMS activation are separate steps.',
    provider_brand_state='complete',provider_campaign_state='complete',provider_campaign_use_case='CUSTOMER_CARE',
    provider_verified_at=checked_at,provider_verified_legal_name=a.legal_business_name,provider_verified_dba_name=a.dba_name,
    provider_verified_website_host=expected_host,reviewed_by=p_actor_id::text,reviewed_at=ts,updated_at=ts where id=a.id;
  update public.messaging_managed_registration_operations set poll_state='complete',poll_next_at=null,poll_lease_id=null,
    poll_lease_until=null,recovery_version=recovery_version+1,updated_at=ts where application_id=a.id;
  update public.messaging_registrations set status='in_review',provider='signalwire',provider_reference=a.id::text,
    status_detail='Staff verification complete. Number purchase and SMS activation are separate steps.',updated_at=ts where account_id=a.account_id;
  insert into public.messaging_registration_events(application_id,account_id,event_type,actor_type,actor_reference,previous_status,new_status,metadata)
    values(a.id,a.account_id,'managed_final_approved','staff',p_actor_id::text,a.status,'approved',
      jsonb_build_object('revision',a.revision,'provider_brand_id',a.provider_brand_id,'provider_campaign_id',a.provider_campaign_id,
        'tax_identity_verified',true,'version','managed-final-v1'));
end;
$$;
revoke all on function public.approve_messaging_managed_registration(uuid,uuid,integer,uuid,jsonb,text,text,uuid,text,text,boolean,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.approve_messaging_managed_registration(uuid,uuid,integer,uuid,jsonb,text,text,uuid,text,text,boolean,jsonb,boolean) to service_role;
commit;

;
