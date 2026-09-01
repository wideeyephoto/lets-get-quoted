# FTC Advertising & Performance Claims Substantiation Register

**Entity:** LETS GET QUOTED LLC  
**Product:** Let's Get Quoted (Web, Field, Invoicing, Dispatch & AI Operating System)  
**Effective Date:** August 31, 2026  
**Governing Standard:** Federal Trade Commission (FTC) Act § 5 (15 U.S.C. § 45), FTC Policy Statement on Deception, FTC Guides Concerning the Use of Endorsements and Testimonials in Advertising (16 C.F.R. Part 255), CAN-SPAM Act (15 U.S.C. § 7701 et seq.), Telephone Consumer Protection Act (47 U.S.C. § 227), and applicable state consumer protection & electronic monitoring laws.

---

## 1. Executive Summary & Substantiation Framework

This Register serves as the definitive legal substantiation document for all express and implied performance, ROI, cost savings, timeline, pricing, and comparative marketing claims published across Let's Get Quoted marketing sites, pricing schedules, product copy, and onboarding/lifecycle communications.

### Substantiation Standard of Proof
Every factual, quantified, or comparative claim published by Let's Get Quoted must meet one of the following tiers of substantiation:
1. **Tier 1 (Internal Architectural & Product Truth):** Direct source code, billing schemas, automated test assertions, and database invariants.
2. **Tier 2 (Third-Party Regulatory & Technical Standards):** Published carrier 10DLC specifications, PCI-DSS Level 1 specifications, Stripe Connect terms, and Intuit Developer API agreements.
3. **Tier 3 (Grounded Industry Research & Benchmarks):** Published industry studies, trade association reports, and published peer-reviewed field service benchmarks (e.g. Lead Response Management Study, Harvard Business Review, National Association of Home Builders, ServiceTitan/Jobber industry benchmarks).

---

## 2. Product Claims & Substantiation Registry

| Claim ID | Exact Claim Copy | Published Surface | Classification | Factual Basis & Substantiation Evidence | Review Status & Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CLM-001** | *"Quotes sent within 2 hours of a site visit are 2.8x more likely to be approved on the spot."* | Lifecycle Email #2, Growth Playbook Template | Performance / Win Rate Benchmark | **Industry Benchmark:** Lead Response Management Study (Dr. James Oldroyd / InsideSales) & HBR Speed-to-Lead field conversion analysis demonstrating a >2.5x to 3x drop in quote close rates when estimates are delayed beyond 2–4 hours versus delivered on-site. | ✅ **VERIFIED**<br/>Commercial Legal |
| **CLM-002** | *"Offering an upgraded tier increases average job value by 22% without adding sales pressure."* | Lifecycle Email #2, Growth Playbook Template | Revenue / Ticket Lift Benchmark | **Industry Benchmark:** Multi-tier estimating analysis (Good-Better-Best pricing frameworks in residential contracting; Harvard Business Review behavioral pricing research indicating a 15–25% median ticket increase on tiered options). | ✅ **VERIFIED**<br/>Commercial Legal |
| **CLM-003** | *"Draft custom multi-tier estimates in under 60 seconds."* | Lifecycle Email #7, Public Feature Pages | Product Usability / Speed | **Product Truth:** System enables pre-saved trade labor/material templates and preset Good/Better/Best option matrices, allowing 1-click package selection and instant SMS estimate dispatch without manual drafting. Verified in automated demo test fixtures. | ✅ **VERIFIED**<br/>Product Eng |
| **CLM-004** | *"Contractors lose 30% of incoming jobs to voicemail."* | `/features/ai-voice`, Revenue Leakage Calculator | Operational Benchmark | **Industry Benchmark:** Invoca State of Inbound Calls Report & ServiceTitan industry benchmarking showing that 28–35% of residential trade calls go to voicemail during peak hours/in transit, with 85% of first-time callers hanging up without leaving a message. | ✅ **VERIFIED**<br/>Commercial Legal |
| **CLM-005** | *"30-Day Money-Back Guarantee: Cancel your first annual plan within 30 days for a full refund."* | `/pricing`, Billing Catalog, Terms §5 | Financial Guarantee | **Product Truth:** Automated refund engine in `subscription-cancellation.ts` verifies `current_period_start` within 30 days, looks up settled invoice payments via Stripe API, issues full refund, and cancels subscription. Verified in `test/subscription-cancellation.test.ts`. | ✅ **VERIFIED**<br/>Billing Eng |
| **CLM-006** | *"PCI-DSS Level 1 Compliant Card Processing via Stripe Connect."* | `/security`, `/terms`, `product-truth.ts` | Security & Compliance | **Third-Party Proof:** Stripe, Inc. is certified as a PCI-DSS Level 1 Service Provider. All payment fields use Stripe Elements / Checkout iframe tokenization; raw primary account numbers (PAN) never touch or reside on Let's Get Quoted application servers. | ✅ **VERIFIED**<br/>Security / SRE |
| **CLM-007** | *"Official Intuit QuickBooks Online 2-Way Accounting Sync."* | `/features`, `/pricing`, `product-truth.ts` | Integration Partner | **Third-Party Proof:** Bi-directional OAuth 2.0 integration built strictly against official Intuit Developer REST API endpoints (`/v3/company/.../invoice`, `/v3/company/.../customer`, `/v3/company/.../payment`). Pushes invoices & payments to QuickBooks, and pulls customers, payment receipts, and reconciled statuses back into Let's Get Quoted. | ✅ **VERIFIED**<br/>Integrations Eng |
| **CLM-008** | *"Base Plan Tiers: Solo $39/mo ($420/yr), Growth $129/mo ($1,188/yr), Scale $329/mo ($3,588/yr)."* | `/pricing`, Settings, Billing Catalog | Pricing Schedule | **Product Truth:** Strict 1:1 binding to verified active Stripe Live Price IDs in `src/lib/billing/catalog.ts` and Stripe catalog `2026-08-18-preview`. Checked in `test/ad-billing.test.ts` and live price audit. | ✅ **VERIFIED**<br/>Billing Eng |
| **CLM-009** | *"Platform transaction fees down to 0.25% (Growth) / 0.10% (Scale)."* | `/pricing`, Billing Catalog, Terms | Fee Schedule | **Product Truth:** Invariant enforced server-side in `platformFeePercent(plan)` (`flex: 1.25%`, `solo: 0.50%`, `growth: 0.25%`, `scale: 0.10%`). Tamper-proof fee calculation in `src/lib/payments.ts`. | ✅ **VERIFIED**<br/>Billing Eng |
| **CLM-010** | *"US Carrier 10DLC Compliance with Automatic Calling & Messaging Quiet Hours (8:00 AM – 9:00 PM)."* | `/sms-terms`, Terms §3, Speed-to-Lead | Regulatory Compliance | **Technical Implementation:** Atomic delayed scheduling in `20260831190000_atomic_delayed_sms_delivery.sql` and `ad-speed-to-lead.ts` calculates recipient timezone or account local timezone and holds non-emergency SMS until the next 8:00 AM window. | ✅ **VERIFIED**<br/>Telecom Eng |
| **CLM-011** | *"UPPA-Aligned Workflow & Scope Clarification Generator."* | `/for/[trade]`, Trade Insurance Studio | Regulatory Scope | **Legal Distinction:** Software provides itemized construction estimating tools, building code citations (IRC, IICRC, ANSI), and scope review templates without acting as a licensed public adjuster or negotiating claim settlement amounts on behalf of policyholders. | ✅ **VERIFIED**<br/>Commercial Legal |

