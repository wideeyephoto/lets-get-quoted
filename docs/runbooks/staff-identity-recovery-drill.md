# Staff & Identity Recovery Drill Runbook

**Goal:** Rehearse identity recovery procedures including sole-identity loss, session revocation, staff TOTP MFA recovery, account suspension/lockout, and break-glass bootstrap access via `ADMIN_EMAILS`.

---

## 1. Threat & Recovery Scenarios

### Scenario 1: Sole Account Owner Identity Loss
- **Condition**: Contractor loses access to primary email / phone or phone number was ported/compromised.
- **Procedure**:
  1. Founder/Staff verifies identity out-of-band (e.g. government ID, business registration documents, prior invoice/Stripe bank payout verification).
  2. Staff with `account.support` / `account.enforce` permission opens `/admin/accounts/[id]`.
  3. Update owner email / phone via admin mutation:
     ```sql
     -- Database level update (via service role / admin console):
     UPDATE auth.users SET email = 'new-owner@example.com', email_confirmed_at = now() WHERE id = '<owner_user_id>';
     UPDATE public.memberships SET ... WHERE user_id = '<owner_user_id>' AND account_id = '<account_id>';
     ```
  4. Trigger `signOutAllSessionsAction` to revoke all active tokens/sessions across devices.
  5. Dispatch new secure magic link to verified email.

### Scenario 2: Active Session Revocation & Immediate Workspace Lockout
- **Condition**: Compromised credentials, rogue employee, or urgent security incident.
- **Procedure**:
  1. Open `/admin/accounts/[id]` in internal admin console.
  2. Enter confirmation reason: "SECURITY INCIDENT - IMMEDIATE LOCKOUT".
  3. Execute **Sign Out All Members**:
     - Bans all member user IDs in `auth.users` for 24h via `admin.auth.admin.updateUserById(userId, { ban_duration: '24h' })`.
     - Blocks immediate token refresh.
  4. Set `suspended_at = now()` on `accounts`:
     - Evaluated on every single HTTP request by `requireOwnerContext` / `requireMemberContext` (`a.suspended_at is null`).
     - Halts all authenticated app access instantly on the very next request.

### Scenario 3: Staff Member TOTP / MFA Loss
- **Condition**: Staff member loses hardware authenticator / phone.
- **Procedure**:
  1. Super Admin navigates to `/admin/staff`.
  2. Select compromised staff member.
  3. Disable TOTP / require MFA re-enrollment on next login (`requireMfaPermission`).
  4. Audit action is durably logged in `admin_actions`.

### Scenario 4: Break-Glass Bootstrap Procedure
- **Condition**: All database staff rows corrupted or locked out during catastrophic recovery.
- **Procedure**:
  1. `ADMIN_EMAILS` environment variable contains comma-separated bootstrap allowlist (e.g. `founder@letsgetquoted.com:super_admin`).
  2. `resolveStaff()` in `src/lib/auth.ts` inspects `ADMIN_EMAILS` on startup.
  3. If no staff row exists in database, `resolveStaff` auto-provisions a `super_admin` record for allowlisted emails on first login.
  4. Founder accesses `/admin/staff` and re-provisions team roles.
