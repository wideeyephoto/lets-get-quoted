-- Arrival management — "On my way", grown up.
--
-- The first version was a button that fired a text. That is the easy 20% of the
-- problem. What actually goes wrong on the way to a house is: the tech guesses
-- an ETA and is wrong, the homeowner has no way to say "the gate is locked",
-- the tech taps the button twice, the tech taps it on the WRONG job, the text
-- silently fails to send and nobody knows, and a location share meant to last
-- twenty minutes keeps running all afternoon.
--
-- So this is a state machine with a promised window, an audit trail, a delivery
-- receipt and an expiry — not a message send.
--
-- Safe to re-run. Nothing here drops or rewrites existing data: every column is
-- additive and every default reproduces the behaviour that shipped before it.

-- ---------------------------------------------------------------------------
-- THE TRIP  (job_tracking)
-- ---------------------------------------------------------------------------

-- WHO is arriving. A job can have five people assigned; the homeowner should
-- see ONE name and one face, not a convergence of dots on a map. This is the
-- designated arriving contact for this trip.
alter table job_tracking add column if not exists crew_id uuid references crew(id) on delete set null;
alter table job_tracking add column if not exists sent_by text;

-- The PROMISED window. Nullable: a tech who won't commit to a time still gets
-- to say "I'm on my way", and a null window renders as exactly that rather than
-- as a promise nobody made.
alter table job_tracking add column if not exists arrival_start timestamptz;
alter table job_tracking add column if not exists arrival_end timestamptz;

-- Location sharing is a SEPARATE, shorter-lived grant than the link itself.
-- Conflating the two is how a tech ends up broadcasting their position for
-- twelve hours because a customer left a status page open.
alter table job_tracking add column if not exists share_location boolean not null default false;
alter table job_tracking add column if not exists location_expires_at timestamptz;

-- What was actually sent, and whether it actually arrived. "It says sent" and
-- "it sent" are different claims, and only one of them is worth showing to
-- somebody about to knock on a door unannounced.
alter table job_tracking add column if not exists message_body text;
alter table job_tracking add column if not exists sms_status text;
alter table job_tracking add column if not exists sms_sid text;
alter table job_tracking add column if not exists sms_error text;

-- The homeowner's side of the conversation. One current note (shown back to the
-- tech); the full history lives in job_feed like every other job event.
alter table job_tracking add column if not exists homeowner_note text;
alter table job_tracking add column if not exists homeowner_note_at timestamptz;

-- Revisions. A second "on my way" on the same trip is an UPDATE, not a new
-- trip, and this count is what lets the UI stop a tech sending five.
alter table job_tracking add column if not exists revision_count integer not null default 0;
alter table job_tracking add column if not exists last_sent_at timestamptz;

comment on column job_tracking.crew_id is
  'The designated arriving contact for this trip. One person, even when five are assigned.';
comment on column job_tracking.arrival_start is
  'Start of the promised arrival window. NULL means no time was promised, which is a real state and not missing data.';
comment on column job_tracking.share_location is
  'Consent for THIS trip only. Cleared by every terminal status, and independently capped by location_expires_at.';
comment on column job_tracking.sms_status is
  'Delivery receipt: sent | failed | no_phone | opted_out | not_configured. What the field app reports back to the tech.';

-- The lifecycle. 'delayed' is still en route (a revised promise); the terminal
-- states below it are outcomes a tech must be able to record, because "we never
-- showed up" and "nobody was home" look identical in a system that can only say
-- en_route or arrived.
do $$ begin
  alter table job_tracking drop constraint if exists job_tracking_status_check;
  alter table job_tracking add constraint job_tracking_status_check
    check (status in ('en_route', 'delayed', 'arrived', 'no_access', 'rescheduled', 'cancelled', 'done'));
exception when others then null; end $$;

-- Both the field app and the owner's job screen ask "is there a live trip on
-- this job?" on every render. This is that question.
create index if not exists job_tracking_active_idx
  on job_tracking (account_id, job_id, status) where status not in ('done', 'cancelled');

-- ---------------------------------------------------------------------------
-- ACCOUNT SETTINGS
-- ---------------------------------------------------------------------------

-- Whether a tech is asked to share location, always shares, or never can.
-- 'ask' is the default deliberately: an employer silently switching on location
-- broadcast for their staff is something they should choose, not inherit.
alter table accounts add column if not exists arrival_location_policy text not null default 'ask';
do $$ begin
  alter table accounts add constraint accounts_arrival_location_policy_check
    check (arrival_location_policy in ('ask', 'on', 'off'));
exception when duplicate_object then null; end $$;

-- Coordinate precision on the public page. 'street' rounds to ~3 decimal places
-- (about 100m) — enough to show "a few blocks away", not enough to be a
-- tracking device pointed at an employee.
alter table accounts add column if not exists arrival_location_precision text not null default 'street';
do $$ begin
  alter table accounts add constraint accounts_arrival_location_precision_check
    check (arrival_location_precision in ('exact', 'street'));
exception when duplicate_object then null; end $$;

-- Exact ETA ("2:15") or a safer window ("between 2:15 and 2:45"). Window is the
-- default, because a single promised minute is a promise that gets broken.
alter table accounts add column if not exists arrival_window_style text not null default 'window';
do $$ begin
  alter table accounts add constraint accounts_arrival_window_style_check
    check (arrival_window_style in ('exact', 'window'));
exception when duplicate_object then null; end $$;
alter table accounts add column if not exists arrival_window_minutes integer not null default 30;

-- The remembered common selection, so the tech's usual answer is pre-picked.
alter table accounts add column if not exists arrival_default_minutes integer;

-- The business's own wording, with {{tokens}}. NULL = use the built-in default,
-- which is a real choice and has to survive a save — hence NULL rather than ''.
alter table accounts add column if not exists arrival_message_template text;

-- How long the status link stays live. Shorter than a day, because it is a link
-- to where somebody's house is being visited.
alter table accounts add column if not exists arrival_link_hours integer not null default 12;

-- ---------------------------------------------------------------------------
-- CREW PERMISSIONS
--
-- Defaults preserve exactly what every crew member can do today (send, share
-- location, see the customer's number), so applying this changes nobody's
-- access on the day it runs. Rescheduling is the one genuinely new capability,
-- so it starts OFF — a new power that grants itself to everyone is not a
-- default, it's a surprise.
-- ---------------------------------------------------------------------------
alter table crew add column if not exists can_send_arrival boolean not null default true;
alter table crew add column if not exists can_share_location boolean not null default true;
alter table crew add column if not exists can_view_client_contact boolean not null default true;
alter table crew add column if not exists can_reschedule boolean not null default false;

comment on column crew.can_reschedule is
  'Off by default: this capability did not exist before arrival management, so it is granted, never inherited.';
