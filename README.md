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

SMS login and homeowner payment updates use separate integration paths:

1. In Supabase Dashboard, open **Authentication > Providers > Phone**, enable Phone Auth, and configure the Twilio provider credentials. Supabase sends and verifies contractor login codes. **This is a second, entirely separate Twilio integration that lives outside this repository** — Supabase's phone-provider list has no SignalWire option, so a provider migration scoped by grepping this codebase moves homeowner texting and leaves contractor sign-in on Twilio. Decide that explicitly; it is the step most easily forgotten.
2. In the application environment, set one provider block from `.env.example` — Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`) or SignalWire (`SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, and either `SIGNALWIRE_NUMBER_GROUP_ID` or `SIGNALWIRE_FROM_NUMBER`). The provider is inferred from whichever block is complete; `LGQ_SMS_PROVIDER` is the tiebreaker when both are, which is only the case during a migration.
3. Set `LGQ_LEAD_VERIFICATION_SECRET`. It signs lead phone-verification tokens and is not a provider credential — it only lived on `TWILIO_AUTH_TOKEN` by accident. Set it to that variable's current value the first time, so no in-flight token is invalidated.
4. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS application URL. This is the origin used in one-tap payment links and in delivery callbacks. **If it is not https, no `StatusCallback` is attached to any send** and no delivery result is ever reported back — which makes the "Failed texts" card on `/admin/health` permanently read zero. That card now says so.
5. In the provider console, set the incoming message webhook to `https://<app-host>/api/sms/inbound` using `POST`, and a tracking number's Voice URL to `https://<app-host>/api/sms/voice`. STOP and START messages update application consent records. The old `/api/twilio/*` paths remain live permanently as aliases — a webhook URL only exists in a vendor console, so nothing in the code can prove every number was repointed.
6. Register the sending number or number pool for the required US A2P 10DLC campaign before production traffic. The payment form requires the contractor to attest that the homeowner agreed to transactional texts.

`/admin/health` reports which provider is active, which credentials are present, and — the line that matters during a cutover — which signature headers inbound webhooks will be accepted under. It is read-only by design: the credentials live in the environment, so a database toggle could only ever point at secrets it does not hold. Switching providers is `LGQ_SMS_PROVIDER` plus a deploy, which is an atomic and revertible boundary in a way that a click is not.

Payment lifecycle messages are deduplicated per payment and event: requested, paid, failed, and refunded. Provider delivery failures are recorded on the payment and can be retried by the contractor.

### Switching providers

Ordered so that no inbound text is dropped and no outbound send fails at any point. The migration window in step 3 can stay open as long as you like — inbound is selected by the signature header, not by a mode, so both providers keep working throughout.

1. **Stand the new provider up in parallel.** Create the Space, buy **one** number, and start brand/campaign registration — it is the long pole, it costs money, and US numbers cannot be released for 14 days, so do not churn them. Production is untouched by any of this.
2. **Point the test number's inbound and voice webhooks at `/api/sms/*` and text it from a real phone.** Confirm on `/admin/health` that the signature validated, the message reached the inbox, and STOP flipped consent. **Send a photo too** — whether the new provider's media URLs are fetchable without auth is the one thing that would otherwise surface as every thread image breaking after cutover.
3. **Set the new provider's variables alongside the old ones, with `LGQ_SMS_PROVIDER` pinned explicitly to the incumbent, and deploy.** Outbound does not move. Inbound now accepts both signature headers, each against its own key. Check the health card reads both.
4. **Verify outbound before flipping it.** A throwaway script calling `buildSendRequest()` with the new config, texting your own phone, confirms the URL, the `.json` suffix, the auth header and the response shape. Do not discover any of that by flipping production.
5. **Change `LGQ_SMS_PROVIDER` to the new provider and deploy.** Outbound moves. Messages already in flight keep posting status callbacks signed by the old provider to the old route, and both keep validating — that is what the window in step 3 is for.
6. **Watch `/admin/health` and `webhook_failures` for 48 hours**, longer than any provider's status-callback retry horizon. Then move the remaining numbers one at a time.
7. **Decommission weeks later, deliberately.** Before removing `TWILIO_*`, make sure `LGQ_LEAD_VERIFICATION_SECRET` is set — otherwise phone verification stops running. Update `/sms-terms`, which names the provider as a subprocessor and is read by carriers rather than by customers. Leave Supabase phone auth alone unless you have separately decided what happens to contractor sign-in; it is a different Twilio account that this repository cannot see. And note that photos already in customer threads stay hosted by the old provider — closing that account deletes them.
