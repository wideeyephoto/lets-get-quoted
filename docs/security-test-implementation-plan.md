# Security Test Implementation Plan — Tiers 1–3

**Created:** 2026-09-14
**Basis:** Follow-up to `docs/pentest-2026-09-14.md` (finding F1). Turns the three recommended tiers into concrete, sequenced work.
**Author intent:** every item is a *standing* regression test wired into CI, not a one-off probe. Runtime over static; real roles over mocks; **staging never prod**.

## Where each kind of test runs (use the harness that already exists)

| Substrate | Config / dir | Use for | Guardrail |
|---|---|---|---|
| Live staging DB integration | `vitest.staging.config.ts` → `test-staging/` | REST/RLS/Storage/Realtime with real JWTs | `scripts/lib/dr-target.mjs` refuses prod; creds from gitignored `.env.staging.local` |
| Hermetic embedded Postgres | `vitest.pg17.config.ts` | DB-ACL invariants, RLS policy logic, migration contracts | fully offline |
| Hermetic unit/static | `vitest.config.ts` → `test/` | signature/dedup logic, client-bundle scan, config parity | dummy creds injected; must stay offline |
| Script harnesses | `scripts/*.mjs` (`npm run test:pg17:*`) | pg-backed verifications | pattern already in repo |

New npm scripts to add: `test:security:rest`, `test:security:acl`, `test:security:webhooks`, `test:security:live`, and fold the fast/hermetic ones into `test:security`.

---

## Phase 0 — Foundations (blocks every tier; do first)

- [ ] **0.1 Execution-substrate decision doc** — one short README in `test-staging/security/README.md` stating which suite runs where (table above), how to run locally, and the prod-safety guarantees. *DoD:* a new engineer can run the live suite against staging in <10 min.
- [ ] **0.2 Synthetic two-tenant fixture factory** — `test-staging/security/fixtures/tenants.ts`. Creates **Tenant A** and **Tenant B**, each with:
  - `accounts` row (+ `sites`, `workspace_entitlements`).
  - memberships: **owner**, **restricted office** (only e.g. `jobs.read`), **office with team.manage granted**, **crew** — with matching `office_member_capabilities` rows.
  - per-tenant data: `clients`, `leads`, `jobs`, `invoices`, `payments`, `account_attachments`, `crew`, `services`, plus a live `job_tracking` token and a `client_portal_access` token.
  - Idempotent create keyed by a unique test prefix; returns all IDs. *DoD:* one call yields two fully-populated isolated tenants + teardown handle.
- [ ] **0.3 Real-JWT / session helper** — `test-staging/security/fixtures/auth.ts`. Mint genuine `authenticated` JWTs per `(user, role)` via the Supabase Auth admin API (`auth.admin.createUser` + password sign-in) **or** by signing with `SUPABASE_JWT_SECRET`. Returns: a `supabase-js` client bound to that user's session, plus a raw bearer string. Also expose an **anon** client. *DoD:* `asUser(tenantA.owner)` and `asAnon()` both work against staging PostgREST.
- [ ] **0.4 Raw PostgREST client helper** — `test-staging/security/fixtures/rest.ts`. Thin wrapper over `fetch` for `GET/POST/PATCH/DELETE /rest/v1/<table>` and `POST /rest/v1/rpc/<fn>` with a supplied bearer; returns `{status, body}`. This is the actual attack surface (F1 was reachable only here). *DoD:* can issue an arbitrary REST/RPC call as any role and assert status+body.
- [ ] **0.5 Isolation & teardown** — prefer an **ephemeral Supabase branch per CI run** (`create_branch` → run → `delete_branch`) so tests never mutate the shared staging schema; fallback = unique-prefix rows + guaranteed cleanup in `afterAll`. Wire `assertScratchTarget`/`dr-target` so the suite hard-fails if pointed at prod. *DoD:* a failed run leaves no residue; pointing at prod aborts before any write.
- [ ] **0.6 CI job + secrets** — GitHub Actions job `security-live` with staging creds in secrets, `NODE_ENV`/`VERCEL_ENV` set, artifacts uploaded. Keep it a **separate** workflow from the hermetic suite so `npm test` stays offline. *DoD:* job runs on PRs touching `migrations/**`, `supabase/**`, `src/lib/auth*`, RLS, or RPC files.

---

## Tier 1 — access control (the F1 blind spots)

