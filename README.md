# Let’s Get Quoted

Next.js App Router workspace for the contractor quote-to-paid product.

## Scripts

1. Run `npm run dev` to start the local app on port 3010.
2. Run `npm run lint` to validate the web app.
3. Run `npm run build` to verify the production build.

## Key routes

1. `/` marketing and product overview.
2. `/login` passwordless email or SMS sign-in.
3. `/dashboard` protected contractor workspace.
4. `/pay/[id]` homeowner payment flow.

## Google Places setup

Address autocomplete on quote request and job forms uses the Google Maps JavaScript API with Places API (New). In Google Cloud, the browser key must allow both APIs and include every app origin in its HTTP referrer restrictions, such as `http://localhost:3010/*`, any alternate local preview port, and the deployed domains.

Dashboard maps use Advanced Markers and the JavaScript vector map ID in `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. The production ID is the code fallback; set the variable when a preview or another Cloud project needs a different map ID.

## SMS setup

SMS login and application messaging are separate systems:

1. Supabase Auth keeps its Twilio Phone provider. It sends and verifies contractor login codes outside this repository. Changing LGQ's application provider does not change that integration.
2. LGQ producers write `sms_events` and `sms_delivery_tasks` atomically. The one-minute worker leases work, rechecks consent and sender readiness, records the no-return boundary, and only then calls Twilio or SignalWire. A post-request unknown is `indeterminate`, never an automatic retry.
3. Every real send comes from `sms_sender_numbers`. LGQ account traffic, LGQ dispatch traffic, and contractor-branded homeowner traffic are separate purposes with separate exact-`1` release gates. A contractor message requires that contractor's active, assigned, inbound-ready dedicated number.
4. Configure the application provider block from `.env.example`. SignalWire additionally requires `SIGNALWIRE_SIGNING_KEY`, which is the distinct Dashboard Signing Key — never default it to `SIGNALWIRE_API_TOKEN`.
5. Set `LGQ_LEAD_VERIFICATION_SECRET` before removing any application Twilio secret. It signs LGQ lead-verification tokens and is unrelated to Supabase Auth.
6. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin, and point registered provider callbacks to `/api/sms/inbound` and `/api/sms/status`. Callbacks authenticate the exact raw body before parsing, dedupe provider events, and route only through the callback's `To` sender inventory. Unknown or ambiguous destinations enter operator review; there is no "most recent conversation" fallback.
7. Register every US sender for the exact A2P 10DLC traffic it carries. An order marked `Processed` is not readiness; the individual number assignment must be successful.

`/admin/messaging` reports runtime gates, sender/Campaign readiness, queue age and states, latest outbound/inbound evidence, and authenticated callbacks requiring review. `/admin/health` keeps the higher-level provider and scheduled-worker heartbeat.

Payment lifecycle messages use stable business idempotency keys. Provider acceptance creates the outbound inbox mirror; enqueueing alone never claims that a customer was texted.

### Switching providers

Use [the cutover runbook](docs/signalwire-messaging-cutover-runbook.md). Its gates are intentionally stricter than "credentials present": callback bytes and signing key must be captured in staging, the individual Campaign assignment must succeed, one canary must reach `delivered`, one reply must route exactly once, and STOP/START must be proved before expansion. Emergency rollback is `LGQ_DISABLE_OUTBOUND_SMS=1`; it is never fallback to an unregistered sender.
