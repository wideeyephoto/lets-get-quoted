-- Update RLS policies for services table so office staff with jobs or quotes capabilities can read and manage services in the Price Book.

begin;

alter table if exists services enable row level security;
drop policy if exists services_owner on services;
drop policy if exists services_select on services;
drop policy if exists services_modify on services;

create policy services_select on services
  for select using (
    public.office_can(account_id, 'jobs.read')
    or public.office_can(account_id, 'quotes.read')
  );

create policy services_modify on services
  for all using (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'quotes.write')
  ) with check (
    public.office_can(account_id, 'jobs.write')
    or public.office_can(account_id, 'quotes.write')
  );

commit;
