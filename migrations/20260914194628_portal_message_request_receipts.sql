create table public.portal_message_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  body text not null check(length(body) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,request_id)
);
alter table public.portal_message_requests enable row level security;
revoke all on public.portal_message_requests from public,anon,authenticated;
grant select,insert on public.portal_message_requests to service_role;
create index portal_message_requests_client_idx on public.portal_message_requests(account_id,client_id,created_at desc);
create index portal_message_requests_job_idx on public.portal_message_requests(job_id);
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event','change_order','warranty_claim','review_feedback_request','quick_stop','payment_refund','account_connect','payment_dispute','recurring_failure','portal_message'));
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active','change_order_approved','change_order_declined','warranty_claim','review_feedback','quick_stop_confirmed','quick_stop_cancellation','quick_stop_expired','quick_stop_requested','payment_refund_recorded','connect_transfers_inactive','payment_dispute_opened','payment_dispute_lost','recurring_payment_failed','quote_approved','portal_message_received'));

create or replace function public.owner_event_source_available(n public.owner_event_notices)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  -- Existing messaging tables intentionally grant service_role SELECT only.
  -- This service-only function exposes a boolean and row locks, never mutation.
  -- Reload the persisted notice so supplied composite fields cannot choose a source.
  select * into n from public.owner_event_notices where id=n.id and account_id=n.account_id;
  if not found then return false; end if;
  if n.source_type='portal_message' and n.event_kind='portal_message_received' then
    perform 1 from public.portal_message_requests r where r.id=n.source_id and r.account_id=n.account_id
      and r.client_id::text=n.source_payload->>'client_id' and r.body=n.source_payload->>'body'
      and r.job_id::text is not distinct from n.source_payload->>'job_id' for share;
    return found;
  end if;
  if n.source_type='recurring_failure' and n.event_kind='recurring_payment_failed' then
    perform 1 from public.payments p where p.id::text=n.source_payload->>'payment_id' and p.account_id=n.account_id
      and p.status='failed' and p.dunning_failure_event_id=n.source_id
      and p.recurring_plan_id::text=n.source_payload->>'plan_id' and p.amount=(n.source_payload->>'payment_amount')::numeric
      and p.charge_attempts=(n.source_payload->>'charge_attempt')::integer
      and p.dunning_state=n.source_payload->>'dunning_state' for share;
    return found;
  end if;
  if n.source_type='payment_dispute' then
    perform 1 from public.payments p where p.id::text=n.source_payload->>'payment_id' and p.account_id=n.account_id
      and p.dispute_notice_event_id=n.source_id and p.stripe_dispute_id=n.source_payload->>'dispute_id'
      and p.stripe_payment_intent=n.source_payload->>'payment_intent' and p.amount=(n.source_payload->>'payment_amount')::numeric
      and (not(to_jsonb(p)?'charge_model') or to_jsonb(p)->>'charge_model'='destination')
      and ((n.event_kind='payment_dispute_opened' and p.status='disputed' and p.dispute_status in ('needs_response','under_review'))
        or (n.event_kind='payment_dispute_lost' and p.status='refunded' and p.dispute_status='lost')) for share;
    return found;
  end if;
  if n.source_type='account_connect' and n.event_kind='connect_transfers_inactive' then
    perform 1 from public.accounts a where a.id=n.account_id and a.connect_onboarded=false
      and a.connect_notice_event_id=n.source_id
      and a.stripe_connect_id=n.source_payload->>'stripe_connect_id'
      and extract(epoch from a.connect_disabled_at)::text=n.source_payload->>'disabled_at' for share;
    return found;
  end if;
  if n.source_type='payment_refund' and n.event_kind='payment_refund_recorded' then
    perform 1 from public.payments p where p.id::text=n.source_payload->>'payment_id' and p.account_id=n.account_id
      and p.status in ('paid','refunded')
      and (not(to_jsonb(p)?'charge_model') or to_jsonb(p)->>'charge_model'='destination')
      and p.stripe_payment_intent=n.source_payload->>'payment_intent'
      and p.amount=(n.source_payload->>'payment_amount')::numeric
      and p.refunded_amount>=(n.source_payload->>'refunded_total')::numeric for share;
    return found;
  end if;
  if n.source_type='job_feed' and n.event_kind='quote_approved' then
    perform 1 from public.job_feed f join public.jobs j on j.id=f.job_id and j.account_id=f.account_id
      where f.id=n.source_id and f.account_id=n.account_id and f.kind='quote_approved'
        and f.source_table='jobs' and f.source_id=f.job_id
        and f.meta->>'owner_email_notice'='quote_approval_v1' and f.meta->>'acceptance_source'='client_link'
        and f.job_id::text=n.source_payload->>'job_id' and f.title=n.source_payload->>'approval_title'
        and coalesce(f.body,'')=n.source_payload->>'body'
        and coalesce(f.amount,0)=(n.source_payload->>'quote_amount')::numeric
        and coalesce(j.quoted_amount,0)=coalesce(f.amount,0) for share of f,j;
    return found;
  end if;
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

