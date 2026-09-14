# Guarded deliverability seed runner

Local implementation, September 14, 2026. No live messages, hosted changes or new recipient approval occurred during this work.

## Preview

From the repository root, run `node scripts/run-deliverability-seed-test.mjs --target=reviewer@example.com`. Preview is the default; `--dry-run` is an explicit alias. It renders the real login, quote and invoice HTML plus invoice PDF, without creating a database client, checking credentials or making network requests. The example address is synthetic. Preview output reports `rendered` and null provider IDs, never dispatch or delivery.

The runner bundles the local TypeScript/TSX renderers with the repository's installed esbuild and removes its temporary bundle afterward. It works with plain Node and requires the existing project dependencies. It does not load `.env.local` or any other credential file.

## Controlled live run

Live use requires `--send`, one to five explicit unique recipient addresses, and a matching `--allow=...` list of approved controlled inboxes. The existing `--gmail`, `--outlook`, `--yahoo` and `--icloud` address flags remain accepted, but no default inbox is assumed. Unknown flags, malformed addresses, missing allowlist entries and contradictory send/preview flags fail before sending. The allowlist is an execution guard, not independent proof of recipient ownership or approval.

Supply `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the process environment for the reviewed target environment. The platform preference migration `20260914152829_platform_campaign_preferences.sql` must already be present. The script uses the existing platform transactional policy immediately before each submission. Hard bounces, complaints and provider suppressions stop the run; marketing-only opt-outs do not block these controlled transactional samples. Signed callbacks use the explicit platform scope.

Each HTTP submission rejects redirects and has a ten-second timeout. Sends are sequential, at most three per recipient and fifteen per invocation. The first failure stops all remaining submissions. There is no automatic provider retry or fallback; a rate limit stops the run. This bound is not a provider capacity reservation or verification of actual account quotas.

## Evidence and recovery

JSON output retains a separate row for every recipient/template and keeps acceptance IDs from earlier successful submissions when a later one fails. Outcomes are `rendered`, `accepted`, `rejected`, `uncertain`, `blocked_or_render_failed` and `not_attempted`. HTTP success without an acceptance ID, malformed receipts, network failures, HTTP 408 and server errors remain uncertain. Failed runs exit nonzero. Raw provider bodies and exception text are not copied into the report.

Retain this private output with the controlled test record. Recipient addresses and provider IDs are operational evidence. The report is emitted at the end; process termination can interrupt it. There is no durable intent ledger or deduplication across invocations. Do not rerun an entire partially accepted batch as recovery: reconcile accepted and uncertain messages against provider evidence first. A missing report does not prove nothing was submitted.

The script does not inspect inbox placement, SPF/DKIM/DMARC, replies or PDF layout and labels those results **NOT VERIFIED**. Receiver evidence must include actual received messages and headers, timestamps, provider IDs, placement and reviewer observations. The template links are synthetic and nonfunctional; these samples cannot establish working authentication, document access or payment behavior. No payment is due for the sample invoice.

## Local verification

`npm run test:email-seed` runs the offline runner tests and is included in CI. Tests exercise actual template/PDF rendering, default preview, recipient guards, exact suppression queries with the installed Supabase client, all block reasons, marketing-only preferences, late blocks, callback tags, base64 PDF serialization, missing acceptance, provider failures and retained partial results. Hosted receiver tests remain open.
