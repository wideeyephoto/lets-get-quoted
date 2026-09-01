# Live integrations and real-world journey audit — 2026-09-01

Scope: production Stripe, SignalWire, Resend, Vercel configuration, and production
database evidence. No live account was created, no identity or bank data was
entered, no card was charged or refunded, and no SMS or email was sent during
this audit.

Production deployment inspected: `73c9e233154097751cca5c6b228ce2a35a46a53e`.
The public health endpoint reported the database, Stripe, SMS gateway, and CDN
operational at 2026-09-01T10:30:13Z.

## Outcome summary

| Journey | Outcome | Evidence / blocker |
| --- | --- | --- |
| Stripe clean-slate onboarding -> quote -> payment -> refund | **Not signed off** | The active homeowner-payment rail is the legacy Accounts v2 Recipient/destination-charge flow, gated by `stripe_transfers`, while the newer Merchant/card-payments onboarding is dark-launched. Stripe-hosted KYC/bank entry and a real card authorization also require an authorized human. Production has no new-rail live payment or app-issued direct-refund ledger evidence. |
| Stripe prices and webhook replay | **Price parity passed; projector defect fixed locally; new connected ingestion misconfigured** | All six production Vercel Price bindings exactly match the repository bindings. An exact production inbox replay returned the same row with `inserted=false` and an unchanged payload digest. One existing subscription update terminalized because the projector compared the checkout-time Terms version with today's Terms version; the local fix preserves and verifies the immutable accepted version. The new connected-payment worker is configured while its webhook flag and secret are absent. |
| SignalWire carrier compliance | **Application/provider preflight passed; physical-carrier sign-off blocked** | Provider verifier: 13 pass, 0 fail, 1 warning for two inactive/pending campaigns. Focused suite: 8 files / 99 tests. All seven production receipt/projector/queue primitives exist. Production has processed STOP and START plus applied delivered receipts, but no HELP receipt and no owned multi-carrier handset matrix. Quiet-hours policy is not centralized across all SMS producers. |
| Resend deliverability and suppression | **Domain/webhook operational; controlled inbox matrix blocked** | Resend domain, DKIM, SPF/MAIL FROM, and webhook are verified/enabled. Production has recent sent/delivered events plus one untagged bounce. The corresponding provider suppression was accepted, but neither event carried an account tag, so a tenant-scoped suppression row could not be created safely. No controlled Gmail/Outlook/Yahoo inbox/header evidence exists. DMARC remains monitoring-only. |

## Stripe details

### Production configuration and ledger

- All six Solo/Growth/Scale monthly and annual Vercel Price values matched the
  expected repository IDs exactly.
- The live billing inbox contains applied subscription and invoice events. One
  subscription update was terminally rejected as
  `provider_object_contract_mismatch`.
- A restricted, read-only Stripe retrieval proved every provider predicate for
  that subscription was valid except the Terms version: the subscription kept
  the version accepted at checkout, while the projector required the current
  site version. Changing site Terms could therefore break every valid older
  subscription.
- The local projector now accepts only the repository's explicit
  `VALID_TERMS_VERSIONS`, preserves the observed version, and still requires an
  exact match with the immutable checkout operation. Unknown versions and
  operation mismatches remain terminal failures.
- Exact production replay was exercised through the inbox function using an
  already-stored canonical receipt. It returned `inserted=false`, returned the
  original row ID, and left the stored digest unchanged.
- Production currently has no `stripe_livemode=true` row in the new direct
  payment ledger and no direct-refund operation. That journey is unproven.

### Rail mismatch that must be decided before the live rehearsal

- Current quote payment links still use the legacy destination-charge path.
- Current onboarding readiness is based on the Accounts v2 `stripe_transfers`
  capability, not classic `charges_enabled`.
- The newer Merchant/card-payments onboarding explicitly does not switch
  homeowner payment links yet.
- Production has the new connected-payment projection worker configured, but
  `LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED` and
  `STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET` are absent. The webhook returns 404
  while the authenticated cron exists, so no new receipts can reach that
  worker.

Do not run the existing local payment-flow script against the present local
environment: it mixes a test Stripe key with production database configuration
and performs service-role inserts/deletes.

### Local remediation verification

- Stripe audit: 28 files / 426 tests passed.
- Projector compatibility change: 5 files / 75 tests plus TypeScript passed.
- Combined final regression run included the projector and passed.

