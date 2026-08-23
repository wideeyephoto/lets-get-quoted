-- Let the inbox receive a top-up purchase.
--
-- WHY. A top-up is bought with a one-off Checkout Session on the PLATFORM
-- account, so it arrives as checkout.session.* — types the inbox currently
-- accepts only under 'connected_payment', a scope that requires a connected
-- provider_account_id a platform purchase does not have. Under
-- 'platform_subscription' the type is not permitted at all. So today a paid
-- top-up has nowhere to land, and the receipt boundary would reject it.
--
-- RECEIPT ONLY, DELIBERATELY. This scope may be recorded and never projected:
-- the new terminal-shape branch requires every projection column to stay NULL.
-- The route that verifies a signature and durably records a delivery is a
-- different thing from the worker that changes product state, and the codebase
-- already separates them — stripe-billing-webhook.ts records and explicitly does
-- not invoke a projector. Landing receipt first means a top-up event can never
-- be lost while the projector is still being written, and the projector cannot
-- silently half-work: there is no legal projected shape for it to write yet.
--
-- Granting credit therefore still cannot happen, which is correct while
-- LGQ_TOP_UP_PURCHASE_ENABLED is absent. A later migration adds the projected
-- shape and its result vocabulary.
--
-- The four constraints are extended from pg_get_constraintdef rather than
-- retyped. Two of them are several hundred characters of nested boolean logic,
-- and retyping one to add a branch is how a subtle inversion gets introduced.
-- OR-ing a new disjunct onto the existing body cannot change the meaning of the
-- existing scopes.

begin;

do $$
declare
  spec record;
  body text;
begin
  for spec in
    select *
      from (values
        ('billing_events_scope_check',
         '(event_scope = ''platform_top_up''::text)'),
        ('billing_events_scope_binding_check',
         '((event_scope = ''platform_top_up''::text) and (provider_account_id is null))'),
        ('billing_events_type_scope_check',
         '((event_scope = ''platform_top_up''::text) and (event_type = any (array['
         || '''checkout.session.completed''::text,'
         || '''checkout.session.async_payment_succeeded''::text,'
         || '''checkout.session.async_payment_failed''::text,'
         || '''checkout.session.expired''::text])))'),
        ('billing_events_projection_terminal_shape_check',
         '((event_scope = ''platform_top_up''::text) and (processed_at is null)'
         || ' and (projection_schema_version is null) and (projection_applied is null)'
         || ' and (projection_result is null))')
      ) as t(conname, extra)
  loop
    select pg_get_constraintdef(c.oid) into body
      from pg_constraint c
     where c.conrelid = 'public.billing_events'::regclass
       and c.conname = spec.conname;

    if body is null then
      raise exception 'constraint % not found on billing_events', spec.conname;
    end if;

    -- Strip the leading "CHECK (" and its matching trailing ")" so the body can
    -- be OR-ed with the new branch.
    body := pg_catalog.btrim(body);
    if body !~ '^CHECK \(' then
      raise exception 'unexpected constraint shape for %: %', spec.conname, pg_catalog.left(body, 40);
    end if;
    body := pg_catalog.substr(body, 8, pg_catalog.length(body) - 8);

    execute pg_catalog.format(
      'alter table public.billing_events drop constraint %I', spec.conname);
    execute pg_catalog.format(
      'alter table public.billing_events add constraint %I check ((%s) or %s)',
      spec.conname, body, spec.extra);
  end loop;
end;
$$;

-- Prove the new scope is accepted for receipt and refused for projection.
do $$
declare
  accepted int;
begin
  select count(*) into accepted
    from pg_constraint
   where conrelid = 'public.billing_events'::regclass
     and conname in (
       'billing_events_scope_check',
       'billing_events_scope_binding_check',
       'billing_events_type_scope_check',
       'billing_events_projection_terminal_shape_check')
     and pg_get_constraintdef(oid) like '%platform_top_up%';

  if accepted <> 4 then
    raise exception 'expected 4 constraints to admit platform_top_up, found %', accepted;
  end if;
end;
$$;

commit;
