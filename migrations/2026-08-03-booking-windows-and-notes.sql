-- Online booking: arrival windows instead of clock times, and a place for the
-- homeowner to say what we should know.
--
-- The public page offered "Morning · 8:00 AM", which is a promise no trade can
-- keep. The job before yours runs long and now the contractor is late on a
-- commitment they never meant to make. A window says the true thing: someone
-- will be there between these two times.

-- How long each offered window runs. 240 minutes matches what utilities and
-- cable companies use, and is wide enough to survive an ordinary bad morning.
-- Existing accounts inherit it, which WIDENS what their page promises rather
-- than narrowing it — and a booking still waits on the contractor either way, so
-- no commitment already made to a customer changes meaning.
alter table accounts
  add column if not exists booking_window_minutes integer not null default 240;

alter table accounts
  add constraint accounts_booking_window_minutes_range
  check (booking_window_minutes between 30 and 600) not valid;

-- Snapshot the window's end on the request itself. Deriving it from the
-- account's current setting would silently rewrite what an old request promised
-- the day an owner changed their window length — the customer's confirmation
-- text would stop matching the job on the contractor's screen.
alter table jobs
  add column if not exists booking_requested_end_time time;

-- "Gate code is 1234, dog in the back, please text before you pull in." This is
-- NOT the job description: it's what the person standing at the door needs to
-- know, so it travels to the crew rather than into the sales notes.
alter table jobs
  add column if not exists booking_note text;
