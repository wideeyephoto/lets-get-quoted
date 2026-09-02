# Friends & Family (F&F) VIP Discount Plan

## Overview
This document defines the strategy, unit economics, safeguards, and operational rollout for the **Friends & Family VIP Discount** program. 

The goal is to onboard a trusted inner circle of early trade contractors to validate workflows, uncover bugs, and provide candid product feedback, while ensuring **every account remains strictly cash-flow positive with a 15%+ profit margin over raw infrastructure costs**.

---

## 1. Unit Economics & Pricing Model

The Friends & Family program operates with two distinct discount tracks:
1. **Paid Plans (Solo & Growth):** **60% lifetime recurring discount** on monthly/annual subscriptions.
2. **Pay-As-You-Go Plan (Flex):** **40% reduction across everything** (transaction fees, AI voice add-on, and capacity top-ups).

### A. Paid Subscription Plans (60% Off)

| Plan | Public Monthly | F&F Monthly (60% Off) | Public Annual | F&F Annual (60% Off) | Estimated Baseline Cost | Net Margin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Solo** | \$39.00 | **\$15.60** | \$420.00 | **\$168.00** | ~\$10.00 / mo | **+35% to +40%** |
| **Growth** | \$129.00 | **\$51.60** | \$1,188.00 | **\$475.20** | ~\$30.00 / mo | **+40% to +45%** |

*Note: Baseline cost covers database read/write volume, multi-tenant storage, authentication, transaction emails, base AI intake credits, and included plan SMS allowances.*

---

### B. Flex Plan (40% Reduction Across the Board)

Flex has a \$0/mo base fee. For Friends & Family members operating on Flex, all platform fees, monthly add-ons, and top-ups are reduced by **40%**:

| Feature / SKU | Public Standard | F&F Rate (40% Reduction) | Benefit to Contractor |
| :--- | :--- | :--- | :--- |
| **Platform Fee (Take Rate)** | `1.25%` (125 bps) | **`0.75%` (75 bps)** | Saves 50 bps on all customer payments collected |
| **AI Voice Receptionist** | \$69.00 / mo | **\$41.40 / mo** | \$27.60 / mo savings on monthly voice add-on |
| **250 Text Credits (`flex_text_250`)** | \$12.00 | **\$7.20** | \$4.80 savings per pack |
| **1,000 Text Credits (`text_1000`)** | \$42.00 | **\$25.20** | \$16.80 savings per pack |
| **5,000 Marketing Emails (`marketing_email_5000`)** | \$17.00 | **\$10.20** | \$6.80 savings per pack |
| **100 AI Intake Credits (`ai_intake_100`)** | \$15.00 | **\$9.00** | \$6.00 savings per pack |
| **250 AI Writing Drafts (`ai_writing_250`)** | \$19.00 | **\$11.40** | \$7.60 savings per pack |
| **100 GB Storage (`storage_100gb`)** | \$15.00 / mo | **\$9.00 / mo** | \$6.00 / mo savings |
| **100 Connected Voice Minutes (`voice_minutes_100`)** | \$35.00 | **\$21.00** | \$14.00 savings per pack |

---

## 2. Hard Cost Safeguards & Plan Rules

To prevent financial leakage and ensure administrative clarity, the following conditions apply:

1. **Continuous Active Account Required:**
   - The discounts are valid only for continuous, active accounts in good standing.
   - If a paid subscription (Solo/Growth/Voice) is canceled or lapses past the grace collection window, the rate is permanently forfeited.
2. **Flex Margin Protection:**
   - Even with a 40% reduction on Flex top-ups and fees, unit economics remain safely cash-flow positive above wholesale carrier/infrastructure costs.
3. **Strictly Non-Transferable:**
   - Entitlements and fee reductions belong solely to the recipient's registered workspace and business entity.
4. **Active Usage Requirement:**
   - Accounts dormant for >60 consecutive days without quote or job activity are subject to review or suspension.

