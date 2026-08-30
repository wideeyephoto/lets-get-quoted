-- Migration: 20260830180000_messaging_compliance_audit_and_sole_prop.sql
-- Description: Supports No-EIN Sole Proprietor TCR OTP verification track and separates owner self-attestation audit events from staff MFA compliance verification.

-- 1. Extend messaging_compliance_verifications for TCR sole proprietor OTP track
alter table public.messaging_compliance_verifications
  add column if not exists verification_method text not null default 'ein',
  add column if not exists otp_reference text;

alter table public.messaging_compliance_verifications
  alter column ein_last_four drop not null;

-- Ensure constraints match verification method
alter table public.messaging_compliance_verifications
  drop constraint if exists messaging_compliance_verifications_method_check;

alter table public.messaging_compliance_verifications
  add constraint messaging_compliance_verifications_method_check check (
    verification_method in ('ein', 'sole_proprietor_otp')
    and (
      (verification_method = 'ein' and ein_last_four ~ '^[0-9]{4}$')
      or
      (verification_method = 'sole_proprietor_otp' and ein_last_four is null)
    )
  );

-- 2. Owner self-attestation audit event recorder
create or replace function public.record_messaging_tax_identity_submission(
  p_application_id uuid,
  p_verification_method text,
  p_ein_last_four text,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_application public.messaging_registration_applications%rowtype;
begin
  if p_application_id is null
     or coalesce(p_verification_method, '') not in ('ein', 'sole_proprietor_otp')
     or (p_verification_method = 'ein' and coalesce(p_ein_last_four, '') !~ '^[0-9]{4}$')
     or (p_verification_method = 'sole_proprietor_otp' and p_ein_last_four is not null)
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_actor_reference, ''))) not between 3 and 320 then
    raise exception 'Messaging tax identity submission input is invalid' using errcode = '22023';
  end if;

  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    v_application.id, v_application.account_id, 'tax_identity_submitted',
    'owner', pg_catalog.btrim(p_actor_reference), v_application.status, v_application.status,
    case
      when p_verification_method = 'ein' then 'Tax identity / EIN suffix self-attested by account owner upon application submission'
      else 'Sole proprietor no-EIN identity self-attested by account owner for carrier OTP verification'
    end,
    pg_catalog.jsonb_build_object(
      'application_revision', v_application.revision,
      'verification_method', p_verification_method,
      'ein_last_four_provided', p_verification_method = 'ein'
    )
  );
  return true;
end;
$$;

-- 3. Staff / Provider compliance verification function (MFA-authorized staff or provider verification)
create or replace function public.record_messaging_compliance_verification(
  p_application_id uuid,
  p_ein_last_four text,
  p_verification_reference text,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  return public.record_messaging_compliance_verification_v2(
    p_application_id,
    'ein',
    p_ein_last_four,
    p_verification_reference,
    null,
    p_actor_reference
  );
end;
$$;

create or replace function public.record_messaging_compliance_verification_v2(
  p_application_id uuid,
  p_verification_method text,
  p_ein_last_four text,
  p_verification_reference text,
  p_otp_reference text,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_method text := coalesce(p_verification_method, 'ein');
begin
  if p_application_id is null
     or v_method not in ('ein', 'sole_proprietor_otp')
     or (v_method = 'ein' and coalesce(p_ein_last_four, '') !~ '^[0-9]{4}$')
     or (v_method = 'sole_proprietor_otp' and p_ein_last_four is not null)
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_verification_reference, ''))) not between 4 and 255
     or pg_catalog.btrim(coalesce(p_verification_reference, '')) ~ '(^|[^0-9])[0-9]{2}-?[0-9]{7}([^0-9]|$)'
     or pg_catalog.length(pg_catalog.regexp_replace(coalesce(p_verification_reference, ''), '[^0-9]', '', 'g')) = 9
     or (p_otp_reference is not null and (
          pg_catalog.length(pg_catalog.btrim(p_otp_reference)) not between 4 and 255
          or pg_catalog.btrim(p_otp_reference) ~ '(^|[^0-9])[0-9]{2}-?[0-9]{7}([^0-9]|$)'
          or pg_catalog.length(pg_catalog.regexp_replace(p_otp_reference, '[^0-9]', '', 'g')) = 9
        ))
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_actor_reference, ''))) not between 3 and 320 then
    raise exception 'Messaging compliance verification input is invalid' using errcode = '22023';
  end if;

  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected')
     or v_application.provider_brand_id is not null
     or v_application.provider_campaign_id is not null
     or v_application.provider_number_id is not null then
    raise exception 'Approved or provisioned compliance evidence is immutable; clear the carrier binding through a reviewed invalidation before reverifying'
      using errcode = '55000';
  end if;

  insert into public.messaging_compliance_verifications (
    application_id, account_id, application_revision, verification_method,
    ein_last_four, verification_reference, otp_reference, verified_at, verified_by, created_at, updated_at
  ) values (
    v_application.id, v_application.account_id, v_application.revision, v_method,
    p_ein_last_four, pg_catalog.btrim(p_verification_reference),
    case when p_otp_reference is not null then pg_catalog.btrim(p_otp_reference) else null end,
    v_now, pg_catalog.btrim(p_actor_reference), v_now, v_now
  )
  on conflict (application_id) do update
    set account_id = excluded.account_id,
        application_revision = excluded.application_revision,
        verification_method = excluded.verification_method,
        ein_last_four = excluded.ein_last_four,
        verification_reference = excluded.verification_reference,
        otp_reference = excluded.otp_reference,
        verified_at = excluded.verified_at,
        verified_by = excluded.verified_by,
        updated_at = excluded.updated_at;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    v_application.id, v_application.account_id, 'tax_identity_verified',
    'staff', p_actor_reference, v_application.status, v_application.status,
    case
      when v_method = 'ein' then 'Tax identity verified by MFA operations; only the last four are retained in restricted compliance storage.'
      else 'Sole proprietor identity and phone OTP verified by MFA operations for carrier registration.'
    end,
    pg_catalog.jsonb_build_object(
      'application_revision', v_application.revision,
      'verification_method', v_method,
      'ein_last_four_recorded', v_method = 'ein'
    )
  );
  return true;
end;
$$;

-- Permissions
revoke all on function public.record_messaging_tax_identity_submission(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_messaging_tax_identity_submission(uuid,text,text,text) to service_role;

revoke all on function public.record_messaging_compliance_verification_v2(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_messaging_compliance_verification_v2(uuid,text,text,text,text,text) to service_role;
