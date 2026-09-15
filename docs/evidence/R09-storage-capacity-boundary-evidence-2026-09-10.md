# R09 — Storage and Capacity-Reduction Boundary Evidence

**Audit Date:** September 10, 2026  
**Auditor:** Automated Prelaunch Agent  

---

## 1. Hard Cap Enforcement Test Results

All storage-related test suites passed:

| Test Suite | Tests | Result |
|:---|:---|:---|
| `storage-usage.test.ts` | All | ✅ PASS |
| `storage-realtime-tenancy-matrix.test.ts` | All | ✅ PASS |
| `workspace-storage-usage-migration.test.ts` | All | ✅ PASS |
| `client-attachment-capacity.test.ts` | All | ✅ PASS |
| `lead-photo-uploader-audience.test.ts` | All | ✅ PASS |
| `verify-storage-usage-migration.mjs` (PG17) | All | ✅ PASS |
| `verify-purchased-capacity-lifecycle.mjs` (PG17) | All | ✅ PASS |
| `verify-cancelled-returns-to-flex.mjs` (PG17) | All | ✅ PASS |

---

## 2. Concurrent Upload Boundary Test

New test created: `test/concurrent-upload-boundary.test.ts`

| Scenario | Result |
|:---|:---|
| Upload at 1 byte under limit succeeds | ✅ PASS |
| Upload at exact capacity is refused | ✅ PASS |
| Upload over capacity is refused | ✅ PASS |
| 5 concurrent uploads near capacity — at most 1 succeeds | ✅ PASS |
| Existing files remain accessible after downgrade | ✅ PASS |
| New uploads exceeding lower limit refused after downgrade | ✅ PASS |

**6/6 tests passed.**

---

## 3. Storage Cap Architecture Summary

### Enforcement Points (10 call sites)
1. `uploadJobPhoto` — per-photo cap 6 MB
2. `uploadCrewPhoto` — per-photo cap 6 MB
3. `uploadInsuranceProof` — per-file cap 15 MB
4. `uploadSiteImage` / `uploadGeneratedSiteImage` / `importJobPhotoAsSiteImage` — per-file cap 10 MB
5. `createSignedVideoUpload` — client-reported size pre-check, cap 100 MB
6. `uploadToolPhoto` — per-photo cap 6 MB
7. `uploadFollowupFiles` — batch sum pre-check
8. `raiseWarrantyClaimAction` — batch sum pre-check
9. `uploadLeadPhoto` (workspace caller) — enforced
10. `uploadLeadPhoto` (public visitor) — **intentionally bypassed** (fails open to avoid losing contractor leads)

### Fail-Open Safeguards
- `LGQ_STORAGE_CAP_ENFORCED ≠ '1'` → `allowed_not_enforced`
- `limitBytes === null` → `allowed_no_limit` (unprovisioned workspace)
- `bytesUsed === null` → `allowed_unmeasured` (unswept workspace)

### Plan Allowances
| Plan | Storage | Office Seats | Crew Seats |
|:---|:---|:---|:---|
| Flex | 5 GB | 1 | 2 |
| Solo | 10 GB | 1 | 5 |
| Growth | 100 GB | 1 | 10 |
| Scale | 250 GB | 1 | 25 |

---

## 4. Downgrade & Cancellation Preservation

### File Preservation ✅
- Files stored above new limit remain **completely intact and downloadable**
- Only subsequent uploads exceeding lower allowance are refused
- File deletion continues to function normally above cap

### Membership Preservation ✅
- Existing crew members and office users are **NOT removed or deactivated**
- All logins and assignments continue to function
- New invitations fail when `active_count >= limit`

### Cancellation → Flex Revert ✅
- `customer.subscription.deleted` resets workspace to `flex` plan
- Storage allowance drops to 5 GB, but existing files are preserved
- Capacity lifecycle worker reconciles Stripe states hourly
- Grace states (`past_due`, `unpaid`) still count capacity (no immediate revocation)

---

**R09 storage and capacity-reduction boundary verification COMPLETE.**
