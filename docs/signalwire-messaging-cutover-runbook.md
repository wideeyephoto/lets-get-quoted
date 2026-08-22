# SignalWire Messaging Cutover Runbook

**Owner:** LGQ Operations<br>
**Last updated:** 2026-08-21<br>
**Default state:** dark; do not activate from this document alone

This is the controlled handoff for LGQ operational messaging. Supabase Auth phone login remains on Twilio. The kill switch is always `LGQ_DISABLE_OUTBOUND_SMS=1`.

## Traffic lanes

| Lane | Sender purpose | Release gate | Allowed traffic |
|---|---|---|---|
| LGQ shared | `lgq_shared` | `LGQ_SMS_SHARED_ENABLED=1` | LGQ-branded account, billing, support, and approved quote-request notifications to opted-in account holders |
| LGQ dispatch | `lgq_dispatch` | `LGQ_SMS_DISPATCH_ENABLED=1` | Crew/subcontractor dispatch only after written carrier confirmation or separate Campaign approval |
| Contractor dedicated | `contractor_dedicated` | `LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED=1` | One vetted contractor's homeowner traffic from that contractor's active assigned number |

No lane inherits another lane's Campaign, number, consent, or release decision.

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
