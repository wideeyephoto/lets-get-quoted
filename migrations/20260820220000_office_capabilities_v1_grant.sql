-- What an office user may ever do. The decision 20260819220000 refused to make.
--
-- That migration shipped twenty-five switches, all false, and said so out loud:
-- "It ships the MECHANISM and none of the policy." This is the policy, and it is
-- deliberately a separate file so the decision can be read, argued with, and
-- reverted without touching the mechanism underneath it.
--
-- STILL INERT. No RLS policy references `office_can` yet, so enabling a
-- capability here grants nothing today -- it states an intent that the policy
-- swaps in the next migrations will honour. Landing the decision before the
-- policy rewrite is on purpose: the tenant boundary is the most dangerous thing
-- in this schema to edit, and it should be edited against a list somebody has
-- already agreed to rather than one being invented while rewriting it.
--
-- WHY THESE THIRTEEN. The seat is sold as "office user", and the job that names
-- is a person who runs the day: answers enquiries, books work, talks to
-- customers, and can see what has been quoted and billed so they can answer a
-- question about it. Every capability below is one that job cannot be done
-- without.
--
-- WHY THE OTHER TWELVE ARE OFF, which matters more. There is no per-workspace
-- grant layer yet -- `office_can` checks a GLOBAL switch and the user's office
-- membership, so a capability enabled here is held by every office user in every
-- workspace. That makes "on" a much bigger claim than it will be later, and it
-- is the whole reason the money-moving, payroll and account bands stay dark: a
-- contractor cannot yet say "this one may refund, that one may not", so the
-- answer for all of them has to be no.
--
--   reports.read     whole-business revenue, margin and job costing. Defensible
--                    for the role and the first one to reconsider -- held only
--                    because margin exposes the cost structure, and until a
--                    contractor can grant it per person, everyone gets it.
--   quotes.write     sets prices a customer can accept and be charged for.
--   invoices.write   changes amounts owed.
--   payments.collect charges a card.
--   payments.refund  sends money back, irreversibly.
--   crew.write       changes who is on the roster and who is assigned.
--   crew_pay.read    what every individual earns.
--   crew_pay.write   changes pay rates and approves payroll.
--   settings.write   the public site, booking rules, the business number.
--   team.manage      hands this same access to somebody else.
--   billing.read     what LGQ charges. Held with billing.manage, not because it
--                    is dangerous but because a plan screen that can be read and
--                    not acted on is a support ticket.
--   billing.manage   can cancel the subscription and end the business's access.
--   inventory.read   view inventory register, tools, vehicles, and stock.
--   inventory.custody check tools in/out and transfer stock.
--   inventory.write  create, edit, and retire equipment and stock.
--   marketing.read   view marketing attribution, campaigns, and performance.
--   marketing.write  compose and send campaigns, write blog posts, configure ads.
--
-- Six of those twelve are named in OFFICE_CAPABILITIES_REQUIRING_DELIBERATION in
-- src/lib/office-permissions.ts as capabilities that must never be on by
-- default. The post-condition below asserts this migration left all six off, so
-- a future edit that adds one to the enable list fails here rather than in
-- production.

begin;

-- The thirteen, by key rather than by band: `crew.read` is banded `people`
-- alongside the payroll switches, and scheduling work requires knowing who is on
-- the roster. Enabling by band would have taken pay rates with it.
update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in (
   -- Day-to-day work: the whole band.
   'leads.read', 'leads.write',
   'clients.read', 'clients.write',
   'jobs.read', 'jobs.write',
   'schedule.write',
   'messages.read', 'messages.send',
   -- Money they can see, minus reports.read. Read-only: nothing here changes
   -- what a customer will be charged.
   'quotes.read', 'invoices.read', 'payments.read',
   -- Who is on the roster and how to reach them. Explicitly NOT their pay.
   'crew.read'
 );

do $post$
declare
  v_enabled text[];
  v_expected text[] := array[
    'clients.read', 'clients.write', 'crew.read', 'invoices.read',
    'jobs.read', 'jobs.write', 'leads.read', 'leads.write',
    'messages.read', 'messages.send', 'payments.read', 'quotes.read',
    'schedule.write'
  ];
  v_never text[] := array[
    'payments.collect', 'payments.refund', 'crew_pay.read',
    'crew_pay.write', 'team.manage', 'billing.manage'
  ];
  v_bad text;
  v_count integer;
begin
  select pg_catalog.array_agg(capability order by capability)
    into v_enabled
    from public.office_capabilities
   where enabled;

  -- The exact set, not a subset. A superset would mean this migration enabled
  -- something the comment above does not account for, which is precisely the
  -- failure the whole file exists to prevent.
  if v_enabled is distinct from v_expected then
    raise exception 'enabled set is % but should be %', v_enabled, v_expected;
  end if;

  -- Restated independently rather than inferred from the comparison above. If
  -- somebody edits v_expected to add a capability, this still refuses when the
  -- addition is one of the six.
  foreach v_bad in array v_never loop
    if exists (select 1 from public.office_capabilities where capability = v_bad and enabled) then
      raise exception '% requires deliberation and must not be enabled by a migration', v_bad;
    end if;
  end loop;

  -- Every key named above must actually exist. A typo would otherwise update
  -- zero rows and pass every count-based check by being invisible.
  if (select pg_catalog.count(*) from public.office_capabilities
       where capability = any(v_expected)) <> pg_catalog.array_length(v_expected, 1) then
    raise exception 'one or more capability keys in this migration do not exist in the catalog';
  end if;

  -- AND THIS MIGRATION IS STILL INERT. Enabling a switch that no policy reads
  -- changes nothing, and that is the property that makes landing the decision
  -- separately from the policy rewrite safe. The moment a policy references
  -- office_can, this assertion is expected to be removed along with it -- by the
  -- migration that adds the policy, deliberately, not by this one drifting.
  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_policy p
   where pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%office_can%'
      or pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%office_can%';

  if v_count > 0 then
    raise exception
      '% policy/policies already read office_can; this migration is a decision, not a behaviour change', v_count;
  end if;
end $post$;

commit;
