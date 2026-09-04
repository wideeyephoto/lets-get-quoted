# SignalWire Messaging Cutover Runbook

**Owner:** LGQ Operations<br>
**Last updated:** 2026-08-26<br>
**Default state:** dark; do not activate from this document alone

This is the controlled handoff for LGQ operational messaging. Supabase Auth phone login remains on Twilio. The kill switch is always `LGQ_DISABLE_OUTBOUND_SMS=1`.

## Provider cost record

Purchased from SignalWire on 2026-08-26 for the LGQ crew/subcontractor dispatch
Campaign. SignalWire created Campaign
`19e7c875-3611-4b40-8429-7dae3b5e6553` at 20:57 UTC; its carrier status was
`Pending` immediately after submission.

| Item | Timing | Amount | Status / note |
|---|---:|---:|---|
| Campaign registration | Initial three months | $4.50 | Purchased 2026-08-26 |
| Carrier setup | One time | $0.00 | Included in the registration checkout |
| Campaign vetting | One time | $7.50 | Purchased 2026-08-26; review pending |
| **Campaign checkout total** | **At submission** | **$12.00** | **Incurred 2026-08-26** |
| Campaign re-vetting | Per additional review, if required | $7.50 | Contingent; do not book unless incurred |
| Proposed dispatch number `+1 (947) 257-6777` | Monthly | $0.50 | Available candidate; not yet purchased |

Provider cost incurred to date for this dispatch Campaign is **$12.00**. If the
proposed number is purchased, the known first-three-month provider cost becomes
**$13.50**: the $12.00 Campaign checkout plus three months of number rental.
Usage, carrier pass-through, messaging segments, taxes, and Campaign pricing
after the initial three months are not included because they were not quoted on
the confirmation screen.

## Traffic lanes

| Lane | Sender purpose | Release gate | Allowed traffic |
|---|---|---|---|
| LGQ shared | `lgq_shared` | `LGQ_SMS_SHARED_ENABLED=1` | LGQ-branded account, billing, support, and approved quote-request notifications to opted-in account holders |
| LGQ dispatch | `lgq_dispatch` | `LGQ_SMS_DISPATCH_ENABLED=1` | Crew/subcontractor dispatch only after written carrier confirmation or separate Campaign approval |
| Contractor dedicated | `contractor_dedicated` | `LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED=1` | One vetted contractor's homeowner traffic from that contractor's active assigned number |

No lane inherits another lane's Campaign, number, consent, or release decision.

The contractor lane is blocked and has never run. Its gate list — carrier,
commercial, engineering and compliance — is in
[Two-Way Messaging Readiness](two-way-messaging-readiness.md).

### Who can receive from the shared number

Only the **account owner**, at `accounts.alert_phone`, and only for
`billing_category = 'owner_alert'` — in practice `owner-high-value-lead` and
`owner-estimate-accepted`. `senderPurposeFor()` routes every other category to
`contractor_dedicated`, so **no homeowner or customer can ever receive anything
from the shared number**. That is what keeps the platform Campaign's
"no contractor-to-customer traffic" declaration true.

### Who can send to it, and what happens

Anyone can text it; delivery into the app is gated:

| Inbound case | Result |
|---|---|
| No/invalid provider signature | Rejected before the body is read, logged to `webhook_failures` |
| Unparseable body | Stored via `recordInvalidWebhook` |
| `STOP` / `START` / `HELP` | Compliance acknowledgement, consent ledger updated |
| Ordinary reply, one matching consent scope | Routed to that account, action worker runs |
| Ordinary reply, zero or many matches | `shared_destination_unroutable`, held for operator review |

The account is **not** taken from the number that was texted — a platform lane's
`sms_sender_numbers.account_id` is `NULL` by CHECK. It is derived from the
sender:

- **ordinary replies** need a current `sms_consent_scopes` row (`owner` for
  shared, `crew` for dispatch) that is `opted_in`, with `opted_out_at` null;
- **STOP/START/HELP on shared** cannot use consent (START must work *after*
  STOP revoked it), so they use accepted delivery history instead;
- **STOP/START on dispatch** use crew scope plus a live roster match.

Every path requires **exactly one** matching account. Zero and multiple both
fail closed — there is deliberately no recency ordering and no `LIMIT`, because
guessing wrong on a shared number means showing one contractor another's
message.

### The automated reply (added 2026-08-22)

Any inbound to `lgq_shared` / `lgq_dispatch` that is **not** a compliance
keyword is answered with a single fixed notice:

> `<Brand>: Alerts only, replies not monitored. Open your dashboard: <APP_ORIGIN>/dashboard Reply STOP to opt out.`

Rationale and constraints, all of which are load-bearing:

- **Why at all.** Before this, replying to the shared number produced total
  silence — routed messages were filed, unroutable ones went nowhere. Texting a
  business number and getting nothing is worse than an honest automated answer.
