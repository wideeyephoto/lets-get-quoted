create table public.review_feedback_requests (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
  invite_id uuid not null, request_id uuid not null, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(), unique(account_id,invite_id,request_id)
);
alter table public.review_feedback_requests enable row level security;
revoke all on public.review_feedback_requests from public,anon,authenticated;
grant select,insert on public.review_feedback_requests to service_role;
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event','change_order','warranty_claim','review_feedback_request'));
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




create function public.submit_review_link_feedback(p_token text,p_request_id uuid,p_payload_hash text,p_feedback text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.review_invites; r public.review_feedback_requests; job uuid;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_feedback is null or length(btrim(p_feedback)) not between 1 and 2000 then raise exception 'Invalid feedback request'; end if;
  select * into i from public.review_invites where token=p_token for update;
  if not found then raise exception 'Review link not found'; end if;
  select * into r from public.review_feedback_requests where account_id=i.account_id and invite_id=i.id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request has different content'; end if;
    return jsonb_build_object('source_id',r.id,'account_id',r.account_id,'replayed',true);
  end if;
  job:=null;
  if i.job_id is not null then
    select id into job from public.jobs where id=i.job_id and account_id=i.account_id for share;
    if not found then raise exception 'Review job binding is invalid'; end if;
  end if;
  insert into public.review_feedback_requests(account_id,invite_id,request_id,payload_hash) values(i.account_id,i.id,p_request_id,p_payload_hash) returning * into r;
  update public.review_invites set feedback=p_feedback,feedback_at=clock_timestamp(),routed_to='private',responded_at=coalesce(responded_at,clock_timestamp()) where id=i.id;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(i.account_id,'review_feedback_request',r.id,'review_feedback',jsonb_build_object('title','New private feedback',
      'body',coalesce(nullif(i.client_name,''),'A customer')||' left private feedback. Rating: '||coalesce(i.rating::text,'not rated')||E'\n'||p_feedback,
      'job_id',job,'invite_id',i.id));
  if job is not null then
    insert into public.job_feed(account_id,job_id,kind,title,body,visibility,author,meta,published_at)
      values(i.account_id,job,'review_feedback','Private feedback',p_feedback,'internal','Customer',jsonb_build_object('review_feedback_request_id',r.id,'rating',i.rating),clock_timestamp());
  end if;
  return jsonb_build_object('source_id',r.id,'account_id',r.account_id,'replayed',false);
end $$;
revoke all on function public.submit_review_link_feedback(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_review_link_feedback(text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
