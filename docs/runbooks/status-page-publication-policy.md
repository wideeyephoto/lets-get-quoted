# Status page publication policy

What gets published to `letsgetquoted.com/status`, who writes it, and how fast.

This is the G5 policy requirement from
[the gap closure plan](../prelaunch-gap-closure-plan-2026-09-11.md#g5--no-customer-facing-incident-channel):
*"which severities get published, who writes the copy, and the target time from
page to publish."*

It is written for the business as it actually is: **one operator, who sleeps.**
A policy that assumes a rota will be abandoned the first night it is tested, and
an abandoned policy is worse than none because it leaves customers expecting
updates that are not coming. Everything below is sized so one person can hold it.

---

## 1. The decision, in one line

**Publish when a customer could already tell something is wrong.**

Not when it is understood, not when it is fixed, not when the write-up is
polished. If a contractor could be staring at a failed payment or a lead that
never arrived, they are owed a sentence saying we know. Everything else on this
page is detail on that one rule.

The inverse matters as much: **do not publish what a customer cannot observe.**
A dead-letter queue that drained on retry, a cron that failed once and succeeded
on the next fire, a provider blip nobody hit — publishing those trains people to
ignore the page, which costs you the one outage where it mattered.

---

## 2. Which severities get published

`platform_incidents.severity` is `info`, `warning` or `critical`
(`src/lib/platform-incidents.ts`). The operational alert path in
`src/lib/founder-alerts.ts` grades separately as `critical`, `high` or `warning`
across eight incident types. They are not the same scale, so the mapping is
stated rather than assumed.

| Incident severity | Meaning (from `SEVERITY_HELP`) | Publish? | Target time to publish |
| --- | --- | --- | --- |
| `critical` | Customers could not do something important — payments, booking, sign-in | **Always** | 15 minutes from the page |
| `warning` | Some customers hit it, or one part of the product was degraded | **If customer-observable** | 60 minutes from the page |
| `info` | Worth writing down. Nobody was affected | **No** | — |

A `release` is never published as an incident. Releases are logged for the
Command Center; the status page shows them only once they exist as history.

### By alert category

The eight `incidentType` values page the operator. Whether they also reach a
customer depends on whether the customer can see the failure, not on how
alarming the alert reads.

| Category | Default | Why |
| --- | --- | --- |
| `uptime` | **Publish** | The site being down is the most observable failure there is. |
| `runtime_exception` | Publish if a user-facing route is throwing | A background exception nobody hit is not an outage. |
| `database` | **Publish** | Nothing works without it, including this page — see §6. |
| `provider_outage` | Publish if the provider carries customer traffic | Stripe, SignalWire and Resend are observable. An internal provider is not. |
| `sms_queue_stall` | Publish once messages are late enough to notice | A contractor waiting on a dispatch text sees this before we do. |
| `billing_reconciliation` | Usually **not** | Ledger drift is ours to fix. Publish only if a charge, refund or credit is visibly wrong. |
| `webhook_dead_letter` | Usually **not** | Publish if the backlog means a customer's payment or message is not landing. |
| `cron_failure` | Usually **not** | Publish if the missed job is one a customer feels — reminders, settlement, allowance grants. |

When in doubt, publish. An unnecessary incident costs a little credibility; a
missing one costs a support flood and a churn event at the same time.

---

## 3. Who writes it

The operator on the page. There is no second approver, and requiring one would
mean nothing is ever published at 3am.

The published fields are `title`, `description`, `impact_summary` and, on
resolution, `resolution_summary`. Those four are what the page renders. The
migration's grant means `root_cause`, `owner`, `created_by`, `external_url` and
`affected_services` are not readable by an anonymous caller at all, so an
internal note cannot reach a customer by being typed into the wrong box. Write
freely in those fields.

### How to write the four public fields

- **Title.** What is broken, in the customer's words. "Card payments are
  failing", not "Stripe webhook 500s" and not "P1 incident".
- **Description.** What they will see, and what to do instead if there is
  anything. Two sentences.
- **Customer impact.** Who is affected. If it is a subset, say so — "contractors
  on custom email domains" — because everyone else can then stop worrying.
- **Resolution summary.** What restored service, in one sentence, plus anything
  they need to do themselves (re-send, re-try, check a total).

Never publish a cause you are not sure of. "We are investigating" ages well;
a wrong cause has to be retracted in public.

---

## 4. Target times

Measured from the operational alert arriving, not from when it was understood.

| Step | Target |
| --- | --- |
| `critical` incident published | 15 minutes |
| `warning` incident published | 60 minutes |
| Update while an incident is open | every 60 minutes, even if the update is "still working on it" |
| Resolution published | 30 minutes after service is restored |

A missed target is not a policy violation to be argued about later; it is a
signal the alert did not reach a human, which is a
[G3](../prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses)
problem rather than a judgement problem. Note it and check the paging chain.

### Overnight

One operator means overnight publication is best-effort and the policy says so
rather than pretending otherwise. What is committed to overnight: a `critical`
incident that pages the phone gets published before the operator goes back to
sleep, because publishing is three fields and one click and is faster than the
support email it prevents. `warning` incidents wait for morning.

This is the point where §3 of
[the post-cutover watch window](../prelaunch-gap-closure-plan-2026-09-11.md#g7--no-post-cutover-watch-window)
and this policy meet: G7 decides which categories are allowed to wake someone,
and this decides what gets said once they are awake. Neither is finished until
both name the same categories.

---

## 5. The cycle

1. **Open.** `/admin/incidents` → "Log one" → fill the four public fields → tick
   **Publish to the public status page now** → Log it. A `critical` incident also
   dispatches an on-call page automatically.
2. **Update.** Re-publishing is editing the same row; the page reflects it within
   the edge cache window, at most 60 seconds.
3. **Resolve.** "Resolve…" on the open incident, with a resolution summary. The
   row moves to Past incidents on its own.
4. **Retract if wrong.** "Unpublish from /status" removes it from public view
   immediately and keeps the internal record. Retracting is not an admission of
   incompetence and should never be the slow path.

Every one of those writes an `admin_actions` row and requires `ops.manage` with
MFA. The audit trail is the record of what customers were told and when.

---

## 6. When the status page is the thing that is broken

The page reads `platform_incidents` from the same database as everything else,
so a database outage takes the page with it. That is why the page has a third
state: it renders **"Status Unavailable"** in amber and says the platform's
health is unknown rather than rendering green on an empty result. That is
honest, and it is also all it can do.

It is not a substitute for an independent channel. Until one exists, a database
or platform-wide outage is announced wherever customers are already looking, and
the fact that this page cannot self-report its own worst case is a known
limitation rather than a solved problem. Do not cite `/status` as evidence of
uptime.

---

## 7. What this policy does not cover

- **Proactive maintenance windows.** Nothing schedules them yet. When something
  does, they belong here as a `release` published ahead of time.
- **Subscriptions.** There is no way to be notified of a new incident; a customer
  has to open the page. An email or RSS channel is a separate piece of work.
- **An SLA.** Publishing a status page is not a commitment to an uptime number,
  and nothing here should be quoted as one.
- **Per-workspace incidents.** The page is platform-wide. A failure affecting one
  contractor is support, not an incident.
