-- Drain legacy warranty claim actions before applying the source trigger.
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event','change_order','warranty_claim'));
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active','change_order_approved','change_order_declined','warranty_claim'));

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



create function public.record_warranty_claim_owner_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- The parent's RLS authorizes creation. Preserve exact warranty/job ownership.
  perform 1 from public.warranties w where w.id=new.warranty_id and w.account_id=new.account_id and w.job_id=new.job_id for share;
  if not found then raise exception 'Warranty claim source is invalid'; end if;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(new.account_id,'warranty_claim',new.id,'warranty_claim',
      jsonb_build_object('title',case when new.in_warranty_at_claim then 'Warranty request — in warranty' else 'Warranty request — cover has ended' end,
        'body',new.description||E'\n'||case when new.in_warranty_at_claim then 'This was inside the warranty on the day they reported it.'
          else 'Their cover had already ended when they reported this. Review the request to decide how to help.' end||
          case when cardinality(new.photo_paths)>0 then E'\nAttached '||cardinality(new.photo_paths)::text||' photo/video files.' else '' end,
        'job_id',new.job_id,'warranty_id',new.warranty_id,'description',new.description,
        'photo_paths',to_jsonb(new.photo_paths),'in_warranty',new.in_warranty_at_claim::text));
  return new;
end $$;
revoke all on function public.record_warranty_claim_owner_notice() from public,anon,authenticated;
create trigger record_warranty_claim_owner_notice after insert on public.warranty_claims
  for each row execute function public.record_warranty_claim_owner_notice();
notify pgrst,'reload schema';
