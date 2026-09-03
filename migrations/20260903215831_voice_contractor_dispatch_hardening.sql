-- Make AI Voice field dispatch a database-authorized, replay-safe mutation rail.
--
-- SignalWire does not provide a distinct tool-invocation id. The strongest
-- honest retry contract is therefore one identical canonical action per call.
-- An intentional repeat must change a semantic field (work date, amount, note,
-- etc.); a provider retry of the same request replays the stored outcome.

begin;

-- Crew verification was already used by the application, but the roster table
-- did not carry the fields it queried or updated. Add the missing durable facts.
alter table public.crew
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.crew
  drop constraint if exists crew_phone_verification_shape;
alter table public.crew
  add constraint crew_phone_verification_shape check (
    phone_verified_at is null or phone_verified
  );

-- Bind the signed inbound caller and the identity snapshot to the admission.
-- The receipt is not allowed to invent or replace either value later.
alter table public.voice_call_admissions
  add column if not exists caller_number text,
  add column if not exists caller_kind text;

alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_caller_number_shape;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_caller_number_shape check (
    caller_number is null or caller_number ~ '^\+1[2-9][0-9]{9}$'
  );

alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_caller_kind_shape;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_caller_kind_shape check (
    caller_kind is null
    or caller_kind in ('customer', 'owner', 'office', 'crew', 'staff_ambiguous', 'unknown')
  );

-- In-call customer booking is a separate mutation from staff dispatch. Bind its
-- lead and pending job to the provider call so a lost webhook response can
-- resume instead of inserting a second customer or a second booking request.
alter table public.leads
  add column if not exists source_voice_provider_call_id text;
alter table public.jobs
  add column if not exists source_voice_provider_call_id text;

alter table public.leads
  drop constraint if exists leads_voice_provider_call_shape;
alter table public.leads
  add constraint leads_voice_provider_call_shape check (
    source_voice_provider_call_id is null
    or pg_catalog.length(pg_catalog.btrim(source_voice_provider_call_id)) between 1 and 255
  );
alter table public.jobs
  drop constraint if exists jobs_voice_provider_call_shape;
alter table public.jobs
  add constraint jobs_voice_provider_call_shape check (
    source_voice_provider_call_id is null
    or pg_catalog.length(pg_catalog.btrim(source_voice_provider_call_id)) between 1 and 255
  );

drop index if exists public.leads_voice_provider_call_uidx;
drop index if exists public.jobs_voice_provider_call_uidx;
do $constraints$
begin
  alter table public.leads
    add constraint leads_voice_provider_call_unique
    unique (account_id, source_voice_provider_call_id);
exception when duplicate_object then null;
end
$constraints$;
do $constraints$
begin
  alter table public.jobs
    add constraint jobs_voice_provider_call_unique
    unique (account_id, source_voice_provider_call_id);
exception when duplicate_object then null;
end
$constraints$;

