-- Proof of insurance, shown on quotes.
--
-- "Licensed and insured" is a claim every contractor's website makes and no
-- homeowner can check. A certificate attached to the quote turns it into
-- something they can open, which is the whole point.
--
-- The expiry date is the important column here, not the file. A certificate
-- that lapsed in March, still sitting on quotes in August, is not a neutral
-- stale asset — it is a false assurance the homeowner relied on. Everything
-- downstream keys off this date, and an expired one is never shown to a client.

alter table accounts add column if not exists insurance_path text;
-- Kept so the download arrives with the name the contractor uploaded rather
-- than a uuid, which is what a homeowner forwards to their bank or HOA.
alter table accounts add column if not exists insurance_filename text;
alter table accounts add column if not exists insurance_carrier text;
alter table accounts add column if not exists insurance_policy_number text;
alter table accounts add column if not exists insurance_coverage_amount numeric(12,2);
alter table accounts add column if not exists insurance_expires_on date;
alter table accounts add column if not exists insurance_uploaded_at timestamptz;
-- The owner's choice, defaulting to ON: somebody who has gone to the trouble of
-- uploading a certificate wants it seen. It is still a switch, because a
-- policy number is a business detail and some trades would rather not publish it.
alter table accounts add column if not exists insurance_show_on_quotes boolean not null default true;

-- PRIVATE bucket. A certificate of insurance is meant to be handed out, but
-- "handed out" is not the same as "indexed by Google": it carries the business's
-- policy number and address. Clients reach it through a signed URL minted only
-- for somebody already holding a valid job token.
insert into storage.buckets (id, name, public)
values ('insurance-proof', 'insurance-proof', false)
on conflict (id) do nothing;
