-- Transactional email delivery log, fed by the Resend webhook
-- (src/app/api/resend/webhook/route.ts). Resend tells us the fate of a send
-- out of band — often minutes later — so this is the only place a bounce or
-- spam complaint becomes visible; nothing else in this codebase records it.
--
-- Keyed by provider_id (Resend's email id) with an upsert: a send's status
-- moves forward over its lifecycle (sent -> delivered, or sent -> bounced),
-- and we only need the latest known state, not every intermediate event.
--
-- account_id/kind are recovered from the send's tags (see the `tags` argument
-- added to every resend.emails.send() call in src/lib/email.ts) and are best-
-- effort: a send the webhook can't match back to a tag still gets logged with
-- both null/'unknown', because an unattributed bounce is still worth surfacing.
create table if not exists email_events (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references accounts(id) on delete set null,
  kind          text not null default 'unknown',
  recipient     text not null,
  provider_id   text not null,
  status        text not null check (status in ('sent','delivered','delayed','bounced','complained')),
  error_reason  text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (provider_id)
);
create index if not exists email_events_status_idx on email_events (status, occurred_at desc);
create index if not exists email_events_account_idx on email_events (account_id, occurred_at desc);
-- RLS on with NO policy: unreachable via the anon/authed keys. Only the
-- service-role client (used inside requireAdmin's context, and by the Resend
-- webhook route) can read/write it.
alter table email_events enable row level security;
