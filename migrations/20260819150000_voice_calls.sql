-- What the contractor sees about a call.
--
-- THE THIRD TABLE, AND THE ONLY ONE AN OWNER CAN READ. The three exist because
-- they answer different questions and have different truth-lifetimes:
--
--   voice_events   the raw provider receipt. Immutable evidence, backend only,
--                  because its payload is a verbatim transcript of a homeowner's
--                  phone call and carries it three times over.
--   usage_*        the ledger. What was actually charged, and the only thing a
--                  bill may be computed from.
--   voice_calls    THIS. What happened, in the terms the person paying for it
--                  needs: who rang, what they wanted, how long the AI was on,
--                  and how it ended.
--
-- BILLING MUST NEVER READ THIS TABLE. `billed_minutes` here is a REPORT of what
-- the ledger settled, not a source for it -- and this row is mutable by design,
-- because a disposition gets corrected and a recording gets deleted on request.
-- docs/ai-voice-v1-decisions.md §4.1 is the rule; this comment is where somebody
-- about to break it will be looking.
--
-- ONE TRANSCRIPT, NOT THREE. The receipt carries the conversation as `call_log`,
-- `raw_call_log` and `call_timeline` -- 10KB for a 33-second call. Only the
-- first is kept here: it has resolved pronunciation and none of the per-token
-- latency instrumentation, and at 30-to-90-day retention across every call on
-- every workspace the other two are storage LGQ meters and pays for.

begin;

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('signalwire')),
  provider_call_id text not null
    check (pg_catalog.length(pg_catalog.btrim(provider_call_id)) > 0),
  -- The evidence this row was derived from. Nullable so a call can be shown
  -- even if the receipt row is later purged by retention.
  voice_event_id uuid references public.voice_events(id) on delete set null,

  caller_number text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,

  -- Seconds, kept exact. `billed_minutes` is the same span rounded up, and
  -- holding both is what lets a contractor querying a 61-second call see why it
  -- cost two minutes instead of arguing with a number that looks wrong.
  ai_seconds integer check (ai_seconds is null or ai_seconds >= 0),
  billed_minutes integer check (billed_minutes is null or billed_minutes >= 0),

  -- How it was paid for. `unmetered` is a real and expected value: the meter
  -- fails open when the ledger cannot answer, and a call admitted that way must
  -- be visibly different from one that cost nothing.
  settlement text not null default 'unsettled'
    check (settlement in ('unsettled', 'allowance', 'overage', 'unmetered', 'unbillable')),

  outcome text not null default 'completed'
    check (outcome in ('completed', 'transferred', 'voicemail', 'abandoned', 'failed')),

  summary text,
  -- `call_log` only. See the header.
  transcript jsonb check (transcript is null or pg_catalog.jsonb_typeof(transcript) = 'array'),

  lead_id uuid references public.leads(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint voice_calls_provider_call_unique unique (provider, provider_call_id)
);

create index if not exists voice_calls_account_recent_idx
  on public.voice_calls (account_id, started_at desc nulls last);

alter table public.voice_calls enable row level security;

-- READ ONLY, and only your own. A contractor sees their call history; they do
-- not get to edit what a call cost or what was said on it, and neither does a
-- compromised browser session. Every write goes through the service-role client
-- from the receipt boundary.
drop policy if exists voice_calls_owner_read on public.voice_calls;
create policy voice_calls_owner_read
  on public.voice_calls
  for select
  to authenticated
  using ((select public.is_owner(account_id)));

revoke insert, update, delete on table public.voice_calls from anon, authenticated;

drop trigger if exists touch_voice_calls_updated_at_trigger on public.voice_calls;
create trigger touch_voice_calls_updated_at_trigger
before update on public.voice_calls
for each row execute function public.touch_voice_settings_updated_at();

do $$
declare
  v_writable text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_calls' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on voice_calls';
  end if;

  -- The property that matters: a browser role may READ its own history and may
  -- not write any of it. A grant here would let a session rewrite what a call
  -- cost, which is the one thing this table must never allow.
  select pg_catalog.string_agg(distinct g.who || ':' || g.priv, ', ') into v_writable
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as who, x.privilege_type as priv
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname = 'voice_calls'
  ) g
  where g.who in ('anon', 'authenticated', 'public')
    and g.priv in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if v_writable is not null then
    raise exception 'voice_calls is writable by: %', v_writable;
  end if;
end $$;

commit;