- [ ] **1.1 Live cross-tenant REST table matrix** — `test-staging/security/rest-tenant-isolation.test.ts`. For every tenant-scoped table, as each of {A-owner, A-restricted-office, A-crew, anon}: attempt to `SELECT / UPDATE / DELETE` **Tenant B's** row by id. *Acceptance:* B's rows are invisible/denied for every A-role and anon; A's own rows behave per role. Drive the table list from `information_schema` so new tables are auto-covered. *Depends:* 0.2–0.5.
- [ ] **1.2 Live RPC access matrix (F1 regression, runtime)** — `test-staging/security/rest-rpc-isolation.test.ts`. Enumerate every `public` function with `has_function_privilege('authenticated', …, 'EXECUTE')`; call each with **Tenant B's** `account_id`/ids as A-roles and anon. *Acceptance:* no cross-tenant read/write/side-effect; specifically `soft_delete_entity_atomic`, `restore_entity_atomic`, `record_tenant_audit_event_atomic` deny/forbid. Assert **no victim-side change** (row count deltas = 0). *Depends:* 0.3–0.5, plus the F1 migration applied to the test DB.
- [ ] **1.3 RLS policy-correctness deep checks** — `test-staging/security/rls-policy-logic.test.ts`:
  - [ ] **USING vs WITH CHECK asymmetry** — as A, try to `UPDATE` your own row *setting `account_id = B`* (row-migration) and `INSERT` a row with `account_id = B`. *Acceptance:* denied (a read-only `USING` with a missing/loose `WITH CHECK` is the classic write-cross-tenant hole).
  - [ ] **Role-scoped reads** — restricted office and crew cannot read owner-only columns/tables (crew_costs, payouts, tax_vault, etc.).
  - [ ] **Deactivated membership** — set `memberships.deactivated_at`; the user's still-valid JWT immediately loses access.
  - [ ] **Suspended account** — set `accounts.suspended_at`; access fails closed (mirrors `is_member`).
- [ ] **1.4 Runtime DB-ACL invariant in CI** — `test/db-acl-runtime-invariant.test.ts` (pg17 or live). Run the sweep and assert **zero rows**:
  ```sql
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and pg_get_function_identity_arguments(p.oid) ilike '%account_id%'
    and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
    and pg_get_functiondef(p.oid) not ilike '%auth.role()%';
  ```
  Also assert: no `rls_disabled_in_public`, no unexpected `security_definer` views, and pipe `mcp/supabase get_advisors(security)` into the same job (fail on new ERROR/WARN). *This is the check that would have caught F1.* *Depends:* 0.5/0.6.
- [ ] **1.5 Server-action / route authorization matrix** — `test/route-authorization-matrix.test.ts`. Table-driven over all 188 API routes + server actions: a **restricted office user without the required capability** and a **crew user** are denied (expect redirect/401/403, never 200 or 500). Include the guard-redirect-propagation regression so denials aren't swallowed into 500s. *Acceptance:* every mutating route asserts an explicit deny for at least the under-privileged office role and crew.

---

## Tier 2 — payments, storage, realtime, entitlements

- [ ] **2.1 Stripe test-mode webhook harness** — `test/stripe-webhook-abuse.test.ts` (+ live variant if needed). For `stripe/billing/webhook`, `stripe/connected-payments/webhook`, `stripe/top-ups/webhook`:
  - [ ] **Signature negatives** — wrong secret, tampered body, missing header → rejected.
  - [ ] **Idempotency** — deliver the same signed event twice → exactly one state change (no double credit/charge).
  - [ ] **Reordering** — refund-before-charge, `customer.subscription.updated` out of order → no invalid state.
  - [ ] **Amount/account substitution** — craft an event whose amount/`account`/`connect_id` differs from your DB record; assert the handler **re-derives from the DB** and does not trust the event payload. *Acceptance:* entitlements/credits/charges are correct and tenant-bound.
