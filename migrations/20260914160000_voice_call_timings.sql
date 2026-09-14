-- Provider-side latency samples for a completed call.
--
-- WHY THIS TABLE EXISTS SEPARATELY FROM voice_calls AND voice_events:
--
--   voice_events   the raw provider receipt. Immutable, backend-only, not for
--                  aggregation because it carries full transcript text.
--   voice_calls    the mutable operator-facing summary. Billing must never read
--                  it; latency percentiles definitely must not write to it.
--   voice_call_timings   THIS. Numeric diagnostics only — no transcript text,
--                  no arguments, no arbitrary provider fields. Kept separate
--                  from the immutable receipt payload so a deployment cannot
--                  change the payload hash of an old callback retried after
--                  deployment (the original concern documented in provider-timing.ts).
--
-- The application inserts one row per receipt, on first ingestion only, outside
-- the settlement transaction. A failure here must never prevent settlement.
--
-- SCHEMA matches the return value of signalWireTimingSummary() exactly:
--   schema              integer version tag (currently 1)
--   available           whether any numeric data was present in the receipt
--   source              which call log field was used ('raw_call_log' | 'call_log')
--   inspected_turns     how many turns were walked (capped at 1000 in the extractor)
--   truncated           true if the turn list or any sample array hit its limit
--   samples             JSONB array of per-turn latency metrics
--   speech_to_first_audio_ms  JSONB array of integer ms (the mouth-to-ear samples)
--   generations         JSONB array of per-generation LLM cost metrics

set local lock_timeout = '5s';

begin;

create table if not exists public.voice_call_timings (
  id                        uuid primary key default gen_random_uuid(),

  -- Scope. account_id is redundant with voice_calls but avoids a join when
  -- computing per-account percentiles. provider_call_id is the join key to the
  -- receipt; voice_call_id is the join key to the operator surface.
  account_id                uuid not null references public.accounts(id) on delete cascade,
  voice_call_id             uuid references public.voice_calls(id) on delete set null,
  provider_call_id          text not null
    check (pg_catalog.length(pg_catalog.btrim(provider_call_id)) > 0),

  -- Release traceability. Lets a latency or quality shift be attributed to a
  -- specific deployment without querying logs.
  ai_voice_route_revision   text,

  -- Numeric fields from signalWireTimingSummary(). All nullable; the extractor
  -- returns what the receipt actually contains.
  timing_schema             integer not null default 1
    check (timing_schema = 1),
  available                 boolean not null default false,
  source                    text
    check (source is null or source in ('raw_call_log', 'call_log')),
  inspected_turns           integer
    check (inspected_turns is null or inspected_turns >= 0),
  truncated                 boolean,

  -- JSONB arrays. samples = [{index, role, reported:{latency,...}}]
  -- speech_to_first_audio_ms = [integer, ...]  — the primary p50/p95 input
  -- generations = [{index, answer_time, token_time, ...}]
  samples                   jsonb,
  speech_to_first_audio_ms  jsonb,
  generations               jsonb,

  -- Housekeeping
  inserted_at               timestamptz not null default now()
);

comment on table public.voice_call_timings is
  'Numeric-only latency samples extracted from the SignalWire end-of-call receipt.
   One row per call, written on first ingestion. No transcript text or PII.
   Source of truth for p50/p95 speech-to-first-audio and LLM generation cost.';

comment on column public.voice_call_timings.speech_to_first_audio_ms is
  'Array of (first_audio_us - last_word_end_us)/1000 rounded to integer ms,
   one entry per caller turn where both stamps were present. Primary input for
   p50/p95 latency reporting. Empty array means the receipt had no usable stamps.';

comment on column public.voice_call_timings.samples is
  'Per-turn latency metrics reported by the provider (latency, utterance_latency,
   audio_latency, etc.). Capped at 100 turns by the extractor.';

comment on column public.voice_call_timings.ai_voice_route_revision is
  'Value of ai_voice_route_revision from the voice_numbers row at the time of
   the call, captured here so a percentile shift can be attributed to a release.';

-- One row per call. The receipt endpoint deduplicates via inserted, so a
-- duplicate callback should never reach the insert, but enforce it anyway.
create unique index if not exists voice_call_timings_provider_call_id_idx
  on public.voice_call_timings (provider_call_id);

-- Per-account percentile queries: filter by account, order by inserted_at.
create index if not exists voice_call_timings_account_inserted_idx
  on public.voice_call_timings (account_id, inserted_at desc);

-- Join from voice_calls to timing without knowing the provider call id.
create index if not exists voice_call_timings_voice_call_id_idx
  on public.voice_call_timings (voice_call_id)
  where voice_call_id is not null;

-- RLS: no anon or authenticated access. Only service_role (the backend) reads
-- and writes this table. Owner-facing percentiles go through a function that
-- returns only aggregates, never raw rows.
alter table public.voice_call_timings enable row level security;

revoke all on table public.voice_call_timings from public, anon, authenticated;
grant select, insert on table public.voice_call_timings to service_role;

commit;
