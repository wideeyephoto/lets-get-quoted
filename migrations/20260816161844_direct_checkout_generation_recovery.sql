-- DARK generation-aware recovery for expired, unpaid Merchant-direct Checkout.
--
-- This migration adds no route, caller, feature flag, scheduler, or Stripe
-- mutation. It keeps one immutable payment/fee snapshot and appends at most
-- five Checkout-create attempts. A successor is claimable only after the
-- signed connected-account expiration projector has recorded authoritative
-- expired + unpaid evidence for the exact current Session.

begin;

-- Runtime mutation order is account -> payment -> Checkout attempt. Migration
-- locks prevent an older function definition from observing a half-installed
-- generation contract.
lock table public.accounts in share row exclusive mode;
lock table public.payments in share row exclusive mode;
lock table public.billing_payment_operations in share row exclusive mode;
lock table public.billing_events in share row exclusive mode;
lock table public.stripe_connected_checkout_expirations in share row exclusive mode;

alter table public.billing_payment_operations
  add column checkout_generation integer,
  add column checkout_lifecycle text,
  add column checkout_session_expires_at timestamptz,
  add column checkout_expiration_id uuid,
  add column predecessor_operation_pk uuid,
  add column superseded_by_operation_pk uuid,
  add column superseded_at timestamptz;

alter table public.payments
  add column current_checkout_operation_pk uuid;

-- The old dark rail was never activated. Refuse to guess generation identity
-- or provider expiry for any unexpected pre-existing operation; an operator
-- must reconcile that row explicitly before this migration can proceed.
do $$
begin
  if exists (
    select 1
      from public.billing_payment_operations o
     where o.operation_type = 'checkout_session.create'
       and o.operation_id is distinct from (
         'payment:' || o.payment_id::text || ':checkout:1'
       )
  ) then
    raise exception 'existing Checkout operations require an explicit generation identity backfill'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.billing_payment_operations o
     where o.operation_type = 'checkout_session.create'
       and o.state = 'succeeded'
       and not exists (
         select 1
           from public.stripe_connected_checkout_expirations x
          where x.operation_pk = o.id
            and x.checkout_session_id = o.provider_object_id
       )
  ) then
    raise exception 'existing succeeded Checkout operations require an explicit provider expiry backfill'
      using errcode = '55000';
  end if;
end
$$;

create function public.bind_stripe_connected_checkout_expiration_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  -- Preserve the recovery-wide lock order even when this trigger is reached
  -- independently of the signed projector: account -> payment -> attempt.
  perform 1
    from public.accounts a
   where a.id = new.account_id
     and a.stripe_merchant_account_id = new.stripe_account_id
     and a.merchant_livemode = new.livemode
   for key share;
  if not found then
    raise exception 'connected Checkout expiration Merchant mapping changed'
      using errcode = '22000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = new.payment_id
     and p.account_id = new.account_id
     and p.stripe_account_id = new.stripe_account_id
     and p.stripe_livemode = new.livemode
     and p.charge_model = 'direct'
   for share;
  if not found
     or v_payment.stripe_checkout_session is distinct from new.checkout_session_id
     or v_payment.status::text <> 'processing'
     or v_payment.reconciliation_status <> 'pending' then
    raise exception 'connected Checkout expiration is not the payment current generation'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = new.operation_pk
     and o.account_id = new.account_id
     and o.payment_id = new.payment_id
     and o.stripe_account_id = new.stripe_account_id
     and o.livemode = new.livemode
     and o.charge_model = new.charge_model
     and o.operation_type = 'checkout_session.create'
   for share;
  if not found
     or v_operation.state <> 'succeeded'
     or v_operation.checkout_lifecycle <> 'open'
     or v_operation.checkout_expiration_id is not null
     or v_operation.provider_object_id is distinct from new.checkout_session_id
     or v_operation.checkout_session_expires_at is distinct from new.session_expires_at
     or v_operation.superseded_by_operation_pk is not null
     or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_operation.metadata #>> '{checkout_generation}')::integer
        is distinct from v_operation.checkout_generation then
    raise exception 'connected Checkout expiration is not bound to an open generation'
      using errcode = '22000';
  end if;

  if v_payment.current_checkout_operation_pk is distinct from v_operation.id then
    raise exception 'connected Checkout expiration is not the payment current generation'
      using errcode = '22000';
  end if;

  new.checkout_generation := v_operation.checkout_generation;
  return new;
end;
$$;

create trigger bind_stripe_connected_checkout_expiration_generation_trigger
before insert on public.stripe_connected_checkout_expirations
for each row execute function public.bind_stripe_connected_checkout_expiration_generation();

create function public.project_stripe_connected_checkout_expiration_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
begin
  perform pg_catalog.set_config(
    'lgq.direct_checkout_expiration_operation_pk',
    new.operation_pk::text,
    true
  );
  update public.billing_payment_operations o
     set checkout_lifecycle = 'expired_unpaid',
         checkout_expiration_id = new.id
   where o.id = new.operation_pk
     and o.checkout_generation = new.checkout_generation
     and o.state = 'succeeded'
     and o.checkout_lifecycle = 'open'
     and o.checkout_expiration_id is null
     and o.provider_object_id = new.checkout_session_id
     and o.checkout_session_expires_at = new.session_expires_at
     and o.superseded_by_operation_pk is null;
  perform pg_catalog.set_config('lgq.direct_checkout_expiration_operation_pk', '', true);
  if not found then
    raise exception 'connected Checkout expiration lifecycle transition was lost'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

create trigger project_stripe_connected_checkout_expiration_lifecycle_trigger
after insert on public.stripe_connected_checkout_expirations
for each row execute function public.project_stripe_connected_checkout_expiration_lifecycle();

revoke all on function public.bind_stripe_connected_checkout_expiration_generation()
  from public, anon, authenticated, service_role;
revoke all on function public.project_stripe_connected_checkout_expiration_lifecycle()
  from public, anon, authenticated, service_role;

-- The signed expiration RPCs already lock and validate the exact operation PK,
-- event, payment, invoice, Session, cents, and fee snapshot. Patch their
-- historical schema/current-operation predicates; the insert triggers above
-- atomically add generation evidence and move open -> expired_unpaid.
do $$
declare
  v_resolve_before text;
  v_resolve_after text;
  v_project_before text;
  v_project_after text;
  v_resolve_old text := $needle$
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)$needle$;
  v_resolve_new text := $replacement$
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_operation_id)
       and o.id = v_payment.current_checkout_operation_pk$replacement$;
  v_project_old text := $needle$
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_projection ->> 'operation_id')$needle$;
  v_project_new text := $replacement$
       and o.operation_type = 'checkout_session.create'
       and o.operation_id = pg_catalog.btrim(p_projection ->> 'operation_id')
       and o.id = v_payment.current_checkout_operation_pk$replacement$;
begin
  v_resolve_before := pg_catalog.pg_get_functiondef(
    'public.resolve_stripe_connected_checkout_expiration_binding(uuid,uuid,uuid,uuid,text,bigint)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_resolve_before)
       - pg_catalog.length(pg_catalog.replace(v_resolve_before, v_resolve_old, ''))
       is distinct from pg_catalog.length(v_resolve_old)
     or pg_catalog.length(v_resolve_before)
       - pg_catalog.length(pg_catalog.replace(
         v_resolve_before,
         'one_off_direct_checkout_v1',
         ''
       )) is distinct from pg_catalog.length('one_off_direct_checkout_v1')
     or pg_catalog.length(v_resolve_before)
       - pg_catalog.length(pg_catalog.replace(
         v_resolve_before,
         'or v_operation.state <> ''succeeded''',
         ''
       )) is distinct from pg_catalog.length('or v_operation.state <> ''succeeded''') then
    raise exception 'expiration binding source contract did not match exactly once'
      using errcode = '55000';
  end if;
  v_resolve_after := pg_catalog.replace(
    v_resolve_before,
    'one_off_direct_checkout_v1',
    'one_off_direct_checkout_generation_v2'
  );
  v_resolve_after := pg_catalog.replace(v_resolve_after, v_resolve_old, v_resolve_new);
  v_resolve_after := pg_catalog.replace(
    v_resolve_after,
    'or v_operation.state <> ''succeeded''',
    'or v_operation.state <> ''succeeded'''
      || pg_catalog.chr(10)
      || '         or v_operation.checkout_lifecycle <> ''open'''
      || pg_catalog.chr(10)
      || '         or v_operation.checkout_session_expires_at is null'
      || pg_catalog.chr(10)
      || '         or v_operation.superseded_by_operation_pk is not null'
  );
  if v_resolve_after = v_resolve_before
     or pg_catalog.strpos(v_resolve_after, 'o.id = v_payment.current_checkout_operation_pk') = 0
     or pg_catalog.strpos(v_resolve_after, 'one_off_direct_checkout_generation_v2') = 0
     or pg_catalog.strpos(v_resolve_after, 'v_operation.checkout_lifecycle <> ''open''') = 0 then
    raise exception 'expiration binding generation patch did not match exactly'
      using errcode = '55000';
  end if;
  execute v_resolve_after;

  v_project_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_connected_checkout_expiration(uuid,uuid,jsonb)'
      ::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_project_before)
       - pg_catalog.length(pg_catalog.replace(v_project_before, v_project_old, ''))
       is distinct from pg_catalog.length(v_project_old)
     or pg_catalog.length(v_project_before)
       - pg_catalog.length(pg_catalog.replace(
         v_project_before,
         'one_off_direct_checkout_v1',
         ''
       )) is distinct from pg_catalog.length('one_off_direct_checkout_v1')
     or pg_catalog.length(v_project_before)
       - pg_catalog.length(pg_catalog.replace(
         v_project_before,
         'or v_operation.state <> ''succeeded''',
         ''
       )) is distinct from pg_catalog.length('or v_operation.state <> ''succeeded''') then
    raise exception 'expiration projector source contract did not match exactly once'
      using errcode = '55000';
  end if;
  v_project_after := pg_catalog.replace(
    v_project_before,
    'one_off_direct_checkout_v1',
    'one_off_direct_checkout_generation_v2'
  );
  v_project_after := pg_catalog.replace(v_project_after, v_project_old, v_project_new);
  v_project_after := pg_catalog.replace(
    v_project_after,
    'or v_operation.state <> ''succeeded''',
    'or v_operation.state <> ''succeeded'''
      || pg_catalog.chr(10)
      || '         or v_operation.checkout_lifecycle <> ''open'''
      || pg_catalog.chr(10)
      || '         or v_operation.checkout_session_expires_at is distinct from v_session_expires_at'
      || pg_catalog.chr(10)
      || '         or v_operation.superseded_by_operation_pk is not null'
  );
  if v_project_after = v_project_before
     or pg_catalog.strpos(v_project_after, 'o.id = v_payment.current_checkout_operation_pk') = 0
     or pg_catalog.strpos(v_project_after, 'one_off_direct_checkout_generation_v2') = 0
     or pg_catalog.strpos(
       v_project_after,
       'v_operation.checkout_session_expires_at is distinct from v_session_expires_at'
     ) = 0 then
    raise exception 'expiration projector generation patch did not match exactly'
      using errcode = '55000';
  end if;
  execute v_project_after;
