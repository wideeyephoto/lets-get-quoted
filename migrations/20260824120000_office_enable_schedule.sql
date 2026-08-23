-- Enable schedule.write capability in public.office_capabilities and configure RLS
-- on reschedule_offers and availability_blocks tables.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability = 'schedule.write';

-- 1. reschedule_offers
alter table if exists reschedule_offers enable row level security;
drop policy if exists reschedule_offer_owner on reschedule_offers;
drop policy if exists reschedule_offers_select on reschedule_offers;
drop policy if exists reschedule_offers_modify on reschedule_offers;

create policy reschedule_offers_select on reschedule_offers
  for select using (office_can(account_id, 'jobs.read'));

create policy reschedule_offers_modify on reschedule_offers
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));

-- 2. availability_blocks
alter table if exists availability_blocks enable row level security;
drop policy if exists availability_blocks_owner on availability_blocks;
drop policy if exists availability_blocks_select on availability_blocks;
drop policy if exists availability_blocks_modify on availability_blocks;

create policy availability_blocks_select on availability_blocks
  for select using (office_can(account_id, 'jobs.read'));

create policy availability_blocks_modify on availability_blocks
  for all using (office_can(account_id, 'schedule.write')) with check (office_can(account_id, 'schedule.write'));

commit;
