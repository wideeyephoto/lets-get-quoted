-- A homeowner may name a second window they could also do.
--
-- WHY. A booking request is a yes/no question with one answer on the table, and
-- the answer is often "not that morning, but I could do you Thursday". Today
-- that costs a decline, a text, and a customer who has to come back to the page
-- and start again — or, more often, a phone call, which is the thing this page
-- exists to remove. A second choice turns the question into one the contractor
-- can usually say yes to without picking up the phone.
--
-- WHY THE BACKUP IS NOT HELD.
-- getAvailableBookingDays counts a pending request's window as taken, which is
-- what stops two customers being confirmed into the same slot. Counting the
-- BACKUP the same way would let one request consume two windows of a
-- contractor's day: five requests against an eight-window week and the page
-- reads as fully booked to everybody else. So booking_alt_* is a preference the
-- contractor can act on, not a reservation — and both the public page and the
-- confirm panel say so in those words rather than implying a hold.
--
-- Same shape as booking_requested_*: a date, a "HH:MM" start, and the window's
-- end snapshotted at request time so a later change to the account's window
-- length cannot rewrite what the customer was offered.

alter table jobs
  add column if not exists booking_alt_date date,
  add column if not exists booking_alt_time text,
  add column if not exists booking_alt_end_time time;

comment on column jobs.booking_alt_date is
  'Second-choice day for a self-serve booking. A PREFERENCE, not a hold: unlike booking_requested_date this window is not counted as taken by getAvailableBookingDays, so somebody else may take it before the contractor answers.';
comment on column jobs.booking_alt_time is
  'The 24h "HH:MM" window start of the second choice, copied into scheduled_time if the contractor confirms the backup rather than the first choice.';
comment on column jobs.booking_alt_end_time is
  'The second-choice window''s close, snapshotted when the request was made.';