end
$$;


update public.billing_payment_operations o
   set checkout_generation = 1,
       checkout_lifecycle = case
         when o.state = 'succeeded' then 'expired_unpaid'
         else null
       end,
       checkout_session_expires_at = x.session_expires_at,
       checkout_expiration_id = x.id
  from public.stripe_connected_checkout_expirations x
 where o.operation_type = 'checkout_session.create'
   and o.id = x.operation_pk;

update public.billing_payment_operations o
   set checkout_generation = 1
 where o.operation_type = 'checkout_session.create'
   and o.checkout_generation is null;

update public.payments p
   set current_checkout_operation_pk = o.id
  from public.billing_payment_operations o
 where o.payment_id = p.id
   and o.operation_type = 'checkout_session.create';

alter table public.stripe_connected_checkout_expirations
  add column checkout_generation integer;

update public.stripe_connected_checkout_expirations x
   set checkout_generation = o.checkout_generation
  from public.billing_payment_operations o
 where o.id = x.operation_pk;

alter table public.stripe_connected_checkout_expirations
  alter column checkout_generation set not null,
  add constraint stripe_connected_checkout_expiration_generation_check
    check (checkout_generation between 1 and 5),
  add constraint stripe_connected_checkout_expiration_payment_generation_unique
    unique (payment_id, checkout_generation),
  add constraint stripe_connected_checkout_expiration_operation_scope_unique
    unique (
      id, operation_pk, account_id, payment_id, stripe_account_id,
      livemode, charge_model
    );

drop index if exists public.billing_payment_operations_one_checkout_per_payment;

create unique index billing_payment_operations_checkout_generation_unique
  on public.billing_payment_operations (payment_id, checkout_generation)
  where operation_type = 'checkout_session.create';

create unique index billing_payment_operations_checkout_current_unique
  on public.billing_payment_operations (payment_id)
  where operation_type = 'checkout_session.create'
    and superseded_by_operation_pk is null;

create unique index billing_payment_operations_checkout_predecessor_unique
  on public.billing_payment_operations (predecessor_operation_pk)
  where operation_type = 'checkout_session.create'
    and predecessor_operation_pk is not null;

alter table public.billing_payment_operations
  add constraint billing_payment_operations_checkout_predecessor_fk
    foreign key (predecessor_operation_pk)
    references public.billing_payment_operations(id)
    on update restrict on delete restrict,
  add constraint billing_payment_operations_checkout_successor_fk
    foreign key (superseded_by_operation_pk)
    references public.billing_payment_operations(id)
    on update restrict on delete restrict
    deferrable initially deferred,
  add constraint billing_payment_operations_checkout_expiration_fk
    foreign key (
      checkout_expiration_id, id, account_id, payment_id,
      stripe_account_id, livemode, charge_model
    )
    references public.stripe_connected_checkout_expirations(
      id, operation_pk, account_id, payment_id,
      stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict,
  add constraint billing_payment_operations_checkout_generation_shape_check
    check (
      (
        operation_type <> 'checkout_session.create'
        and checkout_generation is null
        and checkout_lifecycle is null
        and checkout_session_expires_at is null
        and checkout_expiration_id is null
        and predecessor_operation_pk is null
        and superseded_by_operation_pk is null
        and superseded_at is null
      )
      or (
        operation_type = 'checkout_session.create'
        and checkout_generation between 1 and 5
        and operation_id = (
          'payment:' || payment_id::text || ':checkout:' || checkout_generation::text
        )
        and metadata #>> '{schema}' = 'one_off_direct_checkout_generation_v2'
        and pg_catalog.jsonb_typeof(metadata #> '{checkout_generation}') = 'number'
        and (metadata #>> '{checkout_generation}')::integer = checkout_generation
        and pg_catalog.jsonb_typeof(metadata #> '{fee_snapshot}') = 'object'
        and (
          (checkout_generation = 1 and predecessor_operation_pk is null)
          or (checkout_generation > 1 and predecessor_operation_pk is not null)
        )
        and (
          (superseded_by_operation_pk is null and superseded_at is null)
          or (superseded_by_operation_pk is not null and superseded_at is not null)
        )
        and (
          (
            state in ('claimed', 'submitted', 'failed', 'indeterminate')
            and checkout_lifecycle is null
            and checkout_session_expires_at is null
            and checkout_expiration_id is null
          )
          or (
            state = 'succeeded'
            and checkout_lifecycle in ('open', 'expired_unpaid', 'paid')
            and checkout_session_expires_at is not null
            and provider_object_id is not null
            and (
              (checkout_lifecycle = 'expired_unpaid' and checkout_expiration_id is not null)
              or (checkout_lifecycle in ('open', 'paid') and checkout_expiration_id is null)
            )
          )
        )
      )
    );

alter table public.payments
  add constraint payments_current_checkout_operation_fk
    foreign key (
      current_checkout_operation_pk, account_id, id,
      stripe_account_id, stripe_livemode, charge_model
    )
    references public.billing_payment_operations(
      id, account_id, payment_id, stripe_account_id, livemode, charge_model
    ) on update restrict on delete restrict
    deferrable initially deferred,
  add constraint payments_current_checkout_operation_shape_check
    check (
      (charge_model <> 'direct' and current_checkout_operation_pk is null)
      or charge_model = 'direct'
    );

-- Generation lineage and lifecycle are financial audit identity. Only the
-- narrow definer RPCs/projectors below may fill the provider/lifecycle fields
-- or append one successor; metadata and idempotency remain immutable.
create or replace function public.protect_billing_payment_operation()
returns trigger
language plpgsql
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_completion_context boolean := false;
  v_expiration_context boolean := false;
  v_paid_context boolean := false;
  v_successor_context boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'billing payment operation audit rows cannot be deleted'
      using errcode = '42501';
  end if;

  if old.account_id is distinct from new.account_id
     or old.payment_id is distinct from new.payment_id
     or old.operation_type is distinct from new.operation_type
     or old.operation_id is distinct from new.operation_id
     or old.charge_model is distinct from new.charge_model
     or old.stripe_account_id is distinct from new.stripe_account_id
     or old.livemode is distinct from new.livemode
     or old.stripe_idempotency_key is distinct from new.stripe_idempotency_key
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.metadata is distinct from new.metadata
     or old.created_at is distinct from new.created_at
     or old.checkout_generation is distinct from new.checkout_generation
     or old.predecessor_operation_pk is distinct from new.predecessor_operation_pk then
    raise exception 'billing payment operation identity is immutable'
      using errcode = '22000';
  end if;

  if old.provider_object_id is not null
     and old.provider_object_id is distinct from new.provider_object_id then
    raise exception 'billing payment operation provider object is immutable once assigned'
      using errcode = '22000';
  end if;
  if new.attempt_count < old.attempt_count then
    raise exception 'billing payment operation attempt count cannot decrease'
      using errcode = '22000';
  end if;

  if new.state is distinct from old.state and not (
    (old.state = 'claimed' and new.state in ('submitted', 'failed', 'indeterminate'))
    or (old.state = 'submitted' and new.state in ('succeeded', 'failed', 'indeterminate'))
    or (old.state = 'indeterminate' and new.state in ('submitted', 'succeeded', 'failed'))
    or (old.state = 'failed' and new.state in ('claimed', 'submitted'))
  ) then
    raise exception 'invalid billing payment operation state transition: % -> %',
      old.state, new.state using errcode = '22000';
  end if;

  if old.operation_type <> 'checkout_session.create' then
    return new;
  end if;

  v_completion_context := coalesce(
    pg_catalog.current_setting('lgq.direct_checkout_completion_operation_pk', true),
    ''
  ) = old.id::text;
  v_expiration_context := coalesce(
    pg_catalog.current_setting('lgq.direct_checkout_expiration_operation_pk', true),
    ''
  ) = old.id::text;
  v_paid_context := coalesce(
    pg_catalog.current_setting('lgq.direct_checkout_paid_operation_pk', true),
    ''
  ) = old.id::text;
  v_successor_context := coalesce(
    pg_catalog.current_setting('lgq.direct_checkout_successor_predecessor_pk', true),
    ''
  ) = old.id::text;

  if old.checkout_session_expires_at is not null
     and old.checkout_session_expires_at is distinct from new.checkout_session_expires_at then
    raise exception 'Checkout Session expiry is immutable once assigned'
      using errcode = '22000';
  end if;
  if old.checkout_expiration_id is not null
     and old.checkout_expiration_id is distinct from new.checkout_expiration_id then
    raise exception 'Checkout expiration evidence is immutable once assigned'
      using errcode = '22000';
  end if;
  if old.superseded_by_operation_pk is not null
     and (
       old.superseded_by_operation_pk is distinct from new.superseded_by_operation_pk
       or old.superseded_at is distinct from new.superseded_at
     ) then
    raise exception 'Checkout successor binding is immutable once assigned'
      using errcode = '22000';
  end if;

  if old.checkout_lifecycle is distinct from new.checkout_lifecycle then
    if not (
      (old.checkout_lifecycle is null and new.checkout_lifecycle = 'open' and v_completion_context)
      or (old.checkout_lifecycle = 'open' and new.checkout_lifecycle = 'expired_unpaid' and v_expiration_context)
      or (old.checkout_lifecycle = 'open' and new.checkout_lifecycle = 'paid' and v_paid_context)
    ) then
      raise exception 'invalid Checkout Session lifecycle transition: % -> %',
        old.checkout_lifecycle, new.checkout_lifecycle using errcode = '22000';
    end if;
  end if;

  if old.checkout_expiration_id is null
     and new.checkout_expiration_id is not null
     and not v_expiration_context then
    raise exception 'Checkout expiration evidence requires the signed expiration projector'
      using errcode = '22000';
  end if;

  if old.superseded_by_operation_pk is null
     and new.superseded_by_operation_pk is not null
     and not v_successor_context then
    raise exception 'Checkout successor binding requires the generation claim RPC'
      using errcode = '22000';
  end if;

  return new;
end;
$$;

-- Preserve the settlement enqueue validator byte-for-byte except for its one
-- historical one-operation lookup. pg_get_functiondef is guarded so migration
-- order drift fails instead of silently leaving an ambiguous consumer.
do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
     and o.operation_type = 'checkout_session.create'
   for share;$needle$;
  v_new text := $replacement$
     and o.operation_type = 'checkout_session.create'
     and o.id = new.current_checkout_operation_pk
     and o.checkout_lifecycle = 'paid'
     and o.superseded_by_operation_pk is null
   for share;$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.enqueue_one_off_direct_payment_settlement()'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'settlement source contract did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  if v_after = v_before
     or pg_catalog.strpos(
       v_after,
       'and o.id = new.current_checkout_operation_pk'
     ) = 0 then
    raise exception 'settlement Checkout operation lookup patch did not match exactly'
      using errcode = '55000';
  end if;
  execute v_after;
end
$$;

-- The bounded success selector must admit both the exact current generation
-- and a late success for an expired predecessor. The latter is intentionally
-- claimed so the generation-aware projector can terminalize it under the
-- Session mutex instead of leaving a signed contradiction in the queue.
do $$
declare
  v_before text;
  v_after text;
  v_old_schema text :=
    'and o.metadata #>> ''{schema}'' = ''one_off_direct_checkout_v1''';
  v_new_schema text :=
    'and o.metadata #>> ''{schema}'' = ''one_off_direct_checkout_generation_v2''';
  v_old_binding text := $needle$
          and p.stripe_checkout_session = o.provider_object_id
          and p.status::text in ('processing', 'paid')$needle$;
  v_new_binding text := $replacement$
          and (
            (
              p.current_checkout_operation_pk = o.id
              and p.stripe_checkout_session = o.provider_object_id
              and o.checkout_lifecycle in ('open', 'paid')
              and o.superseded_by_operation_pk is null
            )
            or (
              o.checkout_lifecycle = 'expired_unpaid'
              and o.checkout_expiration_id is not null
              and exists (
                select 1
                  from public.stripe_connected_checkout_expirations x
                 where x.id = o.checkout_expiration_id
                   and x.operation_pk = o.id
                   and x.checkout_session_id = o.provider_object_id
              )
            )
          )
          and p.status::text in ('processing', 'paid')$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.claim_next_due_stripe_connected_payment_event()'::pg_catalog.regprocedure
  );
  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old_schema, ''))
       is distinct from pg_catalog.length(v_old_schema)
     or pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old_binding, ''))
       is distinct from pg_catalog.length(v_old_binding) then
    raise exception 'connected payment worker source contract did not match exactly once'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old_schema, v_new_schema);
  v_after := pg_catalog.replace(v_after, v_old_binding, v_new_binding);
  if v_after = v_before
     or pg_catalog.strpos(v_after, 'p.current_checkout_operation_pk = o.id') = 0
     or pg_catalog.strpos(v_after, 'o.checkout_expiration_id is not null') = 0
     or pg_catalog.strpos(v_after, 'one_off_direct_checkout_generation_v2') = 0 then
    raise exception 'connected payment worker generation patch did not match exactly'
      using errcode = '55000';
  end if;
  execute v_after;
