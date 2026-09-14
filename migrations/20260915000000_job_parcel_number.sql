-- Add parcel_number column to jobs table for municipal permit filings.
-- Property-scoped legal identifier; remains NULL until entered by contractor or verified from county records.

alter table public.jobs add column if not exists parcel_number text;
