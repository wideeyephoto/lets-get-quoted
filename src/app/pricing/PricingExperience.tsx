'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { buildStartUrl } from '@/lib/signup-intent';
import PricingCalculator from './PricingCalculator';
import {
  ADD_ONS,
  COMPARISON_ROWS,
  PLANS,
  PRICING_FAQS,
  annualPlanCost,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from './pricing-catalog';
import styles from './pricing.module.css';

const CARD_DIFFERENTIATORS: Record<PlanId, readonly string[]> = {
  flex: [
    'No monthly subscription — 100% free when work slows down',
    '1 office user + 2 crew users with full job & invoice dispatch',
    'Custom-domain contractor website with standard lead capture forms',
  ],
  solo: [
    '0.50% lower platform fee (pays for itself around $56k/yr)',
    '2 office users + 2 crew users included',
    '500 monthly text credits & 300 AI intake/draft credits',
  ],
  growth: [
    '0.25% platform fee for rapidly growing invoice volume',
    '5 office users + 10 crew users with team scheduling',
    '1,500 monthly text credits & 750 AI intake/draft credits',
  ],
  scale: [
    '0.10% lowest platform fee for maximum margin efficiency',
    '15 office users + 50 crew users included',
    '3,000 monthly text credits, 1,500 AI credits & 250 GB storage',
  ],
};

const PLAN_AUDIENCE_TAGS: Record<PlanId, string> = {
  flex: 'Seasonal / Starting Out',
  solo: 'Owner-Operator',
  growth: 'Growing Team · Most Popular',
  scale: 'High-Volume Operations',
};

const RECOMMENDER_PRESETS = [
  {
    label: 'Solo Handyman',
    sublabel: '$35k/yr · 1 user',
    teamSize: 'solo' as const,
    volume: 35_000,
    needsTexting: false,
  },
  {
    label: 'Owner-Operator Electrician',
    sublabel: '$150k/yr · 2 users',
    teamSize: 'small' as const,
    volume: 150_000,
    needsTexting: true,
  },
  {
    label: 'Growing Remodeling Crew',
    sublabel: '$600k/yr · 5 users',
    teamSize: 'growth' as const,
    volume: 600_000,
    needsTexting: true,
  },
  {
    label: 'High-Volume Roofing',
    sublabel: '$1.8M/yr · 12 users',
    teamSize: 'scale' as const,
    volume: 1_800_000,
    needsTexting: true,
  },
];

const COMPARISON_CATEGORIES = [
  { id: 'all', label: 'All features (19)' },
  { id: 'fees', label: 'Fees & Seats (5)' },
  { id: 'core', label: 'Leads & Quotes (5)' },
  { id: 'comms', label: 'Messaging & Phone (5)' },
  { id: 'ai', label: 'AI, Storage & QBO (4)' },
] as const;

type ComparisonCategory = (typeof COMPARISON_CATEGORIES)[number]['id'];

const ROW_CATEGORY_MAP: Record<string, ComparisonCategory> = {
  'LGQ platform fee': 'fees',
  'Office / admin users': 'fees',
  'Crew-only users': 'fees',
  'Operating locations for one legal business': 'fees',
  'Usage beyond included limits': 'fees',

  'Leads, clients, quotes, jobs & invoices': 'core',
  'Standard quote-form submissions': 'core',
  'Lead capture after AI limit': 'core',
  'Custom-domain connections': 'core',
  'Free onboarding + quick tour': 'core',

  'Business number': 'comms',
  'Basic call forwarding & voicemail': 'comms',
  'Text credits': 'comms',
  'Marketing email sends': 'comms',
  'Transactional emails': 'comms',

  'AI Intake credits': 'ai',
  'AI writing drafts': 'ai',
  'File & photo storage': 'ai',
  'QuickBooks Online': 'ai',
};

function price(plan: PricingPlan, billing: BillingCycle): number {
  return billing === 'annual' ? plan.annualMonthly : plan.monthly;
}

function paymentFee(plan: PricingPlan): string {
  const digits = plan.paymentFeePct === 0.1 ? 1 : 2;
  return `${plan.paymentFeePct.toFixed(digits)}%`;
}

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function getPlan(planId: PlanId): PricingPlan {
  const plan = PLANS.find((item) => item.id === planId);
  if (!plan) throw new Error(`Unknown pricing plan: ${planId}`);
  return plan;
}

function signupHref(plan: PlanId, billing: BillingCycle) {
  return buildStartUrl({
    goal: 'choose_plan',
    plan: plan as 'flex' | 'starter' | 'growth' | 'scale',
    billing: billing as 'monthly' | 'annual',
    source: 'pricing',
  });
}

function InfoBubble({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.infoBubbleWrapper}>
      <button
        type="button"
        className={styles.infoBubbleTrigger}
        aria-label={`Learn more about ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className={styles.infoBubbleContent} role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}

export default function PricingExperience() {
  // Billing default is Monthly (lower commitment comparison)
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  // Unified 3-Input Recommender State
  const [recommenderTeam, setRecommenderTeam] = useState<'solo' | 'small' | 'growth' | 'scale'>('solo');
  const [recommenderVolume, setRecommenderVolume] = useState<number>(75_000);
  const [recommenderTexting, setRecommenderTexting] = useState<boolean>(true);

  // Expanded Sections
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [comparisonCategory, setComparisonCategory] = useState<ComparisonCategory>('all');
  const [showAllFaqs, setShowAllFaqs] = useState<boolean>(false);

  // Derive seat count number from selection
  const seatsNum = useMemo(() => {
    switch (recommenderTeam) {
      case 'solo': return 1;
      case 'small': return 2;
      case 'growth': return 5;
      case 'scale': return 15;
    }
  }, [recommenderTeam]);

  // Recommendation Engine Logic
  const recommendation = useMemo(() => {
    // 1. Minimum plan by seat capacity
    let minPlanBySeats: PlanId = 'flex';
    if (seatsNum > 5) minPlanBySeats = 'scale';
    else if (seatsNum > 2) minPlanBySeats = 'growth';
    else if (seatsNum > 1) minPlanBySeats = 'solo';
    else minPlanBySeats = recommenderTexting ? 'solo' : 'flex';

    // 2. Cost-based evaluation across eligible plans
    let winnerId: PlanId = 'flex';
    let reason = '';
    let closestAlternative = '';
    let crossoverNote = '';

    if (minPlanBySeats === 'scale' || recommenderVolume >= 1_600_000) {
      winnerId = 'scale';
      if (seatsNum > 5) {
        reason = `You need ${seatsNum} team seats. Scale includes 15 office users, 50 crew users, and the lowest 0.1% platform fee.`;
      } else {
        reason = `At ${money(recommenderVolume)}/year collected, Scale's 0.1% platform fee saves more on invoices than any other tier.`;
      }
      closestAlternative = 'Growth ($129/mo + 0.25%, but higher fee on high volume)';
      crossoverNote = 'Scale is the most cost-effective tier whenever annual collections exceed $1.6M.';
    } else if (minPlanBySeats === 'growth' || recommenderVolume >= 307_200) {
      winnerId = 'growth';
      if (seatsNum > 2) {
        reason = `You selected ${seatsNum} team seats and collect ~${money(recommenderVolume)}/year. Growth includes 5 office seats and a low 0.25% platform fee.`;
      } else {
        reason = `At ${money(recommenderVolume)}/year collected, Growth's 0.25% fee saves enough on processing to offset the subscription.`;
      }
      closestAlternative = recommenderVolume < 307_200 ? 'Solo ($39/mo, max 2 seats)' : 'Scale ($329/mo, lowest 0.1% fee above $1.6M/yr)';
      crossoverNote = recommenderVolume < 1_600_000
        ? `If your volume grows past $1.6M/year, Scale becomes lower overall cost.`
        : `Growth is optimal for teams up to 5 office users under $1.6M/year.`;
    } else if (minPlanBySeats === 'solo' || recommenderVolume >= 56_000 || recommenderTexting) {
      winnerId = 'solo';
      if (recommenderTexting && recommenderVolume < 56_000) {
        reason = `You need 2-way business texting & AI intake. Solo includes 500 monthly text credits and 2 office seats.`;
      } else {
        reason = `At ${money(recommenderVolume)}/year collected, Solo's 0.50% fee saves more on invoices than Flex's 1.25% rate.`;
      }
      closestAlternative = 'Flex ($0/mo, 1.25% fee, starter credits only)';
      crossoverNote = `If your collections exceed $307,000/year, Growth's 0.25% fee becomes more economical.`;
    } else {
      winnerId = 'flex';
      reason = `You have 1 user and collect under $56,000/year. Flex gives you a $0/mo base with 1.25% fee and zero fixed bills in slow months.`;
      closestAlternative = 'Solo ($39/mo with 0.50% fee & 500 texts/mo)';
      crossoverNote = `If your collections grow beyond $56,000/year, Solo saves you money on fees.`;
    }

    const winner = getPlan(winnerId);
    const annualTotalCost = annualPlanCost(winner, billing, recommenderVolume, false);
    const monthlyEffective = Math.round(annualTotalCost / 12);
    const fixedBaseMonthly = price(winner, billing);
    const feeMonthly = Math.round((recommenderVolume * (winner.paymentFeePct / 100)) / 12);

    return {
      winner,
      reason,
      monthlyEffective,
      fixedBaseMonthly,
      feeMonthly,
      closestAlternative,
      crossoverNote,
    };
  }, [recommenderVolume, recommenderTexting, seatsNum, billing]);

  return (
    <>
      {/* 1. Compact Pricing Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContainer}>
          <p className={styles.heroEyebrow}>One connected system · Scalable pricing</p>
          <h1>Start free. Pay less as you grow.</h1>
          <p className={styles.heroLead}>
            One connected system for your whole contracting business—website to payment—with plans that add team capacity
            and lower your platform fee as your business grows.
          </p>

          {/* Explicit Complete Pricing Formula */}
          <div className={styles.formulaBox} role="region" aria-label="LGQ Pricing Formula">
            <span className={styles.formulaBadge}>The Complete Pricing Formula</span>
            <p className={styles.formulaText}>
              Your cost is the <strong>plan subscription</strong> plus an <strong>LGQ platform fee</strong> on eligible payments.
              Stripe processing is separate.
            </p>
            <div className={styles.formulaDetails}>
              <span>✓ No setup fees</span>
              <span>✓ No long-term contracts</span>
              <span>✓ Free contractor website included</span>
              <span>✓ 1-click QuickBooks sync</span>
            </div>
          </div>

          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#plans">
              Start free &rarr;
            </a>
            <a className={styles.secondaryButton} href="#recommender">
              Find my plan &darr;
            </a>
          </div>
        </div>
      </section>

      {/* 2. One Guided Plan Recommender */}
      <section className={styles.recommenderSection} id="recommender">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>ONE GUIDED RECOMMENDER</p>
          <h2>Which plan fits your business?</h2>
          <p>Answer 3 quick questions to calculate your exact fees and match the right team capacity.</p>
        </div>

        {/* Quick Scenario Preset Chips */}
        <div className={styles.presetChips} role="group" aria-label="Quick preset scenarios">
          <span className={styles.presetLabel}>Quick scenarios:</span>
          {RECOMMENDER_PRESETS.map((preset) => {
            const isMatch =
              recommenderTeam === preset.teamSize &&
              recommenderVolume === preset.volume &&
              recommenderTexting === preset.needsTexting;
            return (
              <button
                key={preset.label}
                type="button"
                className={isMatch ? styles.presetChipActive : styles.presetChip}
                onClick={() => {
                  setRecommenderTeam(preset.teamSize);
                  setRecommenderVolume(preset.volume);
                  setRecommenderTexting(preset.needsTexting);
                }}
              >
                <strong>{preset.label}</strong>
                <small>{preset.sublabel}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.recommenderGrid}>
          {/* 3 Decision Inputs */}
          <div className={styles.recommenderInputsCard}>
            <h3 className={styles.recommenderInputTitle}>1. Team &amp; Office Users</h3>
            <div className={styles.inputOptionGroup} role="radiogroup" aria-label="Team size">
              <button
                type="button"
                className={recommenderTeam === 'solo' ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={recommenderTeam === 'solo'}
                role="radio"
                onClick={() => setRecommenderTeam('solo')}
              >
                <strong>1 User</strong>
                <small>Solo Operator</small>
              </button>
              <button
                type="button"
                className={recommenderTeam === 'small' ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={recommenderTeam === 'small'}
                role="radio"
                onClick={() => setRecommenderTeam('small')}
              >
                <strong>2–3 Users</strong>
                <small>Small Office</small>
              </button>
              <button
                type="button"
                className={recommenderTeam === 'growth' ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={recommenderTeam === 'growth'}
                role="radio"
                onClick={() => setRecommenderTeam('growth')}
              >
                <strong>4–8 Users</strong>
                <small>Growing Crew</small>
              </button>
              <button
                type="button"
                className={recommenderTeam === 'scale' ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={recommenderTeam === 'scale'}
                role="radio"
                onClick={() => setRecommenderTeam('scale')}
              >
                <strong>9+ Users</strong>
                <small>High Volume</small>
              </button>
            </div>

            <h3 className={styles.recommenderInputTitle} style={{ marginTop: '24px' }}>
              2. Annual Payments Collected via LGQ
            </h3>
            <div className={styles.volumeDisplayRow}>
              <strong className={styles.volumeAmount}>{money(recommenderVolume)} / year</strong>
              <span className={styles.volumeMonthlyEquiv}>~{money(recommenderVolume / 12)} / month</span>
            </div>
            <input
              type="range"
              min={10_000}
              max={2_500_000}
              step={10_000}
              value={recommenderVolume}
              onChange={(e) => setRecommenderVolume(Number(e.target.value))}
              className={styles.volumeSlider}
              aria-label="Annual payments collected"
            />
            <div className={styles.sliderTickMarks}>
              <span onClick={() => setRecommenderVolume(40_000)}>$40k</span>
              <span onClick={() => setRecommenderVolume(150_000)}>$150k</span>
              <span onClick={() => setRecommenderVolume(350_000)}>$350k</span>
              <span onClick={() => setRecommenderVolume(600_000)}>$600k</span>
              <span onClick={() => setRecommenderVolume(1_500_000)}>$1.5M+</span>
            </div>

            <h3 className={styles.recommenderInputTitle} style={{ marginTop: '24px' }}>
              3. Business Texting &amp; AI Intake
            </h3>
            <div className={styles.inputOptionGroup} role="radiogroup" aria-label="Messaging needs">
              <button
                type="button"
                className={!recommenderTexting ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={!recommenderTexting}
                role="radio"
                onClick={() => setRecommenderTexting(false)}
              >
                <strong>Starter Credits</strong>
                <small>Standard web quote form only</small>
              </button>
              <button
                type="button"
                className={recommenderTexting ? styles.optionBtnActive : styles.optionBtn}
                aria-checked={recommenderTexting}
                role="radio"
                onClick={() => setRecommenderTexting(true)}
              >
                <strong>2-Way Texting &amp; AI Intake</strong>
                <small>Automated text &amp; instant AI estimates</small>
              </button>
            </div>
          </div>

          {/* Unified Recommendation Result Card */}
          <div className={styles.recommenderResultCard}>
            <div className={styles.resultHeader}>
              <span className={styles.resultBadge}>★ Recommended Fit</span>
              <h3 className={styles.resultHeadline}>{recommendation.winner.name} fits your business</h3>
              <p className={styles.resultReason}>{recommendation.reason}</p>
            </div>

            <div className={styles.resultCostBlock}>
              <div className={styles.resultCostMain}>
                <span className={styles.costLabel}>Estimated Effective Monthly Cost</span>
                <strong className={styles.costValue}>~{money(recommendation.monthlyEffective)}<small>/mo</small></strong>
              </div>
              <div className={styles.resultCostBreakdown}>
                <div>
                  <span>Base Subscription</span>
                  <strong>${recommendation.fixedBaseMonthly}/mo</strong>
                </div>
                <div>
                  <span>LGQ Platform Fee</span>
                  <strong>{paymentFee(recommendation.winner)} (~{money(recommendation.feeMonthly)}/mo)</strong>
                </div>
              </div>
            </div>

            <div className={styles.resultInsights}>
              <div className={styles.insightItem}>
                <span className={styles.insightLabel}>Closest Alternative:</span>
                <p className={styles.insightValue}>{recommendation.closestAlternative}</p>
              </div>
              <div className={styles.insightItem}>
                <span className={styles.insightLabel}>Crossover Insight:</span>
                <p className={styles.insightValue}>{recommendation.crossoverNote}</p>
              </div>
            </div>

            <a
              href={signupHref(recommendation.winner.id, billing)}
              className={styles.resultCtaButton}
            >
              {recommendation.winner.id === 'flex' ? 'Start Free on Flex' : `Continue with ${recommendation.winner.name}`} &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* 3. Four Compact Plan Cards */}
      <section className={styles.plansSection} id="plans">
        <div className={styles.sectionHeaderSplit}>
          <div>
            <p className={styles.sectionEyebrow}>TRANSPARENT PLANS</p>
            <h2>Simple, honest pricing for every stage.</h2>
            <p>Every plan includes your website, unlimited core records, and QuickBooks sync.</p>
          </div>

          {/* Billing Cycle Toggle (Default: Monthly) */}
          <div className={styles.billingToggle} role="group" aria-label="Billing cycle">
            <button
              type="button"
              className={billing === 'monthly' ? styles.billingActive : styles.billingInactive}
              aria-pressed={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
            >
              Monthly billing
            </button>
            <button
              type="button"
              className={billing === 'annual' ? styles.billingActive : styles.billingInactive}
              aria-pressed={billing === 'annual'}
              onClick={() => setBilling('annual')}
            >
              Annual billing <span className={styles.savePill}>Save up to $360/yr</span>
            </button>
          </div>
        </div>

        <div className={styles.planCardGrid}>
          {PLANS.map((plan) => {
            const isMatch = recommendation.winner.id === plan.id;
            const cardPrice = price(plan, billing);
            const annualTotal = plan.annualMonthly * 12;
            const annualSavings = (plan.monthly - plan.annualMonthly) * 12;

            return (
              <article
                key={plan.id}
                className={`${styles.planCard} ${plan.featured ? styles.planCardFeatured : ''} ${isMatch ? styles.planCardMatch : ''}`}
              >
                {isMatch && <span className={styles.matchRibbon}>Recommended Match</span>}
                {plan.featured && !isMatch && <span className={styles.popularRibbon}>Most Popular</span>}

                <div className={styles.planCardHeader}>
                  <span className={styles.planAudienceTag}>{PLAN_AUDIENCE_TAGS[plan.id]}</span>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  <p className={styles.planPromiseText}>{plan.promise}</p>
                </div>

                {/* Price and Explicit Commitment */}
                <div className={styles.priceContainer}>
                  <div className={styles.priceNumberRow}>
                    <strong className={styles.priceBig}>${cardPrice}</strong>
                    <span className={styles.priceCadence}>/month</span>
                  </div>

                  {plan.id === 'flex' ? (
                    <p className={styles.commitmentText}>$0 monthly base · pay only when you get paid</p>
                  ) : billing === 'annual' ? (
                    <p className={styles.commitmentText}>
                      ${annualTotal.toLocaleString()} billed annually — equivalent to ${plan.annualMonthly}/month{' '}
                      <strong style={{ color: '#50e3bd' }}>(Save ${annualSavings}/yr)</strong>
                    </p>
                  ) : (
                    <p className={styles.commitmentText}>${plan.monthly} month-to-month · cancel anytime</p>
                  )}
                </div>

                {/* Platform Fee Callout */}
                <div className={styles.feeCallout}>
                  <span className={styles.feeLabel}>LGQ Platform Fee</span>
                  <strong className={styles.feeValue}>{paymentFee(plan)}</strong>
                  <InfoBubble label={`${plan.name} platform fee`}>
                    Applied only to eligible payments successfully collected through LGQ. Stripe processing is separate.
                  </InfoBubble>
                </div>

                {/* Included Capacity */}
                <div className={styles.capacityBadge}>
                  👥 <strong>{plan.officeUsers} Office</strong> + <strong>{plan.crewUsers} Crew</strong> users
                </div>

                {/* 3 Meaningful Differentiators */}
                <ul className={styles.differentiatorList}>
                  {CARD_DIFFERENTIATORS[plan.id].map((diff) => (
                    <li key={diff}>
                      <span className={styles.diffCheck}>✓</span>
                      <span>{diff}</span>
                    </li>
                  ))}
                </ul>

                {/* Single Contextual CTA */}
                <a
                  href={signupHref(plan.id, billing)}
                  className={plan.featured || isMatch ? styles.primaryButton : styles.planButton}
                  style={{ width: '100%', marginTop: 'auto' }}
                >
                  {plan.id === 'flex' ? 'Start with Flex' : `Choose ${plan.name}`} &rarr;
                </a>
              </article>
            );
          })}
        </div>
      </section>

      {/* 4. What Every Plan Includes */}
      <section className={styles.includedSection} id="included">
        <div className={styles.includedHeader}>
          <p className={styles.sectionEyebrow}>INCLUDED ON EVERY PLAN</p>
          <h2>No Nickel-and-Diming for Core Business Tools</h2>
        </div>

        <div className={styles.includedGrid}>
          <div className={styles.includedCard}>
            <span className={styles.includedIcon}>📋</span>
            <strong>Unlimited Core Records</strong>
            <p>Leads, customers, job history, quotes, invoices, and standard quote forms stay unlimited on every plan.</p>
          </div>
          <div className={styles.includedCard}>
            <span className={styles.includedIcon}>🌐</span>
            <strong>Free Contractor Website</strong>
            <p>Connect your custom domain with fast mobile SEO, instant estimate intake, and customer self-booking.</p>
          </div>
          <div className={styles.includedCard}>
            <span className={styles.includedIcon}>⚡</span>
            <strong>QuickBooks Online Sync</strong>
            <p>1-Click bi-directional synchronization for invoices, line items, customers, and payments reconciliation.</p>
          </div>
          <div className={styles.includedCard}>
            <span className={styles.includedIcon}>💳</span>
            <strong>Stripe Certified Payments</strong>
            <p>Bank-grade direct deposits, Apple Pay / Google Pay, card-on-file, and automated review collection.</p>
          </div>
        </div>
      </section>

      {/* 5. Optional Cost Calculator */}
      <div id="savings-calculator" style={{ scrollMarginTop: '80px' }} />
      <section className={styles.calculatorSection} id="calculator">
        <div className={styles.sectionHeaderSplit}>
          <div>
            <p className={styles.sectionEyebrow}>INTERACTIVE MATH</p>
            <h2>Run your custom payment scenarios</h2>
            <p>See exactly how platform fees and subscriptions compare across all 4 plans as your revenue scales.</p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowCalculator((v) => !v)}
            aria-expanded={showCalculator}
          >
            {showCalculator ? 'Collapse calculator ▲' : 'Open interactive calculator ▼'}
          </button>
        </div>

        {showCalculator && (
          <div className={styles.calculatorWrapper}>
            <PricingCalculator
              billing={billing}
              volume={recommenderVolume}
              officeUsers={seatsNum}
              onBillingChange={(b) => setBilling(b)}
              onVolumeChange={(v) => setRecommenderVolume(v)}
              onOfficeUsersChange={(u) => {
                if (u <= 1) setRecommenderTeam('solo');
                else if (u <= 3) setRecommenderTeam('small');
                else if (u <= 8) setRecommenderTeam('growth');
                else setRecommenderTeam('scale');
              }}
            />
          </div>
        )}
      </section>

      {/* 6. Detailed Feature Comparison & Allowances */}
      <section className={styles.compareSection} id="comparison">
        <details className={styles.disclosure}>
          <summary className={styles.disclosureSummary}>
            <div>
              <span className={styles.sectionEyebrow}>DETAILED ALLOWANCES</span>
              <h3 style={{ margin: '4px 0 0', fontSize: '20px', color: '#ffffff' }}>
                Full feature comparison &amp; plan limits
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9db0bd' }}>
                Click to inspect line-by-line allowances, team seats, messaging credits, and optional add-ons.
              </p>
            </div>
            <span className={styles.disclosurePlus}>+</span>
          </summary>

          <div className={styles.disclosureBody}>
            <div className={styles.categoryTabs} role="tablist" aria-label="Feature categories">
              {COMPARISON_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={comparisonCategory === cat.id}
                  className={comparisonCategory === cat.id ? styles.categoryTabActive : styles.categoryTab}
                  onClick={() => setComparisonCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className={styles.tableScroll} tabIndex={0}>
              <table className={styles.comparisonTable}>
                <caption className={styles.srOnly}>Detailed comparison of Flex, Solo, Growth, and Scale</caption>
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    {PLANS.map((plan) => (
                      <th scope="col" key={plan.id}>
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.filter(([label]) => {
                    if (comparisonCategory === 'all') return true;
                    return ROW_CATEGORY_MAP[label] === comparisonCategory;
                  }).map(([label, ...values]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {values.map((val, idx) => (
                        <td key={`${label}-${PLANS[idx].id}`}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Margin-safe Top-ups */}
            <div style={{ marginTop: '28px' }}>
              <h4 style={{ fontSize: '16px', color: '#ffd166', margin: '0 0 8px' }}>
                Optional Usage Top-Ups (Margin-Safe &amp; Opt-in Only)
              </h4>
              <p style={{ fontSize: '13px', color: '#9db0bd', margin: '0 0 14px' }}>
                No surprise overages — extra usage is off unless you switch it on and set your own spending limit, at a price you see before you pay.
              </p>
              <div className={styles.addOnList}>
                {ADD_ONS.map((item) => (
                  <div key={item.label} className={styles.addOnItem}>
                    <span>
                      <strong>{item.label}</strong>
                      <small style={{ display: 'block', color: '#9db0bd', fontSize: '12px' }}>{item.eligibility}</small>
                    </span>
                    <b style={{ color: '#50e3bd' }}>{item.price}</b>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor Benchmarking Link */}
            <div className={styles.competitorLinkBanner}>
              <div>
                <strong>Want to see how Let&apos;s Get Quoted compares to Jobber, Housecall Pro, or ServiceTitan?</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9db0bd' }}>
                  View transparent competitor list pricing and side-by-side feature breakdowns on our comparison hub.
                </p>
              </div>
              <Link href="/compare" className={styles.secondaryButton}>
                See Competitor Comparisons &rarr;
              </Link>
            </div>
          </div>
        </details>
      </section>

      {/* 7. Short FAQ (Top 6 Purchasing Questions) & Final CTA */}
      <section className={styles.faqSection} id="faq">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>FREQUENTLY ASKED QUESTIONS</p>
          <h2>Questions contractors ask before starting</h2>
          <p>Clear answers without the sales runaround.</p>
        </div>

        <div className={styles.faqGrid}>
          {(showAllFaqs ? PRICING_FAQS : PRICING_FAQS.slice(0, 6)).map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary className={styles.faqSummary}>
                <span>{item.q}</span>
                <span className={styles.faqIcon}>+</span>
              </summary>
              <p className={styles.faqAnswer}>{item.a}</p>
            </details>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button
            type="button"
            className={styles.faqMoreButton}
            onClick={() => setShowAllFaqs((v) => !v)}
          >
            {showAllFaqs ? 'Show fewer questions' : `Show all ${PRICING_FAQS.length} pricing questions`}
          </button>
        </div>

        {/* Final Conversion CTA */}
        <div className={styles.finalCta}>
          <div className={styles.finalCtaContent}>
            <p className={styles.sectionEyebrow}>START WINNING MORE JOBS</p>
            <h2>From first click to final payment. Run it all in one place.</h2>
            <p>
              Start free on Flex with $0 monthly base, or pick the plan with the team seats and messaging capacity you need.
            </p>
            <div className={styles.heroActions} style={{ justifyContent: 'center' }}>
              <a
                href={buildStartUrl({ goal: 'build_site', source: 'pricing_footer' })}
                className={styles.primaryButton}
              >
                Build my free site &rarr;
              </a>
              <Link href="/contact" className={styles.secondaryButton}>
                Talk to our team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
