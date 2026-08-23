-- Update RLS policies for payments table so office staff with payments or reports capabilities can view and manage payments.

begin;

alter table if exists public.payments enable row level security;
drop policy if exists payments_owner on public.payments;
drop policy if exists payments_select on public.payments;
drop policy if exists payments_modify on public.payments;

create policy payments_select on public.payments
  for select using (
    public.office_can(account_id, 'payments.read')
    or public.office_can(account_id, 'reports.read')
  );

create policy payments_modify on public.payments
  for all using (
    public.office_can(account_id, 'payments.collect')
    or public.office_can(account_id, 'payments.refund')
  ) with check (
    public.office_can(account_id, 'payments.collect')
    or public.office_can(account_id, 'payments.refund')
  );

commit;
