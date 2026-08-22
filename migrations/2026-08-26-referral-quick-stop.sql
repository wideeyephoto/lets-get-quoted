-- Quick Stop joins the referral engine.
--
-- WHY. A referral link lands on /book/<subdomain>, and that page offers TWO
-- rails: the ordinary request-a-visit flow, which becomes a lead, and Quick
-- Stop, which becomes an extra_stop_requests row and never becomes a lead at
-- all. The referral engine was built on leads, so a referred customer who took
-- the priority-visit path produced revenue with no attribution — the referrer
-- was never credited and the owner was never told the referral had arrived.
-- That is the rail a homeowner with an urgent problem is most likely to take,
-- which made it the worst possible gap to leave.
--
-- ONE COLUMN, and only because it is the money-shaped one.
--
--   The CODE is still not stored: HMAC(accountId.clientId), recomputed on
--   verify (src/lib/referral.ts).
--
--   The ATTRIBUTION is not stored in a column either. createQuickStopRequest's
--   insert already names `intake`, so the verified referrer rides in as
--   intake.referredBy — exactly how a lead's rides in triage.referredBy, and
--   for the same reason: the capture half then needs no migration and no deploy
--   ordering. It is SAFER here than on a lead, in fact. getLeadTriage rebuilds
--   the triage blob field by known field, so an unparsed key there vanishes at
--   the next write; `intake` is written once, at insert, and only ever read
--   afterwards (grep: src/lib/quick-stop-requests.ts is its only writer), so
--   there is no silent-eraser hazard to guard against.
--
--   What is left is "I have thanked this person", which the engine cannot
--   derive. Same argument as leads.referral_settled_at in the 2026-08-25
--   migration: losing an attribution is mild and self-correcting, losing THIS
--   one means the owner pays the same person twice.
--
-- APPLY THIS BEFORE the deploy that reads it. A select naming a column that
-- does not exist errors rather than degrading.
--
-- ADDITIVE AND RE-RUNNABLE. One nullable column, no default, no constraint, no
-- backfill. Every row that exists today reads as null — nothing settled — which
-- is exactly what it was before this file.
--
-- Run with:  node scripts/run-migration.mjs 2026-08-26-referral-quick-stop.sql --check
--            node scripts/run-migration.mjs 2026-08-26-referral-quick-stop.sql
-- (NOT deploy-schema.mjs — see the warning at the top of every other migration.)

begin;

-- When the owner marked the referrer as thanked for sending this Quick Stop.
-- Nullable rather than a boolean so the row records WHEN, and so "still owed"
-- is simply null. Settling stamps this and leads.referral_settled_at together,
-- because one referred person can arrive down both rails and that is one debt.
alter table extra_stop_requests add column if not exists referral_settled_at timestamptz;

commit;
