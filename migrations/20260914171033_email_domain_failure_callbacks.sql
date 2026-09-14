-- Signed callback evidence repairs acceptance without another provider request.
alter table public.email_domain_failure_notices
  add column callback_status text check (callback_status in ('sent','delayed','delivered','failed','bounced','suppressed','complained')),
  add column callback_at timestamptz,
  add column callback_event_id text;

create function public.confirm_email_domain_failure_notice(
  p_id uuid, p_account_id uuid, p_recipient text, p_provider_id text,
  p_status text, p_occurred_at timestamptz, p_event_id text
) returns text language plpgsql security invoker set search_path = '' as $$
declare n public.email_domain_failure_notices; s public.email_domain_failure_snapshots;
  ranks text[] := array['sent','delayed','delivered','failed','bounced','suppressed','complained'];
begin
  if p_provider_id is null or length(btrim(p_provider_id)) not between 1 and 256
    or p_provider_id<>btrim(p_provider_id) or p_recipient is null
    or p_event_id is null or length(btrim(p_event_id)) not between 1 and 256
    or p_occurred_at is null or not isfinite(p_occurred_at)
    or p_status is null or not p_status=any(ranks) then return 'conflict'; end if;
  select * into n from public.email_domain_failure_notices where id=p_id for update;
  if not found then return 'missing'; end if;
  if n.account_id is distinct from p_account_id then return 'conflict'; end if;
  select * into s from public.email_domain_failure_snapshots where notice_id=p_id;
  if not found then return 'unprepared'; end if;
  if lower(s.payload->>'to') is distinct from lower(p_recipient)
    or n.state in ('pending','cancelled')
    or (n.provider_id is not null and n.provider_id<>p_provider_id) then return 'conflict'; end if;
  -- A unique provider ID can never be bound to a second failure episode.
  update public.email_domain_failure_notices set provider_id=p_provider_id,
    accepted_at=coalesce(accepted_at,p_occurred_at) where id=p_id;
  if n.callback_status is not null and (
    array_position(ranks,p_status)<array_position(ranks,n.callback_status)
    or (p_status=n.callback_status and p_occurred_at<=n.callback_at)) then return 'confirmed'; end if;
  update public.email_domain_failure_notices set callback_status=p_status,
    callback_at=p_occurred_at,callback_event_id=p_event_id where id=p_id;
  -- An operator's explicit closeout remains intact; retain subsequent evidence.
  if n.state='resolved' and n.resolved_by is distinct from 'signed_provider_webhook' then return 'confirmed'; end if;
  if p_status='delivered' then
    update public.email_domain_failure_notices set state='resolved',resolved_at=clock_timestamp(),
      resolved_by='signed_provider_webhook',resolution='Provider '||p_provider_id||': delivered' where id=p_id;
  elsif p_status in ('failed','bounced','suppressed','complained') then
    update public.email_domain_failure_notices set state='manual_review',last_error='delivery_'||p_status where id=p_id;
  elsif n.state='sending' or (n.state='manual_review' and n.last_error in ('send_outcome_unknown','send_failed_or_outcome_unknown')) then
    update public.email_domain_failure_notices set state='accepted' where id=p_id;
  end if;
  return 'confirmed';
exception when unique_violation then return 'conflict';
end $$;
revoke all on function public.confirm_email_domain_failure_notice(uuid,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.confirm_email_domain_failure_notice(uuid,uuid,text,text,text,timestamptz,text) to service_role;

create function public.finish_email_domain_failure_notice(
  p_id uuid, p_account_id uuid, p_attempted_at timestamptz, p_provider_id text, p_error text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.email_domain_failure_notices;
begin
  select * into n from public.email_domain_failure_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.attempted_at is distinct from p_attempted_at then return false; end if;
  if n.provider_id is not null then
    -- Callback already won. Neither a delayed acknowledgement nor a timeout
    -- may overwrite its delivered/negative state or operator resolution.
    return p_provider_id is null or n.provider_id=p_provider_id;
  end if;
  if n.state<>'sending' and not (n.state='manual_review' and n.last_error='send_outcome_unknown') then return false; end if;
  if p_provider_id is not null then
    if length(btrim(p_provider_id)) not between 1 and 256 or p_provider_id<>btrim(p_provider_id)
      or not exists(select 1 from public.email_domain_failure_snapshots where notice_id=p_id) then return false; end if;
    update public.email_domain_failure_notices set state='accepted',provider_id=p_provider_id,
      accepted_at=clock_timestamp() where id=p_id;
  else
    if p_error is null or p_error not in ('owner_email_missing','owner_brand_unavailable','snapshot_prepare_failed','send_failed_or_outcome_unknown') then return false; end if;
    update public.email_domain_failure_notices set state='manual_review',last_error=p_error where id=p_id;
  end if;
  return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.finish_email_domain_failure_notice(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.finish_email_domain_failure_notice(uuid,uuid,timestamptz,text,text) to service_role;

-- Prepared sends use their bound callback evidence, not an unbound events row.
-- Return false only for legacy notices that still need the old observation path.
create function public.review_email_domain_failure_notice(p_id uuid,p_account_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n public.email_domain_failure_notices;
begin
  select * into n from public.email_domain_failure_notices where id=p_id and account_id=p_account_id for update;
  if not found then return true; end if;
  if not exists(select 1 from public.email_domain_failure_snapshots where notice_id=p_id) then return false; end if;
  if n.state='accepted' and n.accepted_at<clock_timestamp()-interval '30 minutes' then
    update public.email_domain_failure_notices set state='manual_review',last_error='delivery_unconfirmed' where id=p_id;
  end if;
  return true;
end $$;
revoke all on function public.review_email_domain_failure_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_email_domain_failure_notice(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
