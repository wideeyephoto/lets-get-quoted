-- Drain legacy notification actions before applying: events now enqueue atomically.
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event'));
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active'));

create function public.owner_event_source_available(n public.owner_event_notices)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  -- Existing messaging tables intentionally grant service_role SELECT only.
  -- This service-only function exposes a boolean and row locks, never mutation.
  -- Reload the persisted notice so supplied composite fields cannot choose a source.
  select * into n from public.owner_event_notices where id=n.id and account_id=n.account_id;
  if not found then return false; end if;
  if n.source_type='job_feed' then
    perform 1 from public.job_feed f where f.id=n.source_id and f.account_id=n.account_id and f.kind=n.event_kind for share;
    return found;
  end if;
  perform 1 from public.messaging_registration_events e
    join public.messaging_registration_applications a on a.id=e.application_id and a.account_id=e.account_id
    where e.id=n.source_id and e.account_id=n.account_id and 'messaging_'||e.new_status=n.event_kind
      and a.revision::text=n.source_payload->>'revision'
      and lower(btrim(coalesce(nullif(a.business_email,''),a.authorized_contact_email)))=n.source_payload->>'recipient_email'
      and (e.new_status='submitted' or (a.status=e.new_status
        and (e.new_status not in ('action_required','rejected') or coalesce(a.status_detail,'')=coalesce(e.detail,'')))) for share of e,a;
  return found;
end $$;
revoke all on function public.owner_event_source_available(public.owner_event_notices) from public,anon,authenticated;
grant execute on function public.owner_event_source_available(public.owner_event_notices) to service_role;

create function public.record_messaging_owner_event_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a public.messaging_registration_applications; subject text; body text; previous public.messaging_registration_events;
begin
  select * into a from public.messaging_registration_applications where id=new.application_id and account_id=new.account_id;
  if not found or a.status<>new.new_status then raise exception 'Messaging notice source binding is invalid'; end if;
  -- Review retries can append the same audit decision. Changed notes or a new
  -- status transition remain distinct events; repeated active polls stay silent.
  if new.event_type='number_assignment_checked' and new.previous_status='active' then return new; end if;
  if new.event_type='application_reviewed' and new.previous_status=new.new_status then
    select * into previous from public.messaging_registration_events where application_id=new.application_id
      and account_id=new.account_id and event_type='application_reviewed' and id<>new.id order by created_at desc,id desc limit 1;
    if found and previous.new_status=new.new_status and coalesce(previous.detail,'')=coalesce(new.detail,'') then return new; end if;
  end if;
  subject:=case new.new_status when 'submitted' then 'Dedicated number application received'
    when 'action_required' then 'Action required for your dedicated number application'
    when 'approved' then 'Your dedicated number application is approved'
    when 'rejected' then 'Your dedicated number application was not approved'
    else 'Your dedicated texting number is ready' end;
  body:=case new.new_status when 'submitted' then 'We received your application for '||a.legal_business_name||'. Review and number setup can take time. Check your dashboard for status and payment details.'
    when 'approved' then 'Your registration has been approved. Check your dashboard for number setup and activation status.'
    when 'active' then 'Your dedicated texting number '||coalesce(a.purchased_number,'')||' is active. Open Messages to review its status and conversations.'
    else coalesce(nullif(new.detail,''),'Open your messaging dashboard to review this application update.') end;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(new.account_id,'messaging_registration_event',new.id,'messaging_'||new.new_status,
      jsonb_build_object('title',subject,'body',body,'application_id',a.id,'revision',a.revision,
        'business_name',a.legal_business_name,'recipient_email',lower(btrim(coalesce(nullif(a.business_email,''),a.authorized_contact_email)))));
  return new;
end $$;
revoke all on function public.record_messaging_owner_event_notice() from public,anon,authenticated;
create trigger record_messaging_owner_event_notice after insert on public.messaging_registration_events
  for each row when ((new.event_type in ('application_submitted','application_resubmitted') and new.new_status='submitted')
    or (new.event_type='application_reviewed' and new.new_status in ('action_required','approved','rejected'))
    or (new.event_type='number_assignment_checked' and new.new_status='active'))
  execute function public.record_messaging_owner_event_notice();

create or replace function public.claim_owner_event_notices(p_limit integer default 5,p_source_id uuid default null,p_account_id uuid default null)
returns setof public.owner_event_notices language plpgsql security invoker set search_path='' as $$
begin
  update public.owner_event_notices set state='manual_review',last_error='send_outcome_unknown'
    where state='sending' and attempted_at<clock_timestamp()-interval '5 minutes';
  update public.owner_event_notices set state='manual_review',last_error='delivery_unconfirmed'
    where state='accepted' and accepted_at<clock_timestamp()-interval '30 minutes';
  update public.owner_event_notices n set state='cancelled',resolution='Source event is no longer available.'
    where state='pending' and not public.owner_event_source_available(n);
  return query with picked as (
    select n.id from public.owner_event_notices n where n.state='pending' and n.attempted_at is null
      and (p_source_id is null or n.source_id=p_source_id) and (p_account_id is null or n.account_id=p_account_id)
      order by n.created_at,n.id for update skip locked limit greatest(1,least(coalesce(p_limit,5),10))
  ) update public.owner_event_notices n set state='sending',attempted_at=clock_timestamp()
    from picked where n.id=picked.id returning n.*;
end $$;
revoke all on function public.claim_owner_event_notices(integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_owner_event_notices(integer,uuid,uuid) to service_role;


create or replace function public.prepare_owner_event_notice(p_id uuid,p_account_id uuid,p_attempted_at timestamptz,p_recipient text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n public.owner_event_notices;
begin
  select * into n from public.owner_event_notices where id=p_id and account_id=p_account_id for update;
  if not found or n.state<>'sending' or n.recipient is not null or n.attempted_at is distinct from p_attempted_at
    or n.attempted_at<clock_timestamp()-interval '5 minutes' then return false; end if;
  if p_recipient is null or p_recipient<>lower(btrim(p_recipient))
    or p_recipient !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$' then return false; end if;
  if not public.owner_event_source_available(n) then return false; end if;
  if n.source_type='messaging_registration_event' and p_recipient is distinct from n.source_payload->>'recipient_email' then return false; end if;
  update public.owner_event_notices set recipient=p_recipient where id=p_id;
  return true;
end $$;
revoke all on function public.prepare_owner_event_notice(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.prepare_owner_event_notice(uuid,uuid,timestamptz,text) to service_role;


create or replace function public.guard_owner_event_notice_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare n public.owner_event_notices;
begin
  if tg_op = 'UPDATE' then raise exception 'Owner event notice snapshot is immutable'; end if;
  select * into n from public.owner_event_notices where id=new.notice_id for update;
  if not found or n.state <> 'sending' or n.attempted_at is distinct from new.attempted_at
    or n.attempted_at < clock_timestamp()-interval '5 minutes' or n.attempted_at > clock_timestamp() then
    raise exception 'Owner event notice claim is not eligible';
  end if;
  if not public.owner_event_source_available(n) then raise exception 'Owner event notice notice is obsolete'; end if;
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


notify pgrst,'reload schema';
