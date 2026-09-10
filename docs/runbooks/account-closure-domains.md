# Account closure and contractor domains

The supported admin **Close account** action schedules a 30-day recovery period. It suspends access immediately and records `account_closure_requested`; it must not report completed anonymization during that period. The scheduled closure worker performs disposal after the recovery deadline and any legal hold. The legacy hard-delete helper is not the supported UI flow.

The closure request captures website hostnames/site IDs and email domain/provider IDs in the service-only `account_closure_jobs.domain_cleanup_targets` ledger. It captures these within the request transaction, before email rows can be disposed. New domain enrollment is serialized with the account lock and cannot cross that snapshot. Browser roles cannot read these targets or run cleanup/recovery RPCs.

The hosted disposition preflight found the optional `form_templates` and `job_form_submissions` tables absent. Only a matching missing-table response for those two known optional relations is tolerated; permission, column, transport and unrelated table errors remain failures. SMS delivery attempts are append-only, and their task rows are protected by a RESTRICT foreign key. Both stay in retained delivery evidence rather than being deleted during account closure.

After confirmed local disposal, a leased worker clears only the captured website routes, verification stamps and publication flags, invalidates their caches, and releases their provider bindings. Each request rechecks the job version, current lease, recovery deadline, account/legal hold and ownership. Provider calls are time-bounded; hostname reuse waits through the previous lease. Resend cleanup checks both the saved ID and returned domain. A confirmed provider 404 is idempotent success; errors or mismatches are not.

On failure, targets remain in the ledger, the domain stage becomes `retry`, and the closure stays incomplete. Inspect **Admin → Accounts → Closures**, its Domains stage, next retry, attempts and exact error. Exhausted attempts or `operator_review` require staff review. Do not clear provider IDs, force the domain state to success, or close the job to silence an error. An unfinished job created before this migration lacks a trustworthy snapshot and is explicitly marked for review. A partially provisioned email binding without a provider ID also requires inventory review before release.

Account recovery uses the existing suspension columns, restores only memberships this request deactivated, and preserves earlier or later staff enforcement. It is allowed only within an unprocessed recovery period. A failed recovery RPC does not fall back to direct writes. The authorized owner action uses a service client after checking membership; direct browser execution of the recovery RPC is revoked.

## Release and rollback

Apply these migrations in order before deploying the new application:

1. `20260910133921_account_closure_domain_cleanup.sql`
2. `20260910140253_account_closure_request_contract.sql`
3. `20260910140758_account_closure_actor_type.sql`

The latter two align the pre-existing request/recovery functions with the hosted account schema: `suspended_at`, `suspended_reason`, and text `suspended_by`. There are no `accounts.status` or `accounts.updated_at` columns. Staging discovered this mismatch during a transaction that rolled back completely. The final local harness uses the actual column names and types. Preserve each applied migration rather than rewriting staging history.

Run `npm run test:pg17:closure-domains`, relevant application tests, type checking, lint and the full CI build. The PostgreSQL harness exercises actual request/claim functions, capture, grace and hold guards, concurrent enrollment, retry/completion, browser-role denial, recovery and preservation of existing enforcement. A hosted SQL rollback drill checks the full hosted schema without provider calls or committed fixture data. Neither test is proof of a deployed production provider deletion.

If the application must be rolled back, retain the additive ledger and database completion guard. An old worker cannot resolve the new domain stage. Pause/review unfinished closure processing while restoring a compatible worker; never drop the ledger or weaken the completion condition. The production website fixture must remain intact until the release and a separately authorized closure drill are ready. Never shorten a real account's recovery period to accelerate a test.
