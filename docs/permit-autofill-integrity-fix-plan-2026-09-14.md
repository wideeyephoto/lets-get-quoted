# Permit Auto-Fill Integrity — Fix Plan

**Date:** 2026-09-14
**Trigger:** Job `7d5ad6ea-98c3-45d3-82af-eceb3f776902` (BrokePipes — $350 sewer hydro-jetting, Royal Oak MI) rendered a **roof replacement permit application** carrying a fabricated builder license, two fabricated insurance policies, a fabricated FEIN, and a parcel ID belonging to no property.

---

## 1. Problem statement

`compilePermitApplication()` presents every field as fact on a document that ends with a signature block and the attestation *"All statements made in this application are true to the best of my knowledge."* In reality a large share of those fields are **hardcoded literals** that appear whenever real data is absent — and several appear *unconditionally*, with no data path at all.

Two distinct defects, different severity:

| | Defect | Severity |
|---|---|---|
| **A** | Fabricated legally-attestable identifiers (license, insurance, FEIN, parcel) | **Critical** — contractor signs and submits false credentials to a municipality |
| **B** | Trade routing ignored — every job renders as roofing | **High** — document is nonsense for 4 of 5 supported trades |

Mitigating factor: nothing auto-transmits today. `resolvePermitHistoryProvider()` falls back to `ManualLinkPermitProvider` and no provider in `src/lib/permit-intel/providers/` makes an outbound call. The document is printed/downloaded and hand-carried by the contractor. That bounds the blast radius but does not reduce the legal exposure of the contractor who signs it.

---

## 2. Verified defect inventory

Rendered end-to-end against production data for the job above.

### 2.1 Defect A — fabricated identifiers

Account has **zero rows** in `contractor_credentials`; `sites.license` is `null`. Every credential falls through to a literal.

| Field | Printed | Location | Has data path? |
|---|---|---|---|
| State builder license # | `2101234567` | `application-generator.ts:117` | vault -> `sites.license` -> **literal** |
| License expiration | `2027-05-31` | `:119` | vault -> **literal** |
| License type | `State of Michigan Residential Builder (2101)` | `:158` | **none — always literal** |
| Qualifying contact | `Master Builder / Qualifying Licensee` | `:120` | vault -> **literal** |
| Liability carrier / policy | `Cincinnati Insurance Company` / `CPP-9402194` | `:124-126` | vault -> **literal** |
| Workers' comp carrier / policy | `Accident Fund Insurance Co of America` / `WC-094124-MI` | `:128-129` | vault -> **literal** |
| MESC employer # | `00-1234567` | `:161` | **none — always literal** |
| FEIN | `38-9876543` | `:162` | **none — always literal** |
| Parcel ID | `25-15-200-014` | `:175` | **none — always literal** |
| Contractor email | `permits@contractor.com` | `:164` | **none — always literal** |
| Authority phone | `248-246-3210` | `:148` | **none — Royal Oak's number on every US jurisdiction** |

Two of these name **real insurance companies** against invented policy numbers. The bottom five have no storage backing them anywhere — confirmed: no `parcel`, `fein`, `mesc`, or `tax_id` column exists in any table in the production schema.

Dead guard: `${data.property.parcelNumber || 'Pending verification'}` at `:246` can never reach its fallback because `:175` always assigns.

### 2.2 Defect B — trade routing discarded

`classifyWorkScope()` **correctly** returns `{ trade: 'plumbing', discipline: 'plumbing' }`, and `resolveJurisdiction()` **correctly** returns `City of Royal Oak Plumbing Inspection`. Then `:180-198` throws the classification away and hardcodes roofing:

- Title -> `4763 Morse Ave Roof Replacement`
- Trade -> `Building / Roofing (22 Squares)` — 22 is an invented default
- `Tear off 1 layer down to approved wood deck`
- GAF Timberline HDZ shingles - ASTM D226 underlayment - ice barrier - drip edge - ridge vent - step flashing
- Department forced to `Building Inspection Division`, overriding the plumbing agency
- Header: `Application for Residential Building / Roofing Permit`
- `occupancyType` / `constructionType` hardcoded

### 2.3 Sibling surfaces carrying the same pattern

