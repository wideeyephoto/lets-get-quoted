-- Drain legacy new-request email producers before applying this trigger.
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active','change_order_approved','change_order_declined','warranty_claim','review_feedback','quick_stop_confirmed','quick_stop_cancellation','quick_stop_expired','quick_stop_requested'));

create or replace function public.owner_event_source_available(n public.owner_event_notices)
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
  if n.source_type='quick_stop' and n.event_kind='quick_stop_requested' then
    perform 1 from public.extra_stop_requests q where q.id=n.source_id and q.account_id=n.account_id
      and q.status in ('awaiting_contractor','more_information_requested') and q.response_deadline_at>clock_timestamp()
      and q.client_name=n.source_payload->>'client_name' and coalesce(q.address,'')=coalesce(n.source_payload->>'address','')
      and coalesce(q.ai_summary,'')=coalesce(n.source_payload->>'summary','')
      and coalesce(q.intake->>'issue','')=coalesce(n.source_payload->>'issue','')
      and extract(epoch from q.response_deadline_at)::text=n.source_payload->>'response_deadline' for share;
    return found;
  end if;
  if n.source_type='quick_stop' and n.event_kind='quick_stop_expired' then
    perform 1 from public.extra_stop_requests q where q.id=n.source_id and q.account_id=n.account_id and q.status='offer_expired'
      and q.client_name=n.source_payload->>'client_name'
      and q.payment_id::text is not distinct from n.source_payload->>'payment_id'
      and extract(epoch from q.payment_deadline_at)::text=n.source_payload->>'payment_deadline'
      and not exists(select 1 from public.payments p where p.id=q.payment_id and p.status in ('paid','refunded')) for share;
    return found;
  end if;
  if n.source_type='quick_stop' and n.event_kind='quick_stop_cancellation' then
    perform 1 from public.extra_stop_requests q where q.id=n.source_id and q.account_id=n.account_id
      and q.status in ('customer_canceled','contractor_canceled','no_show_confirmed','refunded','disputed')
      and q.client_name=n.source_payload->>'client_name'
      and coalesce(q.cancel_reason,'')=coalesce(n.source_payload->>'cancel_reason','')
      and extract(epoch from q.canceled_at)::text is not distinct from n.source_payload->>'canceled_at'
      and extract(epoch from q.no_show_confirmed_at)::text is not distinct from n.source_payload->>'no_show_at' for share;
    return found;
  end if;
  if n.source_type='quick_stop' then
    perform 1 from public.extra_stop_requests q where q.id=n.source_id and q.account_id=n.account_id
      and q.status in ('confirmed','en_route','arrived','completed')
      and exists(select 1 from public.payments p where p.id=q.payment_id and p.account_id=q.account_id and p.status='paid')
      and q.payment_id::text=n.source_payload->>'payment_id'
      and extract(epoch from q.paid_at)::text=n.source_payload->>'paid_at'
      and q.client_name=n.source_payload->>'client_name'
      and coalesce(q.address,'')=coalesce(n.source_payload->>'address','')
      and q.arrival_date::text is not distinct from n.source_payload->>'arrival_date'
      and q.arrival_start::text is not distinct from n.source_payload->>'arrival_start'
      and q.arrival_end::text is not distinct from n.source_payload->>'arrival_end' for share;
    return found;
  end if;
  if n.source_type='review_feedback_request' then
    perform 1 from public.review_feedback_requests r join public.review_invites i on i.id=r.invite_id and i.account_id=r.account_id
      where r.id=n.source_id and r.account_id=n.account_id for share of r,i;
    return found;
  end if;
  if n.source_type='warranty_claim' then
    perform 1 from public.warranty_claims c where c.id=n.source_id and c.account_id=n.account_id
      and c.job_id::text=n.source_payload->>'job_id'
      and c.warranty_id::text=n.source_payload->>'warranty_id'
      and c.description=n.source_payload->>'description'
      and to_jsonb(c.photo_paths)=n.source_payload->'photo_paths'
      and c.in_warranty_at_claim::text=n.source_payload->>'in_warranty'
      and c.status in ('open','scheduled') for share;
    return found;
  end if;
  if n.source_type='change_order' then
    perform 1 from public.change_orders c where c.id=n.source_id and c.account_id=n.account_id
      and 'change_order_'||c.status=n.event_kind
      and c.job_id::text=n.source_payload->>'job_id'
      and extract(epoch from c.responded_at)::text=n.source_payload->>'responded_at'
      and c.title=n.source_payload->>'order_title'
      and c.amount::text=n.source_payload->>'amount'
      and c.signature_name=n.source_payload->>'signature_name'
      and coalesce(c.decline_reason,'')=coalesce(n.source_payload->>'decline_reason','') for share;
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








create function public.guard_active_quick_stop_contact() returns trigger
language plpgsql security invoker set search_path='' as $$
declare key text;
begin
  new.client_email:=nullif(lower(btrim(new.client_email)),'');
  new.client_phone:=nullif(btrim(new.client_phone),'');
  -- Consistent ordering protects requests sharing either contact channel.
  for key in select v from unnest(array[
    case when new.client_email is not null then new.account_id::text||':email:'||new.client_email end,
    case when new.client_phone is not null then new.account_id::text||':phone:'||new.client_phone end]) v where v is not null order by v loop
    perform pg_advisory_xact_lock(hashtextextended(key,0));
  end loop;
  if exists(select 1 from public.extra_stop_requests q where q.account_id=new.account_id and q.status in ('requested','awaiting_contractor','more_information_requested','contractor_offer_sent','awaiting_customer_payment','confirmed','en_route','arrived')
      and ((new.client_email is not null and lower(btrim(q.client_email))=new.client_email) or (new.client_phone is not null and q.client_phone=new.client_phone))) then
    raise exception 'This contact already has an active Quick Stop request' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function public.guard_active_quick_stop_contact() from public,anon,authenticated;
create trigger guard_active_quick_stop_contact before insert on public.extra_stop_requests
  for each row when (new.status='awaiting_contractor') execute function public.guard_active_quick_stop_contact();
create function public.record_quick_stop_request_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.response_deadline_at is null or new.response_deadline_at<=clock_timestamp() then raise exception 'Quick Stop response deadline is invalid'; end if;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(new.account_id,'quick_stop',new.id,'quick_stop_requested',jsonb_build_object('title','New Quick Stop request',
      'body',coalesce(nullif(new.ai_summary,''),new.intake->>'issue','A customer requested a Quick Stop.')||E'\n'||coalesce(nullif(new.address,''),'No address given.')||
        E'\nReview the request now to propose an arrival window and set your fee. The response deadline is shown in Quick Stops.',
      'client_name',new.client_name,'address',new.address,'summary',new.ai_summary,'issue',new.intake->>'issue',
      'response_deadline',extract(epoch from new.response_deadline_at)::text));
  return new;
end $$;
revoke all on function public.record_quick_stop_request_notice() from public,anon,authenticated;
create trigger record_quick_stop_request_notice after insert on public.extra_stop_requests
  for each row when (new.status='awaiting_contractor') execute function public.record_quick_stop_request_notice();
notify pgrst,'reload schema';