create or replace function public.voice_normalize_us_phone(p_phone text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    when pg_catalog.length(pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')) = 10
      then '+1' || pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')
    when pg_catalog.length(pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')) = 11
      and pg_catalog.left(pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g'), 1) = '1'
      then '+' || pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')
    else null
  end
$fn$;

revoke all on function public.voice_normalize_us_phone(text)
  from public, anon, authenticated, service_role;

-- Versioned admission entry point. Keeping the previous overload during the
-- migration-first rolling deploy lets old instances drain; new code calls only
-- this caller-bound version.
create or replace function public.claim_voice_call_admission_v2(
  p_account_id uuid,
  p_provider_call_id text,
  p_dialed_number text,
  p_concurrency_limit integer,
  p_caller_number text,
  p_caller_kind text
)
returns table (
  claim_status text,
  admission_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_existing public.voice_call_admissions%rowtype;
  v_open bigint;
  v_id uuid;
  v_sender_number_id uuid;
  v_route_revision bigint;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or pg_catalog.length(p_provider_call_id) > 255
     or p_dialed_number is null
     or p_dialed_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_concurrency_limit is null
     or p_concurrency_limit < 1
     or p_concurrency_limit > 100
     or (p_caller_number is not null and p_caller_number !~ '^\+1[2-9][0-9]{9}$')
     or p_caller_kind is null
     or p_caller_kind not in ('customer', 'owner', 'office', 'crew', 'staff_ambiguous', 'unknown') then
    raise exception 'voice admission claim arguments are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 84601211)
  );

  select s.id, a.ai_voice_route_revision
    into v_sender_number_id, v_route_revision
    from public.accounts a
    join public.sms_sender_numbers s
      on s.account_id = a.id
     and s.e164_number = a.call_tracking_number
   where a.id = p_account_id
     and a.suspended_at is null
     and a.call_tracking_number = p_dialed_number
     and s.provider = 'signalwire'
     and s.purpose = 'contractor_dedicated'
     and s.e164_number = p_dialed_number
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.activated_at is not null
     and s.suspended_at is null
     and s.provider_number_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   for share of a, s;

  if not found then
    return query select 'number_not_ready'::text, null::uuid;
    return;
  end if;

  select a.* into v_existing
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    if v_existing.account_id <> p_account_id then
      raise exception 'voice call id is already bound to another workspace'
        using errcode = '22000';
    end if;
    if v_existing.sender_number_id is distinct from v_sender_number_id
       or v_existing.dialed_number is distinct from p_dialed_number
       or v_existing.route_revision is distinct from v_route_revision
       or v_existing.caller_number is distinct from p_caller_number
       or v_existing.caller_kind is distinct from p_caller_kind then
      return query select 'number_not_ready'::text, null::uuid;
    elsif v_existing.admission_state = 'admitted' then
      return query select 'existing'::text, v_existing.id;
    else
      return query select 'busy'::text, v_existing.id;
    end if;
    return;
  end if;

  select pg_catalog.count(*) into v_open
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.admitted_at >= pg_catalog.clock_timestamp() - interval '60 minutes'
     and not exists (
       select 1
         from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     );

  if v_open >= p_concurrency_limit then
    return query select 'at_capacity'::text, null::uuid;
    return;
  end if;

  insert into public.voice_call_admissions (
    account_id, provider, provider_call_id, reservation_id,
    reserved_minutes, admission_state, sender_number_id,
    dialed_number, route_revision, caller_number, caller_kind
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, null,
    0, 'claimed', v_sender_number_id, p_dialed_number, v_route_revision,
    p_caller_number, p_caller_kind
  )
  returning id into v_id;

  return query select 'claimed'::text, v_id;
end
$fn$;

revoke all on function public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)
  to service_role;

create table if not exists public.voice_tool_actions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  provider_call_id text not null check (
    pg_catalog.length(pg_catalog.btrim(provider_call_id)) between 1 and 255
  ),
  caller_number text not null check (caller_number ~ '^\+1[2-9][0-9]{9}$'),
  function_name text not null check (function_name in (
    'update_job_details',
    'create_or_update_lead',
    'log_crew_time_and_materials',
    'create_job_change_order',
    'append_job_caution_or_note'
  )),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_payload jsonb not null check (pg_catalog.jsonb_typeof(request_payload) = 'object'),
  target_job_id uuid references public.jobs(id) on delete set null,
  target_lead_id uuid references public.leads(id) on delete set null,
  action_state text not null default 'pending' check (action_state in ('pending', 'applied')),
  outcome jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint voice_tool_actions_identity_unique unique (
    account_id, provider, provider_call_id, function_name, request_hash
  ),
  constraint voice_tool_actions_state_shape check (
    (action_state = 'pending' and outcome is null and applied_at is null)
    or (action_state = 'applied' and outcome is not null and applied_at is not null)
  )
);

create index if not exists voice_tool_actions_call_idx
  on public.voice_tool_actions (account_id, provider_call_id, created_at desc);

alter table public.voice_tool_actions enable row level security;
alter table public.voice_tool_actions force row level security;
-- The action table is an internal state machine. Even service-role callers use
-- the single transactional RPC so no other backend path can forge an applied
-- result or skip replay checks.
revoke all on table public.voice_tool_actions from public, anon, authenticated, service_role;

alter table public.leads
  add column if not exists source_voice_action_id uuid
    references public.voice_tool_actions(id) on delete set null;
create unique index if not exists leads_source_voice_action_uidx
  on public.leads (source_voice_action_id)
  where source_voice_action_id is not null;

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
    v_label := nullif(pg_catalog.btrim(p_payload->>'line_item_label'), '');

    if p_payload ? 'line_item_price' then
      if pg_catalog.jsonb_typeof(p_payload->'line_item_price') <> 'number' then
        raise exception 'voice quote amount must be numeric' using errcode = '22023';
      end if;
      v_price := (p_payload->>'line_item_price')::numeric;
    end if;
    if v_scope is null and v_status is null and v_date is null and v_time is null and v_label is null then
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
    if (v_label is null) <> (v_price is null)
       or (v_price is not null and (v_price <= 0 or v_price > 1000000)) then
      raise exception 'voice quote line item is invalid' using errcode = '22023';
    end if;

    if v_label is not null then
      v_quote_items := case
        when pg_catalog.jsonb_typeof(v_job.quote_items) = 'array' then v_job.quote_items
        when v_job.quoted_amount > 0 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'id', 'legacy-' || v_job.id::text,
            'label', 'Existing quote',
            'amount', v_job.quoted_amount,
            'kind', 'base',
            'selected', true,
            'recommended', false
          )
        )
        else '[]'::jsonb
      end;
      v_quote_items := v_quote_items || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'voice-' || v_action_id::text,
          'label', v_label,
          'amount', pg_catalog.round(v_price, 2),
          'kind', 'base',
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
                    when pg_catalog.position(pg_catalog.lower(v_scope) in pg_catalog.lower(j.scope)) > 0 then j.scope
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
      if found and pg_catalog.position(pg_catalog.lower(v_note) in pg_catalog.lower(coalesce(v_client_notes, ''))) = 0 then
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

revoke all on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  to service_role;

-- The action ledger is internal evidence, never a browser mutation surface.
do $assert$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type)
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'voice_tool_actions'
     and grantee in ('PUBLIC', 'anon', 'authenticated');
  if v_bad is not null then
    raise exception 'voice_tool_actions browser grants remain: %', v_bad;
  end if;
end
$assert$;

commit;
