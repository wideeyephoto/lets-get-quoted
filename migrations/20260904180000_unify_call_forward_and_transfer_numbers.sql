-- Migration: 20260904180000_unify_call_forward_and_transfer_numbers.sql
-- Harmonize accounts.call_forward_number and voice_settings.transfer_number.
--
-- Prior to this migration, voice_settings.transfer_number held the destination
-- phone number configured by contractors via Voice Settings, while accounts.call_forward_number
-- remained NULL across accounts. This caused the missed-call rail and fallback routes
-- to play the unavailable recording rather than forwarding calls.

begin;

-- 1. Sync accounts.call_forward_number from voice_settings.transfer_number
update public.accounts a
   set call_forward_number = vs.transfer_number
  from public.voice_settings vs
 where vs.account_id = a.id
   and a.call_forward_number is null
   and vs.transfer_number is not null;

-- 2. Sync voice_settings.transfer_number from accounts.call_forward_number
update public.voice_settings vs
   set transfer_number = a.call_forward_number
  from public.accounts a
 where a.id = vs.account_id
   and vs.transfer_number is null
   and a.call_forward_number is not null;

commit;
