'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { buildStartUrl } from '@/lib/signup-intent';
import { rankPlanCosts } from './pricing-ranking';
import {
  COMPARISON_ROWS,
  COMPETITOR_BENCHMARKS,
  CREW_USER_ADD_ON_AVAILABLE,
  CREW_USER_ADD_ON_ELIGIBLE_PLANS,
  CREW_USER_ADD_ON_MONTHLY,
  PLANS,
  PRICING_FAQS,
  estimateCompetitorAnnualCost,
  type BillingCycle,
  type PlanId,
} from './pricing-catalog';

const activity = [
  { label: 'Quote accepted', value: '$8,420', symbol: '✓', tone: 'orange' },
  { label: 'Crew dispatched', value: '8:30 AM', symbol: '→', tone: 'yellow' },
  { label: 'Invoice paid', value: '+$2,840', symbol: '↑', tone: 'mint' },
];

const featureCards = [
  {
    number: '01',
    title: 'Win the work',
    description: 'Launch your contractor website, capture instant estimates and send quotes with e-signatures.',
    href: '/features/quotes',
    ctaText: 'Explore quotes & website',
  },
  {
    number: '02',
    title: 'Run the job',
    description: 'Schedule work, dispatch crews and keep job notes, hours and progress in one place.',
    href: '/features/dispatch',
    ctaText: 'Explore dispatch & scheduling',
  },
  {
    number: '03',
    title: 'Get paid and synced',
    description: 'Send invoices, collect payments and keep QuickBooks connected to the same workflow.',
    href: '/features/payments',
    ctaText: 'Explore payments & QuickBooks',
  },
];

const walkthroughSteps = [
  {
    badge: '01 · REVENUE & PROFIT',
    title: 'Real-Time Insights Dashboard',
    summary: 'See monthly gross revenue, unbilled receivables, and job profitability side-by-side with cash collected.',
    metric: 'Real-time revenue & margin tracking',
  },
  {
    badge: '02 · CREW DISPATCH',
    title: 'Integrated Field Scheduling',
    summary: 'Coordinate schedules, dispatch crews to job locations, and keep notes and photos attached directly to the work order.',
    metric: 'Live team status & route visibility',
  },
  {
    badge: '03 · CASH COLLECTION',
    title: 'Instant Quote-to-Invoice Payment',
    summary: 'Send Good/Better/Best proposals with online signatures, capture initial deposits, and bill balances seamlessly upon completion.',
    metric: 'Direct Stripe payout to your bank',
  },
  {
    badge: '04 · AUTOMATED BOOKS',
    title: 'Two-Way QuickBooks Online Sync',
    summary: 'Clients, invoices, payments, and sales tax automatically sync to QuickBooks in real time without manual reconciliation.',
    metric: 'Zero double-entry bookkeeping',
  },
];

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function feeLabel(value: number) {
  return `${value.toFixed(2)}%`;
}

const plans = PLANS.map((plan, rank) => {
  const annualBilled = plan.id === 'flex' ? 0 : plan.annualMonthly * 12;
  return {
    ...plan,
    name: plan.id === 'flex' ? 'Flex / Seasonal' : plan.name,
    shortName: plan.name,
    annualBilled,
    annualSavings: plan.monthly * 12 - annualBilled,
    fee: feeLabel(plan.paymentFeePct),
    rate: plan.paymentFeePct / 100,
    storage: `${plan.storageGb} GB`,
    textAllowance: plan.id === 'flex'
      ? '50 one-time starter text credits'
      : `${plan.textCredits.replace('/month', '')} text credits/month`,
    aiAllowance: plan.id === 'flex'
      ? `${money.format(plan.aiCredits)} one-time starter AI Credits`
      : `${money.format(plan.aiCredits)} AI Credits/month`,
    aiReceptionistAllowance: plan.id === 'scale'
      ? 'AI Receptionist: 10 calls at a time · included'
      : plan.id === 'growth'
        ? 'AI Receptionist: 5 calls at a time · $55/mo add-on'
        : plan.id === 'solo'
          ? 'AI Receptionist: 5 calls at a time · $59/mo add-on'
          : 'AI Receptionist: 5 calls at a time · $69/mo add-on',
    rank,
  };
});

const scenarios = [
  { label: 'Solo handyman', detail: '$35k/yr · 1 office · no crew', volume: 35000, office: 1, crew: 0, usage: 'starter' },
  { label: 'Owner-operator', detail: '$150k/yr · 2 office · 1 crew', volume: 150000, office: 2, crew: 1, usage: 'ongoing' },
  { label: 'Growing crew', detail: '$600k/yr · 3 office · 6 crew', volume: 600000, office: 3, crew: 6, usage: 'high' },
  { label: 'High-volume roofing', detail: '$1.8M/yr · 8 office · 25 crew', volume: 1800000, office: 8, crew: 25, usage: 'scale' },
] as const;

const usageOptions = [
  { value: 'starter', label: 'Starter credits', detail: 'Occasional use · one-time balances', minimumRank: 0 },
  { value: 'ongoing', label: 'Ongoing monthly', detail: 'Up to 500 texts + 300 AI credits', minimumRank: 1 },
  { value: 'high', label: 'Automation-heavy', detail: 'Up to 1,500 texts + 750 AI credits', minimumRank: 2 },
  { value: 'scale', label: 'High-volume automation', detail: 'Up to 3,000 texts + 1,500 AI credits', minimumRank: 3 },
] as const;

type UsageLevel = (typeof usageOptions)[number]['value'];

