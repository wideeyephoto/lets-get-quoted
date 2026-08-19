-- Let a paid capacity purchase actually become capacity.
--
-- WHY. 20260818210000 built the ledger and 20260818220000 taught the crew seat
-- gates to read it, but NOTHING HAS EVER WRITTEN A ROW TO IT. The projector
-- decides `capacity_granted` in TypeScript and hands it to
-- project_stripe_platform_top_up_event, whose outcome whitelist does not contain
-- that word -- so a paid capacity SKU raises 22023 and the event fails. The
-- money is taken and the ledger stays empty. That is the exact failure every
-- recurring-capacity SKU is withheld to avoid, and this is the half that was
-- missing.
--
-- IDENTITY IS THE SUBSCRIPTION, NOT THE SESSION, and that is the whole reason
-- this cannot reuse the credit path's idempotency key. A credit lot is bought
-- once by one Session and never changes. A capacity row is bought by a Session
-- and then OUTLIVES it: the subscription goes on to renew, lapse and cancel,
-- sending events that carry no Session at all. So the row is keyed by
-- (livemode, stripe_subscription_id) -- the unique constraint the ledger already
-- declares -- and the read below reports a redelivered receipt as a replay
-- rather than letting the insert raise on that constraint.
--
-- WHAT THIS STILL DOES NOT DO. Nothing here cancels a row when the subscription
-- lapses. Status stays 'active' until something else moves it, which means this
-- alone is not enough to sell a capacity SKU -- a cancelled subscription would
-- keep granting. The lifecycle is a separate rail and the SKUs stay withheld
-- until it exists. This migration removes one of the two reasons, not both.
--
-- THE OUT COLUMNS ARE DELIBERATELY UNCHANGED. Returning a capacity id would mean
-- adding a fourth OUT column, which PostgreSQL cannot do with `create or
-- replace` -- it needs a drop and recreate, and dropping a function that live
-- billing code calls to add a value nobody reads is a bad trade. credit_lot_id
-- stays null for a capacity grant, which is true: no lot was created. The row is
-- findable by subscription id and by billing_event_id.

begin;

-- Both constraints must admit the two new results, extended from their own live
-- text exactly as 20260818160000 extended them. The marker is the first new
-- result: present means this file already ran.
do $mig$
declare
  spec record;
  body text;
begin
  for spec in
    select *
      from (values
        (
          'billing_events_projection_result_check',
          'top_up_capacity_granted',
          $extra$(
            projection_result in (
              'top_up_capacity_granted',
              'top_up_capacity_already_granted'
            )
          )$extra$
        ),
        (
          'billing_events_projection_terminal_shape_check',
          'top_up_capacity_granted',
          -- Mirrors the two credit branches exactly: applied on the first grant,
          -- not applied on a replay, and only ever on an event type that can
          -- carry a completed payment.
          $extra$(
            event_scope = 'platform_top_up'
            and processed_at is not null
            and projection_schema_version is not distinct from
              'stripe_platform_top_up_projection_v1'
            and projection_applied is not null
            and processing_status = 'processed'
            and event_type in (
              'checkout.session.completed',
              'checkout.session.async_payment_succeeded'
            )
            and (
              (projection_applied and projection_result = 'top_up_capacity_granted')
              or (not projection_applied
                  and projection_result = 'top_up_capacity_already_granted')
            )
          )$extra$
        )
      ) as t(conname, marker, extra)
  loop
    select pg_get_constraintdef(c.oid) into body
      from pg_constraint c
     where c.conrelid = 'public.billing_events'::regclass
       and c.conname = spec.conname;

    if body is null then
      raise exception 'constraint % not found on billing_events', spec.conname;
    end if;

    if pg_catalog.strpos(body, spec.marker) > 0 then
      continue;
    end if;

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
end
$mig$;

