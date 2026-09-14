-- Each recorded failure binds one lifetime charge attempt. No historical backfill.
alter table public.payments add column dunning_failure_event_id uuid, add column dunning_failure_attempt integer;
alter table public.owner_event_notices drop constraint owner_event_notices_source_type_check;
alter table public.owner_event_notices add constraint owner_event_notices_source_type_check check(source_type in ('job_feed','messaging_registration_event','change_order','warranty_claim','review_feedback_request','quick_stop','payment_refund','account_connect','payment_dispute','recurring_failure'));
alter table public.owner_event_notices drop constraint owner_event_notices_event_kind_check;
alter table public.owner_event_notices add constraint owner_event_notices_event_kind_check check(event_kind in ('client_question','client_followup','rebook_requested','messaging_submitted','messaging_action_required','messaging_approved','messaging_rejected','messaging_active','change_order_approved','change_order_declined','warranty_claim','review_feedback','quick_stop_confirmed','quick_stop_cancellation','quick_stop_expired','quick_stop_requested','payment_refund_recorded','connect_transfers_inactive','payment_dispute_opened','payment_dispute_lost','recurring_payment_failed'));

create or replace function public.owner_event_source_available(n public.owner_event_notices)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  -- Existing messaging tables intentionally grant service_role SELECT only.
  -- This service-only function exposes a boolean and row locks, never mutation.
  -- Reload the persisted notice so supplied composite fields cannot choose a source.
  select * into n from public.owner_event_notices where id=n.id and account_id=n.account_id;
  if not found then return false; end if;
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

create function public.record_recurring_failure_owner_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.id is distinct from old.id or new.account_id is distinct from old.account_id
    or new.recurring_plan_id is distinct from old.recurring_plan_id or new.recurring_plan_id is null
    or new.amount is distinct from old.amount or new.status is distinct from 'failed'
    or old.status not in ('requested','processing','failed')
    or new.charge_attempts is distinct from old.charge_attempts or new.charge_attempts is null or new.charge_attempts<1
    or new.dunning_failure_attempt is distinct from new.charge_attempts
    or new.dunning_failure_attempt<=coalesce(old.dunning_failure_attempt,0)
    or new.dunning_state is null or new.dunning_state not in ('scheduled','needs_card','exhausted') then
    raise exception 'Invalid recurring failure notice transition';
  end if;
  if new.charge_attempts<>1 and new.dunning_state='scheduled' then return new; end if;
  insert into public.owner_event_notices(account_id,source_type,source_id,event_kind,source_payload)
    values(new.account_id,'recurring_failure',new.dunning_failure_event_id,'recurring_payment_failed',jsonb_build_object(
      'title','Recurring payment needs attention',
      'body','A recurring payment attempt needs attention. Review the payment status and planned follow-up before taking action. Contact the client if needed.',
      'payment_id',new.id,'plan_id',new.recurring_plan_id,'payment_amount',new.amount,
      'charge_attempt',new.charge_attempts,'dunning_state',new.dunning_state));
  return new;
end $$;
revoke all on function public.record_recurring_failure_owner_notice() from public,anon,authenticated;
create trigger record_recurring_failure_owner_notice after update on public.payments
  for each row when (new.dunning_failure_event_id is not null and new.dunning_failure_event_id is distinct from old.dunning_failure_event_id)
  execute function public.record_recurring_failure_owner_notice();
notify pgrst,'reload schema';