end
$$;


-- Keep the proven fresh-preparation implementation for pristine destination
-- rows. The public wrapper below owns every already-direct replay so the v1
-- body can never perform an ambiguous one-operation-per-payment lookup.
alter function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid)
  rename to prepare_one_off_direct_invoice_payment_v1_fresh_only;

revoke all on function public.prepare_one_off_direct_invoice_payment_v1_fresh_only(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

create function public.prepare_one_off_direct_invoice_payment(
  p_account_id uuid,
  p_job_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid
)
returns table (
  preparation_status text,
  account_id uuid,
  job_id uuid,
  invoice_id uuid,
  payment_id uuid,
  merchant_account_id text,
  livemode boolean,
  plan_code text,
  catalog_version text,
  fee_rate_bps integer,
  fee_rate numeric,
  gross_amount_cents bigint,
  eligible_service_subtotal_cents bigint,
  application_fee_cents bigint,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_charge_model text;
  v_account public.accounts%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_invoice public.invoices%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_expected_bps integer;
begin
  select p.charge_model into v_charge_model
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and p.job_id = p_job_id
     and p.invoice_id = p_invoice_id;
  if not found then
    raise exception 'one-off direct payment target was not found in the requested scope'
      using errcode = 'P0002';
  end if;

  if v_charge_model = 'destination' then
    return query
      select *
        from public.prepare_one_off_direct_invoice_payment_v1_fresh_only(
          p_account_id, p_job_id, p_invoice_id, p_payment_id
        );
    return;
  end if;
  if v_charge_model <> 'direct' then
    raise exception 'payment charge model is not supported by direct preparation'
      using errcode = '22000';
  end if;

  select a.* into v_account
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
     and a.merchant_livemode is not null
     and a.merchant_onboarding_state = 'ready'
     and a.merchant_disabled_at is null
     and a.merchant_dashboard_type = 'full'
     and a.merchant_card_payments_active
     and a.merchant_payouts_active
     and a.merchant_fees_collector = 'stripe'
     and a.merchant_losses_collector = 'stripe'
     and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
   for share;
  if not found then
    raise exception 'direct payment replay requires a current ready Stripe Merchant mapping'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id
     and p.job_id = p_job_id
     and p.invoice_id = p_invoice_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_account.stripe_merchant_account_id
     or v_payment.stripe_livemode is distinct from v_account.merchant_livemode
     or v_payment.reconciliation_status <> 'pending'
     or v_payment.reconciled_at is not null
     or v_payment.current_checkout_operation_pk is null
     or v_payment.paid_at is not null
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.refunded_amount is distinct from 0
     or v_payment.disputed_at is not null then
    raise exception 'prepared direct payment replay conflicts with its immutable provider snapshot'
      using errcode = '55000';
  end if;

  perform 1
    from public.billing_payment_operations locked_attempt
   where locked_attempt.payment_id = p_payment_id
     and locked_attempt.operation_type = 'checkout_session.create'
   order by locked_attempt.checkout_generation, locked_attempt.id
   for update;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = v_payment.current_checkout_operation_pk
     and o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id
     and o.operation_type = 'checkout_session.create'
     and o.superseded_by_operation_pk is null;
  if not found
     or v_operation.stripe_account_id is distinct from v_payment.stripe_account_id
     or v_operation.livemode is distinct from v_payment.stripe_livemode
     or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_operation.metadata #>> '{checkout_generation}')::integer
        is distinct from v_operation.checkout_generation
     or v_operation.state = 'failed'
     or (
       v_operation.state = 'succeeded'
       and (
         v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session
         or v_operation.checkout_lifecycle not in ('open', 'expired_unpaid')
         or v_operation.checkout_session_expires_at is null
       )
     )
     or (
       v_operation.state in ('claimed', 'submitted', 'indeterminate')
       and v_payment.stripe_checkout_session is not null
     ) then
    raise exception 'prepared direct payment replay does not match its exact current generation'
      using errcode = '55000';
  end if;

  select i.* into v_invoice
    from public.invoices i
   where i.id = p_invoice_id
     and i.account_id = p_account_id
     and i.job_id = p_job_id
     and i.status::text in ('sent', 'signed')
   for share;
  if not found or v_payment.amount is distinct from v_invoice.total then
    raise exception 'prepared direct payment replay no longer matches its locked invoice'
      using errcode = '55000';
  end if;

  select e.* into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for share;
  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125
    when 'solo' then 50
    when 'growth' then 25
    when 'scale' then 10
    else null
  end;
  if not found
     or v_entitlement.entitlement_state <> 'active'
     or v_entitlement.catalog_version <> '2026-08-15-preview'
     or v_entitlement.platform_fee_bps is distinct from v_expected_bps
     or v_payment.fee_plan_code is distinct from v_entitlement.plan_code
     or v_payment.fee_catalog_version is distinct from v_entitlement.catalog_version
     or v_payment.fee_rate_bps is distinct from v_entitlement.platform_fee_bps
     or v_payment.fee_rate is distinct from v_entitlement.platform_fee_bps::numeric / 10000
     or v_payment.platform_fee is distinct from pg_catalog.round(
       v_payment.fee_basis_amount * v_entitlement.platform_fee_bps::numeric / 10000,
       2
     ) then
    raise exception 'prepared direct payment replay no longer matches the current entitlement'
      using errcode = '55000';
  end if;

  return query select
    'replay'::text,
    v_payment.account_id,
    v_payment.job_id,
    v_payment.invoice_id,
    v_payment.id,
    v_payment.stripe_account_id,
    v_payment.stripe_livemode,
    v_payment.fee_plan_code,
    v_payment.fee_catalog_version,
    v_payment.fee_rate_bps,
    v_payment.fee_rate,
    (v_payment.amount * 100)::bigint,
    (v_payment.fee_basis_amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint,
    v_payment.reconciliation_status;
end;
$$;


create or replace function public.begin_one_off_direct_checkout_submission(
  p_operation_pk uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_predecessor public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout operation was not found' using errcode = 'P0002';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
     and a.merchant_onboarding_state = 'ready'
     and a.merchant_disabled_at is null
     and a.merchant_dashboard_type = 'full'
     and a.merchant_card_payments_active
     and a.merchant_payouts_active
     and a.merchant_fees_collector = 'stripe'
     and a.merchant_losses_collector = 'stripe'
     and a.merchant_configuration_api_version is not null
     and pg_catalog.length(pg_catalog.btrim(a.merchant_configuration_api_version)) > 0
     and a.merchant_configuration_snapshot is not null
     and pg_catalog.jsonb_typeof(a.merchant_configuration_snapshot) = 'object'
     and a.merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
     and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
   for share;
  if not found then
    raise exception 'Stripe Merchant readiness changed before Checkout submission'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for update;
  if not found then
    raise exception 'direct Checkout payment was not found' using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at is null
     or v_operation.lease_expires_at <= pg_catalog.now()
     or v_operation.superseded_by_operation_pk is not null
     or v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is not null
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_operation.livemode
     or (
       v_operation.checkout_generation = 1
       and v_payment.status::text <> 'requested'
     )
     or (
       v_operation.checkout_generation > 1
       and v_payment.status::text <> 'processing'
     ) then
    raise exception 'direct Checkout claim is not current, owned, or submit-ready'
      using errcode = '55000';
  end if;

  if v_operation.checkout_generation > 1 then
    select predecessor.* into v_predecessor
      from public.billing_payment_operations predecessor
     where predecessor.id = v_operation.predecessor_operation_pk
       and predecessor.payment_id = v_operation.payment_id
       and predecessor.checkout_generation = v_operation.checkout_generation - 1
       and predecessor.superseded_by_operation_pk = v_operation.id
       and predecessor.state = 'succeeded'
       and predecessor.checkout_lifecycle = 'expired_unpaid'
       and predecessor.checkout_expiration_id is not null
     for share;
    if not found then
      raise exception 'direct Checkout successor lost its authoritative predecessor binding'
        using errcode = '55000';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        v_payment.account_id,
        v_payment.stripe_account_id,
        v_payment.stripe_livemode,
        v_predecessor.provider_object_id
      )
    );
    if exists (
      select 1
        from public.billing_events success_event
       where success_event.provider = 'stripe'
         and success_event.event_scope = 'connected_payment'
         and success_event.account_id = v_payment.account_id
         and success_event.provider_account_id = v_payment.stripe_account_id
         and success_event.livemode = v_payment.stripe_livemode
         and success_event.event_type in (
           'checkout.session.completed',
           'checkout.session.async_payment_succeeded'
         )
         and success_event.payload #>> '{data_object,object}' = 'checkout.session'
         and success_event.payload #>> '{data_object,id}' = v_predecessor.provider_object_id
    ) then
      raise exception 'stripe_connected_checkout_expiration_conflict'
        using errcode = 'P0001';
    end if;
  end if;

  update public.billing_payment_operations o
     set state = 'submitted',
         submission_started_at = pg_catalog.now(),
         lease_expires_at = null,
         attempt_count = o.attempt_count + 1,
         last_error = null
   where o.id = p_operation_pk;

  return true;
end;
$$;

drop function public.complete_one_off_direct_checkout_operation(uuid, uuid, text);

create function public.complete_one_off_direct_checkout_operation(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_checkout_session_id text,
  p_checkout_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  if p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9_]+$'
     or pg_catalog.length(p_checkout_session_id) > 255
     or p_checkout_session_expires_at is null
     or p_checkout_session_expires_at <= pg_catalog.now()
     or p_checkout_session_expires_at > pg_catalog.now() + interval '25 hours' then
    raise exception 'invalid Stripe Checkout Session completion evidence'
      using errcode = '22023';
  end if;

  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout operation was not found' using errcode = 'P0002';
  end if;
  if (v_hint.livemode and p_checkout_session_id !~ '^cs_live_')
     or (not v_hint.livemode and p_checkout_session_id !~ '^cs_test_') then
    raise exception 'Stripe Checkout Session mode does not match its generation'
      using errcode = '22000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
   for share;
  if not found then
    raise exception 'direct Checkout Merchant mapping changed before completion'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for update;
  if not found then
    raise exception 'direct Checkout payment was not found' using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;

  if v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.superseded_by_operation_pk is not null
     or v_operation.provider_object_id is not null
     or v_operation.checkout_lifecycle is not null
     or v_operation.checkout_session_expires_at is not null
     or v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is not null
     or v_payment.account_id is distinct from v_operation.account_id
     or v_payment.stripe_account_id is distinct from v_operation.stripe_account_id
     or v_payment.stripe_livemode is distinct from v_operation.livemode
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text not in ('requested', 'processing')
     or v_payment.reconciliation_status <> 'pending'
     or v_payment.stripe_payment_intent is not null
     or v_payment.stripe_charge_id is not null
     or v_payment.paid_at is not null then
    raise exception 'direct Checkout provider result does not match its exact current generation'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.stripe_connected_checkout_session_mutex_key(
      v_payment.account_id,
      v_payment.stripe_account_id,
      v_payment.stripe_livemode,
      p_checkout_session_id
    )
  );
  if exists (
    select 1
      from public.billing_events expiration_event
     where expiration_event.provider = 'stripe'
       and expiration_event.event_scope = 'connected_payment'
       and expiration_event.event_type = 'checkout.session.expired'
       and expiration_event.account_id = v_payment.account_id
       and expiration_event.provider_account_id = v_payment.stripe_account_id
       and expiration_event.livemode = v_payment.stripe_livemode
       and expiration_event.payload #>> '{data_object,object}' = 'checkout.session'
       and expiration_event.payload #>> '{data_object,id}' = p_checkout_session_id
  ) then
    raise exception 'new direct Checkout generation already has contradictory expiration receipt'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config(
    'lgq.direct_checkout_completion_operation_pk',
    v_operation.id::text,
    true
  );
  update public.billing_payment_operations o
     set state = 'succeeded',
         provider_object_id = p_checkout_session_id,
         checkout_lifecycle = 'open',
         checkout_session_expires_at = p_checkout_session_expires_at,
         completed_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null
   where o.id = v_operation.id;
  perform pg_catalog.set_config('lgq.direct_checkout_completion_operation_pk', '', true);

  perform pg_catalog.set_config(
    'lgq.direct_checkout_pointer_payment_id',
    v_payment.id::text,
    true
  );
  update public.payments p
     set stripe_checkout_session = p_checkout_session_id,
         status = 'processing'
   where p.id = v_payment.id
     and p.current_checkout_operation_pk = v_operation.id;
  perform pg_catalog.set_config('lgq.direct_checkout_pointer_payment_id', '', true);
  if not found then
    raise exception 'direct Checkout payment pointer changed during completion'
      using errcode = '40001';
  end if;

  return true;
end;
$$;

create or replace function public.mark_one_off_direct_checkout_indeterminate(
  p_operation_pk uuid,
  p_claim_token uuid,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_hint public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
begin
  select o.* into v_hint
    from public.billing_payment_operations o
   where o.id = p_operation_pk;
  if not found
     or v_hint.operation_type <> 'checkout_session.create' then
    raise exception 'direct Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_hint.account_id
     and a.stripe_merchant_account_id = v_hint.stripe_account_id
     and a.merchant_livemode = v_hint.livemode
   for key share;
  if not found then
    raise exception 'direct Checkout Merchant mapping changed before indeterminate transition'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_hint.payment_id
     and p.account_id = v_hint.account_id
   for update;
  if not found then
    raise exception 'direct Checkout indeterminate attempt payment was not found'
      using errcode = 'P0002';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = p_operation_pk
   for update;
  if not found
     or v_operation.operation_type <> 'checkout_session.create'
     or v_operation.state <> 'submitted'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.superseded_by_operation_pk is not null then
    raise exception 'direct Checkout submission is not owned by this claim'
      using errcode = '55000';
  end if;

  if v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is not null then
    raise exception 'direct Checkout indeterminate attempt is no longer current'
      using errcode = '55000';
  end if;

  update public.billing_payment_operations o
     set state = 'indeterminate',
         claim_token = null,
         lease_expires_at = null,
         last_error = pg_catalog.left(coalesce(p_last_error, 'unknown provider outcome'), 1000)
   where o.id = p_operation_pk;

  return true;
end;
$$;


revoke all on function public.protect_billing_payment_operation()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_direct_checkout_session_identity_trigger
  on public.payments;

create or replace function public.protect_direct_checkout_session_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_operation public.billing_payment_operations%rowtype;
begin
  if old.current_checkout_operation_pk is not distinct from new.current_checkout_operation_pk
     and old.stripe_checkout_session is not distinct from new.stripe_checkout_session then
    return new;
  end if;

  -- Preserve the legacy destination rail exactly. This trigger owns only the
  -- generation-aware direct pointer/Session pair; destination Session identity
  -- continues to be governed by its existing rail.
  if old.charge_model <> 'direct' and new.charge_model <> 'direct' then
    return new;
  end if;

  if old.charge_model <> 'direct' or new.charge_model <> 'direct' then
    raise exception 'Checkout current pointer belongs only to direct payments'
      using errcode = '22000';
  end if;
  if current_user in ('anon', 'authenticated', 'service_role')
     or coalesce(
       pg_catalog.current_setting('lgq.direct_checkout_pointer_payment_id', true),
       ''
     ) <> old.id::text then
    raise exception 'direct payment Checkout current pointer is backend-managed'
      using errcode = '42501';
  end if;
  if new.current_checkout_operation_pk is null then
    raise exception 'direct payment Checkout current operation cannot be cleared'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.id = new.current_checkout_operation_pk
     and o.payment_id = new.id
     and o.account_id = new.account_id
     and o.stripe_account_id = new.stripe_account_id
     and o.livemode = new.stripe_livemode
     and o.charge_model = 'direct'
     and o.operation_type = 'checkout_session.create';
  if not found or v_operation.superseded_by_operation_pk is not null then
    raise exception 'direct payment Checkout current pointer is not the unsuperseded attempt'
      using errcode = '22000';
  end if;

  if new.stripe_checkout_session is null then
    if v_operation.state not in ('claimed', 'submitted', 'indeterminate')
       or v_operation.provider_object_id is not null
       or v_operation.checkout_lifecycle is not null
       or (
         v_operation.checkout_generation = 1
         and old.current_checkout_operation_pk is not null
       ) then
      raise exception 'direct payment null Session pointer requires an unsubmitted successor'
        using errcode = '22000';
    end if;
  elsif v_operation.state <> 'succeeded'
        or v_operation.provider_object_id is distinct from new.stripe_checkout_session
        or v_operation.checkout_lifecycle not in ('open', 'paid')
        or v_operation.checkout_session_expires_at is null then
    raise exception 'direct payment Session pointer does not match its succeeded current attempt'
      using errcode = '22000';
  end if;

  return new;
end;
$$;

create trigger protect_direct_checkout_session_identity_trigger
before update of current_checkout_operation_pk, stripe_checkout_session
on public.payments
for each row execute function public.protect_direct_checkout_session_identity();

revoke all on function public.protect_direct_checkout_session_identity()
  from public, anon, authenticated, service_role;

drop function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, text, text, text, bigint, bigint, bigint,
  text, text, integer, numeric
);

create function public.claim_one_off_direct_checkout_operation(
  p_account_id uuid,
  p_payment_id uuid,
  p_stripe_account_id text,
  p_livemode boolean,
  p_checkout_generation integer,
  p_predecessor_operation_pk uuid,
  p_operation_id text,
  p_stripe_idempotency_key text,
  p_request_fingerprint text,
  p_gross_amount_cents bigint,
  p_fee_basis_amount_cents bigint,
  p_application_fee_cents bigint,
  p_fee_plan_code text,
  p_fee_catalog_version text,
  p_fee_rate_bps integer,
  p_fee_rate numeric
)
returns table (
  claim_status text,
  operation_pk uuid,
  claim_token uuid,
  operation_state text,
  provider_object_id text,
  checkout_generation integer,
  checkout_lifecycle text,
  checkout_session_expires_at timestamptz,
  predecessor_operation_pk uuid
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_current public.billing_payment_operations%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_entitlement public.workspace_entitlements%rowtype;
  v_invoice public.invoices%rowtype;
  v_expiration public.stripe_connected_checkout_expirations%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_new_operation_pk uuid := pg_catalog.gen_random_uuid();
  v_expected_operation_id text;
  v_expected_bps integer;
begin
  v_expected_operation_id :=
    'payment:' || p_payment_id::text || ':checkout:' || p_checkout_generation::text;

  if p_account_id is null
     or p_payment_id is null
     or p_stripe_account_id is null
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_livemode is null
     or p_checkout_generation is null
     -- Generation 6 is accepted only as a read-only cap probe below. No row
     -- can be inserted beyond the database-enforced maximum of five.
     or p_checkout_generation not between 1 and 6
     or p_operation_id is distinct from v_expected_operation_id
     or pg_catalog.length(p_operation_id) > 200
     or p_stripe_idempotency_key is null
     or p_stripe_idempotency_key !~ '^lgq:direct:v1:checkout_session[.]create:[0-9a-f]{64}$'
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid generation-aware direct Checkout claim identity'
      using errcode = '22023';
  end if;
  if (p_checkout_generation = 1 and p_predecessor_operation_pk is not null)
     or (p_checkout_generation > 1 and p_predecessor_operation_pk is null) then
    raise exception 'direct Checkout predecessor does not match its generation'
      using errcode = '22023';
  end if;
  if p_gross_amount_cents is null or p_gross_amount_cents <= 0
     or p_fee_basis_amount_cents is null or p_fee_basis_amount_cents < 0
     or p_fee_basis_amount_cents > p_gross_amount_cents
     or p_application_fee_cents is null or p_application_fee_cents < 0
     or p_application_fee_cents > p_fee_basis_amount_cents
     or p_fee_rate_bps is null or p_fee_rate_bps not between 0 and 10000
     or p_fee_rate is null
     or p_fee_rate <> p_fee_rate_bps::numeric / 10000
     or p_fee_plan_code not in ('flex', 'solo', 'growth', 'scale', 'enterprise')
     or p_fee_catalog_version is null
     or pg_catalog.length(pg_catalog.btrim(p_fee_catalog_version)) not between 1 and 100 then
    raise exception 'invalid generation-aware direct Checkout fee snapshot'
      using errcode = '22023';
  end if;

  -- Required recovery lock order: account, payment, then every attempt in
  -- generation order. No Stripe call can happen until this transaction has
  -- committed its exact claimed current attempt.
  perform 1
    from public.accounts a
   where a.id = p_account_id
     and a.stripe_merchant_account_id = p_stripe_account_id
     and a.merchant_livemode = p_livemode
     and a.merchant_onboarding_state = 'ready'
     and a.merchant_disabled_at is null
     and a.merchant_dashboard_type = 'full'
     and a.merchant_card_payments_active
     and a.merchant_payouts_active
     and a.merchant_fees_collector = 'stripe'
     and a.merchant_losses_collector = 'stripe'
     and a.merchant_configuration_api_version is not null
     and pg_catalog.length(pg_catalog.btrim(a.merchant_configuration_api_version)) > 0
     and a.merchant_configuration_snapshot is not null
     and pg_catalog.jsonb_typeof(a.merchant_configuration_snapshot) = 'object'
     and a.merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'
     and a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'
   for share;
  if not found then
    raise exception 'direct Checkout requires a recently verified, ready Stripe Merchant account'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_account_id
   for update;
  if not found then
    raise exception 'direct Checkout payment was not found in the requested account'
      using errcode = 'P0002';
  end if;

  perform 1
    from public.billing_payment_operations locked_attempt
   where locked_attempt.payment_id = p_payment_id
     and locked_attempt.operation_type = 'checkout_session.create'
   order by locked_attempt.checkout_generation, locked_attempt.id
   for update;

  if v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from p_stripe_account_id
     or v_payment.stripe_livemode is distinct from p_livemode
     or v_payment.amount is distinct from p_gross_amount_cents::numeric / 100
     or v_payment.fee_basis_amount is distinct from p_fee_basis_amount_cents::numeric / 100
     or v_payment.platform_fee is distinct from p_application_fee_cents::numeric / 100
     or v_payment.fee_plan_code is distinct from p_fee_plan_code
     or v_payment.fee_catalog_version is distinct from p_fee_catalog_version
     or v_payment.fee_rate_bps is distinct from p_fee_rate_bps
     or v_payment.fee_rate is distinct from p_fee_rate then
    raise exception 'direct Checkout input does not exactly match the immutable payment fee snapshot'
      using errcode = '22000';
  end if;

  select e.* into v_entitlement
    from public.workspace_entitlements e
   where e.account_id = p_account_id
   for share;
  v_expected_bps := case v_entitlement.plan_code
    when 'flex' then 125
    when 'solo' then 50
    when 'growth' then 25
    when 'scale' then 10
    else null
  end;
  if not found
     or v_entitlement.entitlement_state <> 'active'
     or v_entitlement.catalog_version <> '2026-08-15-preview'
     or v_entitlement.platform_fee_bps is distinct from v_expected_bps
     or not (
       (v_entitlement.plan_code = 'flex'
         and v_entitlement.billing_interval = 'none'
         and v_entitlement.billing_status = 'free')
       or
       (v_entitlement.plan_code in ('solo', 'growth', 'scale')
         and v_entitlement.billing_interval in ('monthly', 'annual')
         and v_entitlement.billing_status = 'active'
         and v_entitlement.period_start is not null
         and v_entitlement.period_end > pg_catalog.now())
     )
     or v_entitlement.plan_code is distinct from p_fee_plan_code
     or v_entitlement.catalog_version is distinct from p_fee_catalog_version
     or v_entitlement.platform_fee_bps is distinct from p_fee_rate_bps then
    raise exception 'direct Checkout requires the exact current entitlement and frozen fee snapshot'
      using errcode = '55000';
  end if;

  if v_payment.current_checkout_operation_pk is not null then
    select o.* into v_current
      from public.billing_payment_operations o
     where o.id = v_payment.current_checkout_operation_pk
       and o.payment_id = p_payment_id
       and o.account_id = p_account_id
       and o.operation_type = 'checkout_session.create'
       and o.superseded_by_operation_pk is null;
    if not found then
      raise exception 'direct Checkout payment current attempt pointer is invalid'
        using errcode = 'P0001';
    end if;
  elsif exists (
    select 1
      from public.billing_payment_operations o
     where o.payment_id = p_payment_id
       and o.operation_type = 'checkout_session.create'
  ) then
    raise exception 'direct Checkout operation ledger is missing its current payment pointer'
      using errcode = 'P0001';
  end if;

  -- Same-generation calls are pure durable retries/replays. Submitted and
  -- indeterminate attempts are never converted into a new provider mutation.
  if v_current.id is not null and p_checkout_generation = v_current.checkout_generation then
    v_operation := v_current;
    if v_operation.predecessor_operation_pk is distinct from p_predecessor_operation_pk
       or v_operation.operation_id is distinct from p_operation_id
       or v_operation.stripe_idempotency_key is distinct from p_stripe_idempotency_key
       or v_operation.request_fingerprint is distinct from p_request_fingerprint
       or v_operation.stripe_account_id is distinct from p_stripe_account_id
       or v_operation.livemode is distinct from p_livemode
       or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_generation_v2'
       or (v_operation.metadata #>> '{checkout_generation}')::integer
          is distinct from p_checkout_generation then
      raise exception 'Checkout generation was already claimed with different immutable input'
        using errcode = '22000';
    end if;

    if v_operation.state = 'succeeded' then
      if v_operation.provider_object_id is null
         or v_payment.stripe_checkout_session is distinct from v_operation.provider_object_id
         or v_payment.current_checkout_operation_pk is distinct from v_operation.id then
        raise exception 'succeeded direct Checkout generation is not the exact payment current pointer'
          using errcode = 'P0001';
      end if;
      return query select
        'replay'::text, v_operation.id, null::uuid, v_operation.state,
        v_operation.provider_object_id, v_operation.checkout_generation,
        v_operation.checkout_lifecycle, v_operation.checkout_session_expires_at,
        v_operation.predecessor_operation_pk;
      return;
    end if;

    if v_operation.state = 'claimed'
       and v_operation.lease_expires_at <= pg_catalog.now() then
      update public.billing_payment_operations o
         set claim_token = v_claim_token,
             lease_expires_at = pg_catalog.now() + interval '5 minutes',
             last_error = null
       where o.id = v_operation.id
      returning * into v_operation;
      return query select
        'claimed'::text, v_operation.id, v_operation.claim_token,
        v_operation.state, v_operation.provider_object_id,
        v_operation.checkout_generation, v_operation.checkout_lifecycle,
        v_operation.checkout_session_expires_at,
        v_operation.predecessor_operation_pk;
      return;
    end if;

    return query select
      case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end,
      v_operation.id, null::uuid, v_operation.state,
      v_operation.provider_object_id, v_operation.checkout_generation,
      v_operation.checkout_lifecycle, v_operation.checkout_session_expires_at,
      v_operation.predecessor_operation_pk;
    return;
  end if;

  if v_current.id is null then
    if p_checkout_generation <> 1
       or p_predecessor_operation_pk is not null
       or v_payment.status::text <> 'requested'
       or v_payment.current_checkout_operation_pk is not null
       or v_payment.stripe_checkout_session is not null
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null
       or v_payment.paid_at is not null then
      raise exception 'first direct Checkout generation requires a pristine requested payment'
        using errcode = '55000';
    end if;
  else
    if p_checkout_generation <> v_current.checkout_generation + 1
       or p_predecessor_operation_pk is distinct from v_current.id then
      raise exception 'direct Checkout successor must bind the exact current predecessor generation'
        using errcode = '22000';
    end if;
    if v_current.checkout_generation >= 5 then
      return query select
        'generation_cap'::text, v_current.id, null::uuid, v_current.state,
        v_current.provider_object_id, v_current.checkout_generation,
        v_current.checkout_lifecycle, v_current.checkout_session_expires_at,
        v_current.predecessor_operation_pk;
      return;
    end if;
    if v_current.state <> 'succeeded'
       or v_current.checkout_lifecycle <> 'expired_unpaid'
       or v_current.checkout_expiration_id is null
       or v_current.provider_object_id is null
       or v_current.checkout_session_expires_at is null
       or v_payment.status::text <> 'processing'
       or v_payment.reconciliation_status <> 'pending'
       or v_payment.current_checkout_operation_pk is distinct from v_current.id
       or v_payment.stripe_checkout_session is distinct from v_current.provider_object_id
       or v_payment.stripe_payment_intent is not null
       or v_payment.stripe_charge_id is not null
       or v_payment.stripe_application_fee_id is not null
       or v_payment.stripe_balance_transaction_id is not null
       or v_payment.paid_at is not null
       or v_payment.refunded_amount is distinct from 0
       or v_payment.eligible_service_refunded_amount is distinct from 0
       or v_payment.platform_fee_refunded is distinct from 0
       or v_payment.refunded_at is not null
       or v_payment.stripe_latest_refund_id is not null
       or v_payment.stripe_latest_application_fee_refund_id is not null
       or v_payment.disputed_at is not null
       or v_payment.dispute_reason is not null
       or v_payment.dispute_status is not null
       or v_payment.stripe_dispute_id is not null
       or v_payment.dispute_due_by is not null
       or v_payment.failure_code is not null
       or v_payment.failure_message is not null
       or v_payment.failed_at is not null
       or v_payment.dunning_attempts <> 0
       or v_payment.charge_attempts <> 0
       or v_payment.next_retry_at is not null
       or v_payment.dunning_state is not null then
      raise exception 'direct Checkout successor is blocked by payment or attempt state'
        using errcode = '55000';
    end if;

    select x.* into v_expiration
      from public.stripe_connected_checkout_expirations x
     where x.id = v_current.checkout_expiration_id
       and x.operation_pk = v_current.id
       and x.payment_id = v_payment.id
       and x.account_id = v_payment.account_id
       and x.checkout_generation = v_current.checkout_generation
       and x.stripe_account_id = v_payment.stripe_account_id
       and x.livemode = v_payment.stripe_livemode
       and x.checkout_session_id = v_current.provider_object_id
       and x.session_expires_at = v_current.checkout_session_expires_at
       and x.observed_session_status = 'expired'
       and x.observed_payment_status = 'unpaid'
       and x.observed_currency = 'usd'
       and x.observed_payment_method_types = array['card']::text[]
       and x.observed_payment_intent_id is null
       and x.observed_recovered_from is null
     for share;
    if not found then
      raise exception 'direct Checkout successor lacks exact signed expired-unpaid evidence'
        using errcode = '55000';
    end if;

    if v_payment.invoice_id is null then
      raise exception 'direct Checkout successor payment has no locked invoice'
        using errcode = '55000';
    end if;
    select i.* into v_invoice
      from public.invoices i
     where i.id = v_payment.invoice_id
       and i.account_id = v_payment.account_id
       and i.job_id = v_payment.job_id
       and i.status::text in ('sent', 'signed')
     for share;
    if not found then
      raise exception 'direct Checkout successor invoice is no longer payment-locked'
        using errcode = '55000';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      public.stripe_connected_checkout_session_mutex_key(
        v_payment.account_id,
        v_payment.stripe_account_id,
        v_payment.stripe_livemode,
        v_current.provider_object_id
      )
    );
    if exists (
      select 1
        from public.billing_events success_event
       where success_event.provider = 'stripe'
         and success_event.event_scope = 'connected_payment'
         and success_event.account_id = v_payment.account_id
         and success_event.provider_account_id = v_payment.stripe_account_id
         and success_event.livemode = v_payment.stripe_livemode
         and success_event.event_type in (
           'checkout.session.completed',
           'checkout.session.async_payment_succeeded'
         )
         and success_event.payload #>> '{data_object,object}' = 'checkout.session'
         and success_event.payload #>> '{data_object,id}' = v_current.provider_object_id
    ) then
      raise exception 'stripe_connected_checkout_expiration_conflict'
        using errcode = 'P0001';
    end if;
    if p_stripe_idempotency_key = v_current.stripe_idempotency_key
       or p_request_fingerprint = v_current.request_fingerprint then
      raise exception 'direct Checkout successor requires generation-specific provider identity'
        using errcode = '22000';
    end if;

    perform pg_catalog.set_config(
      'lgq.direct_checkout_successor_predecessor_pk',
      v_current.id::text,
      true
    );
    update public.billing_payment_operations o
       set superseded_by_operation_pk = v_new_operation_pk,
           superseded_at = pg_catalog.now()
     where o.id = v_current.id
       and o.superseded_by_operation_pk is null;
    if not found then
      raise exception 'direct Checkout predecessor was concurrently superseded'
        using errcode = '40001';
    end if;
    perform pg_catalog.set_config('lgq.direct_checkout_successor_predecessor_pk', '', true);
  end if;

  insert into public.billing_payment_operations (
    id, account_id, payment_id, operation_type, operation_id, charge_model,
    stripe_account_id, livemode, stripe_idempotency_key, request_fingerprint,
    state, attempt_count, claim_token, lease_expires_at, metadata,
    checkout_generation, predecessor_operation_pk
  ) values (
    v_new_operation_pk, p_account_id, p_payment_id, 'checkout_session.create',
    p_operation_id, 'direct', p_stripe_account_id, p_livemode,
    p_stripe_idempotency_key, p_request_fingerprint, 'claimed', 0,
    v_claim_token, pg_catalog.now() + interval '5 minutes',
    pg_catalog.jsonb_build_object(
      'schema', 'one_off_direct_checkout_generation_v2',
      'checkout_generation', p_checkout_generation,
      'predecessor_operation_pk', p_predecessor_operation_pk,
      'predecessor_checkout_session_id', v_current.provider_object_id,
      'fee_snapshot', pg_catalog.jsonb_build_object(
        'plan_code', p_fee_plan_code,
        'catalog_version', p_fee_catalog_version,
        'fee_rate_bps', p_fee_rate_bps,
        'fee_rate', p_fee_rate,
        'gross_amount_cents', p_gross_amount_cents,
        'eligible_service_subtotal_cents', p_fee_basis_amount_cents,
        'application_fee_cents', p_application_fee_cents
      )
    ),
    p_checkout_generation, p_predecessor_operation_pk
  )
  returning * into v_operation;

  perform pg_catalog.set_config(
    'lgq.direct_checkout_pointer_payment_id',
    p_payment_id::text,
    true
  );
  update public.payments p
     set current_checkout_operation_pk = v_operation.id,
         stripe_checkout_session = null
   where p.id = p_payment_id
     and p.account_id = p_account_id;
  perform pg_catalog.set_config('lgq.direct_checkout_pointer_payment_id', '', true);

  return query select
    'claimed'::text, v_operation.id, v_operation.claim_token,
    v_operation.state, v_operation.provider_object_id,
    v_operation.checkout_generation, v_operation.checkout_lifecycle,
    v_operation.checkout_session_expires_at,
    v_operation.predecessor_operation_pk;
end;
$$;

create or replace function public.resolve_stripe_connected_payment_projection_binding(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_workspace_id uuid,
  p_payment_id uuid,
  p_operation_id text
)
returns table (
  operation_pk uuid,
  workspace_id uuid,
  payment_id uuid,
  operation_id text,
  checkout_session_id text,
  merchant_account_id text,
  livemode boolean,
  amount_cents bigint,
  application_fee_cents bigint,
  payment_status text,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_payment public.payments%rowtype;
  v_checkout_session_id text;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_workspace_id is null
     or p_payment_id is null
     or p_operation_id is null
     or pg_catalog.length(pg_catalog.btrim(p_operation_id)) not between 1 and 200
     or p_operation_id ~ '[[:cntrl:]]' then
    raise exception 'connected payment projection binding input is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now()
     or v_event.account_id is distinct from p_workspace_id then
    raise exception 'connected payment projection claim is not owned or expired'
      using errcode = '55000';
  end if;
  v_checkout_session_id := v_event.payload #>> '{data_object,id}';

  perform 1
    from public.accounts a
   where a.id = v_event.account_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment workspace and Merchant mapping do not match'
      using errcode = '22000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
     and p.account_id = p_workspace_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id
     or v_payment.stripe_livemode is distinct from v_event.livemode
     or v_payment.status::text not in ('processing', 'paid')
     or v_payment.reconciliation_status not in ('pending', 'reconciled')
     or v_payment.amount <= 0
     or v_payment.platform_fee is null then
    raise exception 'connected payment does not match the immutable payment scope'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.payment_id = p_payment_id
     and o.account_id = p_workspace_id
     and o.operation_type = 'checkout_session.create'
     and o.operation_id = pg_catalog.btrim(p_operation_id)
     and o.provider_object_id = v_checkout_session_id
   for share;
  if not found
     or v_operation.state <> 'succeeded'
     or v_operation.charge_model <> 'direct'
     or v_operation.stripe_account_id is distinct from v_event.provider_account_id
     or v_operation.livemode is distinct from v_event.livemode
     or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_operation.metadata #>> '{checkout_generation}')::integer
        is distinct from v_operation.checkout_generation
     or pg_catalog.jsonb_typeof(v_operation.metadata #> '{fee_snapshot}') is distinct from 'object' then
    raise exception 'connected payment Checkout generation does not match the event'
      using errcode = '22000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.stripe_connected_checkout_session_mutex_key(
      v_payment.account_id,
      v_payment.stripe_account_id,
      v_payment.stripe_livemode,
      v_checkout_session_id
    )
  );
  if v_operation.checkout_lifecycle = 'expired_unpaid'
     or v_operation.checkout_expiration_id is not null
     or exists (
       select 1
         from public.stripe_connected_checkout_expirations x
        where x.operation_pk = v_operation.id
          and x.checkout_session_id = v_checkout_session_id
     ) then
    raise exception 'stripe_connected_checkout_expiration_conflict'
      using errcode = 'P0001';
  end if;

  if v_operation.checkout_lifecycle not in ('open', 'paid')
     or v_operation.superseded_by_operation_pk is not null
     or v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is distinct from v_checkout_session_id then
    raise exception 'connected payment is not bound to the exact current Checkout generation'
      using errcode = '22000';
  end if;

  return query select
    v_operation.id, v_payment.account_id, v_payment.id, v_operation.operation_id,
    v_checkout_session_id, v_payment.stripe_account_id,
    v_payment.stripe_livemode, (v_payment.amount * 100)::bigint,
    (v_payment.platform_fee * 100)::bigint, v_payment.status::text,
    v_payment.reconciliation_status;
end;
$$;

create or replace function public.project_stripe_connected_payment_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  processing_status text,
  payment_id uuid,
  workspace_id uuid,
  projection_applied boolean,
  reconciliation_status text
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_payment public.payments%rowtype;
  v_operation public.billing_payment_operations%rowtype;
  v_expected_keys text[] := array[
    'schema', 'provider_event_id', 'event_type', 'event_created_at',
    'workspace_id', 'payment_id', 'operation_id', 'checkout_session_id',
    'payment_intent_id', 'charge_id', 'application_fee_id',
    'balance_transaction_id', 'merchant_account_id', 'livemode', 'currency',
    'amount_cents', 'application_fee_cents', 'paid_at',
    'reconciliation_status'
  ];
  v_workspace_id uuid;
  v_payment_id uuid;
  v_event_created_at timestamptz;
  v_paid_at timestamptz;
  v_amount_cents bigint;
  v_application_fee_cents bigint;
  v_reconciliation_status text;
  v_application_fee_id text;
  v_balance_transaction_id text;
  v_final_reconciliation_status text;
  v_applied boolean;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object'
     or not (p_projection ?& v_expected_keys)
     or (p_projection - v_expected_keys) <> '{}'::jsonb then
    raise exception 'connected payment projection shape is invalid'
      using errcode = '22023';
  end if;

  begin
    v_workspace_id := (p_projection ->> 'workspace_id')::uuid;
    v_payment_id := (p_projection ->> 'payment_id')::uuid;
    v_event_created_at := (p_projection ->> 'event_created_at')::timestamptz;
    v_paid_at := (p_projection ->> 'paid_at')::timestamptz;
    v_amount_cents := (p_projection ->> 'amount_cents')::bigint;
    v_application_fee_cents := (p_projection ->> 'application_fee_cents')::bigint;
  exception when others then
    raise exception 'connected payment projection scalar is invalid'
      using errcode = '22023';
  end;
  v_reconciliation_status := p_projection ->> 'reconciliation_status';
  v_application_fee_id := p_projection ->> 'application_fee_id';
  v_balance_transaction_id := p_projection ->> 'balance_transaction_id';

  if p_projection ->> 'schema' is distinct from 'stripe_connected_payment_projection_v1'
     or p_projection ->> 'event_type' is distinct from 'checkout.session.completed'
     or p_projection ->> 'currency' is distinct from 'usd'
     or pg_catalog.jsonb_typeof(p_projection -> 'livemode') is distinct from 'boolean'
     or p_projection ->> 'provider_event_id' !~ '^evt_[A-Za-z0-9_]{8,}$'
     or p_projection ->> 'checkout_session_id' !~ '^cs_[A-Za-z0-9_]+$'
     or p_projection ->> 'payment_intent_id' !~ '^pi_[A-Za-z0-9_]+$'
     or p_projection ->> 'charge_id' !~ '^ch_[A-Za-z0-9_]+$'
     or p_projection ->> 'merchant_account_id' !~ '^acct_[A-Za-z0-9]{8,}$'
     or p_projection ->> 'operation_id' is null
     or pg_catalog.length(pg_catalog.btrim(p_projection ->> 'operation_id')) not between 1 and 200
     or p_projection ->> 'operation_id' ~ '[[:cntrl:]]'
     or v_workspace_id is null
     or v_payment_id is null
     or v_event_created_at <= '2000-01-01 00:00:00+00'::timestamptz
     or v_paid_at <= '2000-01-01 00:00:00+00'::timestamptz
     or v_paid_at > v_event_created_at
     or v_amount_cents <= 0
     or v_application_fee_cents < 0
     or v_application_fee_cents > v_amount_cents
     or v_reconciliation_status not in ('pending', 'reconciled')
     or (v_application_fee_id is not null and v_application_fee_id !~ '^fee_[A-Za-z0-9_]+$')
     or (v_balance_transaction_id is not null and v_balance_transaction_id !~ '^txn_[A-Za-z0-9_]+$')
     or (v_application_fee_cents = 0 and v_application_fee_id is not null)
     or (
       v_reconciliation_status = 'reconciled'
       and (
         v_balance_transaction_id is null
         or (v_application_fee_cents > 0 and v_application_fee_id is null)
       )
     ) then
    raise exception 'connected payment projection contract is invalid'
      using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.provider <> 'stripe'
     or v_event.event_scope <> 'connected_payment'
     or v_event.event_type <> 'checkout.session.completed'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now()
     or v_event.provider_event_id is distinct from (p_projection ->> 'provider_event_id')
     or v_event.provider_created_at is distinct from v_event_created_at
     or v_event.account_id is distinct from v_workspace_id
     or v_event.provider_account_id is distinct from (p_projection ->> 'merchant_account_id')
     or v_event.livemode is distinct from (p_projection ->> 'livemode')::boolean
     or v_event.payload #>> '{data_object,id}' is distinct from (p_projection ->> 'checkout_session_id') then
    raise exception 'connected payment projection does not match its owned inbox event'
      using errcode = '55000';
  end if;

  perform 1
    from public.accounts a
   where a.id = v_workspace_id
     and a.stripe_merchant_account_id = v_event.provider_account_id
     and a.merchant_livemode = v_event.livemode
   for key share;
  if not found then
    raise exception 'connected payment projection workspace mapping changed'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_payment_id
     and p.account_id = v_workspace_id
   for update;
  if not found
     or v_payment.charge_model <> 'direct'
     or v_payment.stripe_account_id is distinct from v_event.provider_account_id
     or v_payment.stripe_livemode is distinct from v_event.livemode
     or (v_payment.amount * 100)::bigint is distinct from v_amount_cents
     or (v_payment.platform_fee * 100)::bigint is distinct from v_application_fee_cents
     or v_payment.status::text not in ('processing', 'paid')
     or v_payment.reconciliation_status not in ('pending', 'reconciled')
     or (v_payment.stripe_payment_intent is not null
       and v_payment.stripe_payment_intent is distinct from (p_projection ->> 'payment_intent_id'))
     or (v_payment.stripe_charge_id is not null
       and v_payment.stripe_charge_id is distinct from (p_projection ->> 'charge_id'))
     or (v_payment.stripe_application_fee_id is not null
       and v_payment.stripe_application_fee_id is distinct from v_application_fee_id)
     or (v_payment.stripe_balance_transaction_id is not null
       and v_payment.stripe_balance_transaction_id is distinct from v_balance_transaction_id)
     or (v_payment.paid_at is not null and v_payment.paid_at is distinct from v_paid_at) then
    raise exception 'connected payment projection conflicts with immutable payment truth'
      using errcode = '22000';
  end if;

  select o.* into v_operation
    from public.billing_payment_operations o
   where o.payment_id = v_payment.id
     and o.account_id = v_payment.account_id
     and o.operation_type = 'checkout_session.create'
     and o.operation_id = pg_catalog.btrim(p_projection ->> 'operation_id')
     and o.provider_object_id = p_projection ->> 'checkout_session_id'
   for share;
  if not found
     or v_operation.state <> 'succeeded'
     or v_operation.stripe_account_id is distinct from v_payment.stripe_account_id
     or v_operation.livemode is distinct from v_payment.stripe_livemode
     or v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_generation_v2'
     or (v_operation.metadata #>> '{checkout_generation}')::integer
        is distinct from v_operation.checkout_generation then
    raise exception 'connected payment projection conflicts with immutable Checkout generation'
      using errcode = '22000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.stripe_connected_checkout_session_mutex_key(
      v_payment.account_id,
      v_payment.stripe_account_id,
      v_payment.stripe_livemode,
      p_projection ->> 'checkout_session_id'
    )
  );
  if v_operation.checkout_lifecycle = 'expired_unpaid'
     or v_operation.checkout_expiration_id is not null
     or exists (
       select 1
         from public.stripe_connected_checkout_expirations x
        where x.operation_pk = v_operation.id
          and x.checkout_session_id = p_projection ->> 'checkout_session_id'
     ) then
    raise exception 'stripe_connected_checkout_expiration_conflict'
      using errcode = 'P0001';
  end if;
  if v_operation.checkout_lifecycle not in ('open', 'paid')
     or v_operation.superseded_by_operation_pk is not null
     or v_payment.current_checkout_operation_pk is distinct from v_operation.id
     or v_payment.stripe_checkout_session is distinct from v_operation.provider_object_id then
    raise exception 'connected payment projection is not the current Checkout generation'
      using errcode = '22000';
  end if;

  v_final_reconciliation_status := case
    when v_payment.reconciliation_status = 'reconciled' then 'reconciled'
    else v_reconciliation_status
  end;
  v_applied := not (
    v_payment.status::text = 'paid'
    and v_payment.paid_at is not distinct from v_paid_at
    and v_payment.stripe_payment_intent is not distinct from (p_projection ->> 'payment_intent_id')
    and v_payment.stripe_charge_id is not distinct from (p_projection ->> 'charge_id')
    and v_payment.stripe_application_fee_id is not distinct from v_application_fee_id
    and v_payment.stripe_balance_transaction_id is not distinct from v_balance_transaction_id
    and v_payment.reconciliation_status = v_final_reconciliation_status
    and v_operation.checkout_lifecycle = 'paid'
  );

  if v_operation.checkout_lifecycle = 'open' then
    perform pg_catalog.set_config(
      'lgq.direct_checkout_paid_operation_pk',
      v_operation.id::text,
      true
    );
    update public.billing_payment_operations o
       set checkout_lifecycle = 'paid'
     where o.id = v_operation.id
       and o.checkout_lifecycle = 'open';
    perform pg_catalog.set_config('lgq.direct_checkout_paid_operation_pk', '', true);
    if not found then
      raise exception 'connected payment Checkout lifecycle changed during projection'
        using errcode = '40001';
    end if;
  end if;

  update public.payments p
     set status = 'paid',
         paid_at = v_paid_at,
         stripe_payment_intent = coalesce(
           p.stripe_payment_intent,
           p_projection ->> 'payment_intent_id'
         ),
         stripe_charge_id = coalesce(
           p.stripe_charge_id,
           p_projection ->> 'charge_id'
         ),
         stripe_application_fee_id = coalesce(
           p.stripe_application_fee_id,
           v_application_fee_id
         ),
         stripe_balance_transaction_id = coalesce(
           p.stripe_balance_transaction_id,
           v_balance_transaction_id
         ),
         reconciliation_status = v_final_reconciliation_status,
         reconciled_at = case
           when v_final_reconciliation_status = 'reconciled'
             then coalesce(p.reconciled_at, pg_catalog.now())
           else null
         end
   where p.id = v_payment.id;

  update public.billing_events e
     set processing_status = 'processed',
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_connected_payment_projection_v1',
         projection_applied = v_applied,
         projection_result = case v_final_reconciliation_status
           when 'reconciled' then 'direct_payment_paid_reconciled'
           else 'direct_payment_paid_pending_reconciliation'
         end
   where e.id = v_event.id;

  return query select
    'processed'::text, v_payment.id, v_payment.account_id, v_applied,
    v_final_reconciliation_status;
end;
$$;

revoke all on function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, integer, uuid, text, text, text, bigint,
  bigint, bigint, text, text, integer, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, integer, uuid, text, text, text, bigint,
  bigint, bigint, text, text, integer, numeric
) to service_role;

