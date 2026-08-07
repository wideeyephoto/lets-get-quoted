-- Phase 1: staff become rows, and the audit trail records enough to answer for
-- itself.
--
-- Staff existed only as strings in ADMIN_EMAILS, so nothing could reference
-- them: no roles, no teams, no deactivation record, no permission history, no
-- access review. And src/lib/auth.ts said plainly that the role token was not
-- an authorization boundary — every listed address could refund any amount,
-- suspend a business and hard-delete an account with its whole history.
--
-- ADMIN_EMAILS stays the outer gate. A database row must never be able to grant
-- console access — that turns any write vulnerability into a staff account —
-- and the first staff member has to get in before there is a table to read. The
-- staff row governs what happens AFTER the door, and can revoke what the env
-- still allows, because deactivation has to work faster than a redeploy.

create table if not exists staff (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  -- read_only by default: a row that appears without anybody choosing a role
  -- should be able to look and change nothing.
  role            text not null default 'read_only'
                  check (role in ('super_admin','support','finance','risk','ops','read_only')),
  display_name    text,
  -- Checked before role, everywhere. A deactivated super admin must be able to
  -- do less than a read_only one.
  active          boolean not null default true,
  deactivated_at  timestamptz,
  deactivated_by  text,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Emails are compared lowercased everywhere; the index enforces that one
-- address cannot become two staff members with different powers.
create unique index if not exists staff_email_idx on staff (lower(email));
create index if not exists staff_active_idx on staff (active, role);
alter table staff enable row level security;

-- Who changed whose access, when, and why. A separate table rather than a
-- column history because "when did this person get the ability to issue
-- refunds" is a question asked long after the row itself has moved on.
create table if not exists staff_role_changes (
  id           uuid primary key default gen_random_uuid(),
  -- Not a foreign key, for the same reason admin_actions.account_id is not one:
  -- this is a log, and it has to outlive the row it describes.
  staff_id     uuid,
  staff_email  text not null,
  from_role    text,
  to_role      text,
  from_active  boolean,
  to_active    boolean,
  reason       text,
  changed_by   text not null,
  created_at   timestamptz not null default now()
);
create index if not exists staff_role_changes_staff_idx on staff_role_changes (staff_email, created_at desc);
alter table staff_role_changes enable row level security;

-- --------------------------------------------------------------------------
-- Audit hardening
-- --------------------------------------------------------------------------
-- admin_actions carried four of the sixteen fields an audit trail is asked for:
-- who, what, what to, when. Everything else was squeezed into meta jsonb, where
-- it could not be required, validated, indexed or filtered — which in practice
-- meant it was usually absent.

-- WHY. The single most valuable field and the one most often missing: several
-- actions already collect a reason and then buried it inside meta.
alter table admin_actions add column if not exists reason text;

-- WHAT CHANGED. Enough to answer "what did this look like before" without
-- restoring a backup.
alter table admin_actions add column if not exists before_value jsonb;
alter table admin_actions add column if not exists after_value jsonb;

-- FROM WHERE, and WHICH REQUEST. A correlation id ties every row written while
-- handling one action together — the refund, the credit and the note that came
-- with it stop being three unrelated rows a second apart.
alter table admin_actions add column if not exists ip text;
alter table admin_actions add column if not exists request_id text;

-- UNDER WHAT AUTHORITY. Which permission allowed this. Makes an access review
-- answerable from the log instead of from the code.
alter table admin_actions add column if not exists permission text;

-- The acting staff row, so a rename or an email change does not orphan the
-- history. admin_email stays: it is the durable label, and it is what a person
-- reading the log recognises.
alter table admin_actions add column if not exists staff_id uuid;

create index if not exists admin_actions_request_idx on admin_actions (request_id) where request_id is not null;
create index if not exists admin_actions_permission_idx on admin_actions (permission, created_at desc);

-- APPEND-ONLY, ENFORCED. The table has always been described as append-only and
-- was never prevented from being anything else: every read and write goes
-- through the service-role client, which bypasses RLS, so nothing stopped an
-- UPDATE or a DELETE. An audit trail that the audited party can edit is not an
-- audit trail. This is the cheapest real guarantee available without moving the
-- log off this database entirely.
create or replace function admin_actions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_actions is append-only (attempted %)', tg_op;
end $$;

drop trigger if exists admin_actions_no_update on admin_actions;
create trigger admin_actions_no_update
  before update or delete on admin_actions
  for each row execute function admin_actions_append_only();

-- staff_role_changes is a log too, and for the same reason.
drop trigger if exists staff_role_changes_no_update on staff_role_changes;
create trigger staff_role_changes_no_update
  before update or delete on staff_role_changes
  for each row execute function admin_actions_append_only();