## SignalWire details

### What production evidence proves

- The shared SignalWire lane is live: production has two applied `delivered`
  receipts, with earlier `sent` and `queued` callbacks ignored as stale.
- STOP and START inbound receipts were processed and produced TwiML compliance
  replies. No HELP receipt exists, so HELP is not live-proven.
- All required receipt, reply-audit, delivery-task, attempt, inbound-projector,
  status-projector, and delayed-enqueue database objects are installed.
- The production health endpoint sees configured carrier credentials.

### Defects and gaps

- Quiet-hours delay is durable only for speed-to-lead. Other producers do not
  share one enforcement boundary, and intake confirmation drops rather than
  holds a quiet-hours message.
- The speed-to-lead path previously swallowed a delayed-enqueue failure and
  reported `queuedForQuietHours=true`. It now rejects, so a queued result always
  represents a durable queued event; its endpoint caller already catches the
  failure without losing the lead.
- Provider-native `OptOutType` handling has no durable `provider_handled` audit.
- There is no authorized handset/carrier roster or safe production canary
  workspace. Physical HELP/STOP/START, pre-START suppression, quiet-hours
  handset absence, and DLR verification therefore remain unrun.
- PostgreSQL 17 SMS integration scripts are blocked locally because the pinned
  embedded-Postgres packages are absent.

## Resend details

### Production evidence

- Resend marks `letsgetquoted.com` verified. DKIM is verified, and the
  `send.letsgetquoted.com` MAIL FROM records (SES MX and SPF) are verified.
- The production webhook is enabled and recent sent/delivered, bounced, and
  suppressed deliveries received HTTP 200.
- Fourteen-day database aggregate: 4 sent, 21 delivered, 1 bounced, 0 delayed,
  0 complained; unresolved Resend webhook failures: 0.
- The bounce and provider-suppression event had no `account_id` or `kind` tag.
  Provider-level suppression is active, but inventing a tenant for the local
  suppression table would be unsafe.
- The webhook subscription includes sent, delivered, bounced, and suppressed.
  It does **not** currently include `email.delivery_delayed`, `email.complained`,
  or `email.failed`; add these after deploying the route/migration remediation.

### Local remediation verification

- The route now records official `email.failed` and `email.suppressed` outcomes.
- Tagged provider suppression is mirrored locally. A local suppression failure
  now returns HTTP 500 so Resend retries instead of permanently losing the
  safety action.
- A forward migration expands the status constraint and prevents concurrent or
  out-of-order lifecycle regression at the database boundary.
- Email audit: 11 files / 80 tests, TypeScript, schema ordering, and diff checks
  passed.

### DMARC rollout map

Current record:

```text
v=DMARC1; p=none; rua=mailto:dmarc@letsgetquoted.com; fo=1
```

Do not jump directly to reject. First prove the reporting mailbox is receiving
aggregate reports, inventory every legitimate sender, and complete controlled
Gmail/Outlook/Yahoo header checks showing aligned DKIM or SPF.

1. Keep `p=none` for at least seven clean reporting days.
2. Move to `p=quarantine; pct=10`, review daily, then raise to 25, 50, and 100
   only while legitimate aligned traffic stays clean.
3. Move to `p=reject; pct=10`, then increase to 100 after another clean window.
4. Retain `rua`; set an explicit subdomain policy only after every subdomain
   sender is inventoried.

## Required human-run evidence window

The remaining exercise needs one coordinated, timestamped window with:

1. An unused, controlled signup email and an authorized business representative
   present for Stripe identity/business attestations, MFA/documents, and bank or
   payout details.
2. Explicit approval for the exact live homeowner charge amount and immediate
   refund, plus a real cardholder available for any 3DS challenge.
3. At least two owned, opted-in physical handsets on named carriers and an
   approved production canary workspace.
4. Controlled Gmail, Outlook, and Yahoo inboxes with access to full message
   headers and spam folders.

At the action boundary, record Stripe account/capability state, quote/payment
and refund ledger IDs, webhook row/replay state, per-carrier keyword screenshots
and receipt IDs, DLR transitions, inbox folder/latency, Authentication-Results,
and DMARC alignment. Do not put card, bank, identity, phone, or inbox secrets in
the audit report.

## Security follow-up

The restricted live Stripe audit key appeared in the local tool trace during
this audit. Rotate that restricted key before further live testing; do not reuse
or broaden it.
