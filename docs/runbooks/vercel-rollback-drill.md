# Vercel Deployment Rollback & Schema Forward-Compatibility Runbook

**Goal:** Rehearse fast deployment rollbacks ($< 2$ minutes) while maintaining forward-only database schema compatibility so older frontend/API code executes cleanly against newer database states.

---

## 1. Principles of Forward-Only Schema Compatibility

In a zero-downtime, continuous deployment architecture with independent database migrations:
1. **Never drop columns immediately**: Deprecated columns must be made nullable or given defaults before being phased out.
2. **New columns must be nullable or have server defaults**: A new database column created in migration $N+1$ must never cause `INSERT` statements in deployment $N$ (the rolled-back version) to fail on `NOT NULL` constraints.
3. **RPCs must support default parameters**: Any modified PostgreSQL function/RPC must accept missing new arguments with sensible default parameters (`arg_name text DEFAULT NULL`).
4. **Views use security invoker & backwards-compatible columns**: Views remain selectable by older queries without renaming or dropping columns unexpectedly.

---

## 2. Instant Deployment Rollback Execution

### Step 1: Identify Last-Known Good Deployment
1. Open Vercel Dashboard -> Deployments.
2. Identify previous production deployment SHA with green test/verification record.
3. Check deployment URL directly to confirm healthy `/api/health` response.

### Step 2: Instant Alias Rollback
```bash
# Via Vercel CLI (or dashboard instant rollback button):
vercel rollback dpl_<previous_good_deployment_id> --yes
```
- Instant rollback reroutes edge DNS/CDN routing in $< 30$ seconds.

### Step 3: Smoke Verification of Rolled-Back Deployment
Run targeted curl smokes against production endpoints:
```bash
curl -I https://letsgetquoted.com/
curl -I https://letsgetquoted.com/pricing
curl -I https://letsgetquoted.com/login
curl -s https://letsgetquoted.com/api/health | jq .
```

### Step 4: Schema Compatibility Validation
Verify that the rolled-back application code continues to execute without database errors by running:
```bash
npx vitest run test/vercel-rollback-schema-compatibility.test.ts
```
