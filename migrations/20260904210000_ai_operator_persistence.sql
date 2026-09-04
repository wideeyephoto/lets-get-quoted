-- ============================================================================
-- AI OPERATOR AUDIT LOGS & HITL ACTION REQUESTS PERSISTENCE
--
-- Persists human-in-the-loop action approval queues and operator autonomous
-- audit logs across server restarts.
-- ============================================================================

begin;

create table if not exists public.ai_operator_logs (
  id text primary key,
  timestamp timestamptz not null default clock_timestamp(),
  category text not null,
  action_name text not null,
  severity text not null,
  tool_name text,
  input_payload jsonb,
  output_result jsonb,
  reasoning_summary text not null,
  account_id text,
  status text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists ai_operator_logs_timestamp_idx
  on public.ai_operator_logs (timestamp desc);

create index if not exists ai_operator_logs_category_idx
  on public.ai_operator_logs (category);

create index if not exists ai_operator_logs_account_id_idx
  on public.ai_operator_logs (account_id)
  where account_id is not null;

create index if not exists ai_operator_logs_severity_idx
  on public.ai_operator_logs (severity);

alter table public.ai_operator_logs enable row level security;
revoke all on table public.ai_operator_logs from public, anon, authenticated;
grant all on table public.ai_operator_logs to service_role;

create table if not exists public.ai_operator_action_requests (
  id text primary key,
  category text not null,
  title text not null,
  description text not null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'executed', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text,
  execution_result jsonb,
  executed_at timestamptz,
  is_financial_mutation boolean not null default false,
  required_role text not null default 'admin'
);

create index if not exists ai_operator_action_requests_status_idx
  on public.ai_operator_action_requests (status, created_at desc);

create index if not exists ai_operator_action_requests_action_type_idx
  on public.ai_operator_action_requests (action_type);

alter table public.ai_operator_action_requests enable row level security;
revoke all on table public.ai_operator_action_requests from public, anon, authenticated;
grant all on table public.ai_operator_action_requests to service_role;

commit;
