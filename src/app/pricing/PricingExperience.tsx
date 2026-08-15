'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import PricingCalculator from './PricingCalculator';
import {
  ADD_ONS,
  COMPARISON_ROWS,
  ENTERPRISE,
  PLANS,
  PRICING_FAQS,
  VOICE_MONTHLY_BY_PLAN,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from './pricing-catalog';
import styles from './pricing.module.css';

const CARD_FEATURES: Record<PlanId, readonly string[]> = {
  flex: [
    'Unlimited leads, quotes, jobs, and invoices',
    '1 office user + 2 crew users',
    'Custom-domain connection + QuickBooks Online',
    'Shared LGQ texting number',
    'One-time starter messaging and AI credits',
  ],
  solo: [
    'Everything essential for an owner-operator',
    '1 office user + 2 crew users',
    'Your own voice/text business number',
    '500 text + 250 AI Intake credits/month',
    'Custom domain + QuickBooks Online',
  ],
  growth: [
    '5 office users + 10 crew users',
    'Your own voice/text business number',
    '1,500 text + 500 AI Intake credits/month',
    '2,500 marketing sends + 250 AI drafts/month',
    'Smart Phone Receptionist available',
  ],
  scale: [
    'The same core team and usage capacity as Growth',
    '0% LGQ payment fee',
    'Smart Phone Receptionist included',
    '3 simultaneous AI calls + advanced routing',
    '90-day Receptionist call history',
  ],
};

const COMPETITORS = [
  {
    provider: 'Let’s Get Quoted',
    plan: 'Growth',
    monthly: '$129 + 0.25%',
    annual: '$99 + 0.25%',
    users: '5 office + 10 crew',
    phone: 'Dedicated number; Receptionist +$55',
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

function price(plan: PricingPlan, billing: BillingCycle): number {
  return billing === 'annual' ? plan.annualMonthly : plan.monthly;
}

function voiceDescription(plan: PricingPlan): string {
  const allowance = `${plan.voiceMinutes} AI-connected minutes`;
  return plan.id === 'scale'
    ? `Included · ${allowance}`
    : `$${VOICE_MONTHLY_BY_PLAN[plan.id]}/month · ${allowance}`;
}

function signupHref(
  plan: PlanId,
  billing: BillingCycle,
  includeVoice: boolean,
  includeMessaging: boolean,
): string {
  const options = [
    `plan=${plan}`,
    `billing=${billing}`,
    includeVoice ? 'voice=1' : '',
    includeMessaging ? 'messaging=1' : '',
  ].filter(Boolean);
  return `${APP_SIGNUP_URL}&${options.join('&')}`;
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
  const [includeVoice, setIncludeVoice] = useState(false);
  const [includeMessaging, setIncludeMessaging] = useState(false);
  const [volume, setVolume] = useState(250_000);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.heroEyebrow}>Pricing built for working contractors</p>
            <h1>Powerful contractor software at a surprisingly reasonable price.</h1>
            <p className={styles.heroLead}>
              Start without a monthly bill, add your own business number when you are ready, and reach 0% LGQ fees
              as your business grows. No forced upgrades. No hidden feature maze.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#plans">Choose a plan</a>
              <a className={styles.secondaryButton} href="#calculator">Run my numbers</a>
            </div>
            <ul className={styles.heroProof} aria-label="Pricing highlights">
              <li>QuickBooks Online on every plan</li>
              <li>Free onboarding + quick tour</li>
              <li>Normal quote form never shuts off</li>
            </ul>
          </div>

          <aside className={styles.heroBoard} aria-label="How LGQ pricing grows with a contractor">
            <p className={styles.boardLabel}>A clear path as you grow</p>
            <ol>
              <li data-plan="flex"><span>Starting out</span><strong>$0/mo + 1.25%</strong></li>
              <li data-plan="solo"><span>Owner-operator</span><strong>$39/mo + 0.50%</strong></li>
              <li data-plan="growth"><span>Growing team</span><strong>$129/mo + 0.25%</strong></li>
              <li data-plan="scale"><span>High volume</span><strong>$329/mo + 0%</strong></li>
            </ol>
            <p className={styles.boardNote}>Stripe processing is separate and paid by the contractor.</p>
          </aside>
        </div>
        <div className={styles.previewNotice}>
          <strong>New-plan preview</strong>
          <span>Paid-plan activation follows final payment-infrastructure and usage-control verification.</span>
        </div>
      </section>

      <nav className={styles.sectionNav} aria-label="Pricing sections">
        <a href="#plans">Plans</a>
        <a href="#calculator">Cost calculator</a>
        <a href="#receptionist">Receptionist</a>
        <a href="#compare">Compare</a>
        <a href="#questions">Questions</a>
      </nav>

      <section className={styles.plansSection} id="plans">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Choose what fits today</p>
            <h2>Four useful steps. No dead-end starter plan.</h2>
            <p>Pick by the way your business works. The calculator below handles the revenue math.</p>
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

        <div className={styles.quickOptions} aria-label="Add options while comparing plans">
          <button
            type="button"
            className={includeVoice ? styles.quickOptionSelected : undefined}
            aria-pressed={includeVoice}
            onClick={() => setIncludeVoice((selected) => !selected)}
          >
            <span className={styles.quickIcon} aria-hidden="true">V</span>
            <span><strong>{includeVoice ? 'Voice added' : 'Add Voice'}</strong><small>From $55/mo · included on Scale</small></span>
            <b aria-hidden="true">{includeVoice ? '✓' : '+'}</b>
          </button>
          <button
            type="button"
            className={includeMessaging ? styles.quickOptionSelected : undefined}
            aria-pressed={includeMessaging}
            onClick={() => setIncludeMessaging((selected) => !selected)}
          >
            <span className={styles.quickIcon} aria-hidden="true">2W</span>
            <span><strong>{includeMessaging ? '2-Way Messaging added' : 'Add 2-Way Messaging'}</strong><small>Included on every plan · usage limits apply</small></span>
            <b aria-hidden="true">{includeMessaging ? '✓' : '+'}</b>
          </button>
          <p>These quick picks update the cards and calculator. Messaging is already part of every plan.</p>
        </div>

        <div className={styles.planGrid}>
          {PLANS.map((plan) => {
            const selectedPrice = price(plan, billing);
            const annualTotal = plan.annualMonthly * 12;
            const annualSavings = (plan.monthly - plan.annualMonthly) * 12;
            return (
              <article
                key={plan.id}
                className={`${styles.planCard}${plan.featured ? ` ${styles.featuredCard}` : ''}`}
                data-plan={plan.id}
              >
                <div className={styles.planAccent} />
                {plan.featured ? <span className={styles.featuredBadge}>Best for teams</span> : null}
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
                  <span>LGQ payment fee</span>
                  <strong>{plan.paymentFeePct.toFixed(plan.paymentFeePct === 0 ? 0 : 2)}%</strong>
                  <InfoBubble label={`${plan.name} LGQ payment fee`}>
                    Applied only to the discount-adjusted service subtotal successfully collected through LGQ.
                    Separately stated tax, tips, Stripe fees, refunds, and credits are excluded.
                  </InfoBubble>
                </div>

                <ul className={styles.cardFeatures}>
                  {CARD_FEATURES[plan.id].map((feature) => <li key={feature}>{feature}</li>)}
                </ul>

                <div className={styles.selectedOptions}>
                  <span data-active={includeVoice || plan.id === 'scale'}>
                    <b>Voice</b>
                    {plan.id === 'scale' || includeVoice ? voiceDescription(plan) : 'Not selected'}
                  </span>
                  <span data-active={includeMessaging}>
                    <b>2-Way Messaging</b>
                    {includeMessaging ? plan.messagingSummary : 'Included; quick pick not selected'}
                  </span>
                </div>

                <a
                  className={plan.featured ? styles.primaryButton : styles.planButton}
                  href={signupHref(plan.id, billing, includeVoice, includeMessaging)}
                >
                  Choose {plan.name}
                </a>

                <details className={styles.cardDetails}>
                  <summary>See every included item</summary>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                </details>
              </article>
            );
          })}
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

      <section className={styles.calculatorSection} id="calculator">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Run your real numbers</p>
          <h2>See what LGQ revenue looks like at different contractor sizes.</h2>
          <p>The lowest-price plan changes with billing cadence, payment volume, and whether you need live AI calls.</p>
        </div>
        <div className={styles.calculatorOptionRow}>
          <span>Calculator options:</span>
          <button type="button" aria-pressed={includeVoice} onClick={() => setIncludeVoice((selected) => !selected)}>
            {includeVoice ? '✓ Receptionist included' : '+ Add Receptionist'}
          </button>
          <strong>{billing === 'annual' ? 'Annual billing' : 'Monthly billing'}</strong>
        </div>
        <PricingCalculator
          billing={billing}
          volume={volume}
          includeVoice={includeVoice}
          onVolumeChange={setVolume}
        />
      </section>

      <section className={styles.voiceSection} id="receptionist">
        <div className={styles.sectionHeadingSplit}>
          <div>
            <p className={styles.sectionEyebrow}>Never miss the next good job</p>
            <h2>Smart Phone Receptionist</h2>
            <p>
              Answers calls, gathers job details, and routes the caller using your rules. It uses a dedicated business
              number and keeps working after hours.
            </p>
          </div>
          <div className={styles.voiceProof}>
            <strong>Safe at the limit</strong>
            <span>The active call finishes, then new callers follow forwarding or voicemail.</span>
          </div>
        </div>

        <div className={styles.voiceGrid}>
          {PLANS.map((plan) => (
            <article key={plan.id} data-plan={plan.id}>
              <span>{plan.name}</span>
              <strong>{voiceDescription(plan)}</strong>
              <p>{plan.voiceConcurrentCalls} simultaneous AI {plan.voiceConcurrentCalls === 1 ? 'call' : 'calls'}</p>
              <small>{plan.id === 'scale' ? 'Advanced routing · 90-day history' : 'Standard routing · 30-day history'}</small>
            </article>
          ))}
        </div>
        <p className={styles.sectionFinePrint}>
          AI-connected minutes are separate from text and AI Intake credits. Ringing, failed calls, blocked spam, and
          time after a completed transfer do not use AI minutes. Extra usage requires your approval and spending cap.
        </p>
      </section>

      <section className={styles.compareSection} id="compare">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>Straight answers before checkout</p>
          <h2>Compare the details without squinting.</h2>
          <p>Core business records stay unlimited. We meter the services that create real usage cost.</p>
        </div>

        <details className={styles.disclosure} open>
          <summary>
            <span><strong>Full LGQ feature comparison</strong><small>Every allowance and plan gate</small></span>
            <b aria-hidden="true">+</b>
          </summary>
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
                <div key={item.label}><span><strong>{item.label}</strong><small>{item.eligibility}</small></span><b>{item.price}</b></div>
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
              payment fees. “No published percentage” elsewhere does not mean payment processing, phone, AI, seats,
              or add-ons are free. Plans are not feature-identical.
            </p>
          </details>
        </div>
      </section>

      <section className={styles.promiseSection}>
        <div><strong>Unlimited core work</strong><span>Leads, clients, quotes, jobs, invoices, and standard forms.</span></div>
        <div><strong>No unapproved overages</strong><span>Top up once or deliberately enable a spending cap.</span></div>
        <div><strong>No lost website leads</strong><span>When AI Intake ends, LGQ switches to the normal quote form.</span></div>
        <div><strong>Bring your books</strong><span>One QuickBooks Online connection is included on every plan.</span></div>
      </section>

      <section className={styles.faqSection} id="questions">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionEyebrow}>The fine print, in plain English</p>
          <h2>Questions contractors actually ask.</h2>
        </div>
        <div className={styles.faqGrid}>
          {PRICING_FAQS.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary>{item.q}<span aria-hidden="true">+</span></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionEyebrow}>Built to earn its place in your truck</p>
        <h2>Start small. Keep the same system as you grow.</h2>
        <p>Flex starts at $0/month plus 1.25% on eligible payments. Upgrade only when the math or your team says it is time.</p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href={signupHref('flex', billing, includeVoice, includeMessaging)}>Choose Flex</a>
          <Link className={styles.secondaryButton} href="/contact">Talk to a real person</Link>
        </div>
      </section>
    </>
  );
}
