# Secret Rotation Drill & Zero-Downtime Key Rollover Runbook

**Goal:** Establish operational procedures, zero-downtime key rotation protocols, and emergency revocation workflows across all production API keys, signing secrets, database credentials, and AES-256 vault encryption keys.

---

## 1. Production Secret Inventory & Classification

| Secret Name | Service / Scope | Rotation Mechanism | Downtime / Overlap Impact |
| :--- | :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | Stripe Connect & Platform Billing | Generate new restricted key in Stripe Dashboard $\to$ update Vercel Production $\to$ redeploy $\to$ revoke old key | Zero downtime (Stripe permits multiple active API keys simultaneously) |
| `STRIPE_WEBHOOK_SECRET` | Connect Webhook Ingress | Add new signing secret in Stripe Workbench $\to$ update Vercel $\to$ verify delivery $\to$ revoke old secret | Zero downtime (dual-secret acceptance window) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Billing Webhook Ingress | Add new signing secret $\to$ update Vercel $\to$ verify $\to$ delete old secret | Zero downtime |
| `RESEND_API_KEY` | Transactional Email Dispatch | Create new Resend API key $\to$ update Vercel $\to$ test dispatch $\to$ delete old key | Zero downtime |
| `SIGNALWIRE_API_TOKEN` | 10DLC SMS & Voice Dispatch | Create new API token in SignalWire Space $\to$ update Vercel $\to$ test SMS $\to$ delete old token | Zero downtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Database Admin & RLS Bypass | Generate new JWT secret in Supabase Project Settings $\to$ update Vercel & scripts $\to$ redeploy | <1 min graceful drain |
| `CRON_SECRET` | Vercel Cron & Diagnostics | Generate 64-char hex token $\to$ update Vercel Production $\to$ verify /api/cron/* | Zero downtime |
| `TAX_VAULT_ENCRYPTION_KEY` | AES-256-GCM TIN Vault | Key rollover migration: decrypt with Old Key $\to$ re-encrypt with New Key in transaction | Zero downtime with dual-key migration script |
| `WEBHOOK_VAULT_ENCRYPTION_KEY` | AES-256-GCM Webhook Secrets | Key rollover migration: decrypt with Old Key $\to$ re-encrypt with New Key in transaction | Zero downtime |
| `CLOSURE_ENCRYPTION_SECRET` | Account Deletion Sagas | Key rollover: re-encrypt pending closure handles | Zero downtime |

---

## 2. Step-by-Step Rotation Procedures

### Procedure A: Stripe Platform & Webhook Secrets
1. In Stripe Dashboard $\to$ **Developers** $\to$ **API Keys**:
   - Create a new Restricted Key with exact permissions required (Charges write, Customers write, Subscriptions write, PaymentIntents write).
2. In Vercel Console $\to$ **Project Settings** $\to$ **Environment Variables**:
   - Update `STRIPE_SECRET_KEY` for Production.
3. In Stripe Dashboard $\to$ **Webhooks**:
   - Reveal signing secret for `https://letsgetquoted.com/api/stripe/webhook` and `.../api/stripe/billing/webhook`.
   - If rolling secrets, Stripe allows rolling window where both old and new signatures are valid.
   - Update `STRIPE_WEBHOOK_SECRET` and `STRIPE_BILLING_WEBHOOK_SECRET` in Vercel.
4. Trigger production redeploy (`vercel --prod`).
5. Send a test webhook from Stripe Workbench and verify HTTP 200 response.
6. Delete the old Stripe restricted key and old webhook secret.

### Procedure B: Telephony & Email API Keys (SignalWire / Resend)
1. **SignalWire**:
   - In SignalWire Space $\to$ **API**: Generate a new API Token with full permissions.
   - Update `SIGNALWIRE_API_TOKEN` in Vercel Production.
   - Redeploy and send an automated appointment reminder test.
   - Revoke the old SignalWire token.
2. **Resend**:
   - In Resend Console $\to$ **API Keys**: Create new key `lgq-prod-rotated-<date>`.
   - Update `RESEND_API_KEY` in Vercel Production.
   - Redeploy and trigger a magic link / estimate email.
   - Verify email delivery and revoke old key in Resend.

### Procedure C: AES-256 Encryption Key Rollover (Tax & Webhook Vaults)
1. Generate a new cryptographically secure 256-bit key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Run the dual-key database re-encryption script:
   ```bash
   OLD_KEY="<old_hex_key>" NEW_KEY="<new_hex_key>" node scripts/migrate-vault-encryption-keys.mjs
   ```
3. Update `TAX_VAULT_ENCRYPTION_KEY` and `WEBHOOK_VAULT_ENCRYPTION_KEY` in Vercel Production.
4. Trigger production redeploy.
5. Verify decryption and creation of a new encrypted tax ID / webhook subscription via automated test suite.

---

## 3. Emergency Credential Compromise Playbook

If any credential appears in a public trace, commit, or unauthorized system:
1. **Immediate Revocation**: Go directly to the provider console and delete/revoke the compromised key immediately.
2. **Emergency Rollout**: Generate replacement credentials and push to Vercel via CLI:
   ```bash
   vercel env add <KEY_NAME> production
   vercel --prod
   ```
3. **Audit Log Inspection**:
   - Stripe: Inspect `Events` and `Logs` for unauthorized charges, transfers, or webhook modifications.
   - Supabase: Check PostgreSQL access logs and connection pools for suspicious queries.
   - SignalWire: Review call logs and outbound SMS volume for toll-fraud attempts.
4. **Post-Mortem**: Document incident timestamp, blast radius, revoked key fingerprint, and verify no customer data was compromised.
