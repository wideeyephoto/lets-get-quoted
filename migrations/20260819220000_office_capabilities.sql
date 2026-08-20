-- The permission switches for office users. All of them off.
--
-- This is the last blocker in docs/office-seat-activation.md: "whether added
-- office users should have full owner authority or narrower roles, plus
-- server-side authorization for those roles". It ships the MECHANISM and none
-- of the policy. Every switch below is false, `office_can()` therefore returns
-- false for every capability, and NO RLS POLICY IN THE PRODUCT REFERENCES IT.
--
-- WHY A CAPABILITY AND NOT A ROLE. "Office manager" is not one job. It is a
-- bookkeeper who needs invoices and must never see crew pay rates; a scheduler
-- who needs the calendar and nothing financial; a partner who needs everything
-- except the ability to cancel the subscription. One role forces every
-- contractor into whichever of those we imagined, and the ones it fits worst
-- hand out an owner login instead -- the exact outcome this feature exists to
-- prevent.
--
-- WHY GLOBAL AND NOT PER-WORKSPACE. What an office user may EVER do is a
-- product decision; which of those a particular contractor grants is a later,
-- narrower one. Shipping the global switch first means the per-workspace layer
-- can be added on top without revisiting any of this, and shipping the
-- per-workspace layer first would have meant guessing the vocabulary twice.
--
-- HOW A SURFACE IS OPENED, when the time comes. One policy at a time:
--
--   using ((select public.is_owner(account_id)))
--   -- becomes
--   using ((select public.office_can(account_id, 'jobs.read')))
--
-- `office_can` returns true for an owner unconditionally, so a swapped policy
-- never narrows what an owner can do. That is the property that makes doing this
-- incrementally safe, and it is asserted below.

begin;

