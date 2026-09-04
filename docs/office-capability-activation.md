# Turning an office capability on

Written 2026-08-19, after building the switches and stopping short of wiring
them. The switches exist, all 25 are off, and no RLS policy references
`office_can()`. This is how one gets turned on, and the thing that makes it more
work than it looks.

## The property that makes this safe

`office_can(acc, capability)` returns **true for an owner unconditionally**,
including for capabilities nobody has defined. So swapping a predicate on one
policy can never close a surface for the person who owns the business — which is
what makes this doable one table at a time instead of as one enormous change.

And because every capability ships `false`, **a wired policy is inert until
somebody flips a switch.** Wiring and enabling are two separate acts, and they
can be days apart.

## The trap: `for all` policies cannot be swapped

This is the reason wiring was not done alongside the switches.

The dominant shape in `schema.sql` is one policy covering everything:

```sql
create policy job_owner on jobs for all using ( is_owner(account_id) );
```

Counted against the canonical schema: **44 such policies**, plus 8 `for select`
and 1 `for update`. Every one of the 45 governs select, insert, update **and** delete
together.

So the obvious change is wrong:

```sql
-- WRONG. Grants INSERT, UPDATE and DELETE on a capability named "read".
create policy job_owner on jobs for all using ( office_can(account_id, 'jobs.read') );
```

An office user with `jobs.read` would be able to delete jobs. The capability
catalog distinguishes reading from writing precisely because contractors need
that distinction, and a `for all` policy erases it at the moment of wiring.

**Each table has to be split first**, into a read policy and a write policy:

```sql
-- Step 1: split, still owner-only. Behaviour identical, nothing granted.
drop policy if exists job_owner on jobs;
create policy job_owner_read  on jobs for select using ( is_owner(account_id) );
create policy job_owner_write on jobs for all    using ( is_owner(account_id) )
                                                 with check ( is_owner(account_id) );

-- Step 2, separately: swap only the read side.
drop policy if exists job_owner_read on jobs;
create policy job_owner_read on jobs
  for select using ( office_can(account_id, 'jobs.read') );
```

Two migrations, not one. The first is a refactor with no behaviour change and
can be verified by "nothing moved"; the second is the actual grant. Combining
them makes a failure impossible to attribute.

### `for all` also needs `with check`

`using` governs which existing rows are visible to a command; `with check`
governs which new or modified rows are permitted. A `for all` policy with only
`using` gets `with check` defaulted from it — so a split that writes `for all
using (...)` and omits `with check` **changes nothing today**, but the moment the
predicates differ between them it silently permits writes the read predicate
would have refused. Write both, always, even when identical.

## The order to do it in

Least consequential first, and never more than one band at a time. Between
bands, a real office user should use the product and confirm nothing unexpected
opened.

1. **`work`** — leads, clients, jobs, schedule, messages. Nine capabilities.
   The band where the answer is obvious for nearly every contractor: an office
   manager who cannot see a job cannot do anything.
2. **`money_visible`** — quotes, invoices, payments, reports. Read-only, but
   this is where a person starts seeing what the business earns.
3. **`money_moving`** — writing quotes, billing, collecting, refunding. Each is
   a separate decision. `payments.refund` sends money back and is irreversible.
4. **`people`** — the crew list, then separately what each person is paid.
   `crew_pay.read` exposes every rate and salary to whoever holds it.
5. **`account`** — settings, team management, the LGQ subscription.
   `billing.manage` can cancel the plan and end the business's access.

## Which tables each capability touches

Approximate and worth re-deriving before each migration — the mapping is by
subject, and a table can serve two capabilities.

| Capability | Tables |
| --- | --- |
| `leads.*` | `leads`, `lead_blocklist`, `field_submissions` |
| `clients.*` | `clients`, `client_job_access`, `saved_places` |
| `jobs.*` | `jobs`, `job_feed`, `job_tasks`, `job_milestones`, `job_tracking`, `milestone_photos` |
| `schedule.write` | `availability_blocks`, `booking_holds`, `route_stops`, `job_schedule_requests`, `day_plan_prefs` |
| `messages.*` | `sms_messages`, `sms_events`, `sms_consent`, `message_templates`, `campaigns`, `email_suppression` |
| `quotes.*` | `estimate_offers`, `services` |
| `invoices.*` | `invoices`, `finance_plans`, `payment_plans`, `recurring_plans` |
| `payments.*` | `payments`, `scheduled_payments`, `cash_snapshots` |
| `crew.*` | `crew`, `crew_assignments` |
| `crew_pay.*` | `crew_pay_entries`, `crew_pay_periods`, `crew_pay_entry_lines`, `crew_pay_events`, `time_entries`, `costs` |
| `settings.write` | `sites`, `services`, `review_invites` |
| `team.manage` | `memberships`, `office_invitations` |
| `billing.*` | `workspace_entitlements`, `workspace_purchased_capacity`, `account_credits` |

`memberships` deserves particular care: it is the table the seat count and
`is_owner` itself are computed from, and the `guard_office_seat_entry` trigger
already stops a browser role entering the counted set. Granting `team.manage`
means letting somebody invite and remove — through the RPCs, which check
ownership themselves — not letting them write `memberships` directly.

## What to check after each swap

```sql
-- 1. The owner is unaffected. Run as an owner of a workspace with data.
select count(*) from public.jobs;   -- same as before the migration

-- 2. Nothing was granted yet, because the switch is still off.
select capability, enabled from public.office_capabilities where capability = 'jobs.read';

-- 3. The policy is where it should be, and there is exactly one for select.
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy where polrelid = 'public.jobs'::regclass order by polname;
```

Then, and only then, flip the switch:

```sql
update public.office_capabilities set enabled = true, updated_at = now()
where capability = 'jobs.read';
```

That `UPDATE` is the entire act of granting. It is reversible by setting it back,
and `20260819220000` will not undo it on a re-run — the seed writes descriptions
and bands, never `enabled`.

## What is deliberately not decided here

Which capabilities a **particular** contractor grants. These switches are global:
they say what an office user may ever do in this product. A per-workspace layer
would sit on top of `office_can()` without changing anything above, and shipping
it first would have meant guessing the vocabulary twice.
