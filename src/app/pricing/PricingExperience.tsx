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
  VOICE_MONTHLY_BY_PLAN,
  annualPlanEstimate,
  annualPlanCost,
  planCrossover,
  VOICE_PURCHASABLE,
  VOICE_PLANNED_PRICE_LABEL,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from './pricing-catalog';
import styles from './pricing.module.css';

const CARD_FEATURES: Record<PlanId, readonly string[]> = {
  flex: [
    '$0 monthly base software bill',
    'Unlimited leads, quotes, jobs, and invoices',
    'Custom domain + QuickBooks Online',
  ],
  solo: [
    'Your own voice/text business number',
    '500 text + 250 AI Intake credits/month',
    'Custom domain + QuickBooks Online',
  ],
  growth: [
    '5 office users + 10 crew users',
    '1,500 text + 500 AI Intake credits/month',
    'AI Voice Receptionist coming soon',
  ],
  scale: [
    '0.1% LGQ platform fee',
    'AI Voice Receptionist coming soon',
    'At launch: 3 simultaneous AI calls + advanced routing',
  ],
};

const PLAN_STAGES: Record<PlanId, { label: string; shortLabel: string; number: string }> = {
  flex: { label: 'Seasonal / starting out', shortLabel: 'Start', number: '01' },
  solo: { label: 'Owner-operator', shortLabel: 'Own', number: '02' },
  growth: { label: 'Growing team', shortLabel: 'Grow', number: '03' },
  scale: { label: 'High volume', shortLabel: 'Scale', number: '04' },
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
    description: 'Gets a dedicated number and a much lower platform fee.',
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
  { value: '1 → 5', label: 'Office seats expand on Growth' },
  { value: 'Solo+', label: 'Dedicated business number' },
  { value: 'Coming soon', label: 'AI Voice Receptionist is not available yet' },
] as const;

