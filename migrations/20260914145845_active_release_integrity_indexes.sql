-- Cover account and payment lookups on the new Quick Stop recovery tables.
create index if not exists quick_stop_refund_tasks_account_idx on public.quick_stop_refund_tasks(account_id);
create index if not exists quick_stop_refund_tasks_payment_idx on public.quick_stop_refund_tasks(payment_id);
create index if not exists quick_stop_manual_refund_account_idx on public.quick_stop_manual_refund_reservations(account_id);
create index if not exists quick_stop_no_show_enforcements_account_idx on public.quick_stop_no_show_enforcements(account_id);