export default function PricingExperience() {
  const [annualVolume, setAnnualVolume] = useState(75000);
  const [officeUsers, setOfficeUsers] = useState(1);
  const [crewUsers, setCrewUsers] = useState(0);
  const [usageLevel, setUsageLevel] = useState<UsageLevel>('ongoing');
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  // Interaction State
  const [highlightedPlanId, setHighlightedPlanId] = useState<PlanId | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});
  const [comparedPlanId, setComparedPlanId] = useState<PlanId | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStep, setLightboxStep] = useState(0);
  const [isWorkflowReplaying, setIsWorkflowReplaying] = useState(true);
  const [recommendationPulse, setRecommendationPulse] = useState(false);

  // Dynamic Payment Waterfall & Competitor State
  const [samplePayment, setSamplePayment] = useState(5000);
  const [sampleMethod, setSampleMethod] = useState<'card' | 'ach'>('card');
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string>('jobber');

  const minimumUsageRank = usageOptions.find((option) => option.value === usageLevel)?.minimumRank ?? 0;
  const planEstimates = plans.map((plan) => {
    const annualFee = Math.round(annualVolume * 100 * plan.rate) / 100;
    const canAddCrewSeats = CREW_USER_ADD_ON_AVAILABLE
      && CREW_USER_ADD_ON_ELIGIBLE_PLANS.includes(plan.id);
    const extraCrewUsers = canAddCrewSeats ? Math.max(0, crewUsers - plan.crewUsers) : 0;
    const officeCapacityFits = officeUsers <= plan.officeUsers;
    const crewCapacityFits = crewUsers <= plan.crewUsers || canAddCrewSeats;
    const usageFits = plan.rank >= minimumUsageRank;
    const eligible = officeCapacityFits && crewCapacityFits && usageFits;
    const seatAddOnMonthly = extraCrewUsers * CREW_USER_ADD_ON_MONTHLY;
    const subscriptionAnnual = (billing === 'annual' ? plan.annualBilled : plan.monthly * 12) + seatAddOnMonthly * 12;
    const displayMonthly = billing === 'annual' ? plan.annualMonthly : plan.monthly;
    return {
      ...plan,
      annualFee,
      subscriptionAnnual,
      displayMonthly,
      monthlyWithSeats: displayMonthly + seatAddOnMonthly,
      annualTotal: annualFee + subscriptionAnnual,
      extraCrewUsers,
      seatAddOnMonthly,
      eligible,
    };
  });
  const ranking = rankPlanCosts(planEstimates.map((plan) => ({
    planId: plan.id,
    annualCost: plan.eligible ? plan.annualTotal : null,
  })));
  const recommendation = planEstimates.find((plan) => plan.id === ranking.winner?.planId) ?? planEstimates[planEstimates.length - 1];
  const runnerUp = planEstimates.find((plan) => plan.id === ranking.runnerUp?.planId);
  const annualSavings = runnerUp ? Math.max(0, runnerUp.annualTotal - recommendation.annualTotal) : 0;
  
  // Dynamic Payment Waterfall Calculation
  const examplePayment = samplePayment;
  const exampleLgqFee = examplePayment * recommendation.rate;
  const exampleStripeFee = sampleMethod === 'card'
    ? examplePayment * 0.029 + 0.30
    : Math.min(5.00, examplePayment * 0.008);
  const examplePayout = examplePayment - exampleLgqFee - exampleStripeFee;

  // Competitor Comparison Calculation
  const activeCompetitor = COMPETITOR_BENCHMARKS.find((c) => c.id === selectedCompetitorId) ?? COMPETITOR_BENCHMARKS[0];
  const competitorAnnualCost = estimateCompetitorAnnualCost(activeCompetitor, officeUsers);
  const competitorSavings = Math.max(0, competitorAnnualCost - recommendation.annualTotal);

  const prevRecRef = useRef<PlanId>(recommendation.id);

  // Trigger one short glow pulse whenever the calculated winner changes
  useEffect(() => {
    if (prevRecRef.current !== recommendation.id) {
      prevRecRef.current = recommendation.id;
      setRecommendationPulse(true);
      const timer = setTimeout(() => {
        setRecommendationPulse(false);
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [recommendation.id]);

  // Handle Lightbox key navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
      if (event.key === 'ArrowRight') setLightboxStep((s) => (s + 1) % walkthroughSteps.length);
      if (event.key === 'ArrowLeft') setLightboxStep((s) => (s - 1 + walkthroughSteps.length) % walkthroughSteps.length);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  // Section Scroll Reveal Observer
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    const elements = document.querySelectorAll('.reveal-section');
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const checkoutUrl = (planId: PlanId) => {
    const checkoutBilling = planId === 'flex' ? 'monthly' : billing;
    return buildStartUrl({
      goal: 'choose_plan',
      plan: planId,
      billing: checkoutBilling,
      source: 'pricing',
    });
  };

  const isScenarioSelected = (scenario: (typeof scenarios)[number]) =>
    annualVolume === scenario.volume && officeUsers === scenario.office && crewUsers === scenario.crew && usageLevel === scenario.usage;
  const clampVolume = (value: number) => Math.min(5000000, Math.max(0, Number.isFinite(value) ? value : 0));
  const updateExactVolume = (value: number) => {
    setAnnualVolume(Math.round(clampVolume(value)));
  };
  const updateSliderVolume = (value: number) => {
    setAnnualVolume(Math.round(clampVolume(value) / 5000) * 5000);
  };
  const updateSeats = (kind: 'office' | 'crew', value: number) => {
    if (kind === 'office') setOfficeUsers(Math.min(15, Math.max(1, value)));
    else setCrewUsers(Math.min(75, Math.max(0, value)));
  };

  const scrollToPlan = (planId: PlanId) => {
    setHighlightedPlanId(planId);
    const target = document.getElementById(`detail-${planId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedPlanId((curr) => (curr === planId ? null : curr));
      }, 2600);
    }
  };

  const togglePlanDetails = (planId: string) => {
    setExpandedPlans((prev) => ({ ...prev, [planId]: !prev[planId] }));
  };

  const replayWorkflow = () => {
    setIsWorkflowReplaying(false);
    requestAnimationFrame(() => {
      setIsWorkflowReplaying(true);
    });
  };

  const heroSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing' });
  const footerSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing_footer' });

  const activeComparedPlan = comparedPlanId ? planEstimates.find((p) => p.id === comparedPlanId) : null;

  return (
    <div className="lgq-pricing-v2">
      <div className="site-shell">
        <div className="ambient ambient-one" aria-hidden="true" />
        <div className="ambient ambient-two" aria-hidden="true" />
        <section className="hero reveal-section is-revealed" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            YOUR WHOLE BUSINESS · ONE CONNECTED SYSTEM
          </p>
          <h1 id="hero-title">
            Your whole contracting business. <em>From $0/month.</em>
          </h1>
          <p className="hero-description">
            From an AI-powered website and instant quoting to client texting, booking, invoices, payments, and QuickBooks sync—<em>everything connected from day one.</em>
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href={heroSignupUrl}>
              Start free — $0/month <span aria-hidden="true">→</span>
            </a>
            <a className="button button-secondary" href="#calculator">
              Calculate my best plan <span aria-hidden="true">↓</span>
            </a>
          </div>

          <ul className="assurances" aria-label="Included with every plan">
            <li>Website included</li>
            <li>Unlimited core records</li>
            <li>QuickBooks sync</li>
          </ul>

          <div className="momentum-note" aria-label="Start free and scale when ready">
            <span aria-hidden="true">↗</span>
            <div>
              <strong>Start free. Keep the momentum.</strong>
              <small>Your tools stay connected as the work picks up.</small>
            </div>
          </div>
        </div>

        <div className="pricing-visual" aria-label="Flex Seasonal followed by the Solo, Growth and Scale subscription plans">
          <div className="visual-orbit orbit-one" aria-hidden="true" />
          <div className="visual-orbit orbit-two" aria-hidden="true" />
          <div className="visual-heading">
            <div>
              <span className="visual-kicker"><i aria-hidden="true" /> PLANS THAT FIT THE SEASON</span>
              <h2>Start flexible. Subscribe when it pays.</h2>
            </div>
            <div className="starting-price">
              <strong>$0</strong>
              <span>/mo to start</span>
            </div>
          </div>

          <div
            className={`activity-strip ${isWorkflowReplaying ? 'workflow-animating' : 'workflow-settled'}`}
            aria-label="Workflow demonstration: Quote accepted to Crew dispatched to Invoice paid. Click to replay."
            role="button"
            tabIndex={0}
            onClick={replayWorkflow}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                replayWorkflow();
              }
            }}
            title="Click to replay sequential workflow animation"
          >
            {activity.map((item, idx) => (
              <div className={`activity-event tone-${item.tone} activity-step-${idx + 1}`} key={item.label}>
                <span className="activity-mark" aria-hidden="true">{item.symbol}</span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="plan-architecture">
            <article
              className="flex-plan-card hero-plan-trigger"
              role="button"
              tabIndex={0}
              onClick={() => scrollToPlan('flex')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToPlan('flex');
                }
              }}
              aria-label="Click to jump to Flex plan details"
              title="Click to highlight and view Flex plan details"
            >
              <div className="plan-card-heading">
                <span>FLEX / SEASONAL</span>
                <i>PAY AS YOU GO</i>
              </div>
              <div className="flex-base-price"><strong>$0</strong><span>/month</span></div>
              <p><span className="flex-rate">1.25% LGQ platform fee</span>No monthly subscription. Pay the platform fee only on the eligible service subtotal.</p>
              <span className="hero-plan-jump-hint" aria-hidden="true">View plan breakdown ↓</span>
            </article>

            <a
              className="plan-bridge plan-bridge-link"
              href="#calculator"
              aria-label="Calculate your best plan in the recommender"
              title="Calculate recommended plan"
            >
              <span>UPGRADE <br />WHEN IT PAYS</span>
              <i>→</i>
            </a>

            <div className="subscription-group">
              <div className="subscription-heading">
                <span>SUBSCRIPTION PLANS</span>
                <small>LOWER FIXED FEES</small>
              </div>
              {plans.filter((plan) => plan.id !== 'flex').map((plan) => (
                <article
                  className={`subscription-plan hero-plan-trigger plan-${plan.id}`}
                  key={`graphic-${plan.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => scrollToPlan(plan.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      scrollToPlan(plan.id);
                    }
                  }}
                  aria-label={`Click to jump to ${plan.name} plan details`}
                  title={`Click to highlight and view ${plan.name} plan details`}
                >
                  <div><span>{plan.name}</span><small>{plan.audience}</small></div>
                  <strong>${plan.monthly}<small>/mo</small></strong>
                  <em>{plan.fee}<small> fee</small></em>
                </article>
              ))}
            </div>
          </div>

          <div className="connected-core">
            <div>
              <span>Website</span>
              <span>Quotes</span>
              <span>Jobs</span>
              <span>Invoices</span>
              <span>Payments</span>
            </div>
            <strong>Full Contractor Business Platform</strong>
          </div>

          <p className="pricing-formula">
            LGQ platform fee applies to the discount-adjusted eligible service subtotal. Subscription and Stripe processing are separate.
          </p>
        </div>
      </section>

      <section className="trust-strip reveal-section" aria-label="Support, security and plan flexibility">
        <p>BUILT FOR CONTRACTOR CONFIDENCE</p>
        <Link className="trust-card-link trust-card-text-only" href="/contact" aria-label="Dedicated trade desk: US-based phone and chat support">
          <span>Dedicated trade desk<br /><b>US-based phone &amp; chat support ↗</b></span>
        </Link>
        <Link className="trust-card-link trust-card-text-only" href="/security" aria-label="Protected in transit: HTTPS and TLS 1.3">
          <span>Protected in transit<br /><b>HTTPS + TLS 1.3 ↗</b></span>
        </Link>
        <Link className="trust-card-link" href="/features/payments" aria-label="Payments powered by Stripe: PCI DSS Level 1 provider">
          <strong>PCI</strong><span>Payments powered by Stripe<br /><b>PCI DSS Level 1 provider ↗</b></span>
        </Link>
        <a className="trust-card-link" href="#faq" aria-label="Plan flexibility: Upgrade now, downgrade at renewal">
          <strong>FLEX</strong><span>Plan flexibility<br /><b>Upgrade now · downgrade at renewal ↓</b></span>
        </a>
      </section>

      <section className="page-section calculator-section reveal-section" id="calculator" aria-labelledby="calculator-title">
        <span className="anchor-target" id="recommender" aria-hidden="true" />
        <span className="anchor-target" id="savings-calculator" aria-hidden="true" />
        <div className="calculator-intro">
          <p className="section-kicker">ONE GUIDED RECOMMENDER</p>
          <h2 id="calculator-title">Find the plan that actually fits.</h2>
          <p>Match the right team capacity, messaging allowance and payment fee—not merely the lowest subscription.</p>

          <div className="scenario-presets" aria-label="Quick contractor scenarios">
            {scenarios.map((scenario) => (
              <button
                className={isScenarioSelected(scenario) ? 'selected' : ''}
                type="button"
                key={scenario.label}
                aria-pressed={isScenarioSelected(scenario)}
                onClick={() => {
                  setAnnualVolume(scenario.volume);
                  setOfficeUsers(scenario.office);
                  setCrewUsers(scenario.crew);
                  setUsageLevel(scenario.usage);
                }}
              >
                <strong>{scenario.label}</strong><span>{scenario.detail}</span>
              </button>
            ))}
          </div>

          <fieldset className="seat-picker">
            <legend>1. Team capacity</legend>
            <div className="seat-picker-grid">
              <div className="seat-counter">
                <span>Office / admin users</span>
                <div>
                  <button type="button" aria-label="Remove one office user" onClick={() => updateSeats('office', officeUsers - 1)}>−</button>
                  <output aria-label={`${officeUsers} office ${officeUsers === 1 ? 'user' : 'users'}`}>{officeUsers}</output>
                  <button type="button" aria-label="Add one office user" onClick={() => updateSeats('office', officeUsers + 1)}>+</button>
                </div>
                <small>Choose a plan with enough included office seats (dashboard, quotes, invoices &amp; QuickBooks).</small>
              </div>
              <div className="seat-counter">
                <span>Crew-only users</span>
                <div>
                  <button type="button" aria-label="Remove one crew user" onClick={() => updateSeats('crew', crewUsers - 1)}>−</button>
                  <output aria-label={`${crewUsers} crew ${crewUsers === 1 ? 'user' : 'users'}`}>{crewUsers}</output>
                  <button type="button" aria-label="Add one crew user" onClick={() => updateSeats('crew', crewUsers + 1)}>+</button>
                </div>
                <small>Extra crew seats on Solo+ are $5/month each (mobile app for time clock &amp; job notes).</small>
              </div>
            </div>
          </fieldset>

          <div className="calculator-control">
            <div className="control-label">
              <label htmlFor="volume-exact">2. Annual eligible service subtotal collected through LGQ</label>
              <div className="volume-input">
                <span aria-hidden="true">$</span>
                <input
                  id="volume-exact"
                  type="text"
                  inputMode="numeric"
                  value={money.format(annualVolume)}
                  aria-label="Exact annual eligible service subtotal"
                  onChange={(event) => updateExactVolume(Number(event.target.value.replace(/\D/g, '')))}
                />
                <small>/year</small>
              </div>
            </div>
            <input
              id="volume"
              type="range"
              min="0"
              max="5000000"
              step="5000"
              value={annualVolume}
              aria-label="Annual eligible service subtotal collected through LGQ"
              onChange={(event) => updateSliderVolume(Number(event.target.value))}
              style={{ '--range-progress': `${annualVolume / 50000}%` } as CSSProperties}
            />
            <div className="range-labels"><span>$0</span><span>≈ ${money.format(annualVolume / 12)}/month</span><span>$5M+</span></div>

            <div className="slider-crossover-milestones" aria-label="Fee crossover upgrade milestones">
              <span className="crossover-title">UPGRADE BREAKEVEN MILESTONES:</span>
              <div className="milestone-pills">
                <button
                  type="button"
                  className={`milestone-pill ${annualVolume >= 56000 ? 'active' : ''}`}
                  onClick={() => setAnnualVolume(56000)}
                  title="At $56k/yr volume, Solo's 0.50% fee beats Flex's 1.25% fee"
                >
                  <strong>$56k/yr</strong><span>Solo beats Flex fee</span>
                </button>
                <button
                  type="button"
                  className={`milestone-pill ${annualVolume >= 307200 ? 'active' : ''}`}
                  onClick={() => setAnnualVolume(307200)}
                  title="At $307k/yr volume, Growth's 0.25% fee beats Solo's 0.50% fee"
                >
                  <strong>$307k/yr</strong><span>Growth beats Solo fee</span>
                </button>
                <button
                  type="button"
                  className={`milestone-pill ${annualVolume >= 1600000 ? 'active' : ''}`}
                  onClick={() => setAnnualVolume(1600000)}
                  title="At $1.6M/yr volume, Scale's 0.10% fee beats Growth's 0.25% fee"
                >
                  <strong>$1.6M/yr</strong><span>Scale beats Growth fee</span>
                </button>
              </div>
            </div>
          </div>

          <fieldset className="messaging-picker">
            <legend>3. Monthly messaging and AI usage</legend>
            {usageOptions.map((option) => (
              <button
                className={usageLevel === option.value ? 'selected' : ''}
                type="button"
                key={option.value}
                onClick={() => setUsageLevel(option.value)}
                aria-pressed={usageLevel === option.value}
              >
                <strong>{option.label}</strong><span>{option.detail}</span>
              </button>
            ))}
          </fieldset>

          <div className="billing-toggle" role="group" aria-label="Billing cycle">
            <button className={billing === 'monthly' ? 'selected' : ''} type="button" onClick={() => setBilling('monthly')} aria-pressed={billing === 'monthly'}>Monthly billing</button>
            <button className={billing === 'annual' ? 'selected' : ''} type="button" onClick={() => setBilling('annual')} aria-pressed={billing === 'annual'}>Annual billing <span>Save up to $360/yr</span></button>
          </div>

          <div className="plan-price-strip" aria-label="Monthly subscription prices">
            {planEstimates.map((plan) => (
              <div key={`price-${plan.id}`}>
                <span>{plan.shortName}</span>
                <strong>{plan.displayMonthly === 0 ? '$0' : `$${plan.displayMonthly}`}<small>/mo</small></strong>
                <em>{plan.fee} fee</em>
              </div>
            ))}
          </div>
        </div>

        <div className="calculator-results">
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            Recommended plan: {recommendation.name}. Estimated annual LGQ cost ${money.format(recommendation.annualTotal)}.
          </p>
          <div className="result-topline"><span>YOUR LIVE RECOMMENDATION</span><i><b />CALCULATED</i></div>
          <article className={`result-primary ${recommendationPulse ? 'recommendation-pulse' : ''}`}>
            <div className="result-fit-tags" aria-label="Fit factors for recommendation">
              <span className="fit-tag">✓ Lowest total cost for volume</span>
              <span className="fit-tag">✓ {officeUsers} office + {crewUsers} crew capacity</span>
              <span className="fit-tag">✓ {recommendation.fee} platform fee</span>
            </div>
            <span>Best cost among plans that fit your capacity</span>
            <strong className="result-plan-name numeric-transition-field" key={`name-${recommendation.id}`}>{recommendation.name}</strong>
            <small>{recommendation.monthlyWithSeats === 0 ? '$0/month' : `$${recommendation.monthlyWithSeats}/month`} · {recommendation.fee} platform fee · {recommendation.officeUsers} office + {recommendation.crewUsers} crew included</small>
            <a className="result-cta" href={checkoutUrl(recommendation.id)}>Continue with {recommendation.shortName} <span aria-hidden="true">→</span></a>
            {recommendation.id !== 'flex' && (
              <a className="result-alt-link" href={checkoutUrl('flex')}>
                Or start free on Flex ($0/mo) and upgrade when ready <span aria-hidden="true">→</span>
              </a>
            )}
            {billing === 'annual' && recommendation.annualBilled > 0 && (
              <small className="result-billing-note"><strong>${money.format(recommendation.annualBilled)} base plan billed today.</strong> Crew-seat add-ons renew monthly.</small>
            )}
          </article>
          <div className="result-grid">
            <article>
              <span>Estimated annual LGQ cost</span>
              <strong className="numeric-transition-field" key={`annual-${recommendation.annualTotal}`}>${money.format(recommendation.annualTotal)}</strong>
              <small>base subscription + crew seats + LGQ platform fee</small>
            </article>
            <article>
              <span>Included plan capacity</span>
              <strong key={`text-${recommendation.textAllowance}`}>{recommendation.textAllowance}</strong>
              <small>{recommendation.aiAllowance} · {recommendation.storage}</small>
            </article>
          </div>

          <div className="competitor-savings-box" role="region" aria-label="Estimated savings versus legacy software">
            <div className="competitor-savings-header">
              <div>
                <span className="competitor-tag">COMPARE VS LEGACY FIELD SOFTWARE</span>
                <strong>Keep more profit with Let&apos;s Get Quoted</strong>
              </div>
              <div className="competitor-toggle" role="group" aria-label="Select competitor to compare">
                {COMPETITOR_BENCHMARKS.map((comp) => (
                  <button
                    key={comp.id}
                    type="button"
                    className={selectedCompetitorId === comp.id ? 'selected' : ''}
                    onClick={() => setSelectedCompetitorId(comp.id)}
                    aria-pressed={selectedCompetitorId === comp.id}
                  >
                    {comp.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <div className="competitor-savings-body">
              <div className="competitor-cost-row">
                <div className="comp-item">
                  <small>{activeCompetitor.name}</small>
                  <strong>~${money.format(competitorAnnualCost)}<small>/yr</small></strong>
                  <em>${activeCompetitor.monthlyBase}/mo base + ${activeCompetitor.perUserMonthly}/mo per seat</em>
                </div>
                <div className="comp-arrow" aria-hidden="true">vs</div>
                <div className="comp-item lgq-pick">
                  <small>LGQ {recommendation.shortName}</small>
                  <strong>${money.format(recommendation.annualTotal)}<small>/yr</small></strong>
                  <em>Base + seats + {recommendation.fee} platform fee</em>
                </div>
              </div>
              {competitorSavings > 0 ? (
                <div className="competitor-savings-callout">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>Save ~${money.format(competitorSavings)}/year with Let&apos;s Get Quoted</strong>
                    <small>No expensive per-seat penalties. Website, quotes, invoicing and QuickBooks sync included.</small>
                  </div>
                </div>
              ) : (
                <div className="competitor-savings-callout">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>Full contractor platform with no extra website, dispatch or QuickBooks add-on bills.</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="plan-comparison-header">
            <span>COMPARE WITH OTHER PLANS (CLICK TO INSPECT)</span>
          </div>

          <div className="plan-comparison-list" role="region" aria-label="Plan comparison against recommendation">
            {planEstimates.map((plan) => {
              const isRec = plan.id === recommendation.id;
              const isSelected = plan.id === comparedPlanId;
              return (
                <button
                  type="button"
                  className={`plan-comparison-row-btn ${isRec ? 'recommended' : !plan.eligible ? 'not-eligible' : ''} ${isSelected ? 'active-compare' : ''}`}
                  key={`estimate-${plan.id}`}
                  onClick={() => setComparedPlanId(isSelected ? null : plan.id)}
                  aria-expanded={isSelected}
                  aria-controls={`comparator-panel-${plan.id}`}
                  aria-label={`Compare ${plan.shortName} (${!plan.eligible ? 'does not fit' : `$${money.format(plan.annualTotal)}/yr`}) against recommended ${recommendation.shortName}`}
                >
                  <span className="compare-name">{plan.shortName}</span>
                  <i className="compare-rate">{plan.monthlyWithSeats === 0 ? '$0/mo' : `$${plan.monthlyWithSeats}/mo`} + {plan.fee}</i>
                  <strong className="compare-cost">{!plan.eligible ? 'does not fit' : `$${money.format(plan.annualTotal)}/yr`}</strong>
                  <span className="compare-badge" aria-hidden="true">{isRec ? 'Current pick' : isSelected ? 'Close comparison ✕' : 'Click to compare →'}</span>
                </button>
              );
            })}
          </div>

          {activeComparedPlan && (
            <div
              id={`comparator-panel-${activeComparedPlan.id}`}
              className="live-plan-comparator"
              role="region"
              aria-label={`Comparison breakdown between ${activeComparedPlan.name} and recommended ${recommendation.name}`}
            >
              <div className="comparator-head">
                <strong>Comparing {recommendation.shortName} (Recommended) vs {activeComparedPlan.shortName}</strong>
                <button type="button" onClick={() => setComparedPlanId(null)} aria-label="Close comparison view">✕</button>
              </div>
              <div className="comparator-grid">
                <div>
                  <small>Annual Cost Delta</small>
                  <strong>
                    {activeComparedPlan.id === recommendation.id
                      ? 'Best match'
                      : !activeComparedPlan.eligible
                      ? 'Capacity limit exceeded'
                      : activeComparedPlan.annualTotal >= recommendation.annualTotal
                      ? `+$${money.format(activeComparedPlan.annualTotal - recommendation.annualTotal)}/yr higher`
                      : `-$${money.format(recommendation.annualTotal - activeComparedPlan.annualTotal)}/yr lower`}
                  </strong>
                </div>
                <div>
                  <small>Fee Percentage</small>
                  <strong>{activeComparedPlan.fee} vs {recommendation.fee}</strong>
                </div>
                <div>
                  <small>Office Seats</small>
                  <strong>{activeComparedPlan.officeUsers} included ({officeUsers <= activeComparedPlan.officeUsers ? 'Fits team' : `Short ${officeUsers - activeComparedPlan.officeUsers} seat`})</strong>
                </div>
                <div>
                  <small>Crew Seats</small>
                  <strong>{activeComparedPlan.crewUsers} included</strong>
                </div>
              </div>
              <div className="comparator-actions">
                <a className="button button-secondary compare-cta" href={checkoutUrl(activeComparedPlan.id)}>
                  Choose {activeComparedPlan.shortName} <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          )}

          <div className="result-message">
            <span aria-hidden="true">↗</span>
            <p><strong>{recommendation.name} fits your office seats, crew and usage.</strong> {recommendation.extraCrewUsers > 0 ? `Estimate includes ${recommendation.extraCrewUsers} extra crew seat${recommendation.extraCrewUsers === 1 ? '' : 's'} at $5/month each. ` : ''}{annualSavings > 0 ? `It saves about $${money.format(annualSavings)} per year versus the next-lowest plan that also fits.` : 'It is the first plan with enough included office capacity.'}</p>
          </div>

          <div className="payment-waterfall">
            <div className="waterfall-header">
              <span>REAL-WORLD PAYMENT EXAMPLE</span>
              <strong>{examplePayment === 5000 && sampleMethod === 'card' ? '$5,000 eligible service subtotal paid by card' : `$${money.format(examplePayment)} eligible service subtotal paid by ${sampleMethod === 'card' ? 'card' : 'ACH bank transfer'}`}</strong>
            </div>
            <div className="waterfall-controls" aria-label="Customize example payment amount and method">
              <div className="waterfall-presets" role="group" aria-label="Example job size presets">
                {[1500, 5000, 20000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={`waterfall-btn ${samplePayment === amt ? 'selected' : ''}`}
                    onClick={() => setSamplePayment(amt)}
                    aria-pressed={samplePayment === amt}
                  >
                    ${money.format(amt)}
                  </button>
                ))}
              </div>
              <div className="waterfall-methods" role="group" aria-label="Payment method">
                <button
                  type="button"
                  className={`waterfall-btn ${sampleMethod === 'card' ? 'selected' : ''}`}
                  onClick={() => setSampleMethod('card')}
                  aria-pressed={sampleMethod === 'card'}
                >
                  Card (2.9% + 30¢)
                </button>
                <button
                  type="button"
                  className={`waterfall-btn ${sampleMethod === 'ach' ? 'selected' : ''}`}
                  onClick={() => setSampleMethod('ach')}
                  aria-pressed={sampleMethod === 'ach'}
                >
                  ACH Bank Transfer (0.8% max $5)
                </button>
              </div>
            </div>
            <dl>
              <div><dt>Eligible service subtotal</dt><dd>${money.format(examplePayment)}.00</dd></div>
              <div><dt>LGQ fee on {recommendation.shortName} ({recommendation.fee})</dt><dd>−${exampleLgqFee.toFixed(2)}</dd></div>
              <div><dt>{sampleMethod === 'card' ? 'Stripe example (2.9% + 30¢)' : 'Stripe ACH example (0.8% capped at $5)'}</dt><dd>−${exampleStripeFee.toFixed(2)}</dd></div>
              <div className="payout"><dt>Estimated bank payout</dt><dd>${examplePayout.toFixed(2)}</dd></div>
            </dl>
            <p>LGQ fees exclude separately stated sales tax, tips, refunds and credits. Stripe pricing may vary. Carrier and phone-number fees are separate.</p>
          </div>
        </div>
      </section>

      <section className="page-section tier-section reveal-section" id="plans" aria-labelledby="tiers-title">
        <div className="section-heading">
          <p className="section-kicker">CORE PLATFORM · CAPACITY THAT SCALES</p>
          <h2 id="tiers-title">Choose the capacity that fits the work.</h2>
          <p>Every plan includes the full contractor business platform. Seats, messaging, AI allowances and storage scale with your operation.</p>
        </div>

        <div className="proof-metrics" aria-label="Verified plan facts">
          <div><strong>$0</strong><span>Monthly base price on Flex</span></div>
          <div><strong>0.10%</strong><span>Lowest LGQ platform fee</span></div>
          <div><strong>Unlimited</strong><span>Core business records</span></div>
          <div><strong>1 + 1</strong><span>Domain and QuickBooks connection</span></div>
        </div>

        <div className="plans-billing-bar">
          <span>Show plan pricing:</span>
          <div className="billing-toggle" role="group" aria-label="Plan card billing cycle">
            <button className={billing === 'monthly' ? 'selected' : ''} type="button" onClick={() => setBilling('monthly')} aria-pressed={billing === 'monthly'}>Monthly</button>
            <button className={billing === 'annual' ? 'selected' : ''} type="button" onClick={() => setBilling('annual')} aria-pressed={billing === 'annual'}>Annual <span>Save up to $360</span></button>
          </div>
        </div>

        <div className="tier-grid">
          {planEstimates.map((plan, index) => {
            const isRec = plan.id === recommendation.id;
            const isHighlighted = highlightedPlanId === plan.id;
            const isExpanded = !!expandedPlans[plan.id];
            return (
              <article
                className={`tier-card ${isRec ? 'tier-card-featured' : ''} ${isHighlighted ? 'tier-card-highlighted' : ''} ${recommendationPulse && isRec ? 'recommendation-pulse' : ''}`}
                key={`detail-${plan.id}`}
                id={`detail-${plan.id}`}
              >
                <div className="tier-card-topline">
                  <span>0{index + 1}</span>
                  {isRec ? <i>YOUR RECOMMENDED FIT</i> : plan.id === 'growth' ? <i>MOST POPULAR</i> : null}
                </div>
                <p>{plan.name}</p>
                <strong>{plan.displayMonthly === 0 ? '$0' : `$${plan.displayMonthly}`}</strong>
                <small>/month</small>
                {billing === 'annual' && plan.annualBilled > 0 && (
                  <small className="annual-note">
                    ${money.format(plan.annualBilled)} billed today · save ${plan.annualSavings}/yr
                  </small>
                )}
                <em>+ {plan.fee} LGQ platform fee</em>
                <b>{plan.audience}</b>
                <ul className="plan-allowances">
                  <li>{plan.officeUsers} office + {plan.crewUsers} crew users</li>
                  <li>{plan.textAllowance}</li>
                  <li>{plan.aiAllowance}</li>
                  <li>{plan.storage} storage</li>
                  <li>{plan.aiReceptionistAllowance}</li>
                </ul>

                <button
                  type="button"
                  className="tier-details-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={`tier-features-drawer-${plan.id}`}
                  onClick={() => togglePlanDetails(plan.id)}
                  aria-label={`${isExpanded ? 'Hide' : 'Show'} detailed features for ${plan.name}`}
                >
                  <span>{isExpanded ? 'Hide full plan inclusions' : 'See all plan details & features'}</span>
                  <i aria-hidden="true">{isExpanded ? '−' : '+'}</i>
                </button>

                {isExpanded && (
                  <div id={`tier-features-drawer-${plan.id}`} className="tier-expanded-drawer">
                    <h6>Included with {plan.shortName}:</h6>
                    <ul className="tier-expanded-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <a href={checkoutUrl(plan.id)}>
                  {plan.id === 'flex' ? 'Start with Flex' : `Choose ${plan.shortName}`}{' '}
                  <span aria-hidden="true">→</span>
                </a>
              </article>
            );
          })}
        </div>
        <p className="tier-disclosure">Every plan includes unlimited leads, clients, quotes, jobs, invoices and standard quote-form submissions, plus one custom-domain and one QuickBooks Online connection. Flex balances are one-time; paid-plan allowances reset monthly and do not roll over. No surprise overages: extra usage is off by default and only activates if you switch it on and set a spending limit. Carrier registration, dedicated-number lease, Stripe processing, taxes and top-ups are separate.</p>

        <details className="full-comparison" id="comparison">
          <summary>View the full plan allowance comparison <span aria-hidden="true">+</span></summary>
          <div className="comparison-table-wrap" tabIndex={0}>
            <table>
              <caption>Detailed comparison of Flex, Solo, Growth and Scale</caption>
              <thead>
                <tr><th scope="col">Plan detail</th>{plans.map((plan) => <th scope="col" key={`heading-${plan.id}`}>{plan.shortName}</th>)}</tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([label, ...values]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((value, index) => <td key={`${label}-${plans[index].id}`}>{value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Additional crew seats on Solo, Growth and Scale are $5/month each and renew until canceled. Additional office seats are not currently available.</p>
        </details>
      </section>

      <section className="page-section included-section reveal-section" id="included" aria-labelledby="included-title">
        <div className="included-heading">
          <div className="section-heading">
            <p className="section-kicker">FULL CONTRACTOR PLATFORM · EVERY PLAN</p>
            <h2 id="included-title">The foundation stays with you.</h2>
          </div>
          <p>Your website, unlimited core records and QuickBooks connection stay together. Included seats and monthly usage allowances expand by plan.</p>
        </div>

        <div className="product-stage product-real-stage">
          <figure
            className="product-screenshot-trigger"
            role="button"
            tabIndex={0}
            onClick={() => setLightboxOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label="Click to enlarge real product view and open interactive feature walkthrough"
            title="Click to open full product view lightbox and guided walkthrough"
          >
            <Image
              src="/features/back-office-insights.png"
              width={1000}
              height={684}
              sizes="(max-width: 680px) 100vw, 60vw"
              alt="Let's Get Quoted back-office Insights dashboard showing revenue, cash position and job performance"
            />
            <span className="screenshot-zoom-badge" aria-hidden="true">
              <span>🔍</span> Click to enlarge &amp; guided tour
            </span>
            <figcaption>Actual Let&apos;s Get Quoted Insights interface</figcaption>
          </figure>
          <div className="product-proof-copy">
            <span>REAL LGQ PRODUCT VIEW</span>
            <h3>See the whole business—not another disconnected tool.</h3>
            <p>Revenue, cash position, job value and performance live beside the jobs, schedule, clients and payments that create them.</p>
            <div className="product-proof-actions">
              <button type="button" className="button button-primary" onClick={() => setLightboxOpen(true)}>
                Open interactive walkthrough <span aria-hidden="true">🔍</span>
              </button>
              <Link className="product-sub-link" href="/features/back-office">
                Explore the connected back office <i aria-hidden="true">→</i>
              </Link>
            </div>
          </div>
        </div>

        <div className="feature-grid">
          {featureCards.map((card) => (
            <Link className="feature-card feature-card-interactive" href={card.href} key={card.number} aria-label={`${card.title}: ${card.description}`}>
              <span>{card.number}</span>
              <div className="feature-icon" aria-hidden="true">✓</div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <span className="feature-card-cta">
                {card.ctaText} <i aria-hidden="true">→</i>
              </span>
            </Link>
          ))}
        </div>

        <Link className="feature-link" href="/features">Explore the full feature set <span aria-hidden="true">→</span></Link>
      </section>

      {/* Product Screenshot Lightbox & Guided Walkthrough Modal */}
      {lightboxOpen && (
        <div
          className="product-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-title"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="product-lightbox-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-header">
              <div>
                <span className="lightbox-tag">PRODUCT WALKTHROUGH · INSIGHTS &amp; BACK OFFICE</span>
                <h3 id="lightbox-title">{walkthroughSteps[lightboxStep].title}</h3>
              </div>
              <button
                type="button"
                className="lightbox-close-btn"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close product view walkthrough"
              >
                ✕
              </button>
            </div>

            <div className="lightbox-image-wrap">
              <Image
                src="/features/back-office-insights.png"
                width={1200}
                height={820}
                sizes="(max-width: 1200px) 100vw, 1200px"
                alt="Enlarged view of Let's Get Quoted Insights dashboard"
                className="lightbox-img"
              />
            </div>

            <div className="lightbox-tour-bar">
              <div className="tour-step-indicators" role="tablist" aria-label="Walkthrough steps">
                {walkthroughSteps.map((step, idx) => (
                  <button
                    type="button"
                    key={step.badge}
                    className={`tour-step-pill ${idx === lightboxStep ? 'active' : ''}`}
                    onClick={() => setLightboxStep(idx)}
                    role="tab"
                    aria-selected={idx === lightboxStep}
                  >
                    <span>{step.badge}</span>
                  </button>
                ))}
              </div>

              <div className="tour-content">
                <p>{walkthroughSteps[lightboxStep].summary}</p>
                <div className="tour-highlight">
                  <span aria-hidden="true">✓</span>
                  <strong>{walkthroughSteps[lightboxStep].metric}</strong>
                </div>
              </div>

              <div className="lightbox-nav-controls">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setLightboxStep((s) => (s - 1 + walkthroughSteps.length) % walkthroughSteps.length)}
                  aria-label="Previous walkthrough step"
                >
                  ← Prev
                </button>
                <span>{lightboxStep + 1} / {walkthroughSteps.length}</span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setLightboxStep((s) => (s + 1) % walkthroughSteps.length)}
                  aria-label="Next walkthrough step"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="page-section faq-section reveal-section" id="faq" aria-labelledby="faq-title">
        <div className="section-heading">
          <p className="section-kicker">PRICING QUESTIONS</p>
          <h2 id="faq-title">Clear answers. No fine-print maze.</h2>
        </div>
        <div className="faq-list">
          {PRICING_FAQS.map(({ q, a }, index) => (
            <details key={q} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, '0')}</span>{q}<i aria-hidden="true">+</i></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing-section reveal-section" aria-labelledby="closing-title">
        <div className="closing-glow" aria-hidden="true" />
        <p className="section-kicker">READY WHEN YOU ARE</p>
        <h2 id="closing-title">Build your site. Send your first quote today.</h2>
        <p>Start on Flex / Seasonal with no monthly subscription. Your website, quotes, jobs, invoices and payments are ready to work together.</p>
        <div className="hero-actions closing-actions">
          <a className="button button-primary" href={footerSignupUrl}>Build my free site <span aria-hidden="true">→</span></a>
          <Link className="button button-secondary" href="/contact">Talk to our team</Link>
        </div>
        <div className="closing-proof"><span>✓ $0 monthly subscription on Flex</span><span>✓ Unlimited core records</span><span>✓ Flexible plan changes</span></div>
      </section>
      </div>
    </div>
  );
}