create function public.submit_portal_message_request(p_account_id uuid,p_client_id uuid,p_request_id uuid,p_payload_hash text,p_body text,p_job_id uuid default null,p_raw_phone text default null,p_phone text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.portal_message_requests; client_name text; client_phone text; selected_job uuid; message_id uuid:=gen_random_uuid();
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_body is null or length(btrim(p_body)) not between 1 and 4000 or length(coalesce(p_phone,''))>50 then raise exception 'Invalid portal message request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('portal-message:'||p_account_id::text||':'||p_request_id::text,0));
  select * into r from public.portal_message_requests where account_id=p_account_id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request has different content'; end if;
    return jsonb_build_object('message_id',r.id,'job_id',r.job_id,'replayed',true);
  end if;
  select c.name,c.phone into client_name,client_phone from public.clients c where c.id=p_client_id and c.account_id=p_account_id for share;
  if not found or nullif(client_phone,'') is distinct from p_raw_phone then raise exception 'Client unavailable or changed'; end if;
  if p_job_id is not null then
    select j.id into selected_job from public.jobs j where j.id=p_job_id and j.account_id=p_account_id and j.client_id=p_client_id for share;
    if not found then raise exception 'Job does not belong to this client'; end if;
  else
    select j.id into selected_job from public.jobs j where j.account_id=p_account_id and j.client_id=p_client_id order by j.created_at desc,j.id desc limit 1 for share;
  end if;
  insert into public.portal_message_requests(id,account_id,client_id,job_id,request_id,payload_hash,body)
    values(message_id,p_account_id,p_client_id,selected_job,p_request_id,p_payload_hash,btrim(p_body));
  if selected_job is not null then
    insert into public.job_feed(id,account_id,job_id,kind,title,body,author,visibility,source_table,source_id,published_at)
      values(message_id,p_account_id,selected_job,'portal_note','Portal note from '||coalesce(nullif(client_name,''),'Customer'),btrim(p_body),'Client','client','portal_message_requests',message_id,clock_timestamp());
  end if;
  if p_phone is not null and p_phone<>'' then
    insert into public.sms_messages(id,account_id,phone_number,direction,body) values(message_id,p_account_id,p_phone,'inbound',btrim(p_body));
  end if;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(p_account_id,'portal_message',message_id,'portal_message_received',jsonb_build_object(
      'title','Portal message from '||coalesce(nullif(client_name,''),'Customer'),'body',btrim(p_body),'client_id',p_client_id,'job_id',selected_job));
  return jsonb_build_object('message_id',message_id,'job_id',selected_job,'replayed',false);
end $$;
revoke all on function public.submit_portal_message_request(uuid,uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_portal_message_request(uuid,uuid,uuid,text,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
