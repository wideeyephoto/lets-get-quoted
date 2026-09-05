-- Enable capability-aware RLS policies on client_duplicate_dismissals and client_portal_access
-- allowing office users with clients.read to view and clients.write to manage dismissals and portal access.

begin;

-- 1. client_duplicate_dismissals
alter table if exists client_duplicate_dismissals enable row level security;
drop policy if exists client_duplicate_dismissals_owner on client_duplicate_dismissals;
drop policy if exists client_duplicate_dismissals_select on client_duplicate_dismissals;
drop policy if exists client_duplicate_dismissals_modify on client_duplicate_dismissals;

create policy client_duplicate_dismissals_select on client_duplicate_dismissals
  for select using (office_can(account_id, 'clients.read'));

create policy client_duplicate_dismissals_modify on client_duplicate_dismissals
  for all using (office_can(account_id, 'clients.write')) with check (office_can(account_id, 'clients.write'));

-- 2. client_portal_access
alter table if exists client_portal_access enable row level security;
drop policy if exists client_portal_access_owner on client_portal_access;
drop policy if exists client_portal_access_select on client_portal_access;
drop policy if exists client_portal_access_modify on client_portal_access;

create policy client_portal_access_select on client_portal_access
  for select using (office_can(account_id, 'clients.read'));

create policy client_portal_access_modify on client_portal_access
  for all using (office_can(account_id, 'clients.write')) with check (office_can(account_id, 'clients.write'));

commit;