const COMPETITORS = [
  {
    provider: 'Let’s Get Quoted',
    plan: 'Growth',
    monthly: '$129 + 0.25%',
    annual: '$99 + 0.25%',
    users: '5 office + 10 crew',
    phone: 'Dedicated number; AI Voice Receptionist coming soon',
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

const SECTION_IDS = ['plans', 'calculator', 'receptionist', 'compare', 'questions'] as const;

const NAV_ITEMS = [
  { id: 'plans', label: 'Plans', mobileLabel: 'Plans' },
  { id: 'calculator', label: 'Cost calculator', mobileLabel: 'Calculator' },
  { id: 'receptionist', label: 'AI Voice Receptionist', mobileLabel: 'AI Voice' },
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

function voiceDescription(plan: PricingPlan): string {
  const allowance = `${plan.voiceMinutes} AI-connected minutes`;
  // The minutes are the plan shape and are safe to show. The PRICE is not, while
  // nothing can be bought: "Included" on Scale would be the strongest false
  // claim on the page, because it reads as something already paid for.
  if (!VOICE_PURCHASABLE) return `At launch · ${allowance}`;
  return plan.id === 'scale'
    ? `Included · ${allowance}`
    : `$${VOICE_MONTHLY_BY_PLAN[plan.id]}/month · ${allowance}`;
}

function signupHref(plan: PlanId, billing: BillingCycle): string {
  // No voice parameter. It would have carried an intent to buy something that
  // cannot be provisioned, leaving the far side to guess what to do with it.
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

function AIVoiceReceptionistInfoBubble() {
  return (
    <InfoBubble label="AI Voice Receptionist">
      <p>
        AI Voice Receptionist will answer calls on your business number, gather the job details, and route the caller
        using your rules. It is in build and cannot be bought yet, and no plan includes it today.
      </p>
      <a href="#receptionist">See the planned AI Voice Receptionist allowances →</a>
    </InfoBubble>
  );
}

function MessagingInfoBubble() {
  return (
    <InfoBubble label="2-Way Messaging">
      <p>
        Keeps customer texts and your replies together in one inbox. Flex uses a shared LGQ texting number; paid
        plans include a dedicated business number. Outgoing messages use plan text credits.
      </p>
      <Link href="/demo/messages">Open the messaging demo →</Link>
    </InfoBubble>
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
  const [needsDedicatedNumber, setNeedsDedicatedNumber] = useState(false);
  const [hasUsedCalculator, setHasUsedCalculator] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showSeasonalRhythm, setShowSeasonalRhythm] = useState(false);
  const [showMobileScenarios, setShowMobileScenarios] = useState(false);
  const [showMobileVoicePlans, setShowMobileVoicePlans] = useState(false);

  const recommendation = useMemo(() => PLANS.map((plan) => ({
    plan,
    annualCost: annualPlanEstimate(plan, billing, volume, VOICE_PURCHASABLE, officeUsers, needsDedicatedNumber),
  })).filter((result): result is typeof result & { annualCost: number } => result.annualCost !== null)
    .sort((a, b) => a.annualCost - b.annualCost)[0], [billing, needsDedicatedNumber, officeUsers, volume]);

  const scaleCrossover = planCrossover(getPlan('growth'), getPlan('scale'), billing, VOICE_PURCHASABLE);
  const markCalculatorUsed = () => { setHasUsedCalculator(true); setStickyDismissed(false); };

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
            <a className={styles.seasonalHeroLink} href="#seasonal-flex">
              <span aria-hidden="true">01</span>
              Seasonal contractor? See why Flex fits →
            </a>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#plans">Find my fit</a>
              <a className={styles.secondaryButton} href="#calculator">Run my numbers</a>
            </div>
            <ul className={styles.heroProof} aria-label="Pricing highlights">
              <li>QuickBooks on every plan</li>
              <li>Free onboarding</li>
              <li>No forced upgrades</li>
            </ul>
          </div>

          <aside className={styles.heroBoard} aria-label="How LGQ pricing grows with a contractor">
            <div className={styles.boardTopline}>
              <p className={styles.boardLabel}>Your growth path</p>
              <span>Fixed cost rises</span>
            </div>
            <ol className={styles.growthPath}>
              {PLANS.map((plan, index) => (
                <li data-plan={plan.id} key={plan.id}>
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
              ))}
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
          <a key={item.id} href={`#${item.id}`} data-active={activeSection === item.id} aria-current={activeSection === item.id ? 'location' : undefined}>
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
            <button type="button" aria-pressed={billing === 'monthly'} onClick={() => setBilling('monthly')}>
              Monthly
            </button>
            <button type="button" aria-pressed={billing === 'annual'} onClick={() => setBilling('annual')}>
              Annual <span>Save up to $360</span>
            </button>
          </div>
        </div>

        <aside className={styles.seasonalFeature} id="seasonal-flex">
          <div className={styles.seasonalCopy}>
            <p className={styles.sectionEyebrow}>Seasonal contractor? This is your plan.</p>
            <h3>Flex stays light when work slows down.</h3>
            <p>
              There is no monthly base subscription. Pay the 1.25% LGQ platform fee only on eligible payments you actually
              collect, then move up when the math or your team makes sense.
            </p>
            <button type="button" className={styles.mobileDisclosureButton} aria-expanded={showSeasonalRhythm} aria-controls="seasonal-rhythm" onClick={() => setShowSeasonalRhythm((shown) => !shown)}>
              {showSeasonalRhythm ? 'Hide seasonal cost rhythm' : 'See the seasonal cost rhythm'}
            </button>
          </div>
          <ol id="seasonal-rhythm" className={styles.seasonalRhythm} data-mobile-expanded={showSeasonalRhythm} aria-label="How Flex follows a seasonal business">
            <li><span>Quiet months</span><strong>$0</strong><small>monthly base</small></li>
            <li><span>Jobs come in</span><strong>1.25%</strong><small>eligible payments</small></li>
            <li><span>Business grows</span><strong>Your call</strong><small>upgrade when ready</small></li>
          </ol>
          <a className={styles.seasonalButton} href={signupHref('flex', billing)}>
            Start with Flex
          </a>
        </aside>

        <div className={styles.fitFinder}>
          <div>
            <span className={styles.miniEyebrow}>Quick fit finder</span>
            <strong>Which sounds most like you?</strong>
          </div>
          <div role="group" aria-label="Business stage">
            {PLANS.map((plan) => (
              <button
                type="button"
                key={plan.id}
                data-plan={plan.id}
                aria-pressed={spotlightPlan === plan.id}
                onClick={() => setSpotlightPlan((selected) => selected === plan.id ? null : plan.id)}
              >
                <span>{PLAN_STAGES[plan.id].number}</span>
                {PLAN_STAGES[plan.id].label}
              </button>
            ))}
          </div>
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
                  <p className={styles.billingDetail}>${annualTotal.toLocaleString()}/year prepaid · save ${annualSavings}/year</p>
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
                    onClick={() => setExpandedMobilePlan((expanded) => expanded === plan.id ? null : plan.id)}
                  >
                    {isExpandedOnMobile ? 'Hide key features' : 'See key features'}
                  </button>
                ) : null}

                <div className={styles.planHighlights} id={`plan-highlights-${plan.id}`}>
                  <ul className={styles.cardFeatures}>
                    {CARD_FEATURES[plan.id].map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>

                  <div className={styles.selectedOptions}>
                    <div data-active={VOICE_PURCHASABLE && plan.id === 'scale'}>
                      <div className={styles.optionLabel}><b>AI Voice Receptionist</b><AIVoiceReceptionistInfoBubble /></div>
                      <span>{VOICE_PURCHASABLE ? (plan.id === 'scale' ? voiceDescription(plan) : 'Optional add-on') : 'Coming soon'}</span>
                    </div>
                    <div data-active="true">
                      <div className={styles.optionLabel}><b>2-Way Messaging</b><MessagingInfoBubble /></div>
                      <span>Included at launch · {plan.messagingSummary}</span>
                    </div>
                  </div>
                </div>

                <a className={plan.id === 'flex' ? styles.seasonalButton : plan.featured || isSpotlighted ? styles.primaryButton : styles.planButton} href={signupHref(plan.id, billing)}>
                  {plan.id === 'flex' ? 'Start with Flex' : `Choose ${plan.name}`}
                </a>

                <details className={styles.cardDetails}>
                  <summary>See every included item</summary>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                </details>
              </article>
            );
          })}
        </div>

        <div className={styles.quickOptions} aria-label="Fine-tune plan options">
          <div className={styles.quickOptionsIntro}>
            <span className={styles.miniEyebrow}>Fine-tune your plan</span>
            <strong>Add the tools you need now.</strong>
          </div>
          <div className={styles.quickOptionGroup}>
            <div className={styles.includedOptionBody}>
              <span className={styles.quickIcon} aria-hidden="true">AI</span>
              <span><strong>AI Voice Receptionist</strong><small>{VOICE_PLANNED_PRICE_LABEL}</small></span>
              <b>Coming soon</b>
            </div>
            <a className={styles.quickLearnMore} href="#receptionist">What AI Voice Receptionist includes →</a>
          </div>
          <div className={`${styles.quickOptionGroup} ${styles.includedOption}`}>
            <div className={styles.includedOptionBody}>
              <span className={styles.quickIcon} aria-hidden="true">2W</span>
              <span><strong>2-Way Messaging</strong><small>Included at launch on every plan · carrier registration pending</small></span>
              <b>Included</b>
            </div>
            <Link className={styles.quickLearnMore} href="/demo/messages">See the messaging demo →</Link>
          </div>
        </div>

        <div className={styles.enterpriseStrip}>
          <div>
            <p className={styles.sectionEyebrow}>Multiple companies or custom operations</p>
            <h3>Enterprise starts at ${ENTERPRISE.startingMonthly}/month</h3>
            <p>
              One master agreement with separate workspaces and ledgers. A limited two-workspace package starts at
              ${ENTERPRISE.startingMonthly}; two workspaces with full Scale-level capacity are typically quoted around
              ${ENTERPRISE.fullScaleDuoMonthly}/month.
            </p>
          </div>
          <Link className={styles.secondaryButton} href="/contact">Talk through Enterprise</Link>
        </div>
      </section>

      <section className={styles.scenarioSection} aria-labelledby="scenario-heading">
        <div className={styles.scenarioIntro}>
          <p className={styles.sectionEyebrow}>Picture your business here</p>
          <h2 id="scenario-heading">What the journey can look like.</h2>
          <p>Modeled examples using annual billing and eligible payment volume. Your exact fit may differ.</p>
          <button type="button" className={styles.mobileDisclosureButton} aria-expanded={showMobileScenarios} aria-controls="scenario-examples" onClick={() => setShowMobileScenarios((shown) => !shown)}>
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
                <span>{plan.name} · about {money(cost / 12)}/month</span>
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
            <p>The math responds instantly to payment volume, billing cadence, and live AI calls.</p>
          </div>
          <div className={styles.calculatorOptionRow}>
            <span>Include call coverage?</span>

          </div>
        </div>
        <PricingCalculator
          billing={billing}
          volume={volume}
          officeUsers={officeUsers}
          needsDedicatedNumber={needsDedicatedNumber}
          onBillingChange={(value) => { setBilling(value); markCalculatorUsed(); }}
          onVolumeChange={(value) => { setVolume(value); markCalculatorUsed(); }}
          onOfficeUsersChange={(value) => { setOfficeUsers(Math.min(25, Math.max(1, Math.round(value || 1)))); markCalculatorUsed(); }}
          onDedicatedNumberChange={(value) => { setNeedsDedicatedNumber(value); markCalculatorUsed(); }}
        />
      </section>

      <section className={styles.voiceSection} id="receptionist">
        <div className={styles.voiceStory}>
          <div>
            <p className={styles.sectionEyebrow}>Coming soon · not yet available</p>
            <h2>Your phone will keep working when you can’t answer.</h2>
            <p>
              AI Voice Receptionist will answer, gather the job details, and route the caller using your rules—even
              after hours. It is in build and cannot be bought yet.
            </p>
            <div className={styles.voiceProof}>
              <strong>{VOICE_PLANNED_PRICE_LABEL}</strong>
              <span>Nothing to buy today, and no plan includes it yet. Minutes below are the planned allowances.</span>
            </div>
            <button type="button" className={styles.mobileDisclosureButton} aria-expanded={showMobileVoicePlans} aria-controls="voice-plan-details" onClick={() => setShowMobileVoicePlans((shown) => !shown)}>
              {showMobileVoicePlans ? 'Hide plan minutes' : 'Compare plan minutes'}
            </button>
          </div>
          <ol className={styles.callFlow} aria-label="How AI Voice Receptionist will handle a call">
            <li><span>01</span><div><strong>Answer</strong><small>A professional greeting, every time.</small></div></li>
            <li><span>02</span><div><strong>Qualify</strong><small>Capture the job, urgency, and location.</small></div></li>
            <li><span>03</span><div><strong>Route</strong><small>Transfer or follow your fallback rule.</small></div></li>
            <li><span>04</span><div><strong>Planned</strong><small>None of this is live yet.</small></div></li>
          </ol>
        </div>

        <div id="voice-plan-details" className={styles.voicePlanDetails} data-mobile-expanded={showMobileVoicePlans}>
          <div className={styles.voiceGrid}>
            {PLANS.map((plan) => (
              <article key={plan.id} data-plan={plan.id}>
                <span>{plan.name}</span>
                <strong>{voiceDescription(plan)}</strong>
                <p>{plan.voiceConcurrentCalls} simultaneous AI {plan.voiceConcurrentCalls === 1 ? 'call' : 'calls'}</p>
                <small>{plan.id === 'scale' ? 'Advanced routing · 90-day history' : 'Standard routing · 30-day history'}{VOICE_PURCHASABLE ? '' : ' · planned'}</small>
              </article>
            ))}
          </div>
          <p className={styles.sectionFinePrint}>
            AI Voice Receptionist is not available yet, and no plan currently includes it. The allowances shown are the
            planned launch figures and may change before release. At launch, AI-connected minutes will be separate from
            text and AI Intake credits; ringing, failed calls, blocked spam, and time after a completed transfer will
            not use AI minutes, and extra usage will be a top-up you choose to buy.
          </p>
        </div>
      </section>

      <section className={styles.compareSection} id="compare">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Straight answers before checkout</p>
            <h2>Compare the details without squinting.</h2>
          </div>
          <p className={styles.compareIntro}>Core business records stay unlimited. We meter only the services that create real usage cost.</p>
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
            <span><strong>Full LGQ feature comparison</strong><small>Every allowance and plan gate</small></span>
            <b aria-hidden="true">+</b>
          </summary>
          <p className={styles.tableHint}>Swipe horizontally to compare all plans →</p>
          <div className={styles.tableScroll} tabIndex={0}>
            <table className={styles.comparisonTable}>
              <caption className={styles.srOnly}>Detailed comparison of Flex, Solo, Growth, and Scale</caption>
              <thead>
                <tr><th scope="col">Feature</th>{PLANS.map((plan) => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([label, ...values]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((value, index) => <td key={`${label}-${PLANS[index].id}`}>{value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className={styles.disclosureGrid}>
          <details className={styles.disclosure}>
            <summary>
              <span><strong>Optional top-ups</strong><small>Margin-safe, opt-in capacity</small></span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className={styles.addOnList}>
              {ADD_ONS.map((item) => (
                <div key={item.label}>
                  <span><strong>{item.label}</strong><small>{item.eligibility}</small></span>
                  {/* Gold ink reads as a price. A thing you cannot buy must not. */}
                  <b data-soon={item.available ? undefined : 'true'}>{item.price}</b>
                </div>
              ))}
            </div>
          </details>

          <details className={styles.disclosure}>
            <summary>
              <span><strong>Published competitor rates</strong><small>Closest public team tiers</small></span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className={styles.tableScroll} tabIndex={0}>
              <table className={styles.competitorTable}>
                <caption className={styles.srOnly}>LGQ Growth compared with four contractor software team plans</caption>
                <thead><tr><th>Provider</th><th>Plan</th><th>Monthly</th><th>Annual equivalent</th><th>Users</th><th>Phone / AI</th></tr></thead>
                <tbody>
                  {COMPETITORS.map((row) => (
                    <tr key={row.provider}>
                      <th scope="row"><a href={row.href}>{row.provider}</a></th>
                      <td>{row.plan}</td><td>{row.monthly}</td><td>{row.annual}</td><td>{row.users}</td><td>{row.phone}</td>
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
        <div><strong>Unlimited core work</strong><span>Leads, clients, quotes, jobs, invoices, and standard forms.</span></div>
        <div><strong>No unapproved overages</strong><span>Extra capacity is a one-time top-up you choose to buy.</span></div>
        <div><strong>No lost website leads</strong><span>When AI Intake ends, LGQ switches to the normal quote form.</span></div>
        <div><strong>Bring your books</strong><span>One QuickBooks Online connection is included on every plan.</span></div>
      </section>

      <section className={styles.faqSection} id="questions">
        <div className={styles.faqIntro}>
          <p className={styles.sectionEyebrow}>The fine print, in plain English</p>
          <h2>Questions contractors actually ask.</h2>
          <p>Still unsure which plan fits? We’ll talk through the math with you.</p>
          <Link className={styles.secondaryButton} href="/contact">Ask a real person</Link>
        </div>
        <div id="pricing-faqs" className={`${styles.faqGrid}${showAllFaqs ? ` ${styles.faqGridExpanded}` : ''}`}>
          {PRICING_FAQS.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary>{item.q}<span aria-hidden="true">+</span></summary>
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
          {showAllFaqs ? 'Show fewer questions' : `Show ${Math.max(0, PRICING_FAQS.length - 6)} more questions`}
        </button>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalCtaCopy}>
          <p className={styles.sectionEyebrow}>Built for your busy season and beyond</p>
          <h2>Keep costs light when work slows. Keep the same system when it takes off.</h2>
          <p>Flex starts at $0/month plus 1.25% on eligible payments. Upgrade only when the math or your team says it is time.</p>
          <div className={styles.heroActions}>
            <a className={styles.seasonalButton} href={signupHref('flex', billing)}>Start with Flex</a>
            <Link className={styles.secondaryButton} href="/contact">Talk to a real person</Link>
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
        <aside className={styles.mobileRecommendation} data-plan={recommendation.plan.id} aria-label="Current plan recommendation">
          <button type="button" className={styles.mobileRecommendationDismiss} aria-label="Dismiss recommendation" onClick={() => setStickyDismissed(true)}>×</button>
          <div><span>Your current best fit</span><strong>{recommendation.plan.name} · {money(recommendation.annualCost / 12)}/mo effective</strong></div>
          <a href={signupHref(recommendation.plan.id, billing)}>{recommendation.plan.id === 'flex' ? 'Start Flex' : `Choose ${recommendation.plan.name}`}</a>
        </aside>
      ) : null}
    </>
  );
}
