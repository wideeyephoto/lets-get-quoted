-- Configure capability-aware RLS policies on cancellation_waitlist and waitlist_offers
-- allowing office users with schedule.write and jobs.read to manage the waitlist.

begin;

-- 1. cancellation_waitlist
alter table if exists cancellation_waitlist enable row level security;
drop policy if exists cancellation_waitlist_owner on cancellation_waitlist;
drop policy if exists cancellation_waitlist_select on cancellation_waitlist;
drop policy if exists cancellation_waitlist_modify on cancellation_waitlist;

create policy cancellation_waitlist_select on cancellation_waitlist
  for select using (office_can(account_id, 'jobs.read'));

create policy cancellation_waitlist_modify on cancellation_waitlist
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));

-- 2. waitlist_offers
alter table if exists waitlist_offers enable row level security;
drop policy if exists waitlist_offers_owner on waitlist_offers;
drop policy if exists waitlist_offers_select on waitlist_offers;
drop policy if exists waitlist_offers_modify on waitlist_offers;

create policy waitlist_offers_select on waitlist_offers
  for select using (office_can(account_id, 'jobs.read'));

create policy waitlist_offers_modify on waitlist_offers
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));

commit;
