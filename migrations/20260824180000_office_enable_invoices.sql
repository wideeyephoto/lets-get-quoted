-- Update RLS policies for invoices and invoice_items tables so office staff with invoices capabilities can manage invoices.

begin;

alter table if exists public.invoices enable row level security;
drop policy if exists invoices_owner on public.invoices;
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_modify on public.invoices;

create policy invoices_select on public.invoices
  for select using (
    public.office_can(account_id, 'invoices.read')
  );

create policy invoices_modify on public.invoices
  for all using (
    public.office_can(account_id, 'invoices.write')
  ) with check (
    public.office_can(account_id, 'invoices.write')
  );

alter table if exists public.invoice_items enable row level security;
drop policy if exists invoice_items_owner on public.invoice_items;
drop policy if exists invoice_items_select on public.invoice_items;
drop policy if exists invoice_items_modify on public.invoice_items;

create policy invoice_items_select on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.office_can(i.account_id, 'invoices.read')
    )
  );

create policy invoice_items_modify on public.invoice_items
  for all using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.office_can(i.account_id, 'invoices.write')
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.office_can(i.account_id, 'invoices.write')
    )
  );

commit;
