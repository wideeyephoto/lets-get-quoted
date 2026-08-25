'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import PricingCalculator from './PricingCalculator';
import {
  ADD_ONS,
  COMPARISON_ROWS,
  ENTERPRISE,
  PLANS,
  PRICING_FAQS,
  annualPlanEstimate,
  annualPlanCost,
  planCrossover,
  VOICE_PURCHASABLE,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from './pricing-catalog';
import styles from './pricing.module.css';

const CARD_FEATURES: Record<PlanId, readonly string[]> = {
  flex: [
    'Unlimited leads, quotes, jobs & invoices',
    '1 Office user + 2 Crew users included',
    '2-Way customer messaging on shared line',
    'Custom domain + SEO website included',
    '1 QuickBooks Online sync included',
  ],
  solo: [
    '0.50% lower LGQ platform fee',
    '500 text credits + 300 AI credits/mo (Intake & Drafts)',
    '2-Way customer text messaging included',
    'Custom domain + SEO website included',
    '1 QuickBooks Online sync included',
  ],
  growth: [
    '5 Office users + 10 Crew users included',
    '0.25% platform fee (save on every invoice)',
    '1,500 text credits + 750 AI credits/mo (Intake & Drafts)',
    'Team dispatch & central scheduling',
    '1 QuickBooks Online sync included',
  ],
  scale: [
    '0.10% lowest LGQ platform fee',
    '15 Office users + 50 Crew users included',
    '3,000 text credits + 1,500 AI credits/mo (Intake & Drafts)',
    '250 GB photo and job file storage',
    '1 QuickBooks Online sync included',
  ],
};

const PLAN_STAGES: Record<PlanId, { label: string; shortLabel: string; number: string; persona: string }> = {
  flex: { label: 'Seasonal / starting out', shortLabel: 'Start', number: '01', persona: 'Handyman · Solo Lawn · Seasonal' },
  solo: { label: 'Owner-operator', shortLabel: 'Own', number: '02', persona: 'Electrician · Plumber · Painter' },
  growth: { label: 'Growing team', shortLabel: 'Grow', number: '03', persona: 'HVAC · Remodeling · 2–10 Crew' },
  scale: { label: 'High volume', shortLabel: 'Scale', number: '04', persona: 'Roofing · Multi-Truck · GC' },
};

const TRADE_PRESETS = [
  { trade: '⚡ Electrical & Plumbing', volume: 250_000, users: 2, plan: 'growth' as PlanId, desc: 'Owner + 1 Office, steady invoices' },
  { trade: '🌿 Landscaping & Lawn', volume: 140_000, users: 1, plan: 'solo' as PlanId, desc: 'Solo operator with crew in field' },
  { trade: '🏠 Roofing & Siding', volume: 850_000, users: 5, plan: 'growth' as PlanId, desc: 'High ticket size, team dispatch' },
  { trade: '🔨 Handyman & Painting', volume: 45_000, users: 1, plan: 'flex' as PlanId, desc: 'Starting out / zero monthly base' },
  { trade: '🏗️ General Contractor', volume: 1_800_000, users: 8, plan: 'scale' as PlanId, desc: 'High volume, lowest 0.1% fee' },
] as const;

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

const SCENARIOS: readonly {
  planId: PlanId;
  revenue: number;
  title: string;
  description: string;
}[] = [
  {
    planId: 'flex',
    revenue: 40_000,
    title: 'Seasonal handyman',
    description: 'Keeps fixed costs at zero while the business finds its rhythm.',
  },
  {
    planId: 'solo',
    revenue: 250_000,
    title: 'Owner-operator electrician',
    description: 'Gets a much lower platform fee and expanded messaging capacity.',
  },
  {
    planId: 'growth',
    revenue: 600_000,
    title: 'Landscaping team',
    description: 'Adds office and field capacity without paying per core record.',
  },
  {
    planId: 'scale',
    revenue: 2_000_000,
    title: 'High-volume roofer',
    description: 'Pairs the lowest LGQ platform fee with predictable software cost.',
  },
];

const COMPARISON_HIGHLIGHTS = [
  { value: '1.25% → 0.1%', label: 'Choose a plan with the fee that fits' },
  { value: '1 → 15', label: 'Office seats scale with your team' },
  { value: '100%', label: 'QuickBooks Online connection included on every plan' },
  { value: 'Unlimited', label: 'Core records: leads, quotes, jobs & invoices' },
] as const;

const COMPETITORS = [
  {
    provider: 'Let’s Get Quoted',
    plan: 'Growth',
    monthly: '$129 + 0.25%',
    annual: '$99 + 0.25%',
    users: '5 office + 10 crew',
    phone: '2-way messaging and shared business line included',
    href: '#plans',
  },
  {
    provider: 'Jobber',
    plan: 'Connect',
    monthly: '$199',
    annual: '$149',
    users: '5 users',
    phone: 'Receptionist add-on starts at $29',
    href: 'https://www.getjobber.com/pricing/',
  },
  {
    provider: 'Housecall Pro',
    plan: 'Essentials',
    monthly: '$189',
    annual: '$149',
    users: '5 users',
    phone: 'CSR AI sold separately',
    href: 'https://www.housecallpro.com/pricing/',
  },
  {
    provider: 'Contractor+',
    plan: 'Pro Team (5 users)',
    monthly: '$185',
    annual: '$118',
    users: '5 users',
    phone: 'Phone usage metered separately',
    href: 'https://support.contractorplus.app/en/articles/9476522-contractor-pricing-plans',
  },
  {
    provider: 'QuoteIQ',
    plan: 'Elite',
    monthly: '$299',
    annual: 'About $249',
    users: 'Up to 10 users',
    phone: 'AI uses shared IQ credits',
    href: 'https://myquoteiq.com/pricing/',
  },
] as const;

const SECTION_IDS = ['plans', 'calculator', 'compare', 'questions'] as const;

const NAV_ITEMS = [
  { id: 'plans', label: 'Plans', mobileLabel: 'Plans' },
  { id: 'calculator', label: 'Cost calculator', mobileLabel: 'Calculator' },
  { id: 'compare', label: 'Compare', mobileLabel: 'Compare' },
  { id: 'questions', label: 'Questions', mobileLabel: 'FAQ' },
] as const;

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

function signupHref(plan: PlanId, billing: BillingCycle): string {
  return `${APP_SIGNUP_URL}&${[`plan=${plan}`, `billing=${billing}`].join('&')}`;
}

function InfoBubble({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={styles.infoBubble}>
      <summary aria-label={`More information about ${label}`}>i</summary>
      <div>{children}</div>
    </details>
  );
}



export default function PricingExperience() {
  const [billing, setBilling] = useState<BillingCycle>('annual');
  const [volume, setVolume] = useState(40_000);
  const [spotlightPlan, setSpotlightPlan] = useState<PlanId | null>(null);
  const [activeSection, setActiveSection] = useState<string>('plans');
  const [expandedMobilePlan, setExpandedMobilePlan] = useState<PlanId | null>(null);
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  const [officeUsers, setOfficeUsers] = useState(1);
  const [hasUsedCalculator, setHasUsedCalculator] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showSeasonalRhythm, setShowSeasonalRhythm] = useState(false);
  const [showMobileScenarios, setShowMobileScenarios] = useState(false);
  const [comparisonCategory, setComparisonCategory] = useState<ComparisonCategory>('all');
  const [fitMode, setFitMode] = useState<'stage' | 'trade'>('trade');

  const filteredComparisonRows = useMemo(() => {
    if (comparisonCategory === 'all') return COMPARISON_ROWS;
    return COMPARISON_ROWS.filter(([label]) => ROW_CATEGORY_MAP[label] === comparisonCategory);
  }, [comparisonCategory]);

  const recommendation = useMemo(() => PLANS.map((plan) => ({
    plan,
    annualCost: annualPlanEstimate(plan, billing, volume, VOICE_PURCHASABLE, officeUsers, false),
  })).filter((result): result is typeof result & { annualCost: number } => result.annualCost !== null)
    .sort((a, b) => a.annualCost - b.annualCost)[0], [billing, officeUsers, volume]);

  const scaleCrossover = planCrossover(getPlan('growth'), getPlan('scale'), billing, VOICE_PURCHASABLE);
  const markCalculatorUsed = () => { setHasUsedCalculator(true); setStickyDismissed(false); };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlVolume = Number(params.get('volume'));
    const urlBilling = params.get('billing');
    const urlUsers = Number(params.get('users'));

    if (Number.isFinite(urlVolume) && urlVolume > 0) {
      setVolume(Math.min(3_000_000, urlVolume));
      setHasUsedCalculator(true);
    }
    if (urlBilling === 'monthly' || urlBilling === 'annual') {
      setBilling(urlBilling);
    }
    if (Number.isFinite(urlUsers) && urlUsers >= 1) {
      setOfficeUsers(Math.min(25, Math.max(1, Math.round(urlUsers))));
      setHasUsedCalculator(true);
    }
  }, []);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (section): section is HTMLElement => section !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: '-25% 0px -60% 0px', threshold: [0, 0.1, 0.35] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>Pricing built for working contractors</p>
            <h1>Start free. Pay less as you grow.</h1>
            <p className={styles.heroLead}>
              One system for seasonal work—from your first side job to a high-volume crew—with pricing that gets more
              efficient at every stage.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#plans">Find my fit</a>
              <a className={styles.secondaryButton} href="#calculator">Run my numbers</a>
            </div>
            <div className={styles.heroSubMeta}>
              <ul className={styles.heroProof} aria-label="Pricing highlights">
                <li>QuickBooks on every plan</li>
                <li>Free onboarding</li>
                <li>No forced upgrades</li>
              </ul>
              <a className={styles.seasonalHeroLink} href="#seasonal-flex">
                <span aria-hidden="true">01</span>
                Seasonal contractor? See why Flex fits →
              </a>
            </div>
          </div>

          <aside className={styles.heroBoard} aria-label="How LGQ pricing grows with a contractor">
            <div className={styles.boardTopline}>
              <p className={styles.boardLabel}>Your growth path</p>
              <span>Fixed cost rises</span>
            </div>
            <ol className={styles.growthPath}>
              {PLANS.map((plan, index) => {
                const isSelected = spotlightPlan === plan.id;
                return (
                  <li
                    data-plan={plan.id}
                    key={plan.id}
                    className={isSelected ? styles.growthPathActive : undefined}
                    onClick={() => setSpotlightPlan((selected) => selected === plan.id ? null : plan.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    title={`Click to highlight the ${plan.name} plan`}
                  >
                    <span className={styles.pathNumber}>{PLAN_STAGES[plan.id].number}</span>
                    <div>
                      <span>{PLAN_STAGES[plan.id].label}</span>
                      <strong>{plan.name}</strong>
                    </div>
                    <div className={styles.pathPrice}>
                      <strong>${plan.annualMonthly}<small>/mo</small></strong>
                      <span>{paymentFee(plan)} platform fee</span>
                    </div>
                    {index < PLANS.length - 1 ? <i aria-hidden="true" /> : null}
                  </li>
                );
              })}
            </ol>
            <div className={styles.boardFooter}>
              <span><b>$0</b> to start</span>
              <span><b>0.1%</b> at scale</span>
            </div>
            <p className={styles.boardNote}>Annual monthly equivalent shown. Stripe processing is separate.</p>
          </aside>
        </div>
      </section>

      <nav className={styles.sectionNav} aria-label="Pricing sections">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            data-active={activeSection === item.id}
            aria-current={activeSection === item.id ? 'location' : undefined}
          >
            <span className={styles.navDesktopLabel}>{item.label}</span>
            <span className={styles.navMobileLabel}>{item.mobileLabel}</span>
          </a>
        ))}
      </nav>

      <section className={styles.plansSection} id="plans">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Choose what fits today</p>
            <h2>Four stages. One clear next step.</h2>
            <p>Start with how you work. Then let the calculator check the math.</p>
          </div>

          <div className={styles.billingToggle} role="group" aria-label="Billing cycle">
            <button
              type="button"
              aria-pressed={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billing === 'annual'}
              onClick={() => setBilling('annual')}
            >
              Annual <span>Save up to $360</span>
            </button>
          </div>
        </div>

        <div className={styles.fitFinder}>
          <div className={styles.fitFinderHeader}>
            <div>
              <span className={styles.miniEyebrow}>Quick fit finder · 30-second match</span>
              <strong className={styles.fitFinderTitle}>Find your contractor tier instantly</strong>
            </div>
            <div className={styles.fitFinderModes} role="group" aria-label="Fit finder mode">
              <button
                type="button"
                className={fitMode === 'trade' ? styles.fitModeActive : styles.fitModeBtn}
                aria-pressed={fitMode === 'trade'}
                onClick={() => setFitMode('trade')}
              >
                By Trade Preset
              </button>
              <button
                type="button"
                className={fitMode === 'stage' ? styles.fitModeActive : styles.fitModeBtn}
                aria-pressed={fitMode === 'stage'}
                onClick={() => setFitMode('stage')}
              >
                By Business Stage
              </button>
            </div>
          </div>

          {fitMode === 'trade' ? (
            <div className={styles.tradePresetGrid} role="group" aria-label="Contractor trade presets">
              {TRADE_PRESETS.map((item) => {
                const isActive = spotlightPlan === item.plan && volume === item.volume;
                return (
                  <button
                    type="button"
                    key={item.trade}
                    className={`${styles.tradePresetCard}${isActive ? ` ${styles.tradePresetActive}` : ''}`}
                    aria-pressed={isActive}
                    onClick={() => {
                      setSpotlightPlan(item.plan);
                      setVolume(item.volume);
                      setOfficeUsers(item.users);
                      setHasUsedCalculator(true);
                    }}
                  >
                    <strong className={styles.tradePresetName}>{item.trade}</strong>
                    <span className={styles.tradePresetDesc}>{item.desc}</span>
                    <small className={styles.tradePresetMeta}>Sets {money(item.volume)}/yr · {item.users} office</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.stagePresetGrid} role="group" aria-label="Business stage">
              {PLANS.map((plan) => (
                <button
                  type="button"
                  key={plan.id}
                  data-plan={plan.id}
                  className={`${styles.stagePresetBtn}${spotlightPlan === plan.id ? ` ${styles.stagePresetActive}` : ''}`}
                  aria-pressed={spotlightPlan === plan.id}
                  onClick={() => setSpotlightPlan((selected) => (selected === plan.id ? null : plan.id))}
                >
                  <span className={styles.stageNumber}>{PLAN_STAGES[plan.id].number}</span>
                  <span className={styles.stageLabel}>{PLAN_STAGES[plan.id].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.planGrid}>
          {PLANS.map((plan) => {
            const selectedPrice = price(plan, billing);
            const annualTotal = plan.annualMonthly * 12;
            const annualSavings = (plan.monthly - plan.annualMonthly) * 12;
            const isSpotlighted = spotlightPlan === plan.id;
            const isExpandedOnMobile = plan.id === 'flex' || expandedMobilePlan === plan.id;
            return (
              <article
                key={plan.id}
                className={`${styles.planCard}${plan.featured ? ` ${styles.featuredCard}` : ''}${isSpotlighted ? ` ${styles.spotlightCard}` : ''}`}
                data-plan={plan.id}
                data-expanded={isExpandedOnMobile}
              >
                <div className={styles.planAccent} />
                <div className={styles.planIdentity}>
                  <span>{PLAN_STAGES[plan.id].number}</span>
                  <small>{PLAN_STAGES[plan.id].shortLabel}</small>
                </div>
                {isSpotlighted ? (
                  <span className={styles.matchBadge}>Your match</span>
                ) : plan.id === 'flex' ? (
                  <span className={styles.seasonalBadge}>Seasonal favorite</span>
                ) : plan.featured ? (
                  <span className={styles.featuredBadge}>Best for teams</span>
                ) : null}
                <p className={styles.planAudience}>{plan.audience}</p>
                <h3>{plan.name}</h3>
                <p className={styles.planPromise}>{plan.promise}</p>

                <div className={styles.planPrice}>
                  <strong>${selectedPrice}</strong>
                  <span>/month</span>
                </div>
                {plan.id === 'flex' ? (
                  <p className={styles.billingDetail}>No subscription · optional top-ups only</p>
                ) : billing === 'annual' ? (
                  <p className={styles.billingDetail}>
                    ${annualTotal.toLocaleString()}/year prepaid · save ${annualSavings}/year
                  </p>
                ) : (
                  <p className={styles.billingDetail}>Month-to-month · no annual commitment</p>
                )}

                <div className={styles.feeLine}>
                  <span>LGQ platform fee</span>
                  <strong>{paymentFee(plan)}</strong>
                  <InfoBubble label={`${plan.name} LGQ platform fee`}>
                    Applied only to the discount-adjusted service subtotal successfully collected through LGQ.
                    Separately stated tax, tips, Stripe fees, refunds, and credits are excluded.
                  </InfoBubble>
                </div>

                {plan.id === 'scale' ? (
                  <p className={styles.scaleBreakpoint}>
                    <span>Base-plan price crossover</span>
                    <strong>Usually lowest-cost above {money(scaleCrossover)}/year collected.</strong>
                  </p>
                ) : null}

                {plan.id !== 'flex' ? (
                  <button
                    type="button"
                    className={styles.mobilePlanToggle}
                    aria-expanded={isExpandedOnMobile}
                    aria-controls={`plan-highlights-${plan.id}`}
                    onClick={() => setExpandedMobilePlan((expanded) => (expanded === plan.id ? null : plan.id))}
                  >
                    {isExpandedOnMobile ? 'Hide key features' : 'See key features'}
                  </button>
                ) : null}

                <div className={styles.planHighlights} id={`plan-highlights-${plan.id}`}>
                  <ul className={styles.cardFeatures}>
                    {CARD_FEATURES[plan.id].map((feature) => (
                      <li key={feature}>
                        <span className={styles.featureCheckmark} aria-hidden="true">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  className={
                    plan.id === 'flex'
                      ? styles.seasonalButton
                      : plan.featured || isSpotlighted
                        ? styles.primaryButton
                        : styles.planButton
                  }
                  href={signupHref(plan.id, billing)}
                >
                  <span>{plan.id === 'flex' ? 'Start with Flex' : `Choose ${plan.name}`}</span>
                  <span className={styles.btnArrow} aria-hidden="true">→</span>
                </a>

                <details className={styles.cardDetails}>
                  <summary>See every included item</summary>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </details>
              </article>
            );
          })}
        </div>

        <aside className={styles.seasonalFeature} id="seasonal-flex">
          <div className={styles.seasonalCopy}>
            <p className={styles.sectionEyebrow}>Seasonal contractor? This is your plan.</p>
            <h3>Flex stays light when work slows down.</h3>
            <p>
              There is no monthly base subscription. Pay the 1.25% LGQ platform fee only on eligible payments you actually
              collect, then move up when the math or your team makes sense.
            </p>
            <button
              type="button"
              className={styles.mobileDisclosureButton}
              aria-expanded={showSeasonalRhythm}
              aria-controls="seasonal-rhythm"
              onClick={() => setShowSeasonalRhythm((shown) => !shown)}
            >
              {showSeasonalRhythm ? 'Hide seasonal cost rhythm' : 'See the seasonal cost rhythm'}
            </button>
          </div>
          <ol
            id="seasonal-rhythm"
            className={styles.seasonalRhythm}
            data-mobile-expanded={showSeasonalRhythm}
            aria-label="How Flex follows a seasonal business"
          >
            <li><span>Quiet months</span><strong>$0</strong><small>monthly base</small></li>
            <li><span>Jobs come in</span><strong>1.25%</strong><small>eligible payments</small></li>
            <li><span>Business grows</span><strong>Your call</strong><small>upgrade when ready</small></li>
          </ol>
          <a className={styles.seasonalButton} href={signupHref('flex', billing)}>
            Start with Flex
          </a>
        </aside>

        <div className={styles.quickOptions} aria-label="Fine-tune plan options">
          <div className={styles.quickOptionsIntro}>
            <span className={styles.miniEyebrow}>Included on every plan</span>
            <strong>Tools ready to run on day one.</strong>
          </div>
          <div className={`${styles.quickOptionGroup} ${styles.includedOption}`}>
            <div className={styles.includedOptionBody}>
              <span className={styles.quickIcon} aria-hidden="true">2W</span>
              <span>
                <strong>2-Way Customer Messaging</strong>
                <small>Keep customer texts and replies organized in one team inbox</small>
              </span>
              <b>Included</b>
            </div>
            <Link className={styles.quickLearnMore} href="/demo/messages">
              See the messaging demo →
            </Link>
          </div>
          <div className={`${styles.quickOptionGroup} ${styles.includedOption}`}>
            <div className={styles.includedOptionBody}>
              <span className={styles.quickIcon} aria-hidden="true">QB</span>
              <span>
                <strong>QuickBooks Online Integration</strong>
                <small>1-click sync for invoices, customer records, and payment reconciliation</small>
              </span>
              <b>Included</b>
            </div>
            <Link className={styles.quickLearnMore} href="/features/back-office">
              Learn about QuickBooks sync →
            </Link>
          </div>
        </div>

        <div className={styles.trustStrip} aria-label="LGQ Guarantees and Security">
          <div className={styles.trustItem}>
            <span className={styles.trustIcon} aria-hidden="true">🛡️</span>
            <div>
              <strong>30-Day Guarantee</strong>
              <p>Risk-free refund on prepaid annual base plans.</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <span className={styles.trustIcon} aria-hidden="true">⚡</span>
            <div>
              <strong>Zero Setup Fees</strong>
              <p>Self-guided onboarding & quick tour included.</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <span className={styles.trustIcon} aria-hidden="true">🔒</span>
            <div>
              <strong>Stripe Certified</strong>
              <p>256-bit bank-grade encryption with direct deposit.</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <span className={styles.trustIcon} aria-hidden="true">🤝</span>
            <div>
              <strong>QuickBooks Sync</strong>
              <p>1-Click ledger connection included on every plan.</p>
            </div>
          </div>
        </div>

        <div className={styles.enterpriseStrip}>
          <div>
            <p className={styles.sectionEyebrow}>Multiple companies or custom operations</p>
            <h3>Enterprise starts at ${ENTERPRISE.startingMonthly}/month</h3>
            <p>
              One master agreement with separate workspaces and ledgers. A limited two-workspace package starts at $
              {ENTERPRISE.startingMonthly}; two workspaces with full Scale-level capacity are typically quoted around $
              {ENTERPRISE.fullScaleDuoMonthly}/month.
            </p>
          </div>
          <Link className={styles.secondaryButton} href="/contact">
            Talk through Enterprise
          </Link>
        </div>
      </section>

      <section className={styles.scenarioSection} aria-labelledby="scenario-heading">
        <div className={styles.scenarioIntro}>
          <p className={styles.sectionEyebrow}>Picture your business here</p>
          <h2 id="scenario-heading">What the journey can look like.</h2>
          <p>Modeled examples using annual billing and eligible payment volume. Your exact fit may differ.</p>
          <button
            type="button"
            className={styles.mobileDisclosureButton}
            aria-expanded={showMobileScenarios}
            aria-controls="scenario-examples"
            onClick={() => setShowMobileScenarios((shown) => !shown)}
          >
            {showMobileScenarios ? 'Hide example businesses' : 'See example businesses'}
          </button>
        </div>
        <div id="scenario-examples" className={styles.scenarioTrack} data-mobile-expanded={showMobileScenarios}>
          {SCENARIOS.map((scenario) => {
            const plan = getPlan(scenario.planId);
            const cost = annualPlanCost(plan, 'annual', scenario.revenue, false);
            return (
              <article key={scenario.planId} data-plan={scenario.planId}>
                <div className={styles.scenarioMarker}>{PLAN_STAGES[plan.id].number}</div>
                <p>{scenario.title}</p>
                <h3>{money(scenario.revenue)} collected</h3>
                <span>
                  {plan.name} · about {money(cost / 12)}/month
                </span>
                <small>{scenario.description}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.calculatorSection} id="calculator">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Run your real numbers</p>
            <h2>Find the point where your plan should change.</h2>
            <p>The math responds instantly to payment volume and billing cadence.</p>
          </div>
        </div>
        <PricingCalculator
          billing={billing}
          volume={volume}
          officeUsers={officeUsers}
          onBillingChange={(value) => {
            setBilling(value);
            markCalculatorUsed();
          }}
          onVolumeChange={(value) => {
            setVolume(value);
            markCalculatorUsed();
          }}
          onOfficeUsersChange={(value) => {
            setOfficeUsers(Math.min(25, Math.max(1, Math.round(value || 1))));
            markCalculatorUsed();
          }}
        />
      </section>

      <section className={styles.compareSection} id="compare">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Straight answers before checkout</p>
            <h2>Compare the details without squinting.</h2>
          </div>
          <p className={styles.compareIntro}>
            Core business records stay unlimited. We meter only the services that create real usage cost.
          </p>
        </div>

        <div className={styles.comparisonHighlights}>
          {COMPARISON_HIGHLIGHTS.map((item, index) => (
            <div key={item.label}>
              <span>0{index + 1}</span>
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </div>
          ))}
        </div>

        <details className={styles.disclosure}>
          <summary>
            <span>
              <strong>Full LGQ feature comparison</strong>
              <small>Every allowance and plan gate</small>
            </span>
            <b aria-hidden="true">+</b>
          </summary>
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
          <p className={styles.tableHint}>Swipe horizontally to compare all plans →</p>
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
                {filteredComparisonRows.map(([label, ...values]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((value, index) => (
                      <td key={`${label}-${PLANS[index].id}`}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className={styles.disclosureGrid}>
          <details className={styles.disclosure}>
            <summary>
              <span>
                <strong>Optional capacity top-ups</strong>
                <small>Margin-safe, opt-in capacity</small>
              </span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className={styles.addOnList}>
              {ADD_ONS.map((item) => (
                <div key={item.label}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.eligibility}</small>
                  </span>
                  <b>{item.price}</b>
                </div>
              ))}
            </div>
          </details>

          <details className={styles.disclosure}>
            <summary>
              <span>
                <strong>Published competitor rates</strong>
                <small>Closest public team tiers</small>
              </span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className={styles.tableScroll} tabIndex={0}>
              <table className={styles.competitorTable}>
                <caption className={styles.srOnly}>LGQ Growth compared with four contractor software team plans</caption>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Plan</th>
                    <th>Monthly</th>
                    <th>Annual equivalent</th>
                    <th>Users</th>
                    <th>Phone / Messaging</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPETITORS.map((row) => (
                    <tr key={row.provider}>
                      <th scope="row">
                        <a href={row.href}>{row.provider}</a>
                      </th>
                      <td>{row.plan}</td>
                      <td>{row.monthly}</td>
                      <td>{row.annual}</td>
                      <td>{row.users}</td>
                      <td>{row.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.competitorNote}>
              Public USD list prices checked August 14, 2026; limited-time promotions excluded. LGQ percentages are
              platform fees. “No published percentage” elsewhere does not mean payment processing, phone, AI, seats,
              or add-ons are free. Plans are not feature-identical.
            </p>
          </details>
        </div>
      </section>

      <section className={styles.promiseSection}>
        <div>
          <strong>Unlimited core work</strong>
          <span>Leads, clients, quotes, jobs, invoices, and standard forms.</span>
        </div>
        <div>
          <strong>No surprise overages</strong>
          <span>Extra usage is off unless you switch it on and set your own spending limit.</span>
        </div>
        <div>
          <strong>No lost website leads</strong>
          <span>When AI Intake ends, LGQ switches to the normal quote form.</span>
        </div>
        <div>
          <strong>Bring your books</strong>
          <span>One QuickBooks Online connection is included on every plan.</span>
        </div>
      </section>

      <section className={styles.faqSection} id="questions">
        <div className={styles.faqIntro}>
          <p className={styles.sectionEyebrow}>The fine print, in plain English</p>
          <h2>Questions contractors actually ask.</h2>
          <p>Still unsure which plan fits? We’ll talk through the math with you.</p>
          <Link className={styles.secondaryButton} href="/contact">
            Ask a real person
          </Link>
        </div>

        <div className={styles.faqContent}>
          <div id="pricing-faqs" className={`${styles.faqGrid}${showAllFaqs ? ` ${styles.faqGridExpanded}` : ''}`}>
            {(showAllFaqs ? PRICING_FAQS : PRICING_FAQS.slice(0, 6)).map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>
                  <span>{item.q}</span>
                  <span className={styles.faqToggleIcon} aria-hidden="true">+</span>
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>

          <button
            type="button"
            className={styles.faqMoreButton}
            aria-expanded={showAllFaqs}
            aria-controls="pricing-faqs"
            onClick={() => setShowAllFaqs((shown) => !shown)}
          >
            {showAllFaqs ? 'Show fewer questions' : `Show all ${PRICING_FAQS.length} questions`}
          </button>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalCtaCopy}>
          <p className={styles.sectionEyebrow}>Built for your busy season and beyond</p>
          <h2>Keep costs light when work slows. Keep the same system when it takes off.</h2>
          <p>Flex starts at $0/month plus 1.25% on eligible payments. Upgrade only when the math or your team says it is time.</p>
          <div className={styles.heroActions}>
            <a className={styles.seasonalButton} href={signupHref('flex', billing)}>
              Start with Flex
            </a>
            <Link className={styles.secondaryButton} href="/contact">
              Talk to a real person
            </Link>
          </div>
        </div>
        <ol className={styles.finalPath} aria-label="LGQ plan journey">
          {PLANS.map((plan) => (
            <li key={plan.id} data-plan={plan.id}>
              <span>{PLAN_STAGES[plan.id].number}</span>
              <strong>{plan.name}</strong>
              <small>{paymentFee(plan)} platform fee</small>
            </li>
          ))}
        </ol>
      </section>

      {hasUsedCalculator && !stickyDismissed ? (
        <aside
          className={styles.mobileRecommendation}
          data-plan={recommendation.plan.id}
          aria-label="Current plan recommendation"
        >
          <button
            type="button"
            className={styles.mobileRecommendationDismiss}
            aria-label="Dismiss recommendation"
            onClick={() => setStickyDismissed(true)}
          >
            ×
          </button>
          <div>
            <span>Your current best fit</span>
            <strong>
              {recommendation.plan.name} · {money(recommendation.annualCost / 12)}/mo effective
            </strong>
          </div>
          <a href={signupHref(recommendation.plan.id, billing)}>
            {recommendation.plan.id === 'flex' ? 'Start Flex' : `Choose ${recommendation.plan.name}`}
          </a>
        </aside>
      ) : null}
    </>
  );
}
