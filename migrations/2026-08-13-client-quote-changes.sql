-- Whether a customer may change their own optional extras after approving,
-- up to the day the job starts.
--
-- DEFAULT FALSE, and that is the whole decision. Defaulting this on would hand
-- every existing customer of every existing account the ability to drop work
-- the morning of — from materials already bought, from a day already blocked
-- out — without the contractor having agreed to any of it. It is their
-- livelihood. They turn it on.
--
-- What it may ever move is the optional add-ons and nothing else: the base
-- scope and its price are the contractor's quote, not a menu. The rest of the
-- rules — work started, job starts today, an authorized payment plan, money
-- already taken — live in src/lib/quote-options.ts and are re-derived on the
-- server at the moment of the write, because the form being hidden is not a
-- check.

alter table public.accounts
  add column if not exists client_quote_changes boolean not null default false;