| File | Issue |
|---|---|
| `coi-generator.ts:110-131` | **Fabricates a Certificate of Insurance** — `Travelers Property Casualty`, `Accident Fund`, `GL-8849201`, `WC-9940122`. A COI is a proof-of-coverage instrument; forging one is worse than the permit form. |
| `ai-autofill.ts:222-338` | Parallel literal set — `25-14-302-019`, `Oak Ridge Estates Lot 42`, `MI-BLD-2101234567`, `TRV-8849201`, `ME-778291`, `MP-662910`, `owner@example.com` |
| `PermitSubmissionModal.tsx:25-26` | Form **pre-fills** `licenseNumber` state with `'2101234567'` and contact with `'Master Licensee / Officer'`, then POSTs them to `/permits/submit` as `qualifyingLicenseNumber` — the fake number becomes the attested value of record |
| `permit-pdf-generator.ts:133,136` | Own roofing defaults (`\|\| 28` squares, `\|\| 'Architectural Asphalt Shingles'`). Shares `compilePermitApplication`, so it inherits everything above. |

---

## 3. Design principle

> **Never synthesize a value a human will attest to.** An empty ruled line is a correct document. A plausible invented number is a forged one.

Classify every field into one of three tiers and give each tier one rendering rule:

| Tier | Contents | Rule when data is missing |
|---|---|---|
| **A — Attested facts** | license #/type/expiry, insurance carriers & policies, WC, FEIN, MESC, parcel ID, owner identity | **Never defaulted.** Render a blank ruled line. Mark the doc DRAFT. Block save/print/submit. |
| **B — Jurisdiction facts** | authority name, agency, department, contact phone, code citations, fee schedule | Resolve from registry. If unverified, print `Verify with jurisdiction` — never another city's value. |
| **C — Proposed scope** | materials, methods, spec table rows, valuation | May be suggested, but must be **trade-correct** and visibly labeled contractor-editable. |

This mirrors the safety boundary the requirement engine already documents ("If an authority or work type is unverified or ambiguous, the engine MUST return 'verify' and NEVER 'not_required'"). The application generator simply never adopted it.

---

## 4. Workstreams

### Phase 0 — Stop the bleeding (ship first, independently)

**P0.1 — Delete every Tier-A literal.** `application-generator.ts:115-176`. Change the shape so absence is representable rather than papered over:

```ts
type AttestedField<T = string> =
  | { status: 'provided'; value: T; sourceId: string }   // sourceId = credential row id, for audit
  | { status: 'missing'; label: string };
```

`compilePermitApplication` returns `applicant.licenseNumber` etc. as `AttestedField`. No `|| '...'` chains on Tier A. Add a derived `readiness: { complete: boolean; missing: string[] }`.

**P0.2 — Render blanks, not inventions.** `generatePermitApplicationHtml`. `missing` -> `<span class="blank-line"></span>` (a ruled underline sized for handwriting) plus a compact **"Missing — complete in Credentials Vault"** chip in the on-screen preview only (suppressed by `@media print`, so the printed form is a clean blank line).

**P0.3 — DRAFT watermark.** When `readiness.complete === false`, overlay a diagonal `DRAFT — NOT FOR SUBMISSION` watermark via CSS, present in both screen and print output.

**P0.4 — Gate the exits.** `PermitApplicationModal.tsx` — disable *Save to Job Documents*, *Download PDF*, and *Print* while `readiness.complete === false`; replace the footer with a "{n} required fields missing" banner and a button that opens `CredentialsVaultModal` directly. Mirror on the server: `POST /permits/application` and `GET /permits/pdf` return **409** with the missing-field list rather than emitting an incomplete artifact.

**P0.5 — Un-prefill the submission modal.** `PermitSubmissionModal.tsx:25-26` — initialise `contactName` and `licenseNumber` to `''`, load real values from the vault, and make both `required`. Server side, `/permits/submit` must reject a `qualifyingLicenseNumber` that is absent or does not match a vault credential for the account.

**P0.6 — De-fabricate the COI.** `coi-generator.ts:105-142` — remove the carrier/policy/limit fallbacks entirely and **refuse to generate** when coverage data is absent. A COI with blanks is still misleading, so this one is throw-not-blank.

