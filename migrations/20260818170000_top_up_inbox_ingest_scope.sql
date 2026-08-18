-- Let the inbox RPC accept the scope its table already accepts.
--
-- WHY. Migration 20260818140000 widened the four billing_events CHECK
-- constraints to admit 'platform_top_up', but ingest_stripe_event_inbox has its
-- own scope dispatch and was not widened with them. Its final branch is
--
--   else
--     raise exception 'unsupported Stripe event scope: %', p_event_scope
--
-- so a signature-verified top-up delivery passes every TypeScript guard, reaches
-- the RPC, and comes back 22023. The webhook boundary maps an unrecognised
-- failure to HTTP 500, which is Stripe's signal to retry — forever, for an event
-- that can never succeed. The table would have accepted the row.
--
-- This is the missing half of the receipt boundary, not a new capability. The
-- row shape it admits is exactly what 20260818140000 already permits: the four
-- one-off Checkout types, no connected account, a checkout.session data object.
--
-- Workspace resolution needs no change. It is gated on
-- `p_event_scope = 'connected_payment'`, so a top-up correctly lands with
-- account_id null and waits for the projector to bind it.
--
-- HOW. The function is patched from its own live source rather than retyped,
-- the same way this tree extends a constraint from pg_get_constraintdef. The
-- anchor is asserted to appear exactly once first, so a drifted body fails the
-- migration instead of being silently rewritten. Note that pg_get_functiondef
-- returns a plpgsql body verbatim, line endings included — see
-- 20260817120000_normalise_function_body_line_endings.sql, which is why this
-- anchor is written with LF and matches.

begin;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
  else
    raise exception 'unsupported Stripe event scope: %', p_event_scope using errcode = '22023';
  end if;$needle$;
  v_new text := $replacement$
  elsif p_event_scope = 'platform_top_up' then
    if p_event_type not in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired'
    ) then
      raise exception 'unsupported platform top-up event type: %', p_event_type using errcode = '22023';
    end if;
    if p_provider_account_id is not null then
      raise exception 'platform top-up events must not contain event.account' using errcode = '22023';
    end if;
    v_expected_object_type := 'checkout.session';
  else
    raise exception 'unsupported Stripe event scope: %', p_event_scope using errcode = '22023';
  end if;$replacement$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.ingest_stripe_event_inbox(text,text,text,text,boolean,text,timestamptz,jsonb)'
      ::pg_catalog.regprocedure
  );

  -- The replacement ends with the anchor it replaced, so the needle still
  -- occurs exactly once afterwards and a second apply would append a second,
  -- unreachable copy of the branch. Skip instead.
  if pg_catalog.strpos(v_before, 'platform_top_up') > 0 then
    return;
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'Stripe event inbox scope dispatch source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- Prove the new branch is live and the existing two are untouched.
do $$
declare
  v_source text;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.ingest_stripe_event_inbox(text,text,text,text,boolean,text,timestamptz,jsonb)'
      ::pg_catalog.regprocedure
  );
  if v_source not like '%platform_top_up%' then
    raise exception 'inbox ingest does not admit platform_top_up';
  end if;
  if v_source not like '%unsupported platform top-up event type%'
     or v_source not like '%platform top-up events must not contain event.account%' then
    raise exception 'inbox ingest top-up branch is incomplete';
  end if;
  if v_source not like '%unsupported platform subscription event type%'
     or v_source not like '%connected-account payment events require a valid event.account%'
     or v_source not like '%unsupported Stripe event scope%' then
    raise exception 'inbox ingest lost an existing scope branch';
  end if;
end;
$$;

commit;