-- Patch the projector from its own live source, the house pattern -- see
-- 20260818220000. Four edits, each asserted to match exactly once, so a drifted
-- function refuses rather than being silently half-patched.
do $mig$
declare
  v_before text;
  v_after text;
  v_edits text[][];
  v_pair text[];
  v_old text;
  v_new text;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.project_stripe_platform_top_up_event(uuid,uuid,jsonb)'::pg_catalog.regprocedure
  );
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  -- Already patched.
  if pg_catalog.strpos(v_before, 'top_up_capacity_granted') > 0 then
    return;
  end if;

  v_edits := array[
    -- 1. Two more locals. v_existing is reused: it already means "the row this
    --    purchase turns out to have created before".
    array[
      '  v_applied boolean;' || pg_catalog.chr(10) || 'begin',
      '  v_applied boolean;' || pg_catalog.chr(10)
        || '  v_subscription text;' || pg_catalog.chr(10)
        || '  v_unit_amount bigint;' || pg_catalog.chr(10) || 'begin'
    ],
    -- 2. The outcome whitelist, which is what raises 22023 today.
    array[
      '       ''capacity_fulfillment_deferred'') then',
      '       ''capacity_fulfillment_deferred'',' || pg_catalog.chr(10)
        || '       ''capacity_granted'') then'
    ],
    -- 3. Which event types may carry it. Same two as every other paid outcome.
    array[
      '(''fulfillment_withheld'', ''capacity_fulfillment_deferred'')',
      '(''fulfillment_withheld'', ''capacity_fulfillment_deferred'', ''capacity_granted'')'
    ],
    -- 4. The branch itself, inserted between the credit branch and the
    --    ignored-outcomes else.
    array[
      '    v_status := ''processed'';' || pg_catalog.chr(10) || '  else',
      '    v_status := ''processed'';' || pg_catalog.chr(10)
        || '  elsif v_outcome = ''capacity_granted'' then' || pg_catalog.chr(10)
        || '    v_resource := p_projection ->> ''resource_code'';' || pg_catalog.chr(10)
        || '    v_units := nullif(p_projection ->> ''units'', '''')::bigint;' || pg_catalog.chr(10)
        || '    v_catalog := p_projection ->> ''catalog_version'';' || pg_catalog.chr(10)
        || '    v_top_up := p_projection ->> ''top_up_id'';' || pg_catalog.chr(10)
        || '    v_subscription := p_projection ->> ''stripe_subscription_id'';' || pg_catalog.chr(10)
        || '    v_unit_amount := nullif(p_projection ->> ''unit_amount_cents'', '''')::bigint;' || pg_catalog.chr(10)
        || '    if v_account is null or v_resource is null or v_units is null' || pg_catalog.chr(10)
        || '       or v_catalog is null or v_top_up is null or v_unit_amount is null' || pg_catalog.chr(10)
        || '       or v_subscription is null' || pg_catalog.chr(10)
        || '       or v_subscription !~ ''^sub_[A-Za-z0-9]{8,}$'' then' || pg_catalog.chr(10)
        || '      raise exception ''top-up capacity projection is incomplete'' using errcode = ''22023'';' || pg_catalog.chr(10)
        || '    end if;' || pg_catalog.chr(10)
        || '    perform pg_catalog.pg_advisory_xact_lock(' || pg_catalog.chr(10)
        || '      pg_catalog.hashtextextended(v_subscription, 0));' || pg_catalog.chr(10)
        || '    select c.id into v_existing' || pg_catalog.chr(10)
        || '      from public.workspace_purchased_capacity c' || pg_catalog.chr(10)
        || '     where c.livemode = v_event.livemode' || pg_catalog.chr(10)
        || '       and c.stripe_subscription_id = v_subscription;' || pg_catalog.chr(10)
        || '    if v_existing is not null then' || pg_catalog.chr(10)
        || '      v_applied := false;' || pg_catalog.chr(10)
        || '      v_result := ''top_up_capacity_already_granted'';' || pg_catalog.chr(10)
        || '    else' || pg_catalog.chr(10)
        || '      insert into public.workspace_purchased_capacity (' || pg_catalog.chr(10)
        || '        account_id, top_up_id, resource_code, units, unit_amount_cents,' || pg_catalog.chr(10)
        || '        catalog_version, livemode, stripe_subscription_id, status,' || pg_catalog.chr(10)
        || '        billing_event_id, metadata)' || pg_catalog.chr(10)
        || '      values (' || pg_catalog.chr(10)
        || '        v_account, v_top_up, v_resource, v_units, v_unit_amount,' || pg_catalog.chr(10)
        || '        v_catalog, v_event.livemode, v_subscription, ''active'', v_event.id,' || pg_catalog.chr(10)
        || '        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(' || pg_catalog.chr(10)
        || '          ''lgq_checkout_session_id'', v_session,' || pg_catalog.chr(10)
        || '          ''lgq_provider_event_id'', v_event.provider_event_id)));' || pg_catalog.chr(10)
        || '      v_applied := true;' || pg_catalog.chr(10)
        || '      v_result := ''top_up_capacity_granted'';' || pg_catalog.chr(10)
        || '    end if;' || pg_catalog.chr(10)
        || '    v_status := ''processed'';' || pg_catalog.chr(10)
        || '  else'
    ]
  ];

  v_after := v_before;
  foreach v_pair slice 1 in array v_edits
  loop
    v_old := v_pair[1];
    v_new := v_pair[2];
    if pg_catalog.length(v_after) - pg_catalog.length(pg_catalog.replace(v_after, v_old, ''))
         is distinct from pg_catalog.length(v_old) then
      raise exception 'top-up projector source contract drifted at: %',
        pg_catalog.left(v_old, 48) using errcode = '55000';
    end if;
    v_after := pg_catalog.replace(v_after, v_old, v_new);
  end loop;

  execute v_after;
end
$mig$;

-- Prove the patched function kept everything that made it safe. A patch that
-- computed the right row and dropped one of these would still be wrong.
do $$
declare
  v_def text;
begin
  v_def := pg_catalog.pg_get_functiondef(
    'public.project_stripe_platform_top_up_event(uuid,uuid,jsonb)'::pg_catalog.regprocedure
  );

  if v_def not like '%insert into public.workspace_purchased_capacity%' then
    raise exception 'top-up projector does not write the capacity ledger';
  end if;
  if v_def not like '%top_up_capacity_already_granted%' then
    raise exception 'top-up projector cannot report a capacity replay';
  end if;
  -- livemode must come from the event row, never from the projection payload.
  if v_def not like '%v_event.livemode, v_subscription%' then
    raise exception 'capacity grant does not take livemode from the event';
  end if;
  -- The claim lock, the Session binding and the credit path all still there.
  if v_def not like '%for update%' then
    raise exception 'top-up projector lost its claim lock';
  end if;
  if v_def not like '%names a different Checkout Session%' then
    raise exception 'top-up projector lost its Session binding check';
  end if;
  if v_def not like '%public.grant_usage_credits(%' then
    raise exception 'top-up projector lost the usage-credit path';
  end if;
  if v_def not like '%top_up_credits_already_granted%' then
    raise exception 'top-up projector lost its credit replay result';
  end if;
end;
$$;

commit;
