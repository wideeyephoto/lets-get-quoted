-- Update RLS policies for scheduled_payments and cash_snapshots tables so office staff with reports or payments capabilities can view and manage cash flow forecasts.

begin;

alter table if exists public.scheduled_payments enable row level security;
drop policy if exists scheduled_payments_owner on public.scheduled_payments;
drop policy if exists scheduled_payments_select on public.scheduled_payments;
drop policy if exists scheduled_payments_modify on public.scheduled_payments;

create policy scheduled_payments_select on public.scheduled_payments
  for select using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.read')
  );

create policy scheduled_payments_modify on public.scheduled_payments
  for all using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.collect')
  ) with check (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.collect')
  );

alter table if exists public.cash_snapshots enable row level security;
drop policy if exists cash_snapshots_owner on public.cash_snapshots;
drop policy if exists cash_snapshots_select on public.cash_snapshots;
drop policy if exists cash_snapshots_modify on public.cash_snapshots;

create policy cash_snapshots_select on public.cash_snapshots
  for select using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.read')
  );

create policy cash_snapshots_modify on public.cash_snapshots
  for all using (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.collect')
  ) with check (
    public.office_can(account_id, 'reports.read')
    or public.office_can(account_id, 'payments.collect')
  );

commit;
