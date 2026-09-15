-- Independent of Resend and the recipient mailbox. No customer usage is charged.
create table public.operational_sms_pages (
  page_key text primary key,
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  sender text not null check (sender ~ '^\+[1-9][0-9]{7,14}$'),
  body text not null,
  state text not null default 'submitting' check (state in ('submitting','accepted','delivered','manual_review')),
  provider_id text unique,
  provider_status text,
  error_code text,
  started_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.operational_sms_pages enable row level security;
revoke all on public.operational_sms_pages from public, anon, authenticated;
grant select, insert, update on public.operational_sms_pages to service_role;
comment on table public.operational_sms_pages is 'Operator-only paging ledger. Insert wins before provider submission. Unknown outcomes are never automatically resubmitted.';

create function public.protect_operational_sms_page_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (old.page_key,old.recipient,old.sender,old.body,old.started_at)
     is distinct from (new.page_key,new.recipient,new.sender,new.body,new.started_at)
     or (old.provider_id is not null and old.provider_id is distinct from new.provider_id)
     or (old.delivered_at is not null and old.delivered_at is distinct from new.delivered_at) then
    raise exception 'Operational page identity is immutable';
  end if;
  return new;
end $$;
revoke all on function public.protect_operational_sms_page_identity() from public,anon,authenticated;
create trigger protect_operational_sms_page_identity before update on public.operational_sms_pages
for each row execute function public.protect_operational_sms_page_identity();
