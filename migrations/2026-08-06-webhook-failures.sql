-- Inbound webhook failure log — Stripe (src/app/api/stripe/webhook/route.ts),
-- Twilio (src/app/api/twilio/inbound & /status), and Resend
-- (src/app/api/resend/webhook). All three providers retry automatically, so a
-- single bad signature or a thrown error rarely loses data outright — but a
-- *string* of them (a rotated secret, a schema drift that makes every
-- delivery throw) is exactly the kind of silent breakage that only shows up
-- here first. Written by src/lib/webhook-failures.ts, best-effort — logging a
-- failure must never itself throw.
create table if not exists webhook_failures (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('stripe','twilio_inbound','twilio_status','resend')),
  event_type       text,              -- Stripe event.type / Twilio MessageStatus / Resend event type, when we got far enough to know it
  reference_id     text,              -- Stripe event id / Twilio MessageSid / Resend email_id, when known
  error_message    text not null,
  payload_excerpt  text,              -- small truncated snippet for debugging — never the full raw body
  resolved_at      timestamptz,
  resolved_by      text,
  created_at       timestamptz not null default now()
);
create index if not exists webhook_failures_unresolved_idx on webhook_failures (created_at desc) where resolved_at is null;
create index if not exists webhook_failures_source_idx on webhook_failures (source, created_at desc);
-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client (used inside requireAdmin's context, and by the webhook
-- routes themselves) can read/write it.
alter table webhook_failures enable row level security;
