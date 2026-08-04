-- Terms of Service acceptance + the two first-run answers.
--
-- Until now an account could be created, store a contractor's customer list, and
-- send texts to homeowners with no agreement in place between LETS GET QUOTED
-- LLC and the contractor. These columns record what was agreed, when, and by
-- which human — the account is the customer, but a person clicks the box.
--
-- terms_version is stored rather than inferred so "which document did they
-- actually accept" stays answerable after the document changes. A mismatch with
-- the current TERMS_VERSION sends the owner back through acceptance.
--
-- All nullable and additive: existing accounts read as not-yet-accepted and get
-- the first-run screen on their next dashboard visit, which is correct — they
-- haven't accepted either.

alter table accounts add column if not exists terms_accepted_at timestamptz;
alter table accounts add column if not exists terms_version     text;
-- The auth user who clicked, for the audit trail. Deliberately NOT a foreign key
-- to auth.users: that table is Supabase's, and a cascade from it must never be
-- able to blank an acceptance record.
alter table accounts add column if not exists terms_accepted_by uuid;

-- Primary trade, asked on the same screen. Lives on the account (not on the
-- site's content, where a trade string already exists for glyph selection)
-- because it is true before any site is built, and it is what should seed that
-- site's trade rather than the other way round.
alter table accounts add column if not exists trade text;

-- ZIP, asked on the same screen. This is the one answer that turns the AI site
-- generator from "a site about a trade" into "a site about a trade in a real
-- town": generateSiteTextAction treats a ZIP as AUTHORITATIVE and resolves it to
-- the actual city, which drives the headline, the SEO title, the service area
-- and the list of nearby cities. Without it the generator is instructed never to
-- invent a location, so the whole site comes out placeless.
-- Text, not an integer: leading zeros are real ZIPs (Massachusetts starts 0).
alter table accounts add column if not exists postal_code text;

-- Answers "who still hasn't accepted" without a sequential scan once there are
-- real numbers of accounts.
create index if not exists accounts_terms_pending_idx
  on accounts (id) where terms_accepted_at is null;
