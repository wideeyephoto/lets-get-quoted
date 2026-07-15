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

## SMS setup

SMS login and homeowner payment updates use separate integration paths:

1. In Supabase Dashboard, open **Authentication > Providers > Phone**, enable Phone Auth, and configure the Twilio provider credentials. Supabase sends and verifies contractor login codes.
2. In the application environment, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. The application sends homeowner payment messages.
3. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS application URL. This is the origin used in one-tap payment links and Twilio delivery callbacks.
4. In the Twilio Messaging Service, set the incoming message webhook to `https://<app-host>/api/twilio/inbound` using `POST`. STOP and START messages update application consent records.
5. Register the sending number or Messaging Service for the required US A2P 10DLC campaign before production traffic. The payment form requires the contractor to attest that the homeowner agreed to transactional texts.

Payment lifecycle messages are deduplicated per payment and event: requested, paid, failed, and refunded. Provider delivery failures are recorded on the payment and can be retried by the contractor.
