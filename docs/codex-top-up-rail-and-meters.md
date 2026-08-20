Vercel project `lets-get-quoted`, plus one Stripe write on live account `acct_1TuCWJGqh5LFKuTC`.

`LGQ_TOP_UP_PURCHASE_ENABLED` must stay absent. Nothing in this brief makes a top-up buyable. If you find yourself near that variable, stop -- it is out of scope and gated on evidence that does not exist yet.

TASK 1 -- Start the three usage meters measuring.

Add to the project, all Production only, Sensitive OFF (boolean flags, not credentials):

    LGQ_TEXT_CREDIT_METER_ENABLED=1
    LGQ_MARKETING_EMAIL_METER_ENABLED=1
    LGQ_AI_WRITING_METER_ENABLED=1

All three are expected to be absent -- this is an ADD, not an edit. If any already exists, do not change it; report its state and continue with the others.

Do NOT add any `*_GATE_ENABLED` variable. In this codebase METER means "write to the ledger" and GATE means "may refuse", and a gate flag reads both. Adding one here would turn counting into blocking. Counting is the whole intent.

TASK 2 -- Create the live top-up webhook endpoint.

It does not exist yet; only the billing endpoint does. Create it on the platform account:

    URL: https://letsgetquoted.com/api/stripe/top-ups/webhook
    Scope: account-scoped on the platform account, NOT Connect-scoped

Enabled events -- exactly these four, no others:

    checkout.session.completed
    checkout.session.expired
    checkout.session.async_payment_succeeded
    checkout.session.async_payment_failed

Do NOT add these four to the existing billing endpoint we_1U5cdfGqh5LFKuTCGsj1e2Pz. That scope admits only customer.subscription.* and invoice.*, so every delivery would fail classification and retry forever.

Expect base-plan signups to land on this endpoint too -- they emit checkout.session.completed on the same account. The projector terminates those as top_up_not_a_purchase. That is correct behaviour, not a misconfiguration.

TASK 3 -- Store the signing secret.

Take the new endpoint's signing secret and add it as:

    STRIPE_TOP_UP_WEBHOOK_SECRET     Production only     Sensitive ON

Sensitive ON here is deliberate and the opposite of Tasks 1 and 4: a signing secret is a real credential, while the boolean flags are not, which is why those stay readable. This secret must differ from STRIPE_WEBHOOK_SECRET and STRIPE_BILLING_WEBHOOK_SECRET. A shared secret means an event meant for one scope verifies against another, and scope is what decides what an event is allowed to do.

TASK 4 -- Enable receipt and projection.

Production only, Sensitive OFF:

    LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1
    LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED=1

TASK 5 -- Redeploy Production.

Vercel bakes environment variables at build time, so none of the above does anything until a new build runs. Redeploy the current Production deployment on commit 0faa67b5080c2a237558567a14b8b4b6d8be88e6. Wait for Ready.

REPORT BACK, VERBATIM:

1. Which of the five flags were added vs already present, with environments and Sensitive state for each.
2. The new endpoint's id, status, api_version, and its enabled events listed one per line -- not a count.
3. Confirmation that the billing endpoint we_1U5cdfGqh5LFKuTCGsj1e2Pz still has its original eighteen events and was not modified.
4. Confirmation that STRIPE_TOP_UP_WEBHOOK_SECRET was stored Sensitive and differs from the other two webhook secrets.
5. The new deployment's id, commit SHA, status and build duration.
6. Anything refused or unavailable, with exact error text. A permission denial is a finding, not a failure.
