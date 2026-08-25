'use client';

import { useMemo, useState } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import {
  PLANS,
  VOICE_PURCHASABLE,
  OFFICE_USER_ADD_ON_MONTHLY,
  COMPETITOR_BENCHMARKS,
  estimateCompetitorAnnualCost,
  annualPlanEstimate,
  annualFixedCost,
  planCrossover,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from './pricing-catalog';
import { rankPlanCosts } from './pricing-ranking';
import styles from './pricing.module.css';

type Props = {
  billing: BillingCycle;
  volume: number;
  officeUsers: number;
  onBillingChange: (value: BillingCycle) => void;
  onVolumeChange: (value: number) => void;
  onOfficeUsersChange: (value: number) => void;
};

const LABELS: Record<PlanId, string> = { flex: 'Flex', solo: 'Solo', growth: 'Growth', scale: 'Scale' };
const MAX_VOLUME = 3_000_000;
const PRESETS = [
  { label: 'Seasonal', sublabel: 'Handyman / Lawn', value: 40_000 },
  { label: 'Owner-operator', sublabel: 'Electrician / Plumber', value: 250_000 },
  { label: 'Growing team', sublabel: 'HVAC / Remodeling', value: 600_000 },
  { label: 'High volume', sublabel: 'Roofing / Multi-Truck', value: 2_000_000 },
] as const;

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function signupHref(plan: PlanId, billing: BillingCycle) {
  return `${APP_SIGNUP_URL}&${[`plan=${plan}`, `billing=${billing}`].join('&')}`;
}

export default function PricingCalculator({
  billing,
  volume,
  officeUsers,
  onBillingChange,
  onVolumeChange,
  onOfficeUsersChange,
}: Props) {
  const [volumeCadence, setVolumeCadence] = useState<BillingCycle>('annual');
  const divisor = volumeCadence === 'monthly' ? 12 : 1;
  const displayedVolume = Math.round(volume / divisor);

  const results = useMemo(() => PLANS.map((plan) => ({
    plan,
    annualCost: annualPlanEstimate(plan, billing, volume, VOICE_PURCHASABLE, officeUsers, false),
  })), [billing, officeUsers, volume]);

  const eligible = results.filter((result): result is typeof result & { annualCost: number } => result.annualCost !== null);
  const ranking = rankPlanCosts(results.map(({ plan, annualCost }) => ({ planId: plan.id, annualCost })));
  const winner = eligible.find((result) => result.plan.id === ranking.winner?.planId) ?? eligible[0];
  const runnerUp = eligible.find((result) => result.plan.id === ranking.runnerUp?.planId);
  const tiedPlans = ranking.tiedPlanIds
    .filter((planId) => planId !== winner.plan.id)
    .map((planId) => LABELS[planId]);
  const savings = runnerUp ? Math.max(0, runnerUp.annualCost - winner.annualCost) : 0;
  const highestCost = Math.max(...eligible.map((result) => result.annualCost), 1);

  const updateDisplayedVolume = (value: number) =>
    onVolumeChange(Math.min(MAX_VOLUME, Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * divisor))));

  const crossovers = useMemo(() => [
    { from: PLANS[0], to: PLANS[1], volume: planCrossover(PLANS[0], PLANS[1], billing, VOICE_PURCHASABLE) },
    { from: PLANS[1], to: PLANS[2], volume: planCrossover(PLANS[1], PLANS[2], billing, VOICE_PURCHASABLE) },
    { from: PLANS[2], to: PLANS[3], volume: planCrossover(PLANS[2], PLANS[3], billing, VOICE_PURCHASABLE) },
  ], [billing]);

  // Breakdown calculations for the winning plan
  const winnerPlan: PricingPlan = winner.plan;
  const winnerBaseAnnual = annualFixedCost(winnerPlan, billing, VOICE_PURCHASABLE);
  const winnerBaseMonthly = winnerBaseAnnual / 12;
  const winnerPlatformFeeAnnual = volume * (winnerPlan.paymentFeePct / 100);
  const winnerPlatformFeeMonthly = winnerPlatformFeeAnnual / 12;
  const extraSeats = Math.max(0, (officeUsers || 1) - winnerPlan.officeUsers);
  const extraSeatsAnnual = extraSeats * OFFICE_USER_ADD_ON_MONTHLY * 12;
  const extraSeatsMonthly = extraSeatsAnnual / 12;
  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('volume', String(volume));
      url.searchParams.set('billing', billing);
      url.searchParams.set('users', String(officeUsers));
      navigator.clipboard.writeText(url.toString()).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      });
    }
  };

  const flexFeeAnnual = volume * 0.0125;
  const winnerFeeAnnual = volume * (winnerPlan.paymentFeePct / 100);
  const feeSavingsVsFlex = flexFeeAnnual - winnerFeeAnnual;
  const [showCompetitorComparison, setShowCompetitorComparison] = useState(true);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('jobber');
  const [monthlyPurchasedLeads, setMonthlyPurchasedLeads] = useState(10);

  return (
    <div className={styles.calculatorShell}>
      <div className={styles.calculatorRequirements}>
        <div>
          <span className={styles.controlLabel}>Billing cycle</span>
          <div className={styles.calculatorBillingToggle} role="group" aria-label="Calculator billing cycle">
            <button
              type="button"
              aria-pressed={billing === 'monthly'}
              onClick={() => onBillingChange('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={billing === 'annual'}
              onClick={() => onBillingChange('annual')}
            >
              Annual
            </button>
          </div>
        </div>

        <label>
          <span className={styles.controlLabel}>Office users needed</span>
          <input
            type="number"
            min={1}
            max={25}
            value={officeUsers}
            onChange={(event) => onOfficeUsersChange(Number(event.target.value))}
          />
        </label>

        <div>
          <span className={styles.controlLabel}>2-Way Customer Messaging</span>
          <div
            className={styles.requirementToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              pointerEvents: 'none',
              background: 'rgba(82, 217, 172, 0.08)',
              borderColor: 'rgba(82, 217, 172, 0.4)',
              fontSize: '0.70rem',
              lineHeight: 1.3,
              fontWeight: 600,
              padding: '0.4rem 0.6rem',
            }}
          >
            Messaging software included; carrier registration and number fees separate
          </div>
        </div>
        <p className={styles.requirementsHint}>
          Flex supports 1 office user + 2 crew users. Extra office users on Solo+ are $15/month.
        </p>
      </div>

      <div className={styles.calculatorLead}>
        <div className={styles.volumeControl}>
          <div className={styles.volumeControlHeader}>
            <label htmlFor="pricing-volume-exact" className={styles.controlLabel}>
              Payments collected through LGQ
            </label>
            <div className={styles.volumeCadence} role="group" aria-label="Payment volume cadence">
              <button
                type="button"
                aria-pressed={volumeCadence === 'monthly'}
                onClick={() => setVolumeCadence('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={volumeCadence === 'annual'}
                onClick={() => setVolumeCadence('annual')}
              >
                Annual
              </button>
            </div>
          </div>

          <div className={styles.volumeEntry}>
            <span aria-hidden="true">$</span>
            <input
              id="pricing-volume-exact"
              type="text"
              inputMode="numeric"
              value={displayedVolume.toLocaleString('en-US')}
              onChange={(event) => updateDisplayedVolume(Number(event.target.value.replace(/\D/g, '')))}
            />
          </div>

          <div className={styles.volumePresets} aria-label={`Common ${volumeCadence} payment amounts`}>
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.label}
                data-active={volume === preset.value}
                aria-pressed={volume === preset.value}
                onClick={() => onVolumeChange(preset.value)}
              >
                <span>{preset.label}</span>
                <strong>
                  {money(Math.round(preset.value / divisor))}
                  {volumeCadence === 'monthly' ? '/mo' : ''}
                </strong>
              </button>
            ))}
          </div>

          <div className={styles.sliderBubbleTrack}>
            <span
              className={styles.sliderBubble}
              style={{ left: `calc(${Math.min(100, Math.max(0, (displayedVolume / (MAX_VOLUME / divisor)) * 100))}% + (${10 - Math.min(100, Math.max(0, (displayedVolume / (MAX_VOLUME / divisor)) * 100)) * 0.2}px))` }}
            >
              {money(displayedVolume)}{volumeCadence === 'monthly' ? '/mo' : ''}
            </span>
          </div>

          <input
            id="pricing-volume"
            type="range"
            min={0}
            max={MAX_VOLUME / divisor}
            step={volumeCadence === 'monthly' ? 500 : 5_000}
            value={displayedVolume}
            aria-label={`${volumeCadence} payments collected through LGQ`}
            onChange={(event) => updateDisplayedVolume(Number(event.target.value))}
          />
          <span className={styles.rangeEnds} aria-hidden="true">
            <span>$0</span>
            <span>{volumeCadence === 'monthly' ? '$250K+' : '$3M+'}</span>
          </span>
          <p className={styles.volumeDefinition}>
            Use the discount-adjusted service subtotal you expect to collect through LGQ. Monthly entries are annualized.
            Taxes, tips, refunds, credits, and Stripe processing are excluded.
          </p>
        </div>

        <div className={styles.calculatorAnswer} data-plan={winner.plan.id}>
          <span className={styles.srOnly} aria-live="polite">
            {tiedPlans.length > 0
              ? `${winner.plan.name} ties ${tiedPlans.join(' and ')} for lowest cost and is recommended for its additional included capability`
              : `${winner.plan.name} is the lowest-cost eligible plan`}{' '}
            at {money(volume)} in annual payments.
          </span>

          <span className={styles.answerContext}>At {money(volume)} in annual payments</span>

          <div className={styles.answerPlan}>
            <small>
              {tiedPlans.length > 0
                ? 'Lowest-cost tie · more included capability'
                : 'Your lowest-cost eligible plan'}
            </small>
            <strong>{winner.plan.name}</strong>
          </div>

          <div className={styles.answerCost}>
            <strong>{money(winner.annualCost / 12)}</strong>
            <span>/month effective</span>
          </div>

          <p className={styles.answerTotal}>
            {money(winner.annualCost)}/year total
            {tiedPlans.length > 0
              ? ` · same estimated price as ${tiedPlans.join(' and ')}`
              : runnerUp
                ? ` · saves ${money(savings)}/year compared with ${runnerUp.plan.name}`
                : ''}
          </p>

          <div className={styles.costBreakdownPanel}>
            <div className={styles.breakdownRow}>
              <span>Base Subscription</span>
              <strong>{money(winnerBaseMonthly)}/mo</strong>
            </div>
            <div className={styles.breakdownRow}>
              <span>LGQ Platform Fee ({winnerPlan.paymentFeePct}%)</span>
              <strong>{money(winnerPlatformFeeMonthly)}/mo</strong>
            </div>
            {extraSeats > 0 ? (
              <div className={styles.breakdownRow}>
                <span>{extraSeats} Extra Office {extraSeats === 1 ? 'User' : 'Users'}</span>
                <strong>{money(extraSeatsMonthly)}/mo</strong>
              </div>
            ) : null}
            {feeSavingsVsFlex > 0 && winner.plan.id !== 'flex' ? (
              <div className={styles.feeSavingsBadge}>
                <span>Platform fee advantage:</span>
                <strong>Saves {money(feeSavingsVsFlex)}/yr vs 1.25% starter rate</strong>
              </div>
            ) : null}
          </div>

          <span className={styles.answerStripe}>Stripe processing is paid separately.</span>

          <div className={styles.answerActions}>
            <a className={styles.calculatorCta} href={signupHref(winner.plan.id, billing)}>
              {winner.plan.id === 'flex' ? 'Start with Flex' : `Choose ${winner.plan.name}`}
            </a>
            <div className={styles.secondaryActions}>
              <a href="#plans">Compare plan details</a>
              <button
                type="button"
                onClick={handleCopyLink}
                className={styles.shareEstimateButton}
                title="Copy shareable link for this calculation"
              >
                {copiedLink ? '✓ Link copied!' : '🔗 Share estimate'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.costRace} aria-label="Estimated annual plan costs">
        <div className={styles.costRaceHeading}>
          <span>
            Estimated annual cost <b>Lower is better</b>
          </span>
          <small>Subscription + LGQ platform fee</small>
        </div>
        {results.map(({ plan, annualCost }) => {
          const isWinner = winner.plan.id === plan.id;
          const isTied = !isWinner && ranking.tiedPlanIds.includes(plan.id);
          const excluded = annualCost === null;
          return (
            <article
              className={isWinner ? styles.costBarWinner : excluded ? styles.costBarIneligible : undefined}
              data-plan={plan.id}
              key={plan.id}
            >
              <div className={styles.costBarHeading}>
                <span>{plan.name}</span>
                {isWinner ? (
                  <em>Best fit</em>
                ) : isTied ? (
                  <em>Same price</em>
                ) : excluded ? (
                  <em>Not eligible</em>
                ) : null}
              </div>
              <span className={styles.costBarTrack} aria-hidden="true">
                <span
                  style={{
                    width: excluded ? '0%' : `${Math.max(6, (annualCost / highestCost) * 100)}%`,
                  }}
                />
              </span>
              <strong>{excluded ? 'Needs Solo+' : money(annualCost)}</strong>
            </article>
          );
        })}
      </div>

      <div className={styles.crossoverGrid}>
        <div>
          <p className={styles.miniEyebrow}>Where the math changes</p>
          <h3>Three natural handoff points.</h3>
          <p>These are price breakpoints, not forced upgrades. Team, phone, and workflow capacity still matter.</p>
        </div>
        <ol>
          {crossovers.map((item, index) => (
            <li
              key={`${item.from.id}-${item.to.id}`}
              onClick={() => onVolumeChange(item.volume)}
              className={styles.crossoverItem}
              title={`Click to set volume to ${money(item.volume)}`}
            >
              <span className={styles.crossoverNumber}>0{index + 1}</span>
              <div>
                <span>
                  {LABELS[item.from.id]} → {LABELS[item.to.id]}
                </span>
                <strong>{money(item.volume)}/year</strong>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.competitorCompareWidget}>
        <button
          type="button"
          className={styles.competitorToggleBtn}
          aria-expanded={showCompetitorComparison}
          aria-controls="pricing-competitor-compare"
          onClick={() => setShowCompetitorComparison((s) => !s)}
        >
          <span>{showCompetitorComparison ? '▼ Hide side-by-side competitor comparison' : '▶ Compare LGQ vs Jobber, Housecall Pro & Lead Brokers at this volume'}</span>
        </button>
        {showCompetitorComparison ? (
          <div id="pricing-competitor-compare" className={styles.competitorCompareCard}>
            <div className={styles.competitorHeader}>
              <span className={styles.controlLabel}>Select comparison benchmark:</span>
              <div className={styles.competitorNav} role="tablist" aria-label="Competitor benchmarks">
                {COMPETITOR_BENCHMARKS.map((comp) => {
                  const isActive = selectedCompetitorId === comp.id;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      className={`${styles.competitorTab} ${isActive ? styles.competitorTabActive : ''}`}
                      onClick={() => setSelectedCompetitorId(comp.id)}
                      role="tab"
                      aria-selected={isActive}
                    >
                      {comp.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedCompetitorId === 'leadbrokers' ? (
              <div className={styles.competitorLeadSliderRow}>
                <span>Estimate shared leads bought per month: <strong>{monthlyPurchasedLeads} leads/mo</strong> (@ ~$75/lead)</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={monthlyPurchasedLeads}
                  onChange={(e) => setMonthlyPurchasedLeads(Number(e.target.value))}
                  aria-label="Monthly shared leads purchased from brokers"
                />
                <strong>{money(monthlyPurchasedLeads * 75 * 12)}/yr spent</strong>
              </div>
            ) : null}

            {(() => {
              const activeCompetitor = COMPETITOR_BENCHMARKS.find((c) => c.id === selectedCompetitorId) ?? COMPETITOR_BENCHMARKS[0];
              const competitorCost = estimateCompetitorAnnualCost(
                activeCompetitor,
                officeUsers,
                activeCompetitor.id === 'leadbrokers' ? monthlyPurchasedLeads : 0,
              );
              const lgqCost = winner.annualCost ?? 0;
              const savings = Math.max(0, competitorCost - lgqCost);

              return (
                <>
                  <div className={styles.competitorCompareGrid}>
                    <div className={styles.competitorColLgq}>
                      <span className={styles.competitorBadge}>Let’s Get Quoted ({winner.plan.name})</span>
                      <strong>{money(lgqCost)}/yr total</strong>
                      <p>
                        Software base + {winnerPlan.paymentFeePct}% platform fee + {winnerPlan.officeUsers} office seats + QuickBooks sync + free website
                      </p>
                    </div>
                    <div className={styles.competitorCol}>
                      <span>{activeCompetitor.name}</span>
                      <strong>{money(competitorCost)}/yr total</strong>
                      <p>{activeCompetitor.notes}</p>
                    </div>
                    <div className={styles.competitorCol}>
                      <span>Structural Difference</span>
                      <strong style={{ color: '#52d9ac' }}>{savings > 0 ? `+${money(savings)}/yr kept` : 'Included team scale'}</strong>
                      <p>
                        {winnerPlan.id === 'flex'
                          ? 'Zero fixed subscription. In slow months with $0 collected, your software bill is $0.'
                          : 'Predictable pricing without per-seat surprises as your crews grow.'}
                      </p>
                    </div>
                  </div>
                  <p className={styles.competitorSummaryNote}>
                    💡 <strong>{activeCompetitor.name} comparison:</strong>{' '}
                    {savings > 0 ? (
                      <>You keep an estimated <strong>{money(savings)}/year</strong> in your pocket compared to {activeCompetitor.name}, with no surprise monthly charges during slow seasons.</>
                    ) : (
                      <>With Let’s Get Quoted {winner.plan.name}, you get built-in AI intake, automated 2-way texting, and QuickBooks sync included without stacking third-party add-on fees.</>
                    )}
                  </p>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>

      <p className={styles.calculatorFinePrint}>
        Estimate includes the selected subscription, LGQ platform fee, and extra office users. AI Voice Receptionist is
        not available yet and adds nothing to these figures. The comparison assumes usage stays within each plan’s
        allowances and excludes Stripe processing, taxes, and optional top-ups.
      </p>
    </div>
  );
}
