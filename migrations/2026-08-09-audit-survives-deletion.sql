-- Deleting an account destroyed the record of deleting it.
--
-- admin_actions.account_id was `on delete set null`, and deleteAccountAction
-- writes its audit row and then deletes the account a millisecond later. So the
-- audit row for the single most destructive staff action — and every prior row
-- for that account, going back to signup — had its account_id NULLed by the
-- very action it was recording. The trail survived and stopped pointing at
-- anything; only meta.accountNumber remained, buried in JSON.
--
-- privacy_requests.account_id was worse: `on delete cascade`. Honouring a
-- deletion request destroyed the proof you had honoured it. That is the one
-- record you cannot afford to lose, because it exists to be produced later by
-- somebody who does not believe you.
--
-- The fix is to stop treating these as rows ABOUT a live account and start
-- treating them as what they are: a log of things that happened. A log with
-- referential integrity to the mutable thing it describes is a log that can be
-- rewritten by editing something else.
--
-- account_id stays a uuid and keeps its index, so "everything ever done to
-- account X" still answers — which is exactly the question asked when a
-- deletion is questioned.

-- Drop by lookup rather than by name: these constraints were auto-named by
-- Postgres, and a hardcoded name that does not match is a migration that
-- silently does nothing.
do $$
declare
  target record;
  con_name text;
begin
  for target in
    select * from (values ('admin_actions'), ('privacy_requests')) as t(tbl)
  loop
    select c.conname into con_name
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
     where c.conrelid = target.tbl::regclass
       and c.contype = 'f'
       and a.attname = 'account_id';

    if con_name is not null then
      execute format('alter table %I drop constraint %I', target.tbl, con_name);
      raise notice 'dropped % on %', con_name, target.tbl;
    else
      raise notice 'no account_id foreign key on % — already dropped', target.tbl;
    end if;
  end loop;
end $$;

-- privacy_requests.account_id was NOT NULL only because the FK implied a live
-- account. It stays not-null: a privacy request with no subject is meaningless,
-- and the id is still the right handle even once the account is gone.

-- The partial index on open requests finally has a query behind it: with rows
-- surviving deletion, "open privacy requests across the platform" is answerable
-- without opening one account at a time.
create index if not exists privacy_requests_account_idx
  on privacy_requests (account_id, created_at desc);
