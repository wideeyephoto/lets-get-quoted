# Messaging & Lead Intake — Handoff

**Date:** 2026-08-22<br>
**Branch:** `main`, clean, pushed through `0f61cbef`<br>
**For:** whoever picks this up next

---

## Where things stand

The **shared LGQ number** (`+1 947-941-2323`) delivered its first real texts
today. Outbound **delivered** — not merely accepted — twice, at 11s and 22s end
to end. Inbound worked for the first time. `STOP` flipped the consent ledger and
genuinely suppressed a qualifying high-value alert; `START` restored it. Registry
callbacks arrived, stored, and signature-verified 2/2.

It is **currently not sendable**. Assignment `eaea6053` is `failed` and the app
correctly refuses. Awaiting SignalWire support.

The **contractor lane** (`contractor_dedicated`) has never run. Zero numbers
exist, so `stage_sms_delivery` returns `blocked_sender` for all customer, payment
and lead-verification traffic — arrival texts, payment reminders, appointment
confirmations, estimate and reschedule offers. Two-way chat is the visible part
of a lane that carries most of the product's customer contact.

Total outbound events ever recorded: **three**. Two delivered owner alerts on the
shared lane, one failed Twilio row from 2026-07-21.

---

## Shipped today

| Commit | What |
|---|---|
| `db8213bf` | 10DLC Campaign Registry callback receiver + migration; five audit defects fixed before shipping |
| `16f791dd` | Callback signature verification — scheme solved offline from captured traffic |
| `f113ca9a` | Owner alert linked to the tenant marketing host instead of the app |
| `723cfa1d` | LGQ's own texts kept out of the contractor's customer inbox |
| `b582cf4d` | Shared-number auto-reply, its audit table, migration `20260822210000` |
| `f12de4da` | Inbox labels: name → street → town → number, and `clients` is now read |
| `0f8ebe8f` | `sms_inbound_action_tasks` was missing `service_role` SELECT; migration `20260822220000` |
| `8c875dea` | `two-way-messaging-readiness.md` — the contractor-lane gate list |
| `657c121a` | Callback knowledge moved out of a dated log into the runbook |
| `01cb923a` | Three health checks fixed; each had a permanent false alarm |
| `0f61cbef` | E1 corrected — an AI-written city list suppresses high-value alerts |

Both migrations are **applied to production and verified**. The notice-reply
function's nine binding rules were each proven to bite inside a rolled-back
transaction, including that a real `contractor_dedicated` sender is refused.

---

## Read these first — they own the truth

| Document | Owns |
|---|---|
| [two-way-messaging-readiness.md](two-way-messaging-readiness.md) | Every contractor-lane gate — A1–A5 carrier, B1–B4 commercial, C1–C5 engineering, D1–D3 compliance, E1–E4 open defects, F what cannot be checked locally. Each claim names the query or file proving it |
| [signalwire-messaging-cutover-runbook.md](signalwire-messaging-cutover-runbook.md) | Traffic lanes, who can send to the shared number, the auto-reply rationale, the 10DLC callback signature scheme, why token rotation is a carrier operation, the cutover sequence |
| [../logs/2026-08-22.md](../logs/2026-08-22.md) | A dated record, **not** a tracker. Its Open section deliberately points at the two docs above rather than duplicating them |

---

## The one decision that reorders everything

**Does each contractor register their own 10DLC brand, or does LGQ pursue a
reseller / sub-account arrangement with SignalWire?**

Each application already carries its own `provider_brand_id` and
`provider_campaign_id`, which is correct for 10DLC — the brand must be the
business whose messages go out, and that is the contractor. But the SignalWire
client has `getBrand` and `getCampaign` and **no create**. Staff paste both UUIDs
into the admin review form after registering them by hand. Per contractor that
means a manual TCR registration, days-to-weeks of vetting, and carrier fees,
before the product can do anything.

The answer decides whether the commercial gaps (no dedicated-number SKU exists at
all; pricing says "coming soon" in four places) are a pricing change or a whole
new purchase flow. Worth asking in the same support thread as `eaea6053`.