- [ ] **2.2 Live storage tenancy** — `test-staging/security/storage-isolation.test.ts`. As A: request `createSignedUrl`/download of **B's** objects; attempt path traversal (`../`, `..%2f`, cross-UUID prefix, absolute) on each bucket (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`). *Acceptance:* every cross-tenant/traversal attempt fails; public buckets expose only intended published assets.
- [ ] **2.3 Live Realtime channel authorization** — `test-staging/security/realtime-isolation.test.ts`. As A and anon, attempt to subscribe to `account:<B>:crew-locations` and any job feed channels; drive GPS/presence broadcast on B and confirm A/anon receive nothing. *Acceptance:* no cross-tenant realtime payloads.
- [ ] **2.4 Entitlement/billing abuse** — `test/entitlement-abuse.test.ts` (pg17 where possible). Attempt to apply add-ons, top-ups, seat entitlements, or overage credits to **another** workspace, or to obtain paid benefits without a settled payment; replay/duplicate the granting event. *Acceptance:* benefits are strictly tenant-bound and payment-gated; grants are idempotent.

---

## Tier 3 — auth lifecycle, leakage, SSRF, AI, SAST

- [ ] **3.1 Auth lifecycle & abuse** — `test-staging/security/auth-lifecycle.test.ts` + `test/auth-abuse.test.ts`:
  - [ ] Removed/deactivated membership vs a still-valid JWT (quantify the exposure window; recommend a per-request membership check if the JWT TTL matters).
  - [ ] Workspace-switch to a workspace the user is not a member of → denied.
  - [ ] Account enumeration on login / signup / password reset / SMS sign-in (uniform responses + timing).
  - [ ] Login + SMS/voice **rate limits / toll-fraud** — confirm `checkRateLimitStrict` fail-closed paths bound abuse.
- [ ] **3.2 Client-bundle secret-leak guard** — `test/no-server-secrets-in-client-bundle.test.ts`. Build, then scan `.next/static/**` client chunks for any non-`NEXT_PUBLIC_` env values and known secret prefixes (`sk_`, `rk_`, `service_role`, `whsec_`, JWT secret). *Acceptance:* zero matches; one-line CI guard.
- [ ] **3.3 SSRF live verification** — `test/ssrf-live.test.ts` using a controlled collaborator/loopback host. Confirm the outbound-webhook `pinned-fetch` and lead-photo proxy actually refuse internal ranges, `169.254.169.254`, IPv4-mapped IPv6, and re-validate on redirect at **runtime** (not just unit mocks). *Acceptance:* every internal/metadata target blocked; deadline enforced across hops.
- [ ] **3.4 AI prompt-injection red-team** — `test/ai-prompt-injection.test.ts`. Feed adversarial caller speech / SMS text / lead-form content to the voice (SWAIG), SMS, and dashboard/field AI tools instructing them to reveal or act on another tenant's data or perform unauthorized job/quote/schedule/payment actions. *Acceptance:* tools stay bound to `ctx.accountId`/signed-token tenant; no cross-tenant data returned; no unauthorized mutation; opt-out/release gates hold.
- [ ] **3.5 SAST / dependency / secret scanning in CI** — add `semgrep` (JS/TS + a PostgREST/RLS ruleset), keep `npm audit --omit=dev` gating, and a secret scanner (gitleaks) on PRs. *Acceptance:* CI fails on new high-severity findings.

---

## Cross-cutting

- [ ] **X.1 npm scripts + CI wiring** — add `test:security:acl` (1.4), `test:security:rest` (1.1–1.3), `test:security:webhooks` (2.1), `test:security:live` (staging suites), and fold hermetic ones into `test:security`. Gate the live/ACL jobs on PRs touching auth/RLS/RPC/migrations.
- [ ] **X.2 Living coverage matrix** — keep the role/resource matrix in `docs/pentest-2026-09-14.md` updated as each suite lands (flip ⬜→✅/❌). Single source of truth for "what's actually verified."
- [ ] **X.3 Fail-closed reporting** — every suite prints a PASS/FAIL/SKIP summary + artifacts; a skipped check (missing creds, no staging branch) reports **SKIP loudly**, never silent PASS.

## Sequencing & definition of done

1. **Phase 0** (foundations) → 2. **1.4 + 1.1/1.2** (the F1-class net) wired to CI → 3. **1.3 + 1.5** → 4. **Tier 2** → 5. **Tier 3**.

**Per-task DoD:** has a positive case (legitimate access still works) *and* a negative case (the attack is denied); runs in CI; provably cannot touch production; updates X.2.

**Standing rule:** a green suite is not proof — the runtime ACL/RLS/REST checks (1.1–1.4) are the ones that establish *deployed* protection. Everything static is a supplement, not a substitute.
