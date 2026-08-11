-- The signature a homeowner draws with their finger.
--
-- Stored as SVG path data rather than a rasterised image: it prints at the
-- printer's resolution instead of the phone's, it is one to three kilobytes
-- instead of forty, and — the part that decides it — path data is numbers and
-- eight letters, which a strict allowlist can prove is inert. This value
-- arrives from an anonymous visitor holding a link and is later rendered on the
-- contractor's screens too. See src/lib/signature.ts.
--
-- The viewBox is a constant both the writer and every reader agree on
-- (600 x 200), so the path is the only thing that needs a column.
--
-- quote_signature_method distinguishes the two ways of signing, because they
-- are both signatures and they are not the same thing: 'typed' is a name
-- entered as an acceptance, 'drawn' is a mark. A receipt that showed a typed
-- name where a mark had been made — or the reverse — would misdescribe what
-- somebody actually did.
--
-- Both nullable: every acceptance recorded before this migration has a name and
-- no mark, which is exactly what null means here.

alter table public.jobs
  add column if not exists quote_signature_path text;

alter table public.jobs
  add column if not exists quote_signature_method text;

alter table public.jobs
  drop constraint if exists jobs_quote_signature_method_check;

alter table public.jobs
  add constraint jobs_quote_signature_method_check
  check (quote_signature_method is null or quote_signature_method in ('drawn', 'typed'));
