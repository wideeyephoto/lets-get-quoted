# Platform campaign email policy

Local implementation, September 14, 2026. No hosted migration, deployment, customer email or rollout expansion was performed.

## Recipient scope

New platform campaigns, including custom lists and test sends, use platform unsubscribe tokens in all three locations: HTML footer, plain text and one-click header. The footer describes platform updates and announcements. A workspace account tag may still be attached for event attribution; it does not change the new unsubscribe token's scope.

`platform_email_suppression` stores platform campaign opt-outs and verified delivery blocks separately from tenant preferences. The normalized email is the primary key. Only service-role code can read/write the table or call its two functions; RLS is enabled, RPCs use invoker rights and an empty search path, and public/anonymous/authenticated grants are revoked.

Existing signed `platform` and `test-preview` unsubscribe links now persist in this table. Existing signed workspace UUID links continue to write only that workspace's preferences. There is no automatic promotion or copy of historical tenant opt-outs to platform scope. Contractor lifecycle onboarding messages retain their existing workspace token and ledger policy; this campaign change does not migrate them. The subsequent [platform transactional policy](platform-transactional-email-policy.md) covers platform login, support, founder/staff alerts and public reports.

## Checks before sending

The recipient-status RPC accepts at most 100 exact `(account_id, email)` pairs and returns one bound result per input. Any platform suppression reason blocks a campaign. When an account is supplied, a suppression for that exact workspace/address also blocks the campaign, preserving existing tenant opt-out behavior. An unrelated workspace's records cannot suppress or authorize it. Custom/test recipients have no invented workspace ID.

Audience selection checks every candidate before deduplicating eligible addresses. The sender checks the chosen recipient again immediately before submission, including tests. Failed, missing, mismatched or partial lookup responses stop the affected send; a failed audience lookup stops the batch. Large suppression tables are queried by exact indexed recipient predicates rather than scanned through capped REST lists.

The database read and provider request are not atomic. A suppression committed after the last check can still race a submission. This change adds no retry or durable send identity. Provider acceptance IDs are required before counting success; acceptance is not proof of delivery. The campaign audit wording now reflects acceptance.

## Unsubscribe and callbacks

The public confirmation page recognizes platform scope without querying tenant UUID columns. It reads persisted status, describes the affected email category and does not trust a `done` query parameter alone. GET requests do not write preferences. The signed confirmation action and one-click POST both use the same persistence path; failed writes do not return success. Tampered tokens remain rejected.

Signed Resend callbacks for `platform_campaign` and `platform_campaign_test` route complaints, permanent bounces and provider suppression to platform storage, including custom recipients without account tags. Existing event recording remains the callback evidence. Transient/undetermined bounces remain outside the delivery-block rules. Failed suppression persistence returns an error for provider retry.

Atomic upsert keeps one row per normalized email and only promotes reason precedence: unsubscribe link, one-click unsubscribe, provider suppression, permanent bounce, complaint. Replays and concurrent weaker events cannot replace stronger evidence. This local evidence is not a provider-wide suppression inventory, historical backfill or region reconciliation.

## Release and verification

Apply `migrations/20260914152829_platform_campaign_preferences.sql` before deploying these application paths. The migration is mirrored in `schema.sql`. Without its RPC/table, campaign eligibility and platform unsubscribe persistence fail closed. Preserve the table and handlers when rolling back senders so previously issued unsubscribe links remain usable.

- 16 selected regression files / 236 tests passed, including 20 new platform policy/route cases and three signed callback cases. Coverage includes custom/test/workspace sends, late opt-out and lookup failure, coherent footer/header tokens, legacy token routing, verified confirmation state, tenant isolation and missing provider acceptance.
- 26 PostgreSQL 17 checks passed in a disposable local database, including four platform groups: actual migration/schema agreement and permissions; workspace/platform scope; concurrent reason precedence; and exact-recipient queries over more than 1,200 suppression rows. The local security advisor reported no issues.
- Database checks run in the existing `test:pg17:document-email` CI step. Page markup was checked through server rendering; hosted page/provider receipt remain acceptance work.
- Full application/test typecheck passed. Changed-file lint has zero errors and three pre-existing unused-import warnings in the compliance test.

Hosted gates: verify migration grants/RLS and schema refresh, open a controlled platform confirmation link, exercise signed POST and real callback persistence, and confirm a subsequent controlled campaign/test is blocked. Verify receiver headers and actual delivery separately. Platform campaign durable identities, pacing/capacity, historical reconciliation, other platform sender families and release enrollment remain open.
