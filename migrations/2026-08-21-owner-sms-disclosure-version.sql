-- Record WHICH disclosure an owner agreed to, not just that they agreed.
--
-- APPLY THIS BEFORE the deploy that writes it. A missing column makes the
-- consent write fail, and a consent form that silently fails to record consent
-- is the exact thing this column exists to make auditable.
--
-- Additive only: one nullable column. Safe to run twice.

begin;

-- WHY THE LEDGER NEEDS THIS.
--
-- sms_consent already stores THAT somebody opted in, when, and under which
-- source. It does not store what they were shown. For a carrier 10DLC review
-- that is the whole question: the evidence screenshot shows one specific
-- sentence, and the ledger has to be able to say that this owner accepted THAT
-- sentence rather than some earlier wording that happened to occupy the same
-- checkbox.
--
-- Nullable, and null is meaningful: it marks a row written before the wording
-- was versioned at all. Those rows are not retro-stamped — backfilling a
-- version onto a consent nobody gave under that version would be inventing
-- evidence, which is worse than having none. They read as needing re-consent,
-- and the dialog asks again.
alter table sms_consent add column if not exists disclosure_version text;

comment on column sms_consent.disclosure_version is
  'Identifier of the exact consent wording accepted (see src/lib/owner-sms-disclosure.ts). Null = consent predates versioning; treat as stale and re-ask.';

commit;
