-- Take back the two capabilities whose pages do not work, and which were the
-- only real exposure in the office grant.
--
-- WHAT WAS WRONG. The Office team card says, in bold, that an office user
-- "can't open anything yet" and that "an invitation connects an account and
-- nothing more". That is not what an invitation did. `20260820220000` enabled
-- thirteen capabilities, and RLS honours six of them today:
--
--     clients.read/write   -> clients   SELECT INSERT UPDATE DELETE
--     jobs.read/write      -> jobs      SELECT INSERT UPDATE DELETE
--     leads.read/write     -> leads     SELECT INSERT UPDATE DELETE
--
-- The other seven enabled flags -- crew.read, invoices.read, messages.read,
-- messages.send, payments.read, quotes.read, schedule.write -- are referenced by
-- no policy at all, so they grant nothing. Checked, not assumed:
--
--     select distinct substring(coalesce(qual, with_check)
--              from 'office_can\([^,]+, ''([a-z_.]+)''')
--       from pg_policies where qual like '%office_can%' or with_check like '%office_can%';
--
-- so the exposure was exactly clients and jobs. A receptionist invited on
-- Solo/Growth/Scale received the complete customer book -- names, phones,
-- addresses -- plus every job, with insert, update and DELETE. The dashboard
-- only routes them to /dashboard/leads, but the dashboard is not the boundary:
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ships to the browser, so their own session token
-- reaches PostgREST directly.
--
-- WHY DISABLE RATHER THAN REWRITE THE COPY. Both were wrong, and both are being
-- fixed -- but these two capabilities buy nothing even when granted. The clients
-- pages and the jobs pages have both been audited against an office session and
-- BOTH FAIL: clients because its detail page states "$0.00 paid" as fact when
-- payments is owner-only, jobs because its detail page builds an admin client
-- while rendering and reads two dozen owner-only tables. So the grant hands over
-- the data through the raw API while the product still cannot show it.
-- Re-enable each one WITH the page that makes it usable, not before.
--
-- leads.read/write STAY. That surface is genuinely converted -- an office user
-- lands on the leads board and can read, triage and edit a lead -- and it is
-- what the card will now describe.

begin;

update public.office_capabilities
   set enabled = false,
       updated_at = pg_catalog.now()
 where capability in ('clients.read', 'clients.write', 'jobs.read', 'jobs.write');

-- ---------------------------------------------------------------------------
-- Post-conditions. The point of this file is what an office user can no longer
-- reach, so assert that rather than the row count.
-- ---------------------------------------------------------------------------
do $$
declare
  v_still_on text;
begin
  select pg_catalog.string_agg(capability, ', ' order by capability)
    into v_still_on
    from public.office_capabilities
   where enabled
     and capability in ('clients.read', 'clients.write', 'jobs.read', 'jobs.write');
  if v_still_on is not null then
    raise exception 'office capability still enabled: %', v_still_on;
  end if;

  -- The leads board is the whole point of the office seat today. If this ever
  -- goes false, the seat grants nothing at all and the card is wrong again in
  -- the other direction.
  if not exists (
    select 1 from public.office_capabilities
     where capability = 'leads.read' and enabled
  ) or not exists (
    select 1 from public.office_capabilities
     where capability = 'leads.write' and enabled
  ) then
    raise exception 'leads capabilities are not enabled; the office seat now grants nothing';
  end if;

  -- And the policies must still be the thing enforcing it. If a future migration
  -- drops office_can from these tables, disabling the capability stops mattering.
  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'clients'
       and coalesce(qual, with_check) like '%office_can%'
  ) then
    raise exception 'clients policies no longer consult office_can; this switch is inert';
  end if;
end $$;

commit;