*Exit criteria:* no permit artifact can be produced containing a credential the account did not enter.

---

### Phase 1 — Trade-aware scope rendering

**P1.1 — Route on the discipline that's already computed.** Replace the hardcoded `workScope` block (`:180-198`) with a per-discipline builder:

```
src/lib/permit-intel/scope-profiles/
  index.ts        // buildScopeProfile(work, jurisdiction) -> ScopeProfile
  roofing.ts      // current content, moved verbatim
  plumbing.ts
  electrical.ts
  mechanical.ts
  building.ts     // generic fallback — no trade-specific spec rows
```

`ScopeProfile` carries `{ tradeLabel, projectTitle, specRows: Array<{label, value}>, citations }`. The spec table in the HTML becomes a loop over `specRows` instead of a fixed roofing grid. Unknown or ambiguous trade -> `building.ts` generic profile with an empty spec table and a `Verify scope with jurisdiction` note. **No trade-specific row is ever emitted for a trade we did not positively classify.**

**P1.2 — Feed profiles from the existing verified catalogs.** The citations already exist and are dated/verified: `MICHIGAN_PLUMBING_CODE_2021_CITATIONS` (incl. `P3005.2 Building Sewer Drainage Cleanouts` — directly on point for this job), `MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS`, `MICHIGAN_MECHANICAL_CODE_2021_CITATIONS`. No new code research needed for MI.

**P1.3 — Drop the invented quantities.** `roofSquares: work.roofSquares || 22` and `layersToTearOff: 1` become optional and omitted unless parsed from scope text. Same for `permit-pdf-generator.ts:133` (`|| 28`) and `:136`. Note `classifyWorkScope` *itself* defaults `roofSquares` to 22 — fix at the source so the field is `undefined` when unstated.

**P1.4 — Fix the header and department.** Title line derives from `ScopeProfile.tradeLabel` (`Application for Residential Plumbing Permit`). `authority.department` comes from `jurisdiction.agencyName`, not the hardcoded `'Building Inspection Division'`.

**P1.5 — Valuation.** Keep `quoted_amount` as the source but coerce defensively — `Number(job.quoted_amount)`, matching `computeMargin` at `jobs.ts:229`. The current `typeof === 'number'` check is fragile against PostgREST numeric serialization; if it ever yields a string the value silently becomes `roofSquares * 450`. Omit valuation entirely when unquoted rather than deriving one from roofing math.

---

### Phase 2 — De-Michigan-ize

The document hardcodes Michigan statute regardless of job location: the Section 23a notice (`MCL 125.1523a`), 2015 MRC citations, `laws of the State of Michigan` in the certification, and `licenseType: 'State of Michigan Residential Builder (2101)'`. Correct for this job; wrong for the other 49 states the registry claims to cover (`permit-50-states-coverage.test.ts`).

**P2.1** — Move the certification notice into `STATE_CODE_REGISTRY` as a per-state `certificationNotice` field; fall back to a **generic** attestation with no statutory citation when the state has none recorded.

**P2.2** — `licenseType` becomes a property of the vault credential (contractor picks it when entering the license), not a constant.

**P2.3** — `authority.contactPhone` sourced from the jurisdiction record, `undefined` when unknown; the HTML already handles absence correctly once the literal is gone.

---

### Phase 3 — Schema for the orphaned fields

FEIN, MESC employer number, and parcel ID have **no column anywhere**. Each needs a decision:

**P3.1 — Contractor tax/employer identifiers.** New migration `migrations/20260915000000_contractor_compliance_profile.sql`:

