-- An inbox that can tell you there is mail, and that keeps the photos.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Every read is written to tolerate the columns being
-- absent, so until it runs the page behaves exactly as it does today.
--
-- Additive only: two columns on sms_messages, one index. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- 1. UNREAD.
--
-- On the message, not the thread. A per-thread "last opened" marker is smaller
-- but cannot answer "how many are waiting" without re-walking every thread, and
-- that count is the whole point — it is what goes in the nav so a text is
-- noticed without going to look for it.
--
-- Nullable, and NULL means unread. Existing rows therefore all start unread,
-- which is wrong-ish for old threads but wrong in the safe direction: the worst
-- case is a contractor clearing a badge once, versus silently marking a real
-- customer message as already seen.
alter table sms_messages add column if not exists read_at timestamptz;

-- Only INBOUND messages are ever unread — our own outbound copy is not mail.
-- Partial index so the nav count stays a cheap lookup as threads pile up.
create index if not exists sms_messages_unread_idx
  on sms_messages (account_id)
  where direction = 'inbound' and read_at is null;

-- 2. PHOTOS.
--
-- Twilio sends NumMedia + MediaUrl0..N on an inbound MMS, and the webhook has
-- been ignoring all of it. A homeowner photographing a leaking valve is the most
-- useful thing that arrives by text, and it was landing as a message with no
-- indication anything was attached — worse than not supporting it, because the
-- thread looked complete.
--
-- Stored as the URLs Twilio hosts. They are unguessable but publicly fetchable,
-- so they are treated as capability URLs: never rendered anywhere but the
-- owner's own dashboard. Copying the bytes into our own storage would be better
-- and is the obvious next step; it needs a bucket and a retention policy, and
-- keeping a photo we never looked at is its own decision.
alter table sms_messages add column if not exists media_urls text[];

commit;
