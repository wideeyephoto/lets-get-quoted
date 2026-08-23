-- Add the `office` value to member_role. Nothing else.
--
-- WHY IT IS ALONE IN A FILE. `alter type ... add value` commits the new label,
-- but PostgreSQL refuses to let the SAME transaction use it: any later statement
-- that evaluates 'office'::member_role -- a partial index predicate, a default,
-- a check -- fails with "unsafe use of new value of enum type". Splitting is not
-- tidiness. A combined migration would fail at apply time, on production, after
-- the earlier half had already run.
--
-- Apply this file first and confirm it committed. 20260819090100 does the rest
-- and will refuse to run if this one has not.
--
-- Safe on its own and reversible by neglect: an enum label no row uses and no
-- code writes changes nothing. Existing 'owner' and 'crew' rows are untouched.

alter type public.member_role add value if not exists 'office';