---

## Landmines that cost real time today

- **A wrapper's exit code is not its gates'.** A background gate script reported
  "completed (exit code 0)" while the test suite inside it had failed. Read the
  per-gate summary file; never quote the task notification as the result. Same
  family as piping a gate into `grep` and reading grep's status.
- **`exit 2` is not a pass.** `npm run test:pg17:*` exits 2 with an install
  command when `embedded-postgres` is absent. Install pinned to 17.x with
  `--no-save`, run `hydrate-symlinks.js` by hand past npm's allow-scripts block,
  and put the bin dir on `PATH` or every backend dies with `STATUS_DLL_INIT_FAILED`.
- **A guard that asserts one direction protects one direction.** The PG17
  contract asserted `!auth_select` and `!service_update` and never named
  `service_select` — so the one privilege that was wrong was the only one nothing
  looked at, and 29 green checks sat beside it.
- **Verify against production, not `schema.sql`.** That file contains more than
  one definition of some tables; read `pg_constraint` on the live database.
- **Zero-row writes report success.** `if (error) throw` proves acceptance, not
  change. Assert row counts.
- **CRLF everywhere.** Multi-line replacement through a shell heredoc eats
  backslashes — `\\s+` arrived as `s+` and produced an invalid regex. Use the
  Edit tool for anything containing escapes.
- **`npm run verify:signalwire` mixes two sources.** Rows tagged `[local env]`
  describe the machine running it, not production. Production flags are Vercel
  **Sensitive** variables and are unreadable by anyone, including the operator
  agent.
- **Prove every guard bites.** Every fix today was mutation-tested: an ungated
  third `<Message>` verb, a dropped suppression check, a dropped atomic claim, a
  removed `clients` read, a collapsed fallback chain, a skipped migration. All
  failed as intended before being trusted.

---

## Permissions

**Without asking:** commit, push (the push *is* the deploy), apply migrations,
read production.

**Through Codex**, the operator agent with an authenticated browser: all Vercel
and Stripe operations. Its refusals are findings, not obstacles.

**Never:** type API tokens or signing keys into form fields. Generated secrets go
to a file, never to chat.

---

## Suggested next steps

1. **Ask SignalWire the brand-model question** alongside the `eaea6053` failure —
   why it failed one second after creation, and why no callback fired for it.
2. **Rotate `LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN`.** It leaked twice today, and
   rotation is safe *now* precisely because the assignment is already failed —
   rotation destroys and re-creates the assignment, so doing it to a healthy one
   breaks it. Kill every log watcher first: a watcher captures the token at
   startup to build its redactor and will print the replacement verbatim.
3. **Register a `status_callback_url` on the campaign** (readiness A5). One
   exists on the assignment order, which is why assignment changes arrive, but
   the campaign has none — so a suspension, expiry or revoked use case delivers
   nothing anywhere. Needs the new token, so it follows step 2.
4. **Decide E1.** May a prune flag suppress a high-value alert at all? A prune
   flag currently makes high-value impossible by construction, forces the score
   to `low`, and the low-quality mute then suppresses the alert — so a large job
   from a town the AI-written city list omits produces no alert and no text. The
   lead is never lost; it sits on the board. The low-risk middle option changes
   no scoring and simply says so on the Automations page, where nothing currently
   indicates that "Areas we serve" filters alerts.

---

## Still open, lower priority

- `LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE=1` — shipped measuring, not
  enforcing. Turn on rejection once live traffic reads `valid` consistently.
  Baked at build, so it does nothing until the next deploy.
- Orphaned SWML resource `6db2d8f3`, still pointing at a dead staging project.
- Four `Dana Whitfield` test leads; the cleanup script dry-runs by default.
- The Solo workspace's entitlement row is on a stale catalog version
  (`2026-08-15-preview`) and advertises `dedicated_business_numbers: 1` on the
  live Plan & usage tab — a number no part of the product can deliver.
