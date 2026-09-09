# Staff & Identity Recovery Drill Runbook

**Goal:** Rehearse identity recovery procedures including sole-identity loss, session containment, staff passkey/TOTP recovery, account suspension/lockout, and bootstrap access via `ADMIN_EMAILS`.

**Evidence:** This document describes recovery procedures, not proof that a provider or native-device drill has passed. Record the project, disposable test user, date, operator, exact provider operations, and observed session/enrollment results for each rehearsal. Never include tokens, authenticator secrets, QR codes, or verification codes in the record.

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
  4. Apply the containment and session checks in Scenario 2. `signOutAllSessionsAction` temporarily bans member users; its name does not establish that all issued tokens or sessions were revoked.
  5. Dispatch new secure magic link to verified email.

### Scenario 2: Session Containment & Workspace Lockout
- **Condition**: Compromised credentials, rogue employee, or urgent security incident.
- **Procedure**:
  1. Open `/admin/accounts/[id]` in internal admin console.
  2. Enter confirmation reason: "SECURITY INCIDENT - IMMEDIATE LOCKOUT".
  3. Execute **Sign Out All Members**:
     - Bans all member user IDs in `auth.users` for 24h via `admin.auth.admin.updateUserById(userId, { ban_duration: '24h' })`.
     - Check every provider result and verify that the affected account cannot refresh or sign in during the ban. A temporary ban is not evidence that all previously issued sessions have been deleted.
  4. Set `suspended_at = now()` on `accounts`:
     - The application checks suspension in its account-context guards. Verify the affected routes deny access using the incident's existing session; do not infer that every endpoint or direct Data API request shares those guards.
  5. Use supported provider session-revocation controls and verify their result before lifting containment. Supabase access JWTs can remain usable until expiry after sign-out. Immediate token rejection requires checking the JWT's `session_id` against an active provider session; this runbook does not claim that check exists on every route. See [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions) and [sign-out behavior](https://supabase.com/docs/guides/auth/signout).

### Scenario 3: Staff Member Passkey / TOTP Loss

**Available controls:** `/admin/staff` currently supports invitations and role/active-state changes. It has no staff MFA-reset action and no "require re-enrollment on next login" control. TOTP is a Supabase MFA factor. Native admin passkeys are managed by this application; they are not Supabase passkey-login credentials or Supabase WebAuthn MFA factors. Provider-admin factor deletion therefore does not revoke an application passkey and does not automatically create an application `admin_actions` entry.

1. If a TOTP backup is available, the staff member verifies their session at `/admin/security` with its code before managing authenticators. TOTP enrollment and verification are required before adding an application passkey, and a verified TOTP backup must remain enrolled. Verify a replacement before removing the only usable authenticator. Removing a lost application passkey must revoke its application grants as well as the credential; removing a provider factor must refresh and recheck the provider session.
2. If all factors are lost, a separately authenticated project owner verifies the requester through an established independent channel. Match the exact Supabase project, immutable Auth user ID, email, and staff record. Record the verification evidence and reason in an access-controlled incident record. A new email, possession of an application session, or a message asking for a reset is insufficient by itself.
3. If compromise is suspected, another MFA-verified super admin deactivates the affected staff row through `/admin/staff` before recovery. This blocks subsequent admin requests through `requireAdmin`; it does not revoke the user's other application sessions. Keep the row inactive while provider session containment/revocation is unresolved.
4. In a trusted server-side administrative environment, the project owner lists the user's provider factors with `admin.auth.admin.mfa.listFactors({ userId })` and removes only the identified lost/compromised provider factors with `admin.auth.admin.mfa.deleteFactor({ userId, id: factorId })`. These are provider Admin API operations, not browser application controls. Use the installed SDK's current contract, check each response, and re-list factors to confirm the result. Revoke lost application passkeys and their grants separately through the application's supported credential-management path. If the user cannot reach that path, keep staff access inactive while the project owner arranges a reviewed application recovery operation; this runbook does not invent an unimplemented staff reset button. Never expose the privileged key to a browser or ask the user to send a session token.
5. Inspect and revoke affected sessions using supported project-owner/provider controls, recording the actual result. Factor deletion alone is not proof of revocation or an immediate assurance downgrade. If effective revocation cannot be established, keep containment in place and resolve that limitation with the provider before restoring access. An access JWT expiring is insufficient if its old refresh token still works.
6. After identity, credential revocation, and session recovery are verified, the authorized super admin restores the prior staff access with a recorded reason. The user signs in freshly, enrolls and verifies TOTP at `/admin/security`, then enrolls and verifies a replacement application passkey. Sensitive actions require provider `aal2` or a valid application passkey grant tied to the current user, active session, and unrevoked credential; application passkey verification does not upgrade Supabase's assurance claim. The application does not force enrollment at ordinary login. Check the browser's account/session and a harmless protected server authorization check before declaring recovery complete.
7. Record factor IDs/types, operator, timestamps, provider outcomes, staff access changes, and the observed backup and server verification results. Link provider audit evidence and the application access-change records in the incident record. Do not state that an MFA reset itself was logged in `admin_actions` unless a real application action generated that entry.

For self-service removal, call `refreshSession()` and recheck assurance; the old token can otherwise retain its level until refresh. See [Supabase MFA removal guidance](https://supabase.com/docs/guides/auth/auth-mfa). Provider-admin reset, passkey verification, and TOTP fallback must be rehearsed with a disposable account before this recovery procedure is marked tested.

### Scenario 4: Bootstrap Access and Sole-Admin Recovery
- **Condition**: An authorized account needs a missing staff row restored, or no working application super-admin session remains.
- **Procedure**:
  1. `ADMIN_EMAILS` environment variable contains comma-separated bootstrap allowlist (e.g. `founder@letsgetquoted.com:super_admin`).
  2. During an authenticated admin request, `resolveStaff()` in `src/lib/auth.ts` uses the allowlist to provision a missing row. The allowlist's configured role is used; an unlabelled entry defaults to `super_admin`.
  3. An existing database row takes precedence. The allowlist cannot reactivate an inactive row, override its role, bypass MFA, or recover a lost authenticator. Do not delete a staff row simply to bypass these restrictions.
  4. If a working super admin remains, use its MFA-verified `/admin/staff` access to restore approved staff access. If none remains, use independently secured project-owner access to verify identity, repair the exact staff record with preserved audit evidence, and complete Scenario 3 for lost factors. If project-owner access is also lost, recover it through Supabase's account/support process; changing the application's allowlist cannot recover the provider account.
  5. Validate restored access, replacement factors, TOTP backup, and sensitive server authorization before ending the incident. Keep project-owner recovery credentials separate from the application's only passkey/password-manager account.
