-- Let the failure log survive a change of SMS provider.
--
-- APPLY THIS BEFORE deploying the code that writes the new values. That order
-- is not a nicety. logWebhookFailure() is best-effort by contract — it catches
-- its own insert error and console.errors it — so a CHECK violation here does
-- not throw, does not retry, and does not surface anywhere. Deploy first and
-- the failure log silently stops recording failures during the exact window
-- you are watching it: a provider cutover.
--
-- Additive only: one constraint widened. Safe to run twice.

begin;

-- WHY THE OLD VALUES STAY.
--
-- 'twilio_inbound' and 'twilio_status' are not deprecated spellings to be
-- migrated away from — they are the literal contents of existing rows, and the
-- Command Center renders row.source directly. Dropping them from the CHECK
-- would not rewrite history, it would just make the table refuse to hold its
-- own past. New code writes the neutral names; the old ones remain legal so
-- every row already written stays readable.
--
-- 'sms_voice' is genuinely new. Both voice webhooks (/api/sms/voice and its
-- dial-completion callback) rejected bad signatures with no log at all — a
-- missed-call text-back could stop working entirely and leave no trace — and
-- part of the reason was that there was no value here for them to log under.
alter table webhook_failures drop constraint if exists webhook_failures_source_check;
alter table webhook_failures add constraint webhook_failures_source_check
  check (source in (
    'stripe',
    'resend',
    -- historic, still written by nothing new
    'twilio_inbound',
    'twilio_status',
    -- provider-neutral, written from the deploy that follows this migration
    'sms_inbound',
    'sms_status',
    'sms_voice'
  ));

commit;
