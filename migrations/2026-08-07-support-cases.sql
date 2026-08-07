-- Lightweight internal support-case log (Phase 3 of the admin dashboard
-- build-out). No external help-desk system exists anywhere in this codebase
-- — staff open a case, thread notes on it, and change its status directly
-- from /admin, the same shape as platform_incidents/admin_actions.

create table if not exists support_cases (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable: a case can be about a general platform issue with no single
  -- account to pin it to. Mirrors the email_events precedent (also a
  -- staff-visible signal log with an optional account reference).
  account_id    uuid references accounts(id) on delete set null,
  subject       text not null,
  status        text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to   text,
  sla_due_at    timestamptz,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

-- Powers "cases nearing SLA": open cases ordered soonest-due-first.
create index if not exists support_cases_sla_idx on support_cases (sla_due_at) where status not in ('resolved', 'closed');
-- Powers "assigned to you" on the Command Center.
create index if not exists support_cases_assigned_idx on support_cases (assigned_to, status);
create index if not exists support_cases_account_idx on support_cases (account_id);

alter table support_cases enable row level security;

-- Append-only note thread per case — ordinary staff notes plus a
-- kind='status_change' row written whenever updateSupportCaseStatus runs, so
-- the thread alone is a full history without joining admin_actions.
create table if not exists support_case_notes (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references support_cases(id) on delete cascade,
  kind          text not null default 'note' check (kind in ('note', 'status_change')),
  body          text not null,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists support_case_notes_case_idx on support_case_notes (case_id, created_at);

alter table support_case_notes enable row level security;

-- Both tables: RLS on, no policy. Staff-only, reachable solely via the
-- service-role client from createAdminClient() — never read from the owner
-- dashboard, same as admin_actions/platform_incidents/webhook_failures.
