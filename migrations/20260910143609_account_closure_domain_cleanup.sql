begin;

-- Capture provider handles inside the existing closure-request transaction.
-- The ledger is already RLS protected and service-role only. Old unfinished
-- jobs need operator review: their email rows may already have been disposed.
alter table public.account_closure_jobs
  add column domain_cleanup_state text not null default 'not_applicable'
    check (domain_cleanup_state in ('pending', 'retry', 'success', 'not_applicable', 'operator_review')),
  add column domain_cleanup_targets jsonb,
  add column domain_cleanup_started_at timestamptz,
  add column domains_reusable_after timestamptz;

update public.account_closure_jobs
set domain_cleanup_state = 'operator_review',
    last_error = 'Domain cleanup targets were not captured before this legacy closure; review provider inventory.'
where completed_at is null;

create function public.capture_closure_domain_targets()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lgq:closure-domain-bindings', 0));
  select coalesce(jsonb_agg(t.target), '[]'::jsonb)
    into new.domain_cleanup_targets
  from (
    select jsonb_build_object('kind', 'website', 'domain', lower(btrim(s.custom_domain)), 'bindingId', s.id, 'subdomain', s.subdomain) target
    from public.sites s where s.account_id = new.closure_subject_id and nullif(btrim(s.custom_domain), '') is not null
    union all
    select jsonb_build_object('kind', 'email', 'domain', lower(btrim(e.domain)), 'bindingId', e.id, 'providerId', e.provider_domain_id)
    from public.email_sending_domains e where e.account_id = new.closure_subject_id
  ) t;
  new.domain_cleanup_state := case when jsonb_array_length(new.domain_cleanup_targets) = 0 then 'not_applicable' else 'pending' end;
  return new;
end;
$$;
create trigger capture_closure_domain_targets before insert on public.account_closure_jobs
for each row execute function public.capture_closure_domain_targets();

-- Serialize new bindings with closure snapshots. A hostname cannot be reused
-- while a worker still has authority to release its previous provider binding.
create function public.guard_closure_domain_binding()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_domain text; v_kind text;
begin
  if tg_table_name = 'sites' then
    v_kind := 'website'; v_domain := lower(btrim(new.custom_domain));
    if tg_op = 'UPDATE' then
      if new.account_id = old.account_id and new.custom_domain is not distinct from old.custom_domain then return new; end if;
    end if;
  else
    v_kind := 'email'; v_domain := lower(btrim(new.domain));
    if tg_op = 'UPDATE' then
      if new.account_id = old.account_id and new.domain = old.domain and new.provider_domain_id is not distinct from old.provider_domain_id then return new; end if;
    end if;
  end if;
  if nullif(v_domain, '') is null then return new; end if;
  -- The request RPC locks this account before inserting the closure job.
  perform 1 from public.accounts a where a.id = new.account_id for update;
  perform pg_advisory_xact_lock(hashtextextended('lgq:closure-domain-bindings', 0));
  if exists (select 1 from public.account_closure_jobs j where j.closure_subject_id = new.account_id and j.completed_at is null) then
    raise exception 'A closing account cannot connect or transfer a domain' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.account_closure_jobs j,
      jsonb_array_elements(coalesce(j.domain_cleanup_targets, '[]'::jsonb)) t
    where t->>'kind' = v_kind and t->>'domain' = v_domain
      and j.closure_state <> 'cancelled_restored'
      and (j.completed_at is null or j.domains_reusable_after > clock_timestamp())
  ) then
    raise exception 'This domain has pending account-closure cleanup' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger guard_site_closure_domain before insert or update of account_id, custom_domain on public.sites
for each row execute function public.guard_closure_domain_binding();
create trigger guard_email_closure_domain before insert or update of account_id, domain, provider_domain_id on public.email_sending_domains
for each row execute function public.guard_closure_domain_binding();

