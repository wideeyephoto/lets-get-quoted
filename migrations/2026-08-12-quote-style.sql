-- How this contractor's quote page looks to their customer.
--
-- One of three finished treatments — see src/lib/quote-style.ts for what a
-- style is allowed to change (presentation only; never a number, never the
-- order of the two agreements).
--
-- Nullable with no default rather than DEFAULT 'signature', so "never chose"
-- and "chose the middle one" stay distinguishable. Every reader puts the column
-- through normalizeQuoteStyle, which lands on 'signature' either way, so the
-- rendered page is identical — but the picker can show an account that has
-- actually made a choice, and a later change of default would not silently
-- rewrite the intent of accounts that had one.

alter table public.accounts
  add column if not exists quote_style text;

alter table public.accounts
  drop constraint if exists accounts_quote_style_check;

alter table public.accounts
  add constraint accounts_quote_style_check
  check (quote_style is null or quote_style in ('classic', 'signature', 'bold'));
