-- Migration: 20260904080000_voice_lead_creation_without_step_up.sql
-- Description:
-- 1. In apply_voice_contractor_action, bypass the step-up challenge check for lead creation.
--    Creating a lead is purely additive to the CRM inbox and must not require 2FA friction.
-- 2. In apply_voice_contractor_action_after_step_up, default operation to 'create' if omitted,
--    and ensure phone number is optional for lead creation.

create or replace function public.apply_voice_contractor_action_after_step_up(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_function_name text,
  p_target_job_id uuid,
  p_target_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_account public.accounts%rowtype;
  v_action public.voice_tool_actions%rowtype;
  v_job public.jobs%rowtype;
  v_lead public.leads%rowtype;
  v_crew public.crew%rowtype;
  v_caller_crew public.crew%rowtype;
  v_function text;
  v_hash text;
  v_action_id uuid;
  v_outcome jsonb;
  v_staff_matches integer := 0;
  v_scope text;
  v_status text;
  v_date text;
  v_time text;
  v_label text;
  v_price numeric;
  v_quote_items jsonb;
  v_hours numeric;
  v_material_amount numeric;
  v_material_description text;
  v_labor_amount numeric;
  v_burden_amount numeric;
  v_note text;
  v_is_caution boolean;
  v_title text;
  v_description text;
  v_operation text;
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_project_type text;
  v_message text;
  v_quote_visit jsonb;
  v_client_notes text;
begin
  v_function := case p_function_name
    when 'update_job_scope' then 'update_job_details'
    when 'add_caution_note' then 'append_job_caution_or_note'
    else p_function_name
  end;

  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$'
     or v_function is null
     or v_function not in (
       'update_job_details', 'create_or_update_lead',
       'log_crew_time_and_materials', 'create_job_change_order',
       'append_job_caution_or_note'
     )
     or p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'voice contractor action arguments are invalid' using errcode = '22023';
  end if;

  v_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_function || ':' || coalesce(p_target_job_id::text, '') || ':'
        || coalesce(p_target_lead_id::text, '') || ':' || p_payload::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id || ':' || v_function || ':' || v_hash,
      20260903
    )
  );

  select a.* into v_action
    from public.voice_tool_actions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.caller_number = p_caller_number
     and a.function_name = v_function
     and a.request_hash = v_hash
   for update;

  if found then
    if v_action.action_state <> 'applied' or v_action.outcome is null then
      raise exception 'voice contractor action is incomplete' using errcode = '55000';
    end if;
    return v_action.outcome || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select a.* into v_account
    from public.accounts a
   where a.id = p_account_id
     and a.suspended_at is null
   for share;
  if not found then
    raise exception 'voice contractor account is unavailable' using errcode = '28000';
  end if;

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.caller_number = p_caller_number
   for share;
  if not found or v_admission.caller_kind not in ('owner', 'office', 'crew') then
    raise exception 'voice contractor caller is not authorized' using errcode = '42501';
  end if;

  -- Re-establish live authorization immediately before the write. Admission is
  -- an immutable snapshot, but suspension/revocation after answer must still win.
  if v_admission.caller_kind = 'owner' then
    select case when (
      public.voice_normalize_us_phone(v_account.alert_phone) = p_caller_number
      or public.voice_normalize_us_phone(v_account.call_forward_number) = p_caller_number
      or exists (
        select 1 from public.voice_settings vs
         where vs.account_id = p_account_id
           and public.voice_normalize_us_phone(vs.transfer_number) = p_caller_number
      )
      or exists (
        select 1 from public.sites s
         where s.account_id = p_account_id
           and public.voice_normalize_us_phone(s.phone) = p_caller_number
      )
    ) then 1 else 0 end into v_staff_matches;
  elsif v_admission.caller_kind in ('office', 'crew') then
    select c.* into v_caller_crew
      from public.crew c
     where c.account_id = p_account_id
       and c.active = true
       and c.deleted_at is null
       and c.access_revoked_at is null
       and public.voice_normalize_us_phone(c.phone) = p_caller_number
     for share;
    if found then
      v_staff_matches := 1;
    end if;
  end if;

  if v_staff_matches = 0 then
    raise exception 'voice contractor caller authorization revoked' using errcode = '42501';
  end if;

  if v_admission.caller_kind = 'crew' and v_function in ('update_job_details', 'create_or_update_lead') then
    raise exception 'voice contractor role is insufficient' using errcode = '42501';
  end if;

  insert into public.voice_tool_actions (
    account_id, provider, provider_call_id, caller_number, function_name,
    request_hash, request_payload, target_job_id, target_lead_id
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, p_caller_number, v_function,
    v_hash, p_payload, p_target_job_id, p_target_lead_id
  ) returning id into v_action_id;

  if v_function in ('update_job_details', 'log_crew_time_and_materials', 'create_job_change_order', 'append_job_caution_or_note') then
    if p_target_job_id is null then
      raise exception 'voice contractor action requires a target job' using errcode = '22023';
    end if;
    select j.* into v_job
      from public.jobs j
     where j.id = p_target_job_id
       and j.account_id = p_account_id
       and j.deleted_at is null
     for update;
    if not found then
      raise exception 'voice contractor job is unavailable' using errcode = 'P0002';
    end if;
  end if;

  if v_function = 'update_job_details' then
    v_scope := nullif(pg_catalog.btrim(p_payload->>'scope'), '');
    v_status := nullif(pg_catalog.btrim(p_payload->>'status'), '');
    v_date := nullif(pg_catalog.btrim(p_payload->>'scheduled_date'), '');
    v_time := nullif(pg_catalog.btrim(p_payload->>'scheduled_time'), '');
    v_label := nullif(pg_catalog.btrim(p_payload->>'line_item_label'), '');
    v_price := case when p_payload ? 'line_item_price' and nullif(p_payload->>'line_item_price', '') is not null
                    then (p_payload->>'line_item_price')::numeric else null end;

    if v_status is not null and v_status not in ('new_lead', 'in_progress', 'complete') then
      raise exception 'voice job status is invalid' using errcode = '22023';
    end if;
    if v_date is not null and v_date !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'voice job date is invalid' using errcode = '22023';
    end if;
    if v_time is not null and v_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'voice job time is invalid' using errcode = '22023';
    end if;
    if (v_label is not null and (v_price is null or v_price <= 0))
       or (v_price is not null and v_label is null) then
      raise exception 'voice quote line item requires both label and positive price' using errcode = '22023';
    end if;

    if v_label is not null then
      v_quote_items := coalesce(v_job.quote_items, '[]'::jsonb) || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', extensions.gen_random_uuid(),
          'label', v_label,
          'unit_price', v_price,
          'unit_cost', 0,
          'quantity', 1,
          'selected', true,
          'recommended', false
        )
      );
    else
      v_quote_items := v_job.quote_items;
    end if;

    update public.jobs j
       set scope = case when v_scope is null then j.scope
                    when j.scope is null or pg_catalog.btrim(j.scope) = '' then v_scope
                    when pg_catalog.strpos(pg_catalog.lower(j.scope), pg_catalog.lower(v_scope)) > 0 then j.scope
                    else j.scope || E'\n\n' || v_scope end,
           status = case when v_status is null then j.status else v_status::public.job_status end,
           scheduled_for = case when v_date is null then j.scheduled_for else v_date::date end,
           scheduled_time = case when v_time is null then j.scheduled_time else v_time::time end,
           quote_items = v_quote_items,
           quoted_amount = case when v_price is null then j.quoted_amount
                                else pg_catalog.round(j.quoted_amount + v_price, 2) end
     where j.id = v_job.id
       and j.account_id = p_account_id;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'replayed', false
    );

  elsif v_function = 'create_or_update_lead' then
    v_operation := pg_catalog.lower(nullif(pg_catalog.btrim(p_payload->>'operation'), ''));
    if v_operation is null then
      v_operation := pg_catalog.lower(nullif(pg_catalog.btrim(p_payload->>'intent'), ''));
    end if;
    v_operation := coalesce(v_operation, 'create');

    v_name := nullif(pg_catalog.btrim(p_payload->>'name'), '');
    v_phone := nullif(pg_catalog.btrim(p_payload->>'phone'), '');
    v_email := pg_catalog.lower(nullif(pg_catalog.btrim(p_payload->>'email'), ''));
    v_address := nullif(pg_catalog.btrim(p_payload->>'address'), '');
    v_project_type := nullif(pg_catalog.btrim(p_payload->>'project_type'), '');
    v_message := nullif(pg_catalog.btrim(p_payload->>'message'), '');

    if p_payload ? 'quote_visit' then
      if pg_catalog.jsonb_typeof(p_payload->'quote_visit') <> 'object'
         or (p_payload->'quote_visit') ? 'scheduledAt' then
        raise exception 'voice quote visit payload is invalid' using errcode = '22023';
      end if;
      v_quote_visit := (p_payload->'quote_visit')
        || pg_catalog.jsonb_build_object('scheduledAt', v_now);
    else
      v_quote_visit := null;
    end if;

    if v_operation = 'create' then
      if p_target_lead_id is not null then
        raise exception 'voice lead creation cannot target an existing lead' using errcode = '22023';
      end if;
      if v_name is null or (v_phone is null and v_email is null and v_address is null
                            and v_project_type is null and v_message is null) then
        raise exception 'voice lead creation needs a name and substantive detail' using errcode = '22023';
      end if;
      insert into public.leads (
        account_id, source, status, name, phone, email, address, project_type,
        message, source_page, triage, quote_visit, source_voice_action_id,
        source_voice_provider_call_id
      ) values (
        p_account_id, 'ai_voice', case when v_quote_visit is null then 'new'::public.lead_status else 'contacted'::public.lead_status end,
        v_name, v_phone, v_email, v_address, v_project_type, v_message, '/call',
        pg_catalog.jsonb_build_object('score', 'warm', 'flags', '[]'::jsonb, 'contactPreference', 'any'),
        v_quote_visit, v_action_id,
        case when not exists (
          select 1 from public.leads
           where account_id = p_account_id
             and source_voice_provider_call_id = p_provider_call_id
        ) then p_provider_call_id else null end
      ) returning * into v_lead;
    elsif v_operation = 'update' then
      if p_target_lead_id is null then
        raise exception 'voice lead update requires an exact lead id' using errcode = '22023';
      end if;
      select l.* into v_lead
        from public.leads l
       where l.id = p_target_lead_id
         and l.account_id = p_account_id
         and l.deleted_at is null
       for update;
      if not found then
        raise exception 'voice lead is unavailable' using errcode = 'P0002';
      end if;
      if not (p_payload ? 'name' or p_payload ? 'phone' or p_payload ? 'email'
              or p_payload ? 'address' or p_payload ? 'project_type'
              or p_payload ? 'message' or p_payload ? 'quote_visit') then
        raise exception 'voice lead update has no effect' using errcode = '22023';
      end if;
      update public.leads l
         set name = case when p_payload ? 'name' then v_name else l.name end,
             phone = case when p_payload ? 'phone' then v_phone else l.phone end,
             email = case when p_payload ? 'email' then v_email else l.email end,
             address = case when p_payload ? 'address' then v_address else l.address end,
             project_type = case when p_payload ? 'project_type' then v_project_type else l.project_type end,
             message = case when p_payload ? 'message' then v_message else l.message end,
             quote_visit = case when p_payload ? 'quote_visit' then v_quote_visit else l.quote_visit end,
             status = case when p_payload ? 'quote_visit' and l.status = 'new'::public.lead_status then 'contacted'::public.lead_status else l.status end,
             updated_at = v_now
       where l.id = v_lead.id
         and l.account_id = p_account_id
       returning * into v_lead;
    else
      raise exception 'voice lead operation is invalid' using errcode = '22023';
    end if;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'lead_id', v_lead.id,
      'target_name', v_lead.name,
      'operation', v_operation,
      'replayed', false
    );

  elsif v_function = 'log_crew_time_and_materials' then
    v_hours := case when p_payload ? 'hours' and nullif(p_payload->>'hours', '') is not null
                    then (p_payload->>'hours')::numeric else null end;
    v_material_amount := case when p_payload ? 'material_cost' and nullif(p_payload->>'material_cost', '') is not null
                              then (p_payload->>'material_cost')::numeric else null end;
    v_material_description := nullif(pg_catalog.btrim(p_payload->>'materials'), '');
    v_note := nullif(pg_catalog.btrim(p_payload->>'notes'), '');

    if (v_hours is null or v_hours <= 0) and (v_material_amount is null or v_material_amount <= 0) then
      raise exception 'crew log requires hours or material cost' using errcode = '22023';
    end if;
    if v_material_amount is not null and v_material_amount > 0 and v_material_description is null then
      raise exception 'crew material cost requires itemized materials' using errcode = '22023';
    end if;

    if v_hours is not null and v_hours > 0 then
      if p_payload ? 'crew_id' and nullif(p_payload->>'crew_id', '') is not null then
        select c.* into v_crew
          from public.crew c
         where c.id = (p_payload->>'crew_id')::uuid
           and c.account_id = p_account_id
           and c.active = true
           and c.deleted_at is null
           and c.access_revoked_at is null;
      elsif p_payload ? 'crew_name' and nullif(p_payload->>'crew_name', '') is not null then
        select c.* into v_crew
          from public.crew c
         where c.account_id = p_account_id
           and c.active = true
           and c.deleted_at is null
           and c.access_revoked_at is null
           and pg_catalog.lower(c.name) = pg_catalog.lower(pg_catalog.btrim(p_payload->>'crew_name'))
         limit 1;
      elsif v_admission.caller_kind in ('office', 'crew') and v_caller_crew.id is not null then
        v_crew := v_caller_crew;
      end if;

      if v_crew.id is not null then
        v_labor_amount := pg_catalog.round(v_hours * coalesce(v_crew.hourly_rate, 0), 2);
        v_burden_amount := pg_catalog.round(v_hours * coalesce(v_crew.hourly_rate, 0) * (coalesce(v_crew.labor_burden_percent, 0) / 100.0), 2);
      else
        v_labor_amount := 0;
        v_burden_amount := 0;
      end if;

      insert into public.job_labor_entries (
        account_id, job_id, crew_id, entry_date, hours,
        hourly_rate, labor_amount, burden_amount, notes,
        source_voice_action_id
      ) values (
        p_account_id, v_job.id, v_crew.id, v_now::date, v_hours,
        coalesce(v_crew.hourly_rate, 0), v_labor_amount, v_burden_amount,
        v_note, v_action_id
      );
    end if;

    if v_material_amount is not null and v_material_amount > 0 then
      insert into public.job_material_expenses (
        account_id, job_id, material_name, material_cost,
        source_voice_action_id
      ) values (
        p_account_id, v_job.id, v_material_description, v_material_amount,
        v_action_id
      );
    end if;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'hours', v_hours,
      'material_cost', v_material_amount,
      'replayed', false
    );

  elsif v_function = 'create_job_change_order' then
    v_title := nullif(pg_catalog.btrim(p_payload->>'title'), '');
    v_description := nullif(pg_catalog.btrim(p_payload->>'description'), '');
    v_price := case when p_payload ? 'price' and nullif(p_payload->>'price', '') is not null
                    then (p_payload->>'price')::numeric else null end;

    if v_title is null or v_description is null or v_price is null or v_price <= 0 then
      raise exception 'change order requires title, description, and positive price' using errcode = '22023';
    end if;

    v_scope := 'CHANGE ORDER: ' || v_title || E'\n' || v_description;
    update public.jobs j
       set scope = case when j.scope is null or pg_catalog.btrim(j.scope) = '' then v_scope
                        else j.scope || E'\n\n' || v_scope end,
           quoted_amount = pg_catalog.round(j.quoted_amount + v_price, 2),
           quote_items = coalesce(j.quote_items, '[]'::jsonb) || pg_catalog.jsonb_build_array(
             pg_catalog.jsonb_build_object(
               'id', extensions.gen_random_uuid(),
               'label', 'Change Order: ' || v_title,
               'unit_price', v_price,
               'unit_cost', 0,
               'quantity', 1,
               'selected', true,
               'recommended', false
             )
           )
     where j.id = v_job.id
       and j.account_id = p_account_id;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'title', v_title,
      'price', v_price,
      'replayed', false
    );

  elsif v_function = 'append_job_caution_or_note' then
    v_note := nullif(pg_catalog.btrim(p_payload->>'note'), '');
    v_is_caution := coalesce((p_payload->>'is_caution')::boolean, false);

    if v_note is null then
      raise exception 'caution or note requires content' using errcode = '22023';
    end if;

    if v_is_caution then
      v_note := '[SAFETY CAUTION - ' || pg_catalog.to_char(v_now, 'YYYY-MM-DD HH24:MI') || ']: ' || v_note;
    else
      v_note := '[DISPATCH NOTE - ' || pg_catalog.to_char(v_now, 'YYYY-MM-DD HH24:MI') || ']: ' || v_note;
    end if;

    update public.jobs j
       set notes = case when j.notes is null or pg_catalog.btrim(j.notes) = '' then v_note
                        else j.notes || E'\n' || v_note end
     where j.id = v_job.id
       and j.account_id = p_account_id;

    if v_job.client_id is not null then
      select notes into v_client_notes from public.clients where id = v_job.client_id;
      update public.clients c
         set notes = case when v_client_notes is null or pg_catalog.btrim(v_client_notes) = '' then v_note
                          else v_client_notes || E'\n' || v_note end
       where c.id = v_job.client_id
         and c.account_id = p_account_id;
    end if;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'is_caution', v_is_caution,
      'replayed', false
    );
  end if;

  update public.voice_tool_actions
     set action_state = 'applied',
         outcome = v_outcome,
         applied_at = v_now
   where id = v_action_id;

  return v_outcome;
