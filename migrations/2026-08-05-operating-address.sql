-- Where you WORK from, kept apart from where your post goes.
--
-- One field was doing two jobs. `mailing_address` is required in the footer of
-- every promotional email by CAN-SPAM — and a PO box satisfies that perfectly
-- well — while the same string was also being geocoded into service_center_*,
-- which is the point Plan my day measures the drive out to the first job and
-- back from the last. A PO box has no driveway. The route was being measured
-- from a mail counter, or, when the geocode came back imprecise, from nowhere
-- at all, and the only symptom was a day whose mileage looked quietly short.
--
-- Nullable and additive: an account that never fills this in keeps behaving
-- exactly as it does today, because the geocode falls back to the mailing
-- address. Nobody's route moves until they tell us it should.
alter table accounts add column if not exists operating_address text;

comment on column accounts.operating_address is
  'Where the working day starts and ends — the yard, shop or home the trucks leave from. Geocoded into service_center_lat/lng. Falls back to mailing_address when unset. NOT the CAN-SPAM address.';
