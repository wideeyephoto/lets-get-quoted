'use client';

import { useMemo, useState } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import {
  PLANS,
  VOICE_PURCHASABLE,
  OFFICE_USER_ADD_ON_MONTHLY,
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
  needsDedicatedNumber: boolean;
  onBillingChange: (value: BillingCycle) => void;
  onVolumeChange: (value: number) => void;
  onOfficeUsersChange: (value: number) => void;
  onDedicatedNumberChange: (value: boolean) => void;
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
  needsDedicatedNumber,
  onBillingChange,
  onVolumeChange,
  onOfficeUsersChange,
  onDedicatedNumberChange,
}: Props) {
  const [volumeCadence, setVolumeCadence] = useState<BillingCycle>('annual');
  const divisor = volumeCadence === 'monthly' ? 12 : 1;
  const displayedVolume = Math.round(volume / divisor);

  const results = useMemo(() => PLANS.map((plan) => ({
    plan,
    annualCost: annualPlanEstimate(plan, billing, volume, VOICE_PURCHASABLE, officeUsers, needsDedicatedNumber),
  })), [billing, needsDedicatedNumber, officeUsers, volume]);

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
          <span className={styles.controlLabel}>Dedicated business number (at launch)</span>
          <button
            className={styles.requirementToggle}
            type="button"
            aria-pressed={needsDedicatedNumber}
            onClick={() => onDedicatedNumberChange(!needsDedicatedNumber)}
          >
            {needsDedicatedNumber ? 'Required' : 'Not required'}
          </button>
        </div>
        <p className={styles.requirementsHint}>
          Flex supports one office user and a shared texting number. Extra office users on Solo+ are $15/month.
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
          </div>

          <span className={styles.answerStripe}>Stripe processing is paid separately.</span>

          <div className={styles.answerActions}>
            <a className={styles.calculatorCta} href={signupHref(winner.plan.id, billing)}>
              {winner.plan.id === 'flex' ? 'Start with Flex' : `Choose ${winner.plan.name}`}
            </a>
            <a href="#plans">Compare plan details</a>
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

      <p className={styles.calculatorFinePrint}>
        Estimate includes the selected subscription, LGQ platform fee, and extra office users. AI Voice Receptionist is
        not available yet and adds nothing to these figures. The comparison assumes usage stays within each plan’s
        allowances and excludes Stripe processing, taxes, and optional top-ups.
      </p>
    </div>
  );
}
