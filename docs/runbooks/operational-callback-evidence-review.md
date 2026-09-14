# Read-only callback evidence review

This report inspects retained evidence without running reconciliation, deleting records or sending messages. It requires the existing operational delivery, platform suppression and `20260914164359_operational_callback_evidence.sql` migrations. No hosted review was run during implementation.

## Run in a reviewed environment

From the repository root, use `node scripts/inspect-operational-callback-evidence.mjs --project-host=<exact Supabase hostname>`. Supply `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through the process environment. The host argument must match the configured HTTPS endpoint; the script does not load `.env` files or require a sending credential.

The request guard permits GET requests only to `operational_callback_evidence`, `operational_alert_deliveries` and `platform_email_suppression` at that origin. It rejects other tables, RPCs, writes, provider requests and redirects. Each HTTP request has a ten-second timeout.

Evidence is read in ordered provider-ID pages of at most 100, continuing until an explicit empty page. Short pages do not imply completion. The CLI's 500-record budget bounds the review; missing data, failed reads, malformed/repeated rows and exhausted budgets produce a nonzero exit with no report marked complete. The reusable inspection function supports reviewed budgets up to 2,000 records; raising the CLI budget is deliberately not a routine flag.

## Interpret the report

| Status | Meaning and next step |
| --- | --- |
| `unmatched_provider` | No operational delivery currently holds that provider ID. Check early acceptance bookkeeping, emergency notifications and environment routing. Do not match by address or resend as a remedy. |
| `recipient_binding_mismatch` | A delivery exists, but its saved recipient shape, extra recipients or tenant tags do not establish platform scope. Inspect the original record and routing privately. |
| `block_missing` | The provider/recipient binding matches but there is no current platform block. Check migration/trigger execution and retained evidence; this report does not repair it. |
| `block_weaker` | The current platform reason is weaker than retained negative evidence. Review reconciliation and concurrent changes before any corrective write. |
| `block_present` | A platform block of equal or greater precedence exists at observation time. This does not prove receiver delivery, provider-wide coverage or how the block was created. |

Output includes provider, event and delivery references, failure reason and timestamps. It omits recipient addresses, saved tags, message bodies, links and credentials. To avoid fetching message content, the delivery lookup selects only specific recipient/tag JSON fields, not the whole payload. Keep reference reports within authorized operational records.

The reads occur across multiple queries and are not an atomic snapshot. Records can change during the review, including new lower-sorting IDs that a running cursor does not revisit. `complete` means the bounded traversal reached its end; it is not proof of a stable historical total or a healthy sending system. The report makes no retention decision and does not certify unknown evidence as safe to delete.

## Local verification

16 offline tests passed using the installed Supabase client and controlled HTTP responses. They cover all five statuses, empty data, lower API caps, explicit empty-page completion, budget/duplicate rejection, unavailable reads, malformed evidence, tenant/extra-recipient conflicts, output privacy, network restrictions and environment matching. Changed-script lint and sender-registry checks passed. CI runs `npm run test:callback-evidence-review`.
