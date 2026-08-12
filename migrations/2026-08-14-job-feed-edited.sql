-- When a manually-posted job update was last rewritten.
--
-- ONLY job_update ROWS ARE EVER EDITABLE, and that boundary is enforced in the
-- action rather than here: everything else in the feed is a record of something
-- that happened — a payment taken, a quote approved, work started — and a
-- record you can rewrite is not a record. See editJobFeedUpdateAction.
--
-- The column exists so the edit is visible. A note that quietly changes on a
-- customer's page after they have read it is the same fault as a quote whose
-- total moves underneath them, and it gets the same answer: say so. Null means
-- never edited, which is what it is for every row already written.

alter table public.job_feed
  add column if not exists edited_at timestamptz;
