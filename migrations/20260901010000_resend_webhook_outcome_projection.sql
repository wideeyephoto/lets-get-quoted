-- Resend webhooks are delivered at least once and are not ordered. Extend the
-- outcome set for Resend's current terminal events, then guard the one-row-per-
-- send projector at the database boundary so concurrent/out-of-order upserts
-- cannot move a delivery back to an older state.

alter table public.email_events
  drop constraint if exists email_events_status_check;

alter table public.email_events
  add constraint email_events_status_check
  check (status in (
    'sent',
    'delayed',
    'delivered',
    'bounced',
    'complained',
    'failed',
    'suppressed'
  ));

create or replace function public.prevent_email_event_status_regression()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_rank integer;
  v_new_rank integer;
begin
  -- Lifecycle ordering for one Resend email id. Complaints occur after a
  -- successful delivery; delivery failures and provider suppression are final
  -- pre-delivery outcomes and must not be replaced by a late sent/delayed event.
  v_old_rank := case old.status
    when 'sent' then 10
    when 'delayed' then 20
    when 'delivered' then 30
    when 'bounced' then 40
    when 'failed' then 40
    when 'suppressed' then 40
    when 'complained' then 50
    else 0
  end;
  v_new_rank := case new.status
    when 'sent' then 10
    when 'delayed' then 20
    when 'delivered' then 30
    when 'bounced' then 40
    when 'failed' then 40
    when 'suppressed' then 40
    when 'complained' then 50
    else 0
  end;

  -- Both checks matter: rank prevents an impossible backward transition even
  -- with a malformed timestamp, while occurred_at follows Resend's documented
  -- ordering key and rejects an older higher-rank event delivered late. Equal-
  -- rank terminal outcomes are mutually exclusive, so the first one stays.
  if new.occurred_at < old.occurred_at
     or v_new_rank < v_old_rank
     or (v_new_rank = v_old_rank and new.status is distinct from old.status) then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists email_events_prevent_status_regression on public.email_events;
create trigger email_events_prevent_status_regression
before update of status, occurred_at on public.email_events
for each row execute function public.prevent_email_event_status_regression();

revoke all on function public.prevent_email_event_status_regression()
  from public, anon, authenticated;
grant execute on function public.prevent_email_event_status_regression()
  to service_role;
