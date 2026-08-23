-- Enable office team permissions on job sub-resources (change orders, warranties, selections, milestones).
-- Allows office users holding 'jobs.read' and 'jobs.write' capabilities to manage job sub-features.

begin;

-- 1. change_orders
alter table if exists change_orders enable row level security;
drop policy if exists change_orders_owner on change_orders;
drop policy if exists change_orders_crew_insert on change_orders;
drop policy if exists change_orders_crew_read on change_orders;
drop policy if exists change_orders_select on change_orders;
drop policy if exists change_orders_insert on change_orders;
drop policy if exists change_orders_update on change_orders;
drop policy if exists change_orders_delete on change_orders;

create policy change_orders_select on change_orders
  for select using (
    office_can(account_id, 'jobs.read')
    or crew_id in (select id from crew where crew.account_id = change_orders.account_id and crew.user_id = auth.uid())
  );

create policy change_orders_insert on change_orders
  for insert with check (
    office_can(account_id, 'jobs.write')
    or crew_id in (select id from crew where crew.account_id = change_orders.account_id and crew.user_id = auth.uid())
  );

create policy change_orders_update on change_orders
  for update using (
    office_can(account_id, 'jobs.write')
  ) with check (
    office_can(account_id, 'jobs.write')
  );

create policy change_orders_delete on change_orders
  for delete using (
    office_can(account_id, 'jobs.write')
  );

-- 2. warranties
alter table if exists warranties enable row level security;
drop policy if exists warranties_owner on warranties;
drop policy if exists warranties_select on warranties;
drop policy if exists warranties_modify on warranties;

create policy warranties_select on warranties
  for select using (office_can(account_id, 'jobs.read'));

create policy warranties_modify on warranties
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 3. warranty_claims
alter table if exists warranty_claims enable row level security;
drop policy if exists warranty_claims_owner on warranty_claims;
drop policy if exists warranty_claims_select on warranty_claims;
drop policy if exists warranty_claims_modify on warranty_claims;

create policy warranty_claims_select on warranty_claims
  for select using (office_can(account_id, 'jobs.read'));

create policy warranty_claims_modify on warranty_claims
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 4. job_selections
alter table if exists job_selections enable row level security;
drop policy if exists job_selections_owner on job_selections;
drop policy if exists job_selections_select on job_selections;
drop policy if exists job_selections_modify on job_selections;

create policy job_selections_select on job_selections
  for select using (office_can(account_id, 'jobs.read'));

create policy job_selections_modify on job_selections
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 5. selection_options
alter table if exists selection_options enable row level security;
drop policy if exists selection_options_owner on selection_options;
drop policy if exists selection_options_select on selection_options;
drop policy if exists selection_options_modify on selection_options;

create policy selection_options_select on selection_options
  for select using (office_can(account_id, 'jobs.read'));

create policy selection_options_modify on selection_options
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 6. selection_templates
alter table if exists selection_templates enable row level security;
drop policy if exists selection_templates_owner on selection_templates;
drop policy if exists selection_templates_select on selection_templates;
drop policy if exists selection_templates_modify on selection_templates;

create policy selection_templates_select on selection_templates
  for select using (office_can(account_id, 'jobs.read'));

create policy selection_templates_modify on selection_templates
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 7. job_milestones
alter table if exists job_milestones enable row level security;
drop policy if exists job_milestones_owner on job_milestones;
drop policy if exists job_milestones_select on job_milestones;
drop policy if exists job_milestones_modify on job_milestones;

create policy job_milestones_select on job_milestones
  for select using (office_can(account_id, 'jobs.read'));

create policy job_milestones_modify on job_milestones
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

-- 8. milestone_photos
alter table if exists milestone_photos enable row level security;
drop policy if exists milestone_photos_owner on milestone_photos;
drop policy if exists milestone_photos_select on milestone_photos;
drop policy if exists milestone_photos_modify on milestone_photos;

create policy milestone_photos_select on milestone_photos
  for select using (office_can(account_id, 'jobs.read'));

create policy milestone_photos_modify on milestone_photos
  for all using (office_can(account_id, 'jobs.write')) with check (office_can(account_id, 'jobs.write'));

commit;
