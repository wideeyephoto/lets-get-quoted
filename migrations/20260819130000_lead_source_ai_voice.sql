-- Add the `ai_voice` value to lead_source. Nothing else.
--
-- ALONE IN A FILE for the same reason 20260819090000 was: PostgreSQL commits a
-- new enum label but refuses to let the SAME transaction use it, so any later
-- statement evaluating 'ai_voice'::lead_source fails with "unsafe use of new
-- value of enum type". A combined migration would fail at apply time, on
-- production, after its earlier half had run.
--
-- WHY NOT REUSE 'missed_call'. The call was not missed — it was answered, by the
-- AI receptionist, which is the entire product. Beyond the plain wrongness, the
-- missed-call text-back dedupes on `source = 'missed_call'` within a ten-minute
-- window, so an AI-answered call would suppress a genuine missed-call lead from
-- the same number, or be suppressed by one.
--
-- Safe alone and reversible by neglect: an enum label no row uses and no code
-- writes changes nothing. Existing rows are untouched.

alter type public.lead_source add value if not exists 'ai_voice';
