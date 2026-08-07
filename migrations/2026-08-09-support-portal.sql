-- Customer-facing support: the contractor raises a case from inside the
-- dashboard and reads the SAME support_case_notes thread staff work in.
--
-- One shared thread is the point — a case record and a separate email
-- conversation drift the moment anyone forgets to paste one into the other, and
-- there is no inbound mail parsing here to keep them together (the Resend
-- webhook handles delivery events only).
--
-- Which makes `visibility` the whole safety story. Every note that exists today
-- was written by staff, for staff, about the account that would now be reading
-- it. So the column defaults to 'internal': the backfill of existing rows is
-- correct by construction, and any code path that forgets to set it publishes
-- nothing. Failing closed is the only acceptable direction here.

alter table support_case_notes
  add column if not exists visibility text not null default 'internal';

do $$ begin
  alter table support_case_notes
    add constraint support_case_notes_visibility_check
    check (visibility in ('internal', 'customer'));
exception when duplicate_object then null; end $$;

-- Who opened it. Staff-opened cases are a log; customer-opened cases are
-- somebody waiting for an answer, and the queue should be able to tell them
-- apart without reading created_by and guessing at the domain.
alter table support_cases
  add column if not exists source text not null default 'staff';

do $$ begin
  alter table support_cases
    add constraint support_cases_source_check
    check (source in ('staff', 'customer'));
exception when duplicate_object then null; end $$;

-- Where a reply goes. Deliberately separate from created_by and from the
-- account owner's login: whoever typed the request is who is waiting on the
-- answer, and on a multi-user account that is not always the owner.
alter table support_cases
  add column if not exists requester_email text;

-- The contractor's own list: their cases, newest first.
create index if not exists support_cases_account_created_idx
  on support_cases (account_id, created_at desc);

-- Every thread read is (case, visibility, time) — staff see the whole thread,
-- the customer sees their half of it.
create index if not exists support_case_notes_visible_idx
  on support_case_notes (case_id, visibility, created_at);
