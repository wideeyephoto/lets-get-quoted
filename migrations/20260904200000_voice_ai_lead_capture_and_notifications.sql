-- Migration: 20260904200000_voice_ai_lead_capture_and_notifications.sql
--
-- Add per-workspace toggles for caller post-call SMS and contractor call notifications.

begin;

alter table public.voice_settings
  add column if not exists post_call_sms_enabled boolean not null default true,
  add column if not exists contractor_notifications_enabled boolean not null default true,
  add column if not exists contractor_notification_channel text not null default 'sms'
    check (contractor_notification_channel in ('sms', 'email', 'both', 'none'));

comment on column public.voice_settings.post_call_sms_enabled is
  'Whether callers receive an automated post-call SMS follow-up with booking or portal links.';

comment on column public.voice_settings.contractor_notifications_enabled is
  'Whether the contractor receives an immediate alert when an ordinary AI call completes.';

comment on column public.voice_settings.contractor_notification_channel is
  'Preferred channel for contractor call alerts: sms, email, both, or none.';

commit;