```sql
create table contractor_compliance_profile (
  account_id uuid primary key references accounts(id) on delete cascade,
  fein text,
  state_employer_number text,          -- MESC in MI, equivalent elsewhere
  license_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS: account-scoped select/update, matching `contractor_credentials`. These are sensitive identifiers — confirm they belong in the same tenancy posture as the existing vault and are covered by `test/service-role-scoping-audit.test.ts` expectations.

**P3.2 — Parcel ID.** Property-scoped, not account-scoped. Options: (a) add `parcel_number text` to `jobs`; (b) attach to the property-passport surface that `test/property-passport-data.test.ts` exercises. **Recommendation: (a)** — smallest change, and parcel is per-job in practice. Populated by the contractor; render blank until then.

**P3.3 — Vault UI.** Extend `CredentialsVaultModal.tsx` with the compliance-profile fields and replace the `placeholder="e.g. 2101234567"` hint (`:254`) with a format-only hint that isn't a plausible real number.

---

### Phase 4 — `ai-autofill.ts`

Same treatment as Phase 0 applied to `:222-338`. This route (`/api/permits/autofill`) is a separate entry point that reconstructs the same document shape independently.

**Recommendation: collapse it.** Have `autofillPermitWithAI` consume the Tier-classified output of `compilePermitApplication` rather than maintaining a second parallel set of fallbacks that will drift again. If the two must stay separate, the `AttestedField` type and the "no Tier-A defaults" rule must apply to both.

---

### Phase 5 — Guardrails so this cannot regress

**P5.1 — Placeholder-literal test.** A unit test that walks `src/lib/permit-intel/**` and fails on any string literal matching credential-shaped patterns (`/\b\d{10}\b/`, `/(CPP|GL|WC|TRV|MP|ME)-\d+/`, `/\d{2}-\d{7}/`, known carrier names). Cheap, and it catches the whole class.

**P5.2 — Golden-document test.** Compile the application for a fixture job with an **empty vault** and assert the output contains none of the retired literals and *does* carry the DRAFT watermark. Then the same job with a **full vault** and assert every Tier-A slot is populated from the vault.

**P5.3 — Per-trade snapshot tests.** One fixture per discipline asserting no roofing vocabulary leaks into non-roofing documents (`shingle|underlayment|ice barrier|squares|tear off`). Extends the existing `permit-multi-discipline.test.ts` / `permit-trade-rules.test.ts`.

**P5.4 — Update existing tests.** `permit-application-generator.test.ts:73-105` asserts `iceBarrierCompliance === true` and `2015 MRC § R905.1.2` unconditionally. Its fixture is a roofing job so both should survive Phase 1, but the assertions must be re-scoped to the roofing profile rather than treated as universal. Audit the other 57 permit test files for placeholder coupling — known hits in `permit-submission-pipeline.test.ts`, `permit-submission-api.test.ts`, `permit-credentials-api.test.ts`.

---

## 5. Sequencing

Phase 0 is independently shippable and should go first — it is mostly deletion plus gating, and it closes the legal exposure. Phases 1–2 are the correctness work. Phase 3 unblocks the fields that currently cannot be filled at all. Phases 4–5 prevent recurrence.

| Phase | Depends on | Rough size |
|---|---|---|
| P0 — stop the bleeding | — | ~1 day |
| P1 — trade routing | P0 | ~2 days |
| P2 — de-Michigan-ize | P1 | ~1 day |
| P3 — schema | — (parallel with P1) | ~1 day |
| P4 — ai-autofill | P0 | ~0.5 day |
| P5 — guardrails | P1, P4 | ~1 day |

## 6. Existing-data check — **clear**

Any `job_permit_documents` row of type `application_draft` saved before this fix would contain fabricated credentials in its stored HTML. Checked against production on 2026-09-14:

```sql
select document_type, count(*) from job_permit_documents group by document_type;
-- -> 0 rows
```

`job_permit_documents` is **empty** — no contractor has ever saved a draft. **No backfill, no invalidation, no customer notification required.** Re-run this query immediately before shipping in case a draft lands in the interim; if one does, reset its case to `draft` and notify the account rather than leaving it retrievable from Job Documents as though valid.

## 7. Open decisions

1. **Refuse vs. blank for the COI** — plan assumes refuse-to-generate. Confirm.
2. **Parcel ID storage** — `jobs.parcel_number` vs. property passport.
3. **Whether `ai-autofill` collapses into the main generator** or stays a parallel path.
4. **FEIN/MESC on the printed form at all** — a contractor may reasonably prefer to hand-write these rather than store tax identifiers. Leaving them as permanent blank lines is a legitimate outcome and skips Phase 3.1 entirely.

~~5. Does any real account have saved application drafts~~ — **resolved, see §6: none exist.**
