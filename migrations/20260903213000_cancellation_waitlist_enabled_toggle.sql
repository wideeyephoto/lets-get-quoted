-- Migration: Add cancellation_waitlist_enabled to accounts
-- Default is false (OFF). Contractors must explicitly opt-in/toggle it on.

begin;

alter table accounts
  add column if not exists cancellation_waitlist_enabled boolean not null default false;

comment on column accounts.cancellation_waitlist_enabled is
  'Controls whether the cancellation waitlist is active for this account. Defaults to false.';

commit;