- **Why it does not advertise the dedicated number.** The registered Campaign is
  `LOW_VOLUME_MIXED` / `CUSTOMER_CARE` + `ACCOUNT_NOTIFICATION`, and its TCR
  description states that **no marketing** is carried. Promoting a paid upgrade
  in the text would contradict a carrier-audited field. The notice states a
  capability limit and points at the dashboard; the **dashboard** does the
  selling, because it is not a carrier-governed surface.
- **Why it is one segment.** Every reply is billed per segment. Plain ASCII stays
  in GSM-7 (160 chars/segment); a single non-GSM-7 character — an em dash, a
  curly apostrophe — promotes the whole message to UCS-2 at **70** chars per
  segment. The first draft used an em dash and cost three segments. A test
  asserts both the charset and the segment count.
- **It obeys the same gates as the durable worker.** A carrier `<Message>` verb
  *is* an outbound text, so it passes through `outboundSmsLaneSuppression` —
  kill switch, canary allow-list, lane flag. A dark deployment does not text.
- **It is claimed in a single transaction.** `record_sms_shared_notice_reply` returns true to
  exactly one caller per receipt, so a provider retry cannot double-text.
- **It never answers a contractor-dedicated number.** Auto-replying there would
  put words in the contractor's mouth mid-conversation with their customer. Both
  the route and the SQL function enforce this.
- **It is audited separately from compliance replies.**
  `record_sms_compliance_reply_result` binds its row to
  `disposition = 'keyword_' || keyword`; a notice's disposition is `routed` or
  `shared_destination_unroutable`. Widening that function would have weakened the
  invariant tying an acknowledgement to the keyword that earned it. STOP/START/
  HELP are carrier obligations; this is a courtesy. Separate tables on purpose.

## 10DLC registry callbacks

The Campaign Registry posts brand, campaign and assignment state changes to
`/api/signalwire/10dlc/<token>`. Two things about it are not in SignalWire's
documentation and cost real time to establish, so they are recorded here rather
than in a dated log.

### The signature scheme

```
HMAC-SHA1(SIGNALWIRE_SIGNING_KEY, callback_url + raw_body) -> HEX
```

Solved offline on 2026-08-22 against two captured `(body, signature)` pairs.

**Hex, not the base64** the rest of the rail uses via `signBase64` — reusing
`validateWebhookSignature` here rejects every genuine delivery. The signed URL
includes the secret path segment, which is what makes verification possible
without moving to a static path.

### The callback carries no reason field

Eleven documented fields, none of them a failure reason, and the delivery is
"advisory, best-effort". The receiver can record **that** an assignment failed
and never **why**; support is the only path to a cause. `failed` may also be
transient. Do not build logic that expects a reason to arrive.

### The campaign itself has no status callback

Registered 2026-08-22 on the assignment ORDER, which is why assignment state
changes now arrive. The **campaign** object still carries no
`status_callback_url`, so a campaign-level change — suspension, expiry, a
carrier revoking the use case — delivers nothing anywhere. `npm run
verify:signalwire` reports it as a carrier blocker.

Registering one needs a valid `LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN`, so it is
naturally sequenced with the outstanding rotation above.

### verify:signalwire mixes two sources

Run it anywhere and the carrier rows are true: brand, campaign, number,
message handler, assignment state. The rows tagged **`[local env]`** are not —
they read `.env.local` on the machine running the script, while the production
flags are Vercel **Sensitive** variables that nothing can read back.

On a laptop that means the lane rows say "not set" and the callback-token row
FAILs while production may be perfectly configured. The summary separates the
two on purpose; before 2026-08-22 it printed one "NOT READY. Blocking:" list
and a missing local file read as a production outage.
### Rotating the token is a carrier operation

The callback URL embeds the token, so rotation forces a delete and re-create of
the number assignment. Doing this on a `completed` assignment broke it on
2026-08-22: the replacement failed one second after creation, against roughly
twelve minutes to succeed, and **no callback fired for that failure**. Rotate
only when a failed assignment costs nothing.

Kill any log watcher first. A watcher captures the token at startup to build its
redactor, so rotating while one runs prints the new token verbatim.

### Pending: enforce the signature

- [ ] `LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE=1`

Shipped **measuring, not enforcing**, per the usual two-flag convention.
Verification currently records a verdict and rejects nothing. Two of two real
callbacks have read `valid`. Turn on rejection once live traffic reads `valid`
consistently — and remember the flag is baked at build, so it does nothing
until the next deploy.
## Hard prerequisites

Stop if any answer is no or unknown:

- [ ] The target migration set is applied and its PostgreSQL verification scripts pass.
- [ ] The exact SignalWire Messaging callback URL, content type, raw body, signature header, and Dashboard Signing Key have been captured in staging.
- [ ] `SIGNALWIRE_SIGNING_KEY` is the Dashboard Signing Key, not the API token.
- [ ] The individual number assignment is `assigned`; an order marked `Processed` is not enough.
- [ ] The number inventory row is `active`, `assigned`, `inbound_ready`, not suspended, and has the expected Campaign and production webhook URL.
- [ ] SignalWire has confirmed the Campaign covers the exact lane being enabled.
- [ ] `LGQ_LEAD_VERIFICATION_SECRET` is present before removing any Vercel Twilio operational secret.
- [ ] Supabase Auth's Twilio configuration is unchanged and a phone-login test succeeds.
- [ ] Operations can open `/admin/messaging` and see queue, review, sender, and gate state.
- [ ] Text-usage reconciliation failures are zero, or every nonzero event has a
  documented operator disposition before any lane expands.

