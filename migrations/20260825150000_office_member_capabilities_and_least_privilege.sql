-- Migration: Office member capabilities per-user grant model and cash flow RLS tightening
--
-- 1. Create public.office_member_capabilities for fine-grained per-member capability grants.
-- 2. Update office_can() to require membership, global feature enablement, AND explicit per-member capability grant.
-- 3. Disable sensitive high-consequence capabilities by default in office_capabilities.
-- 4. Replace permissive FOR ALL policies on scheduled_payments and cash_snapshots with distinct SELECT (reports.read) and INSERT/UPDATE/DELETE (payments.collect) policies.

begin;

-- 1. Create office_member_capabilities table
create table if not exists public.office_member_capabilities (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null references public.office_capabilities(capability) on delete cascade,
  granted_at timestamptz not null default pg_catalog.now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (account_id, user_id, capability)
);

alter table public.office_member_capabilities enable row level security;

drop policy if exists office_member_capabilities_owner_all on public.office_member_capabilities;
create policy office_member_capabilities_owner_all
  on public.office_member_capabilities
  for all
  to authenticated
  using (public.is_owner(account_id))
  with check (public.is_owner(account_id));

drop policy if exists office_member_capabilities_self_read on public.office_member_capabilities;
create policy office_member_capabilities_self_read
  on public.office_member_capabilities
  for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.office_member_capabilities to authenticated;

-- 2. Update office_can() function to require per-member grant
create or replace function public.office_can(acc uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $can$
  select
    public.is_owner(acc)
    or (
      public.is_office(acc)
      and exists (
        select 1 from public.office_capabilities c
        where c.capability = p_capability and c.enabled
      )
      and exists (
        select 1 from public.office_member_capabilities omc
        where omc.account_id = acc
          and omc.user_id = auth.uid()
          and omc.capability = p_capability
      )
    );
$can$;

grant execute on function public.office_can(uuid, text) to authenticated;

-- 3. Disable sensitive capabilities globally in office_capabilities
update public.office_capabilities
   set enabled = false,
       updated_at = pg_catalog.now()
 where capability in (
   'crew_pay.read',
   'crew_pay.write',
   'settings.write',
   'team.manage',
   'payments.collect',
   'payments.refund',
   'billing.manage'
 );

-- 4. Tighten Cash Flow Policies: scheduled_payments
alter table if exists public.scheduled_payments enable row level security;
drop policy if exists scheduled_payments_modify on public.scheduled_payments;
drop policy if exists scheduled_payments_select on public.scheduled_payments;
drop policy if exists scheduled_payments_insert on public.scheduled_payments;
drop policy if exists scheduled_payments_update on public.scheduled_payments;
drop policy if exists scheduled_payments_delete on public.scheduled_payments;

create policy scheduled_payments_select on public.scheduled_payments
  for select
  to authenticated
  using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.read')
    or public.office_can(account_id, 'payments.collect')
  );

create policy scheduled_payments_insert on public.scheduled_payments
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'payments.collect')
  );

create policy scheduled_payments_update on public.scheduled_payments
  for update
  to authenticated
  using (
    public.office_can(account_id, 'payments.collect')
  ) with check (
    public.office_can(account_id, 'payments.collect')
  );

create policy scheduled_payments_delete on public.scheduled_payments
  for delete
  to authenticated
  using (
    public.office_can(account_id, 'payments.collect')
  );

-- Tighten Cash Flow Policies: cash_snapshots
alter table if exists public.cash_snapshots enable row level security;
drop policy if exists cash_snapshots_modify on public.cash_snapshots;
drop policy if exists cash_snapshots_select on public.cash_snapshots;
drop policy if exists cash_snapshots_insert on public.cash_snapshots;
drop policy if exists cash_snapshots_update on public.cash_snapshots;
drop policy if exists cash_snapshots_delete on public.cash_snapshots;

create policy cash_snapshots_select on public.cash_snapshots
  for select
  to authenticated
  using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.read')
    or public.office_can(account_id, 'payments.collect')
  );

create policy cash_snapshots_insert on public.cash_snapshots
  for insert
  to authenticated
  with check (
    public.office_can(account_id, 'payments.collect')
  );

create policy cash_snapshots_update on public.cash_snapshots
  for update
  to authenticated
  using (
    public.office_can(account_id, 'payments.collect')
  ) with check (
    public.office_can(account_id, 'payments.collect')
  );

create policy cash_snapshots_delete on public.cash_snapshots
  for delete
  to authenticated
  using (
    public.office_can(account_id, 'payments.collect')
  );

commit;
