'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { buildStartUrl } from '@/lib/signup-intent';
import { rankPlanCosts } from './pricing-ranking';
import {
  COMPARISON_ROWS,
  CREW_USER_ADD_ON_AVAILABLE,
  CREW_USER_ADD_ON_ELIGIBLE_PLANS,
  CREW_USER_ADD_ON_MONTHLY,
  PLANS,
  PRICING_FAQS,
  type BillingCycle,
  type PlanId,
} from './pricing-catalog';

const activity = [
  { label: 'Quote accepted', value: '$8,420', symbol: '✓', tone: 'orange' },
  { label: 'Crew dispatched', value: '8:30 AM', symbol: '→', tone: 'yellow' },
  { label: 'Invoice paid', value: '+$2,840', symbol: '↑', tone: 'mint' },
];

const features = [
  ['01', 'Win the work', 'Launch your contractor website, capture instant estimates and send quotes with e-signatures.'],
  ['02', 'Run the job', 'Schedule work, dispatch crews and keep job notes, hours and progress in one place.'],
  ['03', 'Get paid and synced', 'Send invoices, collect payments and keep QuickBooks connected to the same workflow.'],
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
  const examplePayment = 5000;
  const exampleLgqFee = examplePayment * recommendation.rate;
  const exampleStripeFee = examplePayment * 0.029 + 0.30;
  const examplePayout = examplePayment - exampleLgqFee - exampleStripeFee;
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

  const heroSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing' });
  const footerSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing_footer' });

  return (
    <div className="lgq-pricing-v2">
      <div className="site-shell">
        <div className="ambient ambient-one" aria-hidden="true" />
        <div className="ambient ambient-two" aria-hidden="true" />
        <section className="hero" aria-labelledby="hero-title">
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

          <div className="activity-strip" aria-label="Example business activity">
            {activity.map((item) => (
              <div className={`activity-event tone-${item.tone}`} key={item.label}>
                <span className="activity-mark" aria-hidden="true">{item.symbol}</span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="plan-architecture">
            <article className="flex-plan-card">
              <div className="plan-card-heading">
                <span>FLEX / SEASONAL</span>
                <i>PAY AS YOU GO</i>
              </div>
              <div className="flex-base-price"><strong>$0</strong><span>/month</span></div>
              <p><span className="flex-rate">1.25% LGQ platform fee</span>No monthly subscription. Pay the platform fee only on the eligible service subtotal.</p>
            </article>

            <div className="plan-bridge" aria-hidden="true">
              <span>UPGRADE <br />WHEN IT PAYS</span>
              <i>→</i>
            </div>

            <div className="subscription-group">
              <div className="subscription-heading">
                <span>SUBSCRIPTION PLANS</span>
                <small>LOWER FIXED FEES</small>
              </div>
              {plans.filter((plan) => plan.id !== 'flex').map((plan) => (
                <article className={`subscription-plan plan-${plan.id}`} key={`graphic-${plan.id}`}>
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

      <section className="trust-strip" aria-label="Support, security and plan flexibility">
        <p>BUILT FOR CONTRACTOR CONFIDENCE</p>
        <div className="trust-card-text-only"><span>Dedicated trade desk<br /><b>US-based phone &amp; chat support</b></span></div>
        <div className="trust-card-text-only"><span>Protected in transit<br /><b>HTTPS + TLS 1.3</b></span></div>
        <div><strong>PCI</strong><span>Payments powered by Stripe<br /><b>PCI DSS Level 1 provider</b></span></div>
        <div><strong>FLEX</strong><span>Plan flexibility<br /><b>Upgrade now · downgrade at renewal</b></span></div>
      </section>

      <section className="page-section calculator-section" id="calculator" aria-labelledby="calculator-title">
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
                <small>Choose a plan with enough included office seats.</small>
              </div>
              <div className="seat-counter">
                <span>Crew-only users</span>
                <div>
                  <button type="button" aria-label="Remove one crew user" onClick={() => updateSeats('crew', crewUsers - 1)}>−</button>
                  <output aria-label={`${crewUsers} crew ${crewUsers === 1 ? 'user' : 'users'}`}>{crewUsers}</output>
                  <button type="button" aria-label="Add one crew user" onClick={() => updateSeats('crew', crewUsers + 1)}>+</button>
                </div>
                <small>Extra crew seats on Solo+ are $5/month each.</small>
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
          <article className="result-primary">
            <span>Best cost among plans that fit your capacity</span>
            <strong className="result-plan-name">{recommendation.name}</strong>
            <small>{recommendation.monthlyWithSeats === 0 ? '$0/month' : `$${recommendation.monthlyWithSeats}/month`} · {recommendation.fee} platform fee · {recommendation.officeUsers} office + {recommendation.crewUsers} crew included</small>
            <a className="result-cta" href={checkoutUrl(recommendation.id)}>Continue with {recommendation.shortName} <span aria-hidden="true">→</span></a>
            {billing === 'annual' && recommendation.annualBilled > 0 && (
              <small className="result-billing-note"><strong>${money.format(recommendation.annualBilled)} base plan billed today.</strong> Crew-seat add-ons renew monthly.</small>
            )}
          </article>
          <div className="result-grid">
            <article>
              <span>Estimated annual LGQ cost</span>
              <strong>${money.format(recommendation.annualTotal)}</strong>
              <small>base subscription + crew seats + LGQ platform fee</small>
            </article>
            <article>
              <span>Included plan capacity</span>
              <strong>{recommendation.textAllowance}</strong>
              <small>{recommendation.aiAllowance} · {recommendation.storage}</small>
            </article>
          </div>
          <div className="plan-comparison-list">
            {planEstimates.map((plan) => (
              <div className={plan.id === recommendation.id ? 'recommended' : !plan.eligible ? 'not-eligible' : ''} key={`estimate-${plan.id}`}>
                <span>{plan.shortName}</span>
                <i>{plan.monthlyWithSeats === 0 ? '$0/mo' : `$${plan.monthlyWithSeats}/mo`} + {plan.fee}</i>
                <strong>{!plan.eligible ? 'does not fit' : `$${money.format(plan.annualTotal)}/yr`}</strong>
              </div>
            ))}
          </div>
          <div className="result-message">
            <span aria-hidden="true">↗</span>
            <p><strong>{recommendation.name} fits your office seats, crew and usage.</strong> {recommendation.extraCrewUsers > 0 ? `Estimate includes ${recommendation.extraCrewUsers} extra crew seat${recommendation.extraCrewUsers === 1 ? '' : 's'} at $5/month each. ` : ''}{annualSavings > 0 ? `It saves about $${money.format(annualSavings)} per year versus the next-lowest plan that also fits.` : 'It is the first plan with enough included office capacity.'}</p>
          </div>

          <div className="payment-waterfall">
            <div><span>REAL-WORLD PAYMENT EXAMPLE</span><strong>$5,000 eligible service subtotal paid by card</strong></div>
            <dl>
              <div><dt>Eligible service subtotal</dt><dd>$5,000.00</dd></div>
              <div><dt>LGQ fee on {recommendation.shortName} ({recommendation.fee})</dt><dd>−${exampleLgqFee.toFixed(2)}</dd></div>
              <div><dt>Stripe example (2.9% + 30¢)</dt><dd>−${exampleStripeFee.toFixed(2)}</dd></div>
              <div className="payout"><dt>Estimated bank payout</dt><dd>${examplePayout.toFixed(2)}</dd></div>
            </dl>
            <p>LGQ fees exclude separately stated sales tax, tips, refunds and credits. Stripe pricing may vary. Carrier and phone-number fees are separate.</p>
          </div>
        </div>
      </section>

      <section className="page-section tier-section" id="plans" aria-labelledby="tiers-title">
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
          {planEstimates.map((plan, index) => (
            <article className={`tier-card ${plan.id === recommendation.id ? 'tier-card-featured' : ''}`} key={`detail-${plan.id}`}>
              <div className="tier-card-topline"><span>0{index + 1}</span>{plan.id === recommendation.id ? <i>YOUR RECOMMENDED FIT</i> : plan.id === 'growth' ? <i>MOST POPULAR</i> : null}</div>
              <p>{plan.name}</p>
              <strong>{plan.displayMonthly === 0 ? '$0' : `$${plan.displayMonthly}`}</strong>
              <small>/month</small>
              {billing === 'annual' && plan.annualBilled > 0 && <small className="annual-note">${money.format(plan.annualBilled)} billed today · save ${plan.annualSavings}/yr</small>}
              <em>+ {plan.fee} LGQ platform fee</em>
              <b>{plan.audience}</b>
              <ul className="plan-allowances">
                <li>{plan.officeUsers} office + {plan.crewUsers} crew users</li>
                <li>{plan.textAllowance}</li>
                <li>{plan.aiAllowance}</li>
                <li>{plan.storage} storage</li>
              </ul>
              <a href={checkoutUrl(plan.id)}>{plan.id === 'flex' ? 'Start with Flex' : `Choose ${plan.shortName}`} <span aria-hidden="true">→</span></a>
            </article>
          ))}
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

      <section className="page-section included-section" id="included" aria-labelledby="included-title">
        <div className="included-heading">
          <div className="section-heading">
            <p className="section-kicker">FULL CONTRACTOR PLATFORM · EVERY PLAN</p>
            <h2 id="included-title">The foundation stays with you.</h2>
          </div>
          <p>Your website, unlimited core records and QuickBooks connection stay together. Included seats and monthly usage allowances expand by plan.</p>
        </div>

        <div className="product-stage product-real-stage">
          <figure>
            <Image src="/features/back-office-insights.png" width="1000" height="684" sizes="(max-width: 680px) 100vw, 60vw" alt="Let's Get Quoted back-office Insights dashboard showing revenue, cash position and job performance" />
            <figcaption>Actual Let&apos;s Get Quoted Insights interface</figcaption>
          </figure>
          <div className="product-proof-copy">
            <span>REAL LGQ PRODUCT VIEW</span>
            <h3>See the whole business—not another disconnected tool.</h3>
            <p>Revenue, cash position, job value and performance live beside the jobs, schedule, clients and payments that create them.</p>
            <Link href="/features/back-office">Explore the connected back office <i aria-hidden="true">→</i></Link>
          </div>
        </div>

        <div className="feature-grid">
          {features.map(([number, title, description]) => (
            <article className="feature-card" key={number}>
              <span>{number}</span>
              <div className="feature-icon" aria-hidden="true">✓</div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <Link className="feature-link" href="/features">Explore the full feature set <span aria-hidden="true">→</span></Link>
      </section>

      <section className="page-section faq-section" id="faq" aria-labelledby="faq-title">
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

      <section className="closing-section" aria-labelledby="closing-title">
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
