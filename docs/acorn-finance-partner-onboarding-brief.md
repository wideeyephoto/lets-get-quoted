# Acorn Finance Partner Onboarding & Integration Brief

## 1. Executive Summary & Partner Profile

| Field | Official Value |
|---|---|
| **Partner Company** | Acorn Finance |
| **Legal Entity** | Headway Sales Inc. (NMLS ID# 1817022), Sacramento, CA |
| **Lending Network** | 12+ national consumer lenders (Point-of-Sale / Home Improvement Marketplace) |
| **Loan Limits** | **\$1,000 to \$100,000** (standard across platform lenders; Texas minimum begins at \$2,000) |
| **Contractor Cost** | **0% merchant fee**, \$0 dealer fees, \$0 subscription fees |
| **Partner Sign-up Portal** | [https://sign-up.acornfinance.com/](https://sign-up.acornfinance.com/) |
| **Developer Portal** | [https://docs.acornfinance.com](https://docs.acornfinance.com) |
| **Partner / IT Support** | `it@acornfinance.com` |
| **API Endpoints** | Production: `https://api.acornfinance.com`<br>UAT / Sandbox: `https://uat.api.acornfinance.com` |

---

## 2. Verified Technical Specifications

Through deep discovery across Acorn Finance developer documentation and existing enterprise partner implementations (JobTread, FieldPulse, Joist):

### A. Dealer & Referral Link Parameters
- **Base Prequalification URL**: `https://www.acornfinance.com/pre-qualify/`
- **`d={dealer_id}`**: Acorn's standard dealer/contractor attribution parameter. When present, attaches the application to the specific contractor in their Acorn Contractor Portal.
- **`utm_source=letsgetquoted`**: Platform attribution identifier.
- **`utm_content={docRef}`**: Officially documented in Acorn API conventions as the **partner's estimate, quote, or invoice identifier**. Acorn preserves this parameter across the application and returns it on application records and postback webhooks as the primary join key back to our platform.
- **`amount={projectTotal}`**: Supported in quoting endpoints and widgets. We pass the rounded project total whenever `amount >= $1,000`.

### B. Lending Floor
- Wisetack's \$500 floor assumption has been formally replaced with Acorn's official network minimum of **\$1,000**.
- Invoices and quotes under \$1,000 automatically suppress financing options to prevent borrower rejection or confusion.

### C. Webhooks & Funding Status (Stage 3 Ready)
- **Partner Postback API**: Acorn supports HTTP POST webhooks for loan status updates.
- **Header Authentication**: `X-Authorization: {partner_postback_api_key}`
- **Core Lifecycle Events**: `application.offered`, `application.approved`, `application.funded`.
- **Zero Servicing Burden**: The lender disburses funds directly to the homeowner; the homeowner settles the invoice with the contractor via Let's Get Quoted Stripe payment.

---

## 3. Partner Call Agenda & Verification Checklist

When speaking with the Acorn Finance partnerships team, verify the following 4 items:

1. **Pre-fill Behavior on Web Form**:
   > *"When we send homeowners to `acornfinance.com/pre-qualify/?d=<code>&amount=8500`, does the hosted prequalification form pre-populate the \$8,500 loan amount, or does the homeowner choose their loan amount on the landing step?"*

2. **Platform Parent Account Setup**:
   > *"We want Let's Get Quoted set up as the parent `AppCompany` (`app_company_parent_id`). How should our contractors obtain their `dealer_id`? Can we provision contractor accounts via the `POST /app_companies` Partner REST API, or should contractors generate their dealer code in the Acorn portal?"*

3. **Mandatory Verbatim Disclosures**:
   > *"We currently render a neutral marketplace card compliant with Regulation Z (no APRs, no monthly terms). Does Acorn mandate any specific legal phrasing or state-specific lending license disclaimers (e.g. California financing licensing numbers) on partner quote and invoice screens?"*

4. **Postback Webhook Activation (Stage 3)**:
   > *"We would like to receive postback webhooks when a loan moves to `OFFERED` or `FUNDED`. What is the process for registering our webhook endpoint URL and receiving our shared secret?"*

---

## 4. Email Outreach Template (Ready to Send)

**To**: `it@acornfinance.com` (or your assigned Acorn Partnership Manager)  
**Subject**: Software Partner Integration Onboarding — Let's Get Quoted & Acorn Finance

```text
Hi Acorn Finance Team,

We are integrating Acorn Finance into Let's Get Quoted (https://letsgetquoted.com), a modern estimating, invoicing, and payments platform for residential trade contractors.

We have already architected our pre-qualification hand-off to route homeowners seamlessly to Acorn's pre-qualification marketplace (with dealer attribution, partner UTM tags, and zero merchant fees for contractors).

We are finalizing our production rollout and would like to schedule a quick 15-minute onboarding call with your partner integrations team to confirm:

1. Our platform partner credentials (parent AppCompany setup on api.acornfinance.com).
2. URL parameter conventions for project total pre-fill and document join keys (`utm_content`).
3. Confirmation of your required legal disclosure copy for software partners.
4. Setting up our webhook endpoint for the Partner Postback API (loan status updates).

Could you please let us know your availability for a brief call this week, or send over your partner onboarding packet?

Best regards,

[Your Name]
Let's Get Quoted Team
```
