-- Who accepted the quote, and when.
--
-- The client job page already collected a typed name — but it collected it to
-- authorize recurring card charges on a payment plan, which is a different
-- agreement from accepting the work and the price. A homeowner typing their
-- name under "authorize automatic installment payments" has not signed a quote,
-- and nothing on the job recorded that they ever had.
--
-- Invoices have carried signer_name/signed_at since the beginning; this is the
-- same pair for the quote itself, so an acceptance can be evidenced without
-- reading it back out of a feed row's prose.
--
-- Nullable and additive: every existing accepted quote simply has no signature
-- on file, which is the truth about them.

alter table jobs add column if not exists quote_signer_name text;
alter table jobs add column if not exists quote_signed_at timestamptz;
