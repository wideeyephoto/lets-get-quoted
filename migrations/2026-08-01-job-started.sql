-- ============================================================================
-- When the work actually STARTED.
--
-- The job lifecycle could say "scheduled" and it could say "complete", and had
-- nothing in between. A job sitting on Tuesday's calendar and a job with a crew
-- currently standing in the driveway were the same row, so the pipeline step
-- read "Scheduled / underway" without knowing which of the two it meant.
--
-- A timestamp, not a status: `status` already carries in_progress and would have
-- to invent a value that means "in progress, but really this time". This records
-- the moment, so the client's feed can say when work began and the owner can see
-- how long a job has been open.
--
-- Nullable and undated by default. A job that was never explicitly started is
-- not "started at its creation date" — it is a job nobody pressed the button on,
-- and guessing a time here would put a wrong date in front of the customer.
-- ============================================================================

alter table jobs add column if not exists started_at timestamptz;

-- Only ever read per-job, alongside the row itself, so no index is warranted.