revoke all on function public.begin_one_off_direct_checkout_submission(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_one_off_direct_checkout_submission(uuid, uuid)
  to service_role;

revoke all on function public.complete_one_off_direct_checkout_operation(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_one_off_direct_checkout_operation(
  uuid, uuid, text, timestamptz
) to service_role;

revoke all on function public.mark_one_off_direct_checkout_indeterminate(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_one_off_direct_checkout_indeterminate(
  uuid, uuid, text
) to service_role;

revoke all on function public.prepare_one_off_direct_invoice_payment(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_one_off_direct_invoice_payment(
  uuid, uuid, uuid, uuid
) to service_role;

comment on column public.billing_payment_operations.checkout_generation is
  'Positive immutable Checkout-create generation; at most five per direct payment.';
comment on column public.billing_payment_operations.checkout_lifecycle is
  'Provider Session lifecycle, independent from mutation state: open, expired_unpaid, or paid.';
comment on column public.payments.current_checkout_operation_pk is
  'Exact unsuperseded Checkout generation pointer; moved only by generation RPCs.';
comment on function public.claim_one_off_direct_checkout_operation(
  uuid, uuid, text, boolean, integer, uuid, text, text, text, bigint,
  bigint, bigint, text, text, integer, numeric
) is 'Dark service-only generation claim: appends one successor only from exact signed expired-unpaid evidence and performs no Stripe call.';

commit;
