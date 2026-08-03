-- Review gating removal.
--
-- letsgetquoted.com routed 4-5★ customers to Google and sent 1-3★ customers to a
-- private feedback form that never showed the Google link. That is review
-- gating: Google's review policy prohibits discouraging negative reviews or
-- selectively soliciting positive ones, and the profile that gets restricted for
-- it belongs to the CONTRACTOR, not to us — even though the decision was made by
-- our product, on by default, with no way for them to know it was a problem.
-- The FTC's Consumer Reviews rule (effective October 2024) covers the same
-- conduct.
--
-- Every customer now sees the same two routes: post publicly, tell the
-- contractor privately, or both. The star rating survives as the owner's own
-- service signal and no longer decides anything.

-- Both routes can now be taken by the same person, so a single routed_to can no
-- longer describe what happened. Each route gets its own timestamp.
alter table review_invites add column if not exists google_clicked_at timestamptz;
alter table review_invites add column if not exists feedback_at timestamptz;

-- Backfill so historical rows keep telling the truth rather than reading as
-- "never responded" once the summary stops trusting routed_to.
update review_invites
   set google_clicked_at = responded_at
 where routed_to = 'google'
   and google_clicked_at is null
   and responded_at is not null;

update review_invites
   set feedback_at = responded_at
 where routed_to = 'private'
   and feedback_at is null
   and responded_at is not null;

-- The account setting no longer gates anything. It now chooses whether the ask
-- goes through our "how did we do?" page — which offers BOTH routes — or links
-- straight to Google. Renamed because a column called review_gating_enabled
-- describes a feature we no longer have.
do $$
begin
  if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'accounts'
           and column_name = 'review_gating_enabled')
     and not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'accounts'
           and column_name = 'review_feedback_page_enabled')
  then
    alter table accounts rename column review_gating_enabled to review_feedback_page_enabled;
  end if;
end $$;

-- Fresh databases that never had the old column still need the setting. Existing
-- accounts keep whatever they had turned on: neither state is a gate now, so
-- flipping it for them would change their customer's experience for no reason.
alter table accounts
  add column if not exists review_feedback_page_enabled boolean not null default true;

-- The rename above carries the OLD column's default (false, from when this was
-- opt-in screening) so the add-if-not-exists never gets to set one. Fix it
-- explicitly. Only new accounts are affected — a default is not a backfill.
-- On for new contractors because the page is now strictly additive: it records a
-- rating for them and gives an unhappy customer somewhere to go besides Google.
alter table accounts alter column review_feedback_page_enabled set default true;
