-- Make Stripe event and mutation ledgers append-only in identity and explicit
-- in their state transitions. Database ownership must not turn an application
-- retry bug into a rewritten financial history.

begin;

create or replace function public.protect_billing_payment_operation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'billing payment operation audit rows cannot be deleted' using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.payment_id is distinct from new.payment_id
     or old.operation_type is distinct from new.operation_type
     or old.operation_id is distinct from new.operation_id
     or old.charge_model is distinct from new.charge_model
     or old.stripe_account_id is distinct from new.stripe_account_id
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.metadata is distinct from new.metadata
     or old.created_at is distinct from new.created_at then
    raise exception 'billing payment operation identity is immutable' using errcode = '22000';
  end if;

  if old.provider_object_id is not null
     and old.provider_object_id is distinct from new.provider_object_id then
    raise exception 'billing payment operation provider object is immutable once assigned' using errcode = '22000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'billing payment operation attempt count cannot decrease' using errcode = '22000';
  end if;

  if new.state is distinct from old.state and not (
    (old.state = 'claimed' and new.state in ('submitted', 'failed', 'indeterminate'))
    or (old.state = 'submitted' and new.state in ('succeeded', 'failed', 'indeterminate'))
    or (old.state = 'indeterminate' and new.state in ('submitted', 'succeeded', 'failed'))
    or (old.state = 'failed' and new.state in ('claimed', 'submitted'))
  ) then
    raise exception 'invalid billing payment operation state transition: % -> %', old.state, new.state
      using errcode = '22000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_billing_payment_operation_update_trigger
  on public.billing_payment_operations;
create trigger protect_billing_payment_operation_update_trigger
before update on public.billing_payment_operations
for each row execute function public.protect_billing_payment_operation();

drop trigger if exists protect_billing_payment_operation_delete_trigger
  on public.billing_payment_operations;
create trigger protect_billing_payment_operation_delete_trigger
before delete on public.billing_payment_operations
for each row execute function public.protect_billing_payment_operation();

revoke all on function public.protect_billing_payment_operation() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.billing_payment_operations'::pg_catalog.regclass
       and conname = 'billing_payment_operations_terminal_timestamp_check'
  ) then
    alter table public.billing_payment_operations
      add constraint billing_payment_operations_terminal_timestamp_check
      check (
        (state in ('succeeded', 'failed') and completed_at is not null)
        or (state not in ('succeeded', 'failed') and completed_at is null)
      );
  end if;
end
$$;

create or replace function public.protect_billing_event()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'billing event audit rows cannot be deleted' using errcode = '42501';
  end if;

  if old.provider is distinct from new.provider
     or old.provider_event_id is distinct from new.provider_event_id
     or old.event_type is distinct from new.event_type
     or old.provider_account_id is distinct from new.provider_account_id
     or old.livemode is distinct from new.livemode
     or old.api_version is distinct from new.api_version
     or old.provider_created_at is distinct from new.provider_created_at
     or old.payload is distinct from new.payload
     or old.payload_sha256 is distinct from new.payload_sha256
     or old.received_at is distinct from new.received_at then
    raise exception 'billing event identity and payload are immutable' using errcode = '22000';
  end if;
  if old.account_id is not null and old.account_id is distinct from new.account_id then
    raise exception 'billing event workspace is immutable once resolved' using errcode = '22000';
  end if;
  if old.billing_subscription_id is not null
     and old.billing_subscription_id is distinct from new.billing_subscription_id then
    raise exception 'billing event subscription is immutable once resolved' using errcode = '22000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'billing event attempt count cannot decrease' using errcode = '22000';
  end if;

  if new.processing_status is distinct from old.processing_status and not (
    (old.processing_status = 'received' and new.processing_status in ('processing', 'ignored'))
    or (old.processing_status = 'processing' and new.processing_status in ('processed', 'failed', 'ignored'))
    or (old.processing_status = 'failed' and new.processing_status in ('processing', 'ignored'))
  ) then
    raise exception 'invalid billing event state transition: % -> %', old.processing_status, new.processing_status
      using errcode = '22000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_billing_event_update_trigger on public.billing_events;
create trigger protect_billing_event_update_trigger
before update on public.billing_events
for each row execute function public.protect_billing_event();

drop trigger if exists protect_billing_event_delete_trigger on public.billing_events;
create trigger protect_billing_event_delete_trigger
before delete on public.billing_events
for each row execute function public.protect_billing_event();

revoke all on function public.protect_billing_event() from public, anon, authenticated;

commit;