create table if not exists public.office_capabilities (
  capability text primary key check (capability ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  enabled boolean not null default false,
  -- Said in terms of what the person could then see or do, not in column names.
  grants text not null,
  band text not null check (band in ('work', 'money_visible', 'money_moving', 'people', 'account')),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Read by anybody signed in -- the list of what an office user COULD hold is not
-- a secret, and a team screen has to render it. Written by nobody through the
-- API: turning one of these on is a deliberate act with a migration behind it,
-- not a toggle a session can flip.
alter table public.office_capabilities enable row level security;

drop policy if exists office_capabilities_read on public.office_capabilities;
create policy office_capabilities_read
  on public.office_capabilities
  for select
  to authenticated
  using (true);

revoke all on table public.office_capabilities from public, anon, authenticated;
grant select on table public.office_capabilities to authenticated;

-- ---------------------------------------------------------------------------
-- The predicate a policy would use
-- ---------------------------------------------------------------------------
create or replace function public.office_can(acc uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $can$
  select
    -- An owner is unconditional. A policy that swaps is_owner() for this must
    -- not narrow what the owner could already do, or opening one surface for an
    -- office user would quietly close it for the person who owns the business.
    public.is_owner(acc)
    or (
      public.is_office(acc)
      and exists (
        select 1 from public.office_capabilities c
        where c.capability = p_capability and c.enabled
      )
    );
$can$;

grant execute on function public.office_can(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The catalog, seeded off
-- ---------------------------------------------------------------------------
-- Kept in step with src/lib/office-permissions.ts by a test that reads both and
-- compares the sets. SQL cannot import TypeScript, so the list exists twice and
-- the only defence against drift is an assertion that says so out loud.
-- What is enabled RIGHT NOW, before this run touches anything. The assertion at
-- the end compares against it rather than against "nothing", because a re-run in
-- an environment where somebody deliberately switched something on must not
-- refuse -- and must equally not be the thing that switched it on.
create temporary table office_capabilities_before on commit drop as
  select capability from public.office_capabilities where enabled;

insert into public.office_capabilities (capability, band, grants) values
  ('leads.read', 'work', 'Every enquiry that came in, including the customer''s name, phone number and address.'),
  ('leads.write', 'work', 'Reply to enquiries, change their status, and mark them won or lost.'),
  ('clients.read', 'work', 'The full customer list with contact details and job history.'),
  ('clients.write', 'work', 'Add customers and change their details, including where work happens.'),
  ('jobs.read', 'work', 'Every job, its schedule, its notes and its photos.'),
  ('jobs.write', 'work', 'Create and reschedule jobs, and change what is on them.'),
  ('schedule.write', 'work', 'Book, move and cancel appointments the crew will turn up to.'),
  ('messages.read', 'work', 'Text conversations with customers, including anything already sent.'),
  ('messages.send', 'work', 'Text customers from the business number. Recipients cannot tell who typed it.'),
  ('quotes.read', 'money_visible', 'Every quote and its prices, including ones never sent.'),
  ('invoices.read', 'money_visible', 'What has been billed, what is outstanding, and who is late paying.'),
  ('payments.read', 'money_visible', 'Every payment taken, and the platform and processing fees on each.'),
  ('reports.read', 'money_visible', 'Revenue, margin and job costing across the whole business.'),
  ('quotes.write', 'money_moving', 'Set prices and send quotes a customer can accept and be charged for.'),
  ('invoices.write', 'money_moving', 'Create and send invoices, and change amounts owed.'),
  ('payments.collect', 'money_moving', 'Charge a customer''s card and request payment. This moves real money.'),
  ('payments.refund', 'money_moving', 'Send money back to a customer. Irreversible once it leaves.'),
  ('crew.read', 'people', 'Who is on the roster and their contact details. Not their pay.'),
  ('crew.write', 'people', 'Add and remove crew, and change who is assigned to what.'),
  ('crew_pay.read', 'people', 'Hourly rates, salaries, day rates and every payroll figure for every person.'),
  ('crew_pay.write', 'people', 'Change pay rates and approve payroll runs.'),
  ('settings.write', 'account', 'The public site, booking rules, automations and the business number.'),
  ('team.manage', 'account', 'Give other people this same access, and take it away.'),
  ('billing.read', 'account', 'The plan, what LGQ charges for it, and every top-up bought.'),
  ('billing.manage', 'account', 'Upgrade, downgrade, buy add-ons and cancel. Can end the business''s access.')
on conflict (capability) do update
  set band = excluded.band, grants = excluded.grants;
-- `do update` on the description, never on `enabled`: re-running this migration
-- must not switch anything back on that somebody deliberately turned off, nor
-- off that somebody deliberately turned on.

do $post$
declare
  v_enabled text;
  v_count integer;
begin
  -- THIS MIGRATION ENABLED NOTHING. The assertion the whole thing is for: it
  -- ships a mechanism, not a decision, and a seeded `true` would be a decision
  -- made by whoever typed the INSERT.
  --
  -- Compared against the before-snapshot rather than against zero. Asserting
  -- "nothing is enabled" was the first version and it was wrong in a way only a
  -- second run showed: it refused in any environment where somebody had
  -- deliberately turned a capability on, which is every environment this will
  -- eventually be re-run in.
  select pg_catalog.count(*), pg_catalog.string_agg(capability, ', ')
    into v_count, v_enabled
  from (
    select capability from public.office_capabilities where enabled
    except
    select capability from office_capabilities_before
  ) s;

  if v_count > 0 then
    raise exception 'this migration enabled office capabilities: %', v_enabled;
  end if;

  -- And on a FIRST install there was nothing before, so the seed must have
  -- turned nothing on. Both halves of the claim, checked separately.
  if not exists (select 1 from office_capabilities_before)
     and exists (select 1 from public.office_capabilities where enabled) then
    raise exception 'a fresh install shipped enabled capabilities';
  end if;

  -- An owner must pass every capability regardless. A policy swapped to
  -- office_can() would otherwise close a surface for the person who owns the
  -- business, which is a far worse failure than the one being fixed.
  if pg_catalog.pg_get_functiondef('public.office_can(uuid,text)'::regprocedure)
       !~ 'is_owner' then
    raise exception 'office_can does not admit an owner unconditionally';
  end if;

  -- And nothing may be reachable yet. If a policy already referenced this, the
  -- migration would be changing behaviour rather than adding a switch.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy p
  where pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%office_can%'
     or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%office_can%';

  if v_count > 0 then
    raise exception '% policy/policies already use office_can; this migration must ship inert', v_count;
  end if;
end $post$;

commit;
