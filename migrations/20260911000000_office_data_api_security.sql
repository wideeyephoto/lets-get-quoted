begin;

-- Revoke direct column access to financial fields from browser roles
revoke select (quoted_amount, quote_items) on public.jobs from authenticated;
-- Service role retains full access
grant select (quoted_amount, quote_items) on public.jobs to service_role;

-- Guard trigger for financial mutations
create or replace function public.jobs_finance_guard()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.quoted_amount is distinct from old.quoted_amount or new.quote_items is distinct from old.quote_items) then
    if not public.office_can(new.account_id, 'quotes.write') then
      raise exception 'Unauthorized to modify financial fields' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger jobs_finance_guard_trigger
  before update on public.jobs
  for each row
  execute function public.jobs_finance_guard();

-- Guard trigger for client tenancy
create or replace function public.jobs_client_tenancy_guard()
returns trigger
language plpgsql
security definer
as $$
declare
  v_client_account_id uuid;
begin
  if (new.client_id is not null) and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select account_id into v_client_account_id from public.clients where id = new.client_id;
    if v_client_account_id is distinct from new.account_id then
      raise exception 'Client does not belong to this account' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger jobs_client_tenancy_guard_trigger
  before insert or update on public.jobs
  for each row
  execute function public.jobs_client_tenancy_guard();

notify pgrst, 'reload schema';

commit;
