# Runbook: Supabase Auth SMS Rate Limits & Spend Caps Inspection (Line 362 / G8)

**Audit Origin:** Item B4 in the 2026-08-31 sweep (`docs/unrun-prelaunch-audits-2026-08-31.md:321`); Item G8 in `docs/prelaunch-gap-closure-plan-2026-09-11.md:357`; Line 362 in `LAUNCH_CHECKLIST.md`.

---

## 1. Background & Threat Model

Auth SMS (phone OTP for owner and crew logins via `supabase.auth.signInWithOtp`) runs through Supabase's managed GoTrue authentication service. 

**Threat:** SMS toll fraud (SMS pumping). Attackers trigger automated OTP requests to premium-rate international or high-cost numbers. If rate limits or spend caps are unconfigured, this bills directly to the project's upstream telephony account with unbounded financial liability.

---

## 2. Operator Inspection Protocol (15 Minutes)

### Step 1: Inspect Supabase Auth Rate Limits
1. Log into the **Supabase Dashboard**: `https://supabase.com/dashboard/project/<PROJECT_ID>`.
2. Navigate to **Authentication** → **Rate Limits**.
3. Verify and record the following active values:
   - **SMS / Phone Provider Rate Limit (per phone number)**: (Recommended: ≤ 5 SMS / hour / number)
   - **SMS / Phone Provider Rate Limit (per IP address)**: (Recommended: ≤ 30 SMS / hour / IP)
   - **Anonymous Sign-in Rate Limit**: (Ensure verification endpoints fail closed on bursts)

### Step 2: Inspect Provider Spend Caps (Twilio / MessageBird / Upstream Gateway)
1. Navigate to **Authentication** → **Providers** → **Phone**.
2. Identify the active telephony provider configured for Auth OTP (e.g., Twilio / MessageBird).
3. Log into the provider's management console:
   - Verify that **Geographic Permissions** are restricted strictly to **United States (+1)** and **Canada (+1)**. All high-risk international prefixes (e.g. +234, +880, +252, etc.) must be disabled.
   - Verify that an active **Monthly Balance Trigger / Hard Spend Cap** (or Auto-Recharge Ceiling) is active (Recommended: \$50–\$100 alert ceiling).

---

## 3. Recording Evidence & Closing Line 362

1. Record the observed values in `docs/vendor-account-register.md` under **Supabase Auth Phone Rail**:
   ```markdown
   ### Supabase Auth Phone Provider (OTP)
   - Date Inspected: YYYY-MM-DD
   - Operator: <Operator Name/Email>
   - Max SMS / hour / phone: <Value>
   - Max SMS / hour / IP: <Value>
   - Geo-Permissions: US / Canada Only (Verified)
   - Hard Spend Cap / Monthly Limit: <Value>
   ```
2. Check off Line 362 in `LAUNCH_CHECKLIST.md`:
   ```markdown
   - [x] **Supabase Auth SMS rate limits and spend caps (Verified YYYY-MM-DD):** recorded console values in vendor register. Geo-permissions restricted to US/Canada with per-IP rate limiting active.
   ```
