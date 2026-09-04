-- Migration: 20260904170000_sync_messaging_registrations_dedicated_canary.sql
-- Goal: Synchronize messaging_registrations for accounts with active dedicated senders in sms_sender_numbers

begin;

-- Insert or update messaging_registrations for BrokePipes and any account with an active dedicated sender
insert into public.messaging_registrations (
  account_id,
  status,
  provider,
  provider_reference,
  status_detail,
  assigned_number,
  submitted_at,
  decided_at,
  created_at,
  updated_at
)
select
  s.account_id,
  'approved'::text,
  s.provider,
  s.provider_number_id,
  null::text,
  s.e164_number,
  coalesce(s.activated_at, clock_timestamp()),
  coalesce(s.activated_at, clock_timestamp()),
  coalesce(s.activated_at, clock_timestamp()),
  clock_timestamp()
from public.sms_sender_numbers s
where s.purpose = 'contractor_dedicated'
  and s.provisioning_status = 'active'
  and s.assignment_state = 'assigned'
  and s.account_id is not null
  and s.e164_number is not null
on conflict (account_id) do update set
  status = 'approved',
  provider = excluded.provider,
  provider_reference = excluded.provider_reference,
  status_detail = null,
  assigned_number = excluded.assigned_number,
  decided_at = coalesce(public.messaging_registrations.decided_at, excluded.decided_at),
  updated_at = clock_timestamp();

commit;