Known external blocker on 2026-08-21: the individual assignment for `+1 (947) 941-2323` was failed even though its order was processed. Production activation is forbidden until that specific assignment is successful.

## Staging proof

Use a non-production number and a canary workspace. Keep all three traffic-lane gates off except the single lane under test.

1. Apply migrations and run:
   - `npm run test:pg17:sms-delivery`
   - `npm run test:pg17:sms-webhooks`
   - `npm run test:pg17:sms-inbound-actions`
   - `npm run test:pg17:number-provisioning`
   - `npm run test:pg17:voice-inbox`
   - `npm run test:pg17:messaging-schema`
   - `npm run check:schema:messaging`
   - `npm run check:schema:order`
   - `npm test`
   - `npm run typecheck`
   - `npm run build`
2. Set the full SignalWire staging credential block and explicit `LGQ_SMS_PROVIDER=signalwire`.
3. Set `LGQ_SMS_CANARY_ACCOUNT_IDS` to one workspace UUID.
4. Keep `LGQ_SMS_DELIVERY_WORKER_ENABLED=0` and
   `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED=0`; deploy and prove callbacks
   authenticate while both workers are dark.
5. Enable the delivery worker and exactly one traffic-lane gate. Enable the
   inbound-action worker only while exercising authenticated reply actions.
6. Prove, from database rows rather than an HTTP 2xx:
   - enqueue → lease → request started → provider accepted → delivered;
   - one inbound reply routes to exactly one tenant;
   - one actionable inbound receipt produces one leased action task and exactly
     one domain mutation across duplicate delivery and crash/retry;
   - duplicate and out-of-order callbacks do not regress state or duplicate the inbox;
   - STOP cancels queued work and future sends for the correct sender/account scope;
   - START/UNSTOP restores only that scope;
   - HELP is handled without changing consent;
   - stale owner/crew phone evidence routes to review, and zero or multiple
     current-authority matches never select an account;
   - YES/NO changes nothing unless the exact linked outbound event is
     provider-accepted, tenant/recipient/purpose/sender/provider matched, and
     chronologically before the reply;
   - unknown and ambiguous destinations create review items;
   - a post-request unknown becomes `indeterminate` and is never retried;
   - its exact text reservation/overage usage is reconciled once, and a marker
     response lost before provider egress is safely compensated;
   - Preview and test environments contact no carrier host.

## Production sequence

1. Set `LGQ_DISABLE_OUTBOUND_SMS=1`.
2. Add the complete SignalWire Production block without changing `LGQ_SMS_PROVIDER`:
   `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, a Number Group or From number, and the distinct `SIGNALWIRE_SIGNING_KEY`.
3. Deploy routes and workers dark: delivery and inbound-action worker gates `0`;
   all traffic-lane gates `0`.
4. Point only the registered SignalWire number's inbound/status resource at the production Vercel endpoints.
5. Send a signed callback test. Valid requests must authenticate; altered bodies, URLs, and signatures must return 403 and create no carrier-derived row.
6. Set `LGQ_SMS_PROVIDER=signalwire` and one canary account. Keep the kill switch on.
7. Enable the worker and exactly one approved traffic lane, then remove the kill switch.
8. Send one opted-in canary. Require a SignalWire provider ID and then `delivered` evidence.
9. Reply once. Require exactly one inbound row in the correct tenant.
10. Exercise STOP and START and inspect queue cancellation/restoration.
11. Observe for at least one full automation interval. Check oldest queue age,
    failed, indeterminate, review, signature-failure, and text-usage
    reconciliation-failure counts.
12. Expand the canary list gradually. An empty canary list means every account is eligible; do this last.

## Rollback

1. Immediately set `LGQ_DISABLE_OUTBOUND_SMS=1`.
2. Leave callbacks online so delayed delivery receipts and replies still reconcile.
3. Do not fall back to unregistered Twilio operational messaging.
4. Do not retry indeterminate work. Resolve it against provider logs first.
5. Revert the provider selection only after the prior provider's sender and Campaign are independently ready.
6. Record the incident, affected event IDs, provider IDs, and the exact environment/deployment transition. Never paste API tokens or full message bodies into incident notes.

## Dedicated-number purchasing

`LGQ_SIGNALWIRE_PROVISIONING_ENABLED=1` only permits an already approved admin operation to reach the provider API. It does not approve a contractor, activate messaging, or open a traffic lane. A number is unusable until purchase, Campaign assignment, inbound configuration, and verification all succeed. Any request whose provider outcome is unknown is `indeterminate`; a human reconciles it before another purchase attempt.
