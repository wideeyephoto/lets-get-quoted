-- "These two are not the same customer."
--
-- findDuplicateGroups is a SUGGESTION engine and is deliberately allowed to be
-- less certain than the create-time dedupe: it proposes, a person decides. What
-- it had no way to record was the decision "no". A landlord and their tenant on
-- one phone number, a father and son at one address, two crews of the same
-- franchise sharing an office line — all real, all correctly grouped, all
-- reappearing at the top of the customer book every single time the page loads,
-- for ever. A suggestion you cannot dismiss stops being a suggestion and
-- becomes a permanent accusation, and the panel it lives in gets collapsed and
-- never opened again — after which the real duplicates go unfound too.
--
-- Additive: one new table. Safe to run twice. Every read tolerates it being
-- absent, so until this runs the panel behaves exactly as it does today.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

create table if not exists client_duplicate_dismissals (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- THE MEMBERS, not the group key. findDuplicateGroups keys a group on the
  -- value the records share ("phone:+12485550117"), which is stable while the
  -- membership changes underneath it — so keying the dismissal on that would
  -- hide a THIRD record arriving on the same number later, which is exactly the
  -- case worth seeing. The ids, sorted and joined, change whenever the set
  -- changes, so the suggestion comes back when it is a different suggestion.
  member_key  text not null,
  -- Which rule grouped them, kept for reading the table rather than for
  -- matching on. Nullable so an old row is never a problem.
  reason      text,
  created_at  timestamptz not null default now(),
  unique (account_id, member_key)
);

-- The only query shape: every dismissal for one account, read once per page.
create index if not exists client_duplicate_dismissals_account_idx
  on client_duplicate_dismissals (account_id);

alter table client_duplicate_dismissals enable row level security;
drop policy if exists client_duplicate_dismissals_owner on client_duplicate_dismissals;
create policy client_duplicate_dismissals_owner on client_duplicate_dismissals
  for all using (is_owner(account_id)) with check (is_owner(account_id));

commit;
