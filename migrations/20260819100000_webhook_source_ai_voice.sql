-- Give AI Voice a value to log failures under, before it can fail.
--
-- APPLY THIS BEFORE deploying any code that writes 'ai_voice'. The order is the
-- same one 2026-08-20-webhook-source-provider-neutral.sql spells out, and for
-- the same reason: logWebhookFailure() is best-effort by contract — it catches
-- its own insert error and console.errors it — so a CHECK violation does not
-- throw, does not retry, and surfaces nowhere. Deploy first and the failure log
-- silently stops recording failures during the exact window somebody is
-- watching it, which for a brand-new webhook is every window.
--
-- Doing it now, while nothing writes the value, is what makes the order free.
--
-- WHY A SEPARATE VALUE FROM 'sms_voice'. The existing voice routes handle a
-- call by dialling the contractor's real line; an AI receptionist answers it
-- instead. They are different rails with different providers' payloads, and the
-- Command Center renders source directly, so collapsing them would make a
-- signature failure on one indistinguishable from the other at the only place
-- anybody looks. 'sms_voice' keeps meaning the dial-and-forward rail.
--
-- Additive only: one constraint widened. Safe to run twice. Existing rows are
-- untouched, and every value that was legal stays legal.

begin;

alter table webhook_failures drop constraint if exists webhook_failures_source_check;
alter table webhook_failures add constraint webhook_failures_source_check
  check (source in (
    'stripe',
    'resend',
    -- historic, still written by nothing new
    'twilio_inbound',
    'twilio_status',
    -- provider-neutral
    'sms_inbound',
    'sms_status',
    'sms_voice',
    -- the AI receptionist rail, written from a later deploy
    'ai_voice'
  ));

do $$
begin
  -- Prove the widened constraint actually admits the new value, rather than
  -- trusting that the text above was edited correctly.
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'webhook_failures_source_check'
      and pg_catalog.pg_get_constraintdef(oid) like '%ai_voice%'
  ) then
    raise exception 'webhook_failures_source_check does not admit ai_voice';
  end if;
end $$;

commit;