end;
$fn$;

-- Now update the outer wrapper function:
-- If function is create_or_update_lead and operation is 'create' (or intent is 'create' or omitted),
-- bypass the step-up challenge check completely!
create or replace function public.apply_voice_contractor_action(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_function_name text,
  p_target_job_id uuid,
  p_target_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_challenge public.voice_staff_step_up_challenges%rowtype;
  v_function text;
  v_operation text;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Voice privileged action call identity is invalid'
      using errcode = '22023';
  end if;

  v_function := case p_function_name
    when 'update_job_scope' then 'update_job_details'
    when 'add_caution_note' then 'append_job_caution_or_note'
    else p_function_name
  end;

  v_operation := pg_catalog.lower(coalesce(
    p_payload->>'operation',
    p_payload->>'intent',
    'create'
  ));

  -- Lead creation is purely additive and unprivileged; it never requires 2FA step-up!
  if v_function = 'create_or_update_lead' and v_operation = 'create' then
    return public.apply_voice_contractor_action_after_step_up(
      p_account_id,
      p_provider_call_id,
      p_caller_number,
      p_function_name,
      p_target_job_id,
      p_target_lead_id,
      p_payload
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;
  if not found then
    raise exception 'voice privileged action requires the same live admitted staff call'
      using errcode = '42501';
  end if;

  select c.* into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.admission_id = v_admission.id
     and c.account_id = p_account_id
     and c.provider = 'signalwire'
     and c.provider_call_id = p_provider_call_id
     and c.caller_number = p_caller_number
     and c.caller_kind = v_admission.caller_kind
     and c.state = 'verified'
     and c.verified_at is not null
     and c.verified_until > v_now
     and c.verified_until <= c.verified_at + interval '30 minutes'
   for share;
  if not found then
    raise exception 'voice privileged action requires a verified step-up challenge'
      using errcode = '42501';
  end if;

  return public.apply_voice_contractor_action_after_step_up(
    p_account_id,
    p_provider_call_id,
    p_caller_number,
    p_function_name,
    p_target_job_id,
    p_target_lead_id,
    p_payload
  );
end;
$fn$;
