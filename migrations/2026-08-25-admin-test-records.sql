-- Keep synthetic/probe traffic out of staff-console production signals.
-- NULL is a real record; a non-null value names the writer or the staff member
-- who classified it. Existing rows remain visible until deliberately marked.

begin;

alter table accounts            add column if not exists test_marker text;
alter table sms_events          add column if not exists test_marker text;
alter table email_events        add column if not exists test_marker text;
alter table webhook_failures    add column if not exists test_marker text;
alter table login_events        add column if not exists test_marker text;
alter table extra_stop_requests add column if not exists test_marker text;
alter table support_cases       add column if not exists test_marker text;

comment on column accounts.test_marker is
  'Synthetic classification. NULL means a real account; otherwise names the probe/script or staff classification.';
comment on column webhook_failures.test_marker is
  'Synthetic classification. Probe failures must set this so operational alert counts remain production-only.';

-- Account classification is the source of truth for account-owned rows. This
-- applies a staff classification to existing history and to future writes.
create or replace function inherit_account_test_marker()
returns trigger
language plpgsql
as $$
begin
  if new.test_marker is null then
    select a.test_marker into new.test_marker from accounts a where a.id = new.account_id;
  end if;
  return new;
end;
$$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array['clients', 'leads', 'jobs', 'invoices', 'payments', 'sms_events', 'email_events', 'login_events', 'extra_stop_requests', 'support_cases']
  loop
    execute format('drop trigger if exists inherit_account_test_marker_trigger on %I', relation_name);
    execute format('create trigger inherit_account_test_marker_trigger before insert or update of account_id on %I for each row execute function inherit_account_test_marker()', relation_name);
  end loop;
end;
$$;

create or replace function cascade_account_test_marker()
returns trigger
language plpgsql
as $$
declare
  relation_name text;
begin
  if new.test_marker is not distinct from old.test_marker then return new; end if;
  foreach relation_name in array array['clients', 'leads', 'jobs', 'invoices', 'payments', 'sms_events', 'email_events', 'login_events', 'extra_stop_requests', 'support_cases']
  loop
    if new.test_marker is not null then
      execute format('update %I set test_marker = $1 where account_id = $2 and test_marker is null', relation_name) using new.test_marker, new.id;
    elsif old.test_marker like 'staff:%' then
      -- Script-owned rows retain their own marker when staff returns an account
      -- to production reporting.
      execute format('update %I set test_marker = null where account_id = $1 and test_marker = $2', relation_name) using new.id, old.test_marker;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cascade_account_test_marker_trigger on accounts;
create trigger cascade_account_test_marker_trigger
after update of test_marker on accounts
for each row execute function cascade_account_test_marker();

commit;
