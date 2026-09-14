# Prelaunch closeout — September 14, 2026

Base revision: `a773f17a8`. Branch: `codex/prelaunch-closeout-20260914`.

## C1: SMS callback preflight

The previous production builder logged a warning and omitted `StatusCallback`
when the configured origin could not be trusted. It still sent and spent credits.
The new regression suite failed 11 of 12 cases against that implementation;
the valid-origin control passed. All carrier calls in the tests were mocked.

Production now throws `SmsCallbackConfigurationError` before credit reservation
and before `beforeRequest` marks a carrier request started. The worker records
`sms_callback_not_configured`, with retry allowed because no request started.
Existing queue retry limits continue to apply. Repair configuration before retrying
an exhausted task through the supported recovery path.

The provider health summary still reports `statusCallbacksEnabled`; tests assert
false for rejected origins and true for a trusted override. The health page now
states that production sending is blocked and directs the operator to correct
the callback configuration. Local request previews retain their prior behavior;
the outbound suppression gates still prevent preview and test delivery.

Regression coverage: absent, HTTP, malformed, unrelated-host, credential-bearing,
path-bearing, query-bearing and fragment-bearing origins; both Twilio and
SignalWire request construction; invalid explicit override despite a valid app
URL; trusted explicit override; no carrier request, request marker or credit hold
on denial; one send and one credit finalization on success; worker retry state.

## Insights export

The checklist's zero-execution finding was stale: the route already had four
tests and the exporter already had a real pdfkit fixture. Added five boundary
checks: owner denial before any read/render for each format, authenticated account
and branding scope despite attacker-supplied account/name query parameters for
each format, and failure propagation when PDF generation throws.

The route now passes 9 tests; the real exporter passes 7, including exact CSV
values and generation of a nonempty `%PDF-` buffer. This is execution and
authorization coverage with mocked owner/data dependencies. It is not a hosted
download, visual PDF-layout review, or a new database RLS acceptance claim.

## Verification

September 14, 2026, 09:25 Eastern: 12 files / 218 tests passed, exit 0:

```text
node node_modules/vitest/vitest.mjs run
  test/sms-callback-preflight.test.ts
  test/sms-provider.test.ts
  test/sms-delivery-worker.test.ts
  test/sms-delivery-worker-coverage.test.ts
  test/sms-delivery-cron.test.ts
  test/sms-durability-followups-migration.test.ts
  test/sms-producer-queue-boundary.test.ts
  test/inbox-reply-text-credits.test.ts
  test/quote-followup-conversation.test.ts
  test/direct-payment-settlement-worker.test.ts
  test/api-export-insights.test.ts
  test/insights-export.test.ts
```

The command above is wrapped for readability; execute it as one line.
Local raw output: `C:/dev/prelaunch-closeout-tests-20260914.log`.

- `npm run typecheck`: PASS, exit 0, including application and test files.
  Raw output: `C:/dev/prelaunch-closeout-typecheck-20260914.log`.
- `npm run build`: PASS, exit 0, with placeholder build-only credentials;
  433/433 static generation steps completed. The final refresh includes the
  revised health-page message in its compiled output. Repository lint warnings
  remain; there were no blocking compile, type, lint or generation errors.
  Raw output: `C:/dev/prelaunch-closeout-build-final-20260914.log`.
- `git diff --check`: PASS.

## Remaining acceptance

C1 implementation is closed; production deployment and real delivery receipts
remain open. No deployment, provider configuration, live message, financial
transaction or account data was changed by this work. The email workstream,
customer carrier approvals, domain observation window and other launch gates
remain separate.
