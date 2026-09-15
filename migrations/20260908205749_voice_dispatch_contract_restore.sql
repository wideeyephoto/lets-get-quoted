-- Restore the current dispatch write contract after the September 4 lead migration
-- replaced it with a legacy body (jobs.notes and obsolete labor tables).
-- Keep the live-call wrapper, no-OTP policy, request fingerprint, and private ACL.
-- Notes and cautions commit to the internal job feed; quote changes stay disabled.
-- Lead creation still defaults to create and accepts substantive detail without phone.

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
      or exists (
        select 1
          from public.memberships m
          join auth.users u on u.id = m.user_id
         where m.account_id = p_account_id
           and m.role = 'owner'
           and m.deactivated_at is null
           and public.voice_normalize_us_phone(u.phone) = p_caller_number
      )
    ) then 1 else 0 end into v_staff_matches;
  elsif v_admission.caller_kind = 'office' then
    select pg_catalog.count(*) into v_staff_matches
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.account_id = p_account_id
       and m.role = 'office'
       and m.deactivated_at is null
       and public.voice_normalize_us_phone(u.phone) = p_caller_number;
  else
    select pg_catalog.count(*) into v_staff_matches
      from public.crew c
     where c.account_id = p_account_id
       and c.active
       and c.deleted_at is null
       and c.access_revoked_at is null
       and public.voice_normalize_us_phone(c.phone) = p_caller_number
       and (
         c.phone_verified_at is not null
         or c.phone_verified
         or (c.user_id is not null and c.last_signed_in_at is not null)
       );
    if v_staff_matches = 1 then
      select c.* into v_caller_crew
        from public.crew c
       where c.account_id = p_account_id
         and c.active
         and c.deleted_at is null
         and c.access_revoked_at is null
         and public.voice_normalize_us_phone(c.phone) = p_caller_number
         and (
           c.phone_verified_at is not null
           or c.phone_verified
           or (c.user_id is not null and c.last_signed_in_at is not null)
         )
       for share;
    end if;
  end if;

  if v_staff_matches <> 1 then
    raise exception 'voice contractor caller lifecycle is invalid or ambiguous' using errcode = '42501';
  end if;

  if v_admission.caller_kind = 'crew'
     and v_function in ('update_job_details', 'create_or_update_lead') then
    raise exception 'voice crew caller is not authorized for office records' using errcode = '42501';
  end if;

  if v_function <> 'create_or_update_lead' then
    if p_target_job_id is null then
      raise exception 'voice contractor action requires an exact job' using errcode = '22023';
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
    if v_admission.caller_kind = 'crew' then
      perform 1
        from public.crew_assignments ca
       where ca.account_id = p_account_id
         and ca.job_id = v_job.id
         and ca.crew_id = v_caller_crew.id;
      if not found then
        raise exception 'voice crew caller is not assigned to this job' using errcode = '42501';
      end if;
    end if;
  elsif p_target_job_id is not null then
    raise exception 'lead action cannot target a job' using errcode = '22023';
  end if;

  -- Phone quote changes remain disabled, including direct service RPC callers.
  if v_function in ('update_job_details', 'create_job_change_order')
     and p_payload ?| array['line_item_label', 'line_item_price', 'quote_total',
       'quoted_amount', 'quotedAmount', 'quote_amount', 'quote_items', 'quoteItems',
       'discount', 'discount_amount', 'discount_percent', 'total', 'price', 'amount'] then
    raise exception 'voice financial edits require the dashboard quote editor' using errcode = '22023';
  end if;

  insert into public.voice_tool_actions (
    account_id, provider, provider_call_id, caller_number, function_name,
    request_hash, request_payload, target_job_id, target_lead_id
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, p_caller_number, v_function,
    v_hash, p_payload, p_target_job_id, p_target_lead_id
  ) returning id into v_action_id;

  if v_function = 'update_job_details' then
    v_scope := nullif(pg_catalog.btrim(p_payload->>'scope_append'), '');
    v_status := nullif(pg_catalog.btrim(p_payload->>'status'), '');
    v_date := nullif(pg_catalog.btrim(p_payload->>'scheduled_date'), '');
    v_time := nullif(pg_catalog.btrim(p_payload->>'scheduled_time'), '');
    if v_scope is null and v_status is null and v_date is null and v_time is null then
      raise exception 'voice job update has no effect' using errcode = '22023';
    end if;
    if v_scope is not null and pg_catalog.length(v_scope) > 4000 then
      raise exception 'voice job scope is too long' using errcode = '22023';
    end if;
    if v_status is not null and v_status not in ('new_lead', 'in_progress', 'complete') then
      raise exception 'voice job status is invalid' using errcode = '22023';
    end if;
    if v_date is not null and (
      v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or pg_catalog.to_char(v_date::date, 'YYYY-MM-DD') <> v_date
    ) then
      raise exception 'voice job date is invalid' using errcode = '22023';
    end if;
    if v_time is not null and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'voice job time is invalid' using errcode = '22023';
    end if;
    update public.jobs j
       set scope = case when v_scope is null then j.scope
                    when j.scope is null or pg_catalog.btrim(j.scope) = '' then v_scope
                    when pg_catalog.strpos(pg_catalog.lower(j.scope), pg_catalog.lower(v_scope)) > 0 then j.scope
                    else j.scope || E'\n\n' || v_scope end,
           status = case when v_status is null then j.status else v_status::public.job_status end,
           scheduled_for = case when v_date is null then j.scheduled_for else v_date::date end,
           scheduled_time = case when v_time is null then j.scheduled_time else v_time::time end
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
    v_operation := coalesce(pg_catalog.lower(nullif(pg_catalog.btrim(p_payload->>'operation'), '')), 'create');
    v_name := nullif(pg_catalog.btrim(p_payload->>'name'), '');
    v_phone := nullif(pg_catalog.btrim(p_payload->>'phone'), '');
    v_email := pg_catalog.lower(nullif(pg_catalog.btrim(p_payload->>'email'), ''));
    v_address := nullif(pg_catalog.btrim(p_payload->>'address'), '');
    v_project_type := nullif(pg_catalog.btrim(p_payload->>'project_type'), '');
    v_message := nullif(pg_catalog.btrim(p_payload->>'message'), '');
    -- The caller supplies only the stable scheduling fields. Stamp the mutable
    -- audit time after the action fingerprint is claimed so an HTTP retry made
    -- seconds later hashes identically and replays instead of creating a
    -- second lead.
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
        message, source_page, triage, quote_visit, source_voice_action_id
      ) values (
        p_account_id, 'ai_voice', case when v_quote_visit is null then 'new' else 'contacted' end,
        v_name, v_phone, v_email, v_address, v_project_type, v_message, '/call',
        pg_catalog.jsonb_build_object('score', 'warm', 'flags', '[]'::jsonb, 'contactPreference', 'any'),
        v_quote_visit, v_action_id
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
             status = case when p_payload ? 'quote_visit' and l.status = 'new' then 'contacted' else l.status end,
             updated_at = v_now
       where l.id = v_lead.id
         and l.account_id = p_account_id
       returning * into v_lead;
    else
      raise exception 'voice lead operation must be create or update' using errcode = '22023';
    end if;

    update public.voice_tool_actions
       set target_lead_id = v_lead.id
     where id = v_action_id;
    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'lead_id', v_lead.id,
      'target_name', v_lead.name,
      'operation', v_operation,
      'replayed', false
    );

  elsif v_function = 'log_crew_time_and_materials' then
    if p_payload ? 'hours' then
      if pg_catalog.jsonb_typeof(p_payload->'hours') <> 'number' then
        raise exception 'voice labor hours must be numeric' using errcode = '22023';
      end if;
      v_hours := (p_payload->>'hours')::numeric;
    end if;
    if p_payload ? 'material_cost' then
      if pg_catalog.jsonb_typeof(p_payload->'material_cost') <> 'number' then
        raise exception 'voice material cost must be numeric' using errcode = '22023';
      end if;
      v_material_amount := (p_payload->>'material_cost')::numeric;
    end if;
    v_material_description := nullif(pg_catalog.btrim(p_payload->>'materials'), '');
    if coalesce(v_hours, 0) <= 0 and coalesce(v_material_amount, 0) <= 0 then
      raise exception 'voice cost action has no positive amount' using errcode = '22023';
    end if;
    if v_hours is not null and (v_hours <= 0 or v_hours > 24 or p_payload->>'crew_id' is null) then
      raise exception 'voice labor entry is invalid' using errcode = '22023';
    end if;
    if v_material_amount is not null and (v_material_amount <= 0 or v_material_amount > 1000000
                                          or v_material_description is null) then
      raise exception 'voice material entry is invalid' using errcode = '22023';
    end if;

    if v_hours is not null then
      select c.* into v_crew
        from public.crew c
       where c.id = (p_payload->>'crew_id')::uuid
         and c.account_id = p_account_id
         and c.active
         and c.deleted_at is null
         and c.access_revoked_at is null
       for share;
      if not found or v_crew.hourly_rate <= 0 then
        raise exception 'voice labor crew member is unavailable' using errcode = 'P0002';
      end if;
      if v_admission.caller_kind = 'crew' and v_crew.id is distinct from v_caller_crew.id then
        raise exception 'voice crew caller cannot log labor for a coworker' using errcode = '42501';
      end if;
      v_labor_amount := pg_catalog.round(v_hours * v_crew.hourly_rate, 2);
      v_burden_amount := pg_catalog.round(
        v_labor_amount * coalesce(v_crew.burden_pct, v_account.default_burden_pct, 0) / 100,
        2
      );
      insert into public.costs (
        account_id, job_id, type, category, description, amount,
        crew_id, crew_name, crew_role_label, hours, rate, burden_amount, cost_source
      ) values (
        p_account_id, v_job.id, 'labor', 'Labor', 'Voice logged labor', v_labor_amount,
        v_crew.id, v_crew.name, v_crew.role_label, v_hours, v_crew.hourly_rate,
        v_burden_amount, 'estimated'
      );
    end if;

    if v_material_amount is not null then
      insert into public.costs (
        account_id, job_id, type, category, description, amount, burden_amount, cost_source
      ) values (
        p_account_id, v_job.id, 'material', 'Materials', v_material_description,
        pg_catalog.round(v_material_amount, 2), 0, 'estimated'
      );
    end if;

    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'hours', coalesce(v_hours, 0),
      'material_cost', coalesce(v_material_amount, 0),
      'replayed', false
    );

  elsif v_function = 'create_job_change_order' then
    v_title := nullif(pg_catalog.btrim(p_payload->>'title'), '');
    v_description := nullif(pg_catalog.btrim(p_payload->>'description'), '');
    if v_title is null or v_description is null
       or pg_catalog.length(v_title) > 200 or pg_catalog.length(v_description) > 8000 then
      raise exception 'voice change order content is invalid' using errcode = '22023';
    end if;
    if v_admission.caller_kind = 'crew'
       and nullif(pg_catalog.btrim(p_payload->>'crew_id'), '') is null then
      raise exception 'voice crew change order must be self-attributed' using errcode = '42501';
    end if;
    if nullif(pg_catalog.btrim(p_payload->>'crew_id'), '') is not null then
      select c.* into v_crew
        from public.crew c
       where c.id = (p_payload->>'crew_id')::uuid
         and c.account_id = p_account_id
         and c.active
         and c.deleted_at is null
         and c.access_revoked_at is null
       for share;
      if not found then
        raise exception 'voice change order crew member is unavailable' using errcode = 'P0002';
      end if;
      if v_admission.caller_kind = 'crew' and v_crew.id is distinct from v_caller_crew.id then
        raise exception 'voice crew caller cannot author a change order for a coworker' using errcode = '42501';
      end if;
    end if;
    insert into public.change_orders (
      id, account_id, job_id, crew_id, crew_name, status, title, field_note, scope
    ) values (
      v_action_id, p_account_id, v_job.id, v_crew.id, v_crew.name,
      'draft', v_title, v_description, v_description
    );
    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'change_order_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'title', v_title,
      'replayed', false
    );

  elsif v_function = 'append_job_caution_or_note' then
    v_note := nullif(pg_catalog.btrim(p_payload->>'note'), '');
    v_is_caution := coalesce((p_payload->>'is_caution')::boolean, false);
    if v_note is null or pg_catalog.length(v_note) > 4000 then
      raise exception 'voice job note is invalid' using errcode = '22023';
    end if;
    if v_job.client_id is not null then
      select c.notes into v_client_notes
        from public.clients c
       where c.id = v_job.client_id
         and c.account_id = p_account_id
       for update;
      if found and pg_catalog.strpos(pg_catalog.lower(coalesce(v_client_notes, '')), pg_catalog.lower(v_note)) = 0 then
        update public.clients c
           set notes = case when coalesce(pg_catalog.btrim(c.notes), '') = '' then '• ' || v_note
                            else c.notes || E'\n• ' || v_note end,
               updated_at = v_now
         where c.id = v_job.client_id
           and c.account_id = p_account_id;
      end if;
    end if;
    v_outcome := pg_catalog.jsonb_build_object(
      'action_id', v_action_id,
      'job_id', v_job.id,
      'job_ref', v_job.ref,
      'target_name', v_job.client_name,
      'is_caution', v_is_caution,
      'saved', pg_catalog.jsonb_build_object('note', v_note, 'is_caution', v_is_caution),
      'replayed', false
    );
  end if;

  if v_function <> 'create_or_update_lead' then
    insert into public.job_feed (
      account_id, job_id, kind, title, body, author, meta,
      visibility, source_table, source_id
    ) values (
      p_account_id,
      v_job.id,
      case when v_function = 'append_job_caution_or_note' and v_is_caution
           then 'field_caution'
           when v_function = 'append_job_caution_or_note' then 'field_note'
           else 'job_update' end,
      case v_function
        when 'update_job_details' then 'Updated by AI Voice Dispatch'
        when 'log_crew_time_and_materials' then 'Logged Time & Materials'
        when 'create_job_change_order' then 'Draft Change Order Created'
        when 'append_job_caution_or_note' then case when v_is_caution then 'Site Caution' else 'Internal Note' end
      end,
      case v_function
        when 'update_job_details' then coalesce(v_scope, 'Schedule, status, or quote details updated by phone.')
        when 'log_crew_time_and_materials' then
          pg_catalog.concat_ws(' ',
            case when v_hours is not null then v_hours::text || ' labor hours logged.' end,
            case when v_material_amount is not null then '$' || v_material_amount::text || ' materials: ' || v_material_description || '.' end
          )
        when 'create_job_change_order' then v_title || ': ' || v_description
        when 'append_job_caution_or_note' then v_note
      end,
      'Contractor (AI Voice Dispatch)',
      pg_catalog.jsonb_build_object(
        'voiceLogged', true,
        'providerCallId', p_provider_call_id,
        'actionId', v_action_id
      ),
      'internal', 'voice_tool_actions', v_action_id
    );
  end if;

  update public.voice_tool_actions
     set action_state = 'applied',
         outcome = v_outcome,
         applied_at = v_now
   where id = v_action_id;

  return v_outcome;
end
$fn$;

revoke all on function public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