---

## 3. Prohibited & Deprecated Copy Rules

To avoid deceptive or unsubstantiated advertising claims, the following rules are permanently codified and enforced across the repository:

1. **Absolute "100%" Deliverability Claims Prohibited:**  
   *Prohibited:* "Guarantees 100% carrier delivery rates."  
   *Approved:* "Ensures messages use verified 10DLC routes for optimal carrier deliverability."

2. **Absolute "100% Compliant" Regulatory Claims Prohibited:**  
   *Prohibited:* "100% UPPA compliant."  
   *Approved:* "UPPA-Aligned Workflow" / "Aligned with UPPA standards and transparent construction estimating."

3. **Unverified Historical Customer Cohort Claims Prohibited:**  
   *Prohibited:* "When we analyzed the contractors with the highest win rates on Let's Get Quoted..." (before significant live historical cohort data exists).  
   *Approved:* "Across trade contractor quoting best practices and estimating industry benchmarks..."

4. **Withheld SKUs / Features Sold as Active Prohibited:**  
   Features listed in `TOP_UPS_WITHHELD` (such as dedicated AI Voice incoming phone lines or extra voice minutes) must not be marketed as immediately available without explicit qualification of their preview / carrier rollout status.

---

## 4. CAN-SPAM & TCPA Compliance Invariants

### 4.1 Physical Postal Address Mandate
Every commercial email transmitted by or on behalf of Let's Get Quoted must include a valid physical postal address:
- **Platform Emails (Announcements & Onboarding):** `Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758` (or `process.env.COMPANY_MAILING_ADDRESS`).
- **Contractor Customer Campaigns:** Strictly requires the contractor's verified business address from their settings profile (`accounts.mailing_address`). System fails closed and refuses to broadcast marketing emails if the contractor has not configured their business address.

### 4.2 One-Click List-Unsubscribe (RFC 8058)
All marketing emails must include RFC 8058 compliant headers:
```http
List-Unsubscribe: <https://app.letsgetquoted.com/api/email/unsubscribe?token=...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
And an HTML footer containing a direct human-clickable unsubscribe link.

### 4.3 Fail-Closed Suppression
Suppression list lookup errors must throw and halt email batch generation immediately. No marketing emails may be dispatched if the suppression list query returns an error.

### 4.4 Mandatory Call & Voice Recording Disclosures
Pursuant to federal (18 U.S.C. § 2511) and state two-party consent laws, all inbound calls answered by AI or recorded by the platform must announce:
1. `You are speaking with an AI assistant.`
2. `This call may be recorded for quality and training purposes.` (when recording is active).
These disclosures are programmatically enforced at the provider SWML/LaML greeting layer and cannot be bypassed.

### 4.5 Workforce Location Monitoring Notices
In compliance with state electronic monitoring laws (e.g. NY Civil Rights Law § 52-c, California Labor Code), mobile field location tracking is restricted to active shift hours and is prominently signaled in the UI with a persistent status indicator ("Work location sharing active while this app is open").
