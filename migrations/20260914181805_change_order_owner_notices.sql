-- Drain legacy change-order response actions before applying this trigger.
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event','change_order'));
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active','change_order_approved','change_order_declined'));

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


-- The parent UPDATE remains subject to its own RLS. This trigger only records
-- that authorized transition; clients cannot call it or edit the private queue.
create function public.record_change_order_owner_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.id is distinct from old.id or new.account_id is distinct from old.account_id or new.job_id is distinct from old.job_id
    or new.responded_at is null or nullif(btrim(new.signature_name),'') is null then
    raise exception 'Change order decision source is invalid';
  end if;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(new.account_id,'change_order',new.id,'change_order_'||new.status,
      jsonb_build_object('title',case new.status when 'approved' then 'Change order approved' else 'Change order declined' end,
        'body',new.signature_name||case new.status when 'approved' then ' approved: ' else ' declined: ' end||new.title||'. Amount: $'||to_char(new.amount,'FM999999999999990.00')||'. '||
          case new.status when 'approved' then 'Your crew can go ahead with this work.' else coalesce(nullif(new.decline_reason,''),'No reason was provided.') end,
        'job_id',new.job_id,'responded_at',extract(epoch from new.responded_at)::text,'order_title',new.title,'amount',new.amount::text,
        'signature_name',new.signature_name,'decline_reason',new.decline_reason));
  return new;
end $$;
revoke all on function public.record_change_order_owner_notice() from public,anon,authenticated;
create trigger record_change_order_owner_notice after update on public.change_orders
  for each row when (old.status='sent' and new.status in ('approved','declined'))
  execute function public.record_change_order_owner_notice();
notify pgrst,'reload schema';
