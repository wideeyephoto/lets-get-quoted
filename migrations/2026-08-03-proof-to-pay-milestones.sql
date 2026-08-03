-- Proof-to-Pay milestones.
--
-- A job gets paid in stages. Today a contractor can request a stage payment at
-- any moment for any amount, and the homeowner's only way to know whether the
-- work behind it actually happened is to walk outside and look. That asymmetry
-- is where stage payments go wrong in both directions: homeowners refuse
-- legitimate draws because they can't see progress, and contractors chase money
-- for work they genuinely did with nothing to point at.
--
-- A milestone is the missing object: a named stage carrying what was PROMISED,
-- the checklist that proves it, the before/after photos, and the amount. The
-- payment request is gated on that proof existing — not as an honour system,
-- but as a check in requestMilestonePayment that the UI merely reflects.
--
-- Nothing here changes existing payments. A milestone that has never had a
-- payment requested is invisible to every existing rollup.

create table if not exists job_milestones (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  -- What the homeowner is being asked to pay FOR. `title` is the stage name
  -- ("Rough-in complete"); `scope` is the promise in the contractor's own words,
  -- written before the work rather than justified after it.
  title         text not null,
  scope         text,

  amount        numeric(12,2) not null default 0,
  sort_order    integer not null default 0,

  -- Reuses the existing payment_kind enum so a deposit milestone creates a real
  -- deposit payment and lands in every rollup that already understands one.
  kind          payment_kind not null default 'stage',

  -- Minimum photo counts before payment can be requested. 0 means not required —
  -- a deposit taken before anyone has been on site has nothing to photograph,
  -- and demanding a picture of an empty driveway would just teach people to
  -- upload noise.
  require_before_photos integer not null default 0,
  require_after_photos  integer not null default 0,

  -- When the contractor asserted the proof was complete and asked for money.
  -- Distinct from the payment's own requested_at: this is the moment the gate
  -- was passed, and it survives the payment being cancelled and re-requested.
  submitted_at  timestamptz,
  payment_id    uuid references payments(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists job_milestones_job_idx on job_milestones (account_id, job_id, sort_order);
create index if not exists job_milestones_payment_idx on job_milestones (payment_id) where payment_id is not null;

alter table job_milestones enable row level security;
drop policy if exists job_milestones_owner on job_milestones;
create policy job_milestones_owner on job_milestones
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );

comment on column job_milestones.scope is
  'The promise, in the contractor''s words, written before the work. Shown to the homeowner beside the proof.';
comment on column job_milestones.submitted_at is
  'When the proof gate was passed and payment requested. Survives a cancelled payment, so re-requesting does not reset the record.';

-- ---------------------------------------------------------------------------
-- THE CHECKLIST BECOMES EVIDENCE
--
-- job_tasks already exists and the crew already ticks items off in the field.
-- Pointing a task at a milestone turns that same tick into the proof behind a
-- payment — no second checklist for the crew to learn, and no chance of the
-- "real" list and the "billing" list disagreeing.
--
-- Nullable: a task with no milestone is an ordinary job task, exactly as before.
-- ---------------------------------------------------------------------------
alter table job_tasks add column if not exists milestone_id uuid references job_milestones(id) on delete set null;
create index if not exists job_tasks_milestone_idx on job_tasks (milestone_id) where milestone_id is not null;

-- ---------------------------------------------------------------------------
-- BEFORE / AFTER PHOTOS
--
-- A separate table rather than more entries in jobs.photo_paths, because these
-- carry a role (before or after) and belong to one stage. Flattening them into
-- the job's gallery would lose both, and the whole point is being able to show
-- a homeowner these two pictures next to this one amount.
--
-- Paths live in the existing private job-photos bucket and are signed per read,
-- so nothing here is publicly reachable.
-- ---------------------------------------------------------------------------
create table if not exists milestone_photos (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  milestone_id  uuid not null references job_milestones(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,

  path          text not null,
  phase         text not null,
  caption       text,

  created_at    timestamptz not null default now()
);

do $$ begin
  alter table milestone_photos add constraint milestone_photos_phase_check
    check (phase in ('before', 'after'));
exception when duplicate_object then null; end $$;

create index if not exists milestone_photos_milestone_idx on milestone_photos (milestone_id, phase, created_at);

alter table milestone_photos enable row level security;
drop policy if exists milestone_photos_owner on milestone_photos;
create policy milestone_photos_owner on milestone_photos
  for all using ( is_owner(account_id) ) with check ( is_owner(account_id) );