-- Revalidate immediately before every provider request. Clearing the local
-- website route and recording the start are atomic; failures retain targets.
create function public.prepare_closure_domain_cleanup(p_job_id uuid, p_lease_token uuid, p_expected_version integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare j public.account_closure_jobs%rowtype; v_hold boolean;
begin
  select * into j from public.account_closure_jobs where id = p_job_id for update;
  if j.id is null or j.completed_at is not null or j.closure_state <> 'processing'
    or j.lease_token is distinct from p_lease_token or p_lease_token is null
    or j.version <> p_expected_version or j.lease_expires_at is null
    or j.lease_expires_at <= clock_timestamp() + interval '30 seconds'
    or j.recoverable_until > clock_timestamp() or j.purge_eligible_at > clock_timestamp()
    or j.legal_hold or j.local_disposal_state <> 'completed'
    or j.domain_cleanup_state not in ('pending', 'retry')
    or j.domain_cleanup_targets is null then
    raise exception 'Domain cleanup lease or closure eligibility is invalid' using errcode = '55000';
  end if;
  select a.legal_hold into v_hold from public.accounts a where a.id = j.closure_subject_id for update;
  if not found or v_hold is distinct from false then
    raise exception 'Domain cleanup requires an existing account without a legal hold' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lgq:closure-domain-bindings', 0));
  if exists (
    select 1 from jsonb_array_elements(j.domain_cleanup_targets) t
    join public.sites s on lower(btrim(s.custom_domain)) = t->>'domain'
    where t->>'kind' = 'website' and s.account_id <> j.closure_subject_id
  ) or exists (
    select 1 from jsonb_array_elements(j.domain_cleanup_targets) t
    join public.email_sending_domains e on e.provider_domain_id = t->>'providerId' or lower(btrim(e.domain)) = t->>'domain'
    where t->>'kind' = 'email' and e.account_id <> j.closure_subject_id
  ) then
    raise exception 'Captured domain is now owned by another account; operator review required' using errcode = '55000';
  end if;
  update public.sites s set custom_domain = null, custom_domain_verified_at = null, published = false
  where s.account_id = j.closure_subject_id and exists (
    select 1 from jsonb_array_elements(j.domain_cleanup_targets) t
    where t->>'kind' = 'website' and t->>'domain' = lower(btrim(s.custom_domain)) and t->>'bindingId' = s.id::text
  );
  update public.account_closure_jobs set domain_cleanup_started_at = coalesce(domain_cleanup_started_at, clock_timestamp()) where id = j.id;
  return j.domain_cleanup_targets;
end;
$$;

create or replace function public.update_closure_job_stage(
  p_job_id uuid, p_lease_token uuid, p_expected_version integer,
  p_stage text, p_status text, p_last_error text default null,
  p_encrypted_handles text default null, p_next_retry_at timestamptz default null
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_updated integer;
begin
  if p_stage not in ('local_disposal', 'stripe', 'quickbooks', 'storage', 'auth_cleanup', 'domain_cleanup') then return false; end if;
  update public.account_closure_jobs j
  set local_disposal_state = case when p_stage = 'local_disposal' then p_status else local_disposal_state end,
      stripe_state = case when p_stage = 'stripe' then p_status else stripe_state end,
      quickbooks_state = case when p_stage = 'quickbooks' then p_status else quickbooks_state end,
      storage_state = case when p_stage = 'storage' then p_status else storage_state end,
      auth_cleanup_state = case when p_stage = 'auth_cleanup' then p_status else auth_cleanup_state end,
      domain_cleanup_state = case when p_stage = 'domain_cleanup' then p_status else domain_cleanup_state end,
      domains_reusable_after = case when p_stage = 'domain_cleanup' and p_status = 'success'
        then greatest(j.lease_expires_at, clock_timestamp() + interval '30 seconds') else domains_reusable_after end,
      last_error = coalesce(p_last_error, last_error),
      encrypted_vendor_handles = coalesce(p_encrypted_handles, encrypted_vendor_handles),
      next_retry_at = p_next_retry_at, version = j.version + 1, updated_at = clock_timestamp()
  where j.id = p_job_id and j.lease_token = p_lease_token and j.version = p_expected_version
    and j.lease_expires_at > clock_timestamp() and j.completed_at is null
    and j.closure_state = 'processing' and not j.legal_hold
    and (j.recoverable_until is null or j.recoverable_until <= clock_timestamp())
    and (j.purge_eligible_at is null or j.purge_eligible_at <= clock_timestamp())
    and exists (select 1 from public.accounts a where a.id = j.closure_subject_id and not a.legal_hold)
    and (p_stage <> 'domain_cleanup' or (
      j.domain_cleanup_state in ('pending', 'retry') and p_status in ('success', 'retry')
      and (p_status = 'retry' or (j.local_disposal_state = 'completed' and j.domain_cleanup_started_at is not null))
    ));
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Even an older deployed worker cannot mark these jobs complete without the
-- new stage. Preserve vendor handles and the reservation until all tracks pass.
create or replace function public.complete_closure_job(
  p_job_id uuid, p_lease_token uuid, p_expected_version integer, p_manifest jsonb
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare v_updated integer;
begin
  update public.account_closure_jobs j
  set completed_at = clock_timestamp(), closure_state = 'completed',
      encrypted_vendor_handles = null, manifest = p_manifest,
      lease_token = null, lease_expires_at = null, version = j.version + 1, updated_at = clock_timestamp()
  where j.id = p_job_id and j.lease_token = p_lease_token and j.version = p_expected_version
    and j.lease_expires_at > clock_timestamp() and j.completed_at is null and j.closure_state = 'processing'
    and not j.legal_hold
    and (j.recoverable_until is null or j.recoverable_until <= clock_timestamp())
    and (j.purge_eligible_at is null or j.purge_eligible_at <= clock_timestamp())
    and exists (select 1 from public.accounts a where a.id = j.closure_subject_id and not a.legal_hold)
    and j.local_disposal_state = 'completed'
    and j.stripe_state in ('success', 'not_applicable')
    and j.quickbooks_state in ('success', 'not_applicable')
    and j.storage_state in ('success', 'not_applicable')
    and j.auth_cleanup_state in ('success', 'not_applicable')
    and j.domain_cleanup_state in ('success', 'not_applicable');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.capture_closure_domain_targets() from public, anon, authenticated;
revoke all on function public.guard_closure_domain_binding() from public, anon, authenticated;
revoke all on function public.prepare_closure_domain_cleanup(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.update_closure_job_stage(uuid, uuid, integer, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_closure_job(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_closure_domain_cleanup(uuid, uuid, integer) to service_role;
grant execute on function public.update_closure_job_stage(uuid, uuid, integer, text, text, text, text, timestamptz) to service_role;
grant execute on function public.complete_closure_job(uuid, uuid, integer, jsonb) to service_role;
commit;