---

## 3. Stripe Implementation Guide

The program is managed cleanly in Stripe without requiring catalog schema mutations or custom database tables.

### Step 1: Create the Master Coupon
- **Name:** `Friends & Family - 60% Off Lifetime`
- **ID:** `ff_vip_60_lifetime`
- **Type:** Percentage discount (`60%`)
- **Duration:** `Forever`
- **Applies to:** **Specific products only** (Select only `Solo Plan` and `Growth Plan`). Leave all top-ups, add-on numbers, and one-off products unselected.
- **Scope:** Subscription-level only (never attach at the global Customer object level).

### Step 2: Customer-Restricted Promotion Codes
To prevent codes from leaking to the public:
1. In the Stripe Dashboard under the `ff_vip_60_lifetime` coupon, create customer-specific promotion codes (e.g., `VIP-DAVE`, `FF-MIKE-ROOFING`).
2. Set **Limit to a specific customer** using their customer ID or email.
3. Set **Max redemptions** to `1`.

### Step 3: Checkout Session Integration
When initiating a Checkout Session in code, ensure promotion codes are enabled or pre-attached:

```typescript
// Example: Pre-applying the F&F coupon directly for a VIP customer
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: stripeCustomerId,
  line_items: [
    {
      price: process.env.STRIPE_PRICE_SOLO_MONTHLY,
      quantity: 1,
    },
  ],
  discounts: [
    {
      coupon: 'ff_vip_60_lifetime',
    },
  ],
  success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/pricing`,
});
```

### Step 4: Flex Plan 40% Reduction Setup
1. **Platform Fee Override (Take Rate):**
   - In your workspace entitlements table, set the workspace's `platform_fee_bps` to **`75`** (0.75%) instead of the default `125` (1.25%).
2. **AI Voice & Top-Up Coupon:**
   - Create a secondary Stripe coupon `ff_flex_40` (`percent_off: 40`, duration: `forever`) applicable to the `ai_voice_flex` product and Flex top-up checkout sessions.

---

## 4. Communication & Positioning

### The Golden Rule of Framing
> **Never tell friends or family you are charging them "cost plus margin".** 
> 
> Frame the offer as an exclusive **"Private 60% VIP Founder Rate"**. It communicates high value and generosity while maintaining professional boundaries.

### Direct Outreach Template (SMS / WhatsApp)

> "Hey [Name],
> 
> As you know, I've spent the past few months building a new quoting and job management system specifically for trade businesses.
> 
> We're officially rolling it out now at \$39–\$129/mo, but before the public launch, I’ve opened up a private **Friends & Family VIP tier** for my inner circle.
> 
> I set up a private code for you that locks in **60% off for life** (so our Solo plan is just **\$15/mo** instead of \$39). As long as you keep your account active, that price will never increase.
> 
> All I ask in exchange is that you run a few real quotes through it and give me your unfiltered feedback on what’s great and what needs work.
> 
> Here’s your private access link: [Link]
> 
> Let me know when you sign up and I'll jump on a quick 15-minute call to help set up your company branding and first quote!"

---

## 5. Onboarding & Feedback Protocol

Because friends and family tend to give polite, non-critical feedback out of kindness, follow this protocol to extract genuine product insights:

1. **The 15-Minute "White Glove" Setup Call:**
   - Walk them through account setup live over Zoom or in person.
   - Watch them configure their business profile, logo, and line items.
   - Observe where they hesitate, click the wrong button, or ask questions.
2. **The "Anti-Politeness" Feedback Questions:**
   - *"What was the most confusing part of sending that quote?"*
   - *"What took longer than you expected?"*
   - *"If you were in a rush in your truck, what feature would annoy you?"*
   - *"What is one thing the software does right now that you wouldn't miss if I deleted it?"*
3. **Milestone Celebration:**
   - When they send their first quote and collect their first payment, acknowledge the milestone and capture a short quote/testimonial for future marketing materials.
