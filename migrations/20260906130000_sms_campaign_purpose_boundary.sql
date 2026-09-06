-- Bind the LGQ dispatch sender exclusively to crew/subcontractor traffic.
--
-- Existing history is preserved. New durable delivery intent is rejected at
-- the enqueue boundary when exactly one side of the dispatch/crew pairing is
-- present. Legacy shared-number crew field confirmations are rehomed onto the
-- campaign-qualified dispatch lane; owner confirmations remain on shared.

begin;

alter table public.sms_events
  drop constraint if exists sms_events_dispatch_category_match;
alter table public.sms_events
  add constraint sms_events_dispatch_category_match check (
    sender_purpose is null
    or billing_category is null
    or (
      (sender_purpose = 'lgq_dispatch')
      = (billing_category = 'crew_message')
    )
  ) not valid;
alter table public.sms_events
  validate constraint sms_events_dispatch_category_match;

do $purpose_boundary$
declare
  v_enqueue_oid oid := pg_catalog.to_regprocedure(
    'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)'
  );
  v_enqueue_definition text;
  v_sender_validation text := $sender_validation$
  if p_sender_purpose is null or p_sender_purpose not in (
    'lgq_shared', 'lgq_dispatch', 'contractor_dedicated'
  ) then
    raise exception 'SMS sender purpose is invalid'
      using errcode = '22023';
  end if;
$sender_validation$;
  v_dispatch_guard text := $dispatch_guard$
  if (p_sender_purpose = 'lgq_dispatch')
       is distinct from (p_billing_category = 'crew_message') then
    raise exception 'LGQ dispatch sender and crew billing category must match'
      using errcode = '22023';
  end if;
$dispatch_guard$;
  v_field_oid oid := pg_catalog.to_regprocedure(
    'public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)'
  );
  v_field_definition text;
  v_old_field_sender text := $old_field_sender$p_sender_purpose => 'lgq_shared',$old_field_sender$;
  v_new_field_sender text := $new_field_sender$p_sender_purpose => case when v_crew.id is not null then 'lgq_dispatch' else 'lgq_shared' end,$new_field_sender$;
  v_old_field_number text := $old_field_number$p_sender_number_id => v_task.sender_number_id$old_field_number$;
  v_new_field_number text := $new_field_number$p_sender_number_id => case when v_crew.id is not null then null::uuid else v_task.sender_number_id end$new_field_number$;
  v_occurrences integer;
begin
  if v_enqueue_oid is null then
    raise exception 'enqueue_sms_delivery function is missing';
  end if;

  select pg_catalog.pg_get_functiondef(v_enqueue_oid)
    into v_enqueue_definition;

  if pg_catalog.strpos(v_enqueue_definition, v_dispatch_guard) = 0 then
    v_occurrences := (
      pg_catalog.length(v_enqueue_definition)
      - pg_catalog.length(pg_catalog.replace(v_enqueue_definition, v_sender_validation, ''))
    ) / pg_catalog.length(v_sender_validation);
    if v_occurrences <> 1 then
      raise exception 'enqueue_sms_delivery sender validation shape changed';
    end if;
    v_enqueue_definition := pg_catalog.replace(
      v_enqueue_definition,
      v_sender_validation,
      v_sender_validation || v_dispatch_guard
    );
    execute v_enqueue_definition;
  end if;

  if v_field_oid is null then
    raise exception 'apply_owner_field_action function is missing';
  end if;

  select pg_catalog.pg_get_functiondef(v_field_oid)
    into v_field_definition;

  if pg_catalog.strpos(v_field_definition, v_new_field_sender) = 0 then
    v_occurrences := (
      pg_catalog.length(v_field_definition)
      - pg_catalog.length(pg_catalog.replace(v_field_definition, v_old_field_sender, ''))
    ) / pg_catalog.length(v_old_field_sender);
    if v_occurrences <> 1 then
      raise exception 'apply_owner_field_action sender selection shape changed';
    end if;
    v_field_definition := pg_catalog.replace(
      v_field_definition,
      v_old_field_sender,
      v_new_field_sender
    );
  end if;

  if pg_catalog.strpos(v_field_definition, v_new_field_number) = 0 then
    v_occurrences := (
      pg_catalog.length(v_field_definition)
      - pg_catalog.length(pg_catalog.replace(v_field_definition, v_old_field_number, ''))
    ) / pg_catalog.length(v_old_field_number);
    if v_occurrences <> 1 then
      raise exception 'apply_owner_field_action sender pinning shape changed';
    end if;
    v_field_definition := pg_catalog.replace(
      v_field_definition,
      v_old_field_number,
      v_new_field_number
    );
  end if;
  execute v_field_definition;
end
$purpose_boundary$;

revoke all on function public.enqueue_sms_delivery(
  uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_sms_delivery(
  uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz
) to service_role;

revoke all on function public.apply_owner_field_action(
  uuid,uuid,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.apply_owner_field_action(
  uuid,uuid,text,jsonb,text,text
) to service_role;

do $verify_boundary$
declare
  v_enqueue_definition text := pg_catalog.pg_get_functiondef(
    'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)'::pg_catalog.regprocedure
  );
  v_field_definition text := pg_catalog.pg_get_functiondef(
    'public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)'::pg_catalog.regprocedure
  );
begin
  if pg_catalog.strpos(
    v_enqueue_definition,
    '(p_sender_purpose = ''lgq_dispatch'')'
  ) = 0 or pg_catalog.strpos(
    v_enqueue_definition,
    '(p_billing_category = ''crew_message'')'
  ) = 0 then
    raise exception 'SMS Campaign purpose guard was not installed';
  end if;

  if pg_catalog.strpos(
    v_field_definition,
    'case when v_crew.id is not null then ''lgq_dispatch'' else ''lgq_shared'' end'
  ) = 0 or pg_catalog.strpos(
    v_field_definition,
    'case when v_crew.id is not null then null::uuid else v_task.sender_number_id end'
  ) = 0 then
    raise exception 'Field confirmation Campaign routing was not installed';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
       'execute'
     ) or pg_catalog.has_function_privilege(
       'anon',
       'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
       'execute'
     ) then
    raise exception 'SMS enqueue privilege boundary changed';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_row
     where constraint_row.conrelid = 'public.sms_events'::pg_catalog.regclass
       and constraint_row.conname = 'sms_events_dispatch_category_match'
       and constraint_row.contype = 'c'
       and constraint_row.convalidated
  ) then
    raise exception 'SMS Campaign purpose table constraint was not installed';
  end if;
end
$verify_boundary$;

notify pgrst, 'reload schema';

commit;
