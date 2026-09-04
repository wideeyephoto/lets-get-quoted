# Target Deployment Release Smoke & Parity Protocol

**Document Version:** 1.0.0  
**Target:** Production Vercel Deployment & Release Candidate  
**Requirement Gate:** [`LAUNCH_CHECKLIST.md:17`](../../LAUNCH_CHECKLIST.md#L17), [`:335`](../../LAUNCH_CHECKLIST.md#L335)  
**Operator Required:** Yes (Vercel deployment confirmation & DNS/edge routing checks)

---

## 1. Release Freezing & SHA Parity

Before promoting or smoking any release:
1. Verify the Git working tree is completely clean:
   ```bash
   git status --short
   ```
2. Note the target Release Commit SHA:
   ```bash
   git rev-parse HEAD
   ```
3. Confirm Vercel Production deployment matches this exact commit:
   ```bash
   npx vercel inspect --prod
   ```
   *Verify that Vercel Deployment Git Commit equals `HEAD`.*

---

## 2. Automated Code & Schema Gates

Execute the full suite of release pre-flight gates locally:

```bash
# 1. TypeScript Strict Typecheck
npm run typecheck

# 2. Pre-Launch Test Suite (38 Critical Suites)
npm run test:prelaunch

# 3. Canonical Database Schema FK Order
node scripts/check-schema-order.mjs

# 4. Canonical Database Migration Parity
node scripts/sync-messaging-schema.mjs --check

# 5. Cron Fleet Health & Worker Readiness
node scripts/inspect-cron-health.mjs 1440 --strict
```

**Passing Requirement:** All 5 gates must exit with return code `0`.

---

## 3. Post-Deploy Edge-Routing & Security Smoke

Run the following cURL probes against production:

### Probe 1: Public Health Check
```bash
curl -I -s https://letsgetquoted.com/api/health
```
**Expected:** `HTTP/2 200` with JSON status `ok`.

### Probe 2: CSP Nonce Propagation
```bash
curl -s https://letsgetquoted.com/ | grep -o 'nonce="[^"]*"' | wc -l
```
**Expected:** Count $> 0$ (confirming dynamic nonce injection into HTML script tags).

### Probe 3: Secretless Cron Protection
```bash
curl -I -s https://letsgetquoted.com/api/cron/voice-number-reconciliation
```
**Expected:** `HTTP/2 401 Unauthorized`.

### Probe 4: Unsigned Webhook Protection
```bash
curl -I -s -X POST https://letsgetquoted.com/api/voice/provider-status
```
**Expected:** `HTTP/2 403 Forbidden`.

### Probe 5: Canonical Host & SSL Enforcement
```bash
curl -I -s http://letsgetquoted.com/
```
**Expected:** `HTTP/1.1 301 Moved Permanently` to `https://letsgetquoted.com/`.

---

## 4. Emergency Instant Rollback Drill

If a release introduces a critical money or routing regression, execute instant rollback:

1. Identify previous healthy deployment:
   ```bash
   npx vercel list --prod
   ```
2. Execute instant deployment rollback (traffic switches in $<10$ seconds):
   ```bash
   npx vercel rollback <previous-deployment-id>
   ```
3. Verify site recovery:
   ```bash
   curl -I -s https://letsgetquoted.com/api/health
   ```
4. Post incident report and alert on-call team.
