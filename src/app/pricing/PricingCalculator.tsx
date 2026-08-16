'use client';

import { useMemo } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import {
  PLANS,
  annualPlanCost,
  planCrossover,
  type BillingCycle,
  type PlanId,
} from './pricing-catalog';
import styles from './pricing.module.css';

type PricingCalculatorProps = {
  billing: BillingCycle;
  volume: number;
  includeVoice: boolean;
  onVolumeChange: (volume: number) => void;
};

const PLAN_LABELS: Record<PlanId, string> = {
  flex: 'Flex',
  solo: 'Solo',
  growth: 'Growth',
  scale: 'Scale',
};

const MAX_VOLUME = 1_500_000;

const VOLUME_PRESETS = [
  { label: 'Seasonal', value: 40_000 },
  { label: 'Owner-operator', value: 250_000 },
  { label: 'Growing team', value: 600_000 },
] as const;

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function signupHref(plan: PlanId, billing: BillingCycle, includeVoice: boolean): string {
  const options = [
    `plan=${plan}`,
    `billing=${billing}`,
    includeVoice ? 'voice=1' : '',
  ].filter(Boolean);
  return `${APP_SIGNUP_URL}&${options.join('&')}`;
}

export default function PricingCalculator({
  billing,
  volume,
  includeVoice,
  onVolumeChange,
}: PricingCalculatorProps) {
  const results = useMemo(
    () =>
      PLANS.map((plan) => ({
        plan,
        annualCost: annualPlanCost(plan, billing, volume, includeVoice),
      })),
    [billing, includeVoice, volume],
  );

  const rankedResults = [...results].sort((a, b) => a.annualCost - b.annualCost);
  const winner = rankedResults[0];
  const runnerUp = rankedResults[1];
  const annualSavings = Math.max(0, runnerUp.annualCost - winner.annualCost);
  const highestCost = Math.max(...results.map((result) => result.annualCost), 1);

  const updateVolume = (nextVolume: number) => {
    const safeVolume = Number.isFinite(nextVolume) ? nextVolume : 0;
    onVolumeChange(Math.min(MAX_VOLUME, Math.max(0, Math.round(safeVolume))));
  };

  const crossovers = useMemo(
    () => [
      {
        from: PLANS[0],
        to: PLANS[1],
        volume: planCrossover(PLANS[0], PLANS[1], billing, includeVoice),
      },
      {
        from: PLANS[1],
        to: PLANS[2],
        volume: planCrossover(PLANS[1], PLANS[2], billing, includeVoice),
      },
      {
        from: PLANS[2],
        to: PLANS[3],
        volume: planCrossover(PLANS[2], PLANS[3], billing, includeVoice),
      },
    ],
    [billing, includeVoice],
  );

  return (
    <div className={styles.calculatorShell}>
      <div className={styles.calculatorLead}>
        <div className={styles.volumeControl}>
          <label htmlFor="pricing-volume-exact" className={styles.controlLabel}>Annual payments collected through LGQ</label>
          <div className={styles.volumeEntry}>
            <span aria-hidden="true">$</span>
            <input
              id="pricing-volume-exact"
              type="number"
              min={0}
              max={MAX_VOLUME}
              step={5_000}
              inputMode="numeric"
              value={volume}
              onChange={(event) => updateVolume(Number(event.target.value))}
            />
          </div>
          <div className={styles.volumePresets} aria-label="Common annual payment amounts">
            {VOLUME_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.label}
                data-active={volume === preset.value}
                aria-pressed={volume === preset.value}
                onClick={() => updateVolume(preset.value)}
              >
                <span>{preset.label}</span>
                <strong>{money(preset.value)}</strong>
              </button>
            ))}
          </div>
          <input
            id="pricing-volume"
            type="range"
            min={0}
            max={MAX_VOLUME}
            step={5_000}
            value={volume}
            aria-label="Annual payments collected through LGQ"
            onChange={(event) => updateVolume(Number(event.target.value))}
          />
          <span className={styles.rangeEnds} aria-hidden="true">
            <span>$0</span>
            <span>$1.5M+</span>
          </span>
          <p className={styles.volumeDefinition}>
            Use the discount-adjusted service subtotal you expect to collect through LGQ. Taxes, tips, refunds,
            credits, and Stripe processing are excluded.
          </p>
        </div>

        <div className={styles.calculatorAnswer} data-plan={winner.plan.id}>
          <span className={styles.srOnly} aria-live="polite">
            {winner.plan.name} is the lowest-cost plan at {money(volume)} in annual payments.
          </span>
          <span>At {money(volume)} in annual payments</span>
          <div className={styles.answerPlan}>
            <small>Your lowest-cost fit</small>
            <strong>{winner.plan.name}</strong>
          </div>
          <div className={styles.answerCost}>
            <strong>{money(winner.annualCost / 12)}</strong>
            <span>/month effective</span>
          </div>
          <p>
            {money(winner.annualCost)}/year total · saves {money(annualSavings)}/year compared with {runnerUp.plan.name}
          </p>
          <span className={styles.answerStripe}>Stripe processing is paid separately.</span>
          <div className={styles.answerActions}>
            <a className={styles.calculatorCta} href={signupHref(winner.plan.id, billing, includeVoice)}>
              {winner.plan.id === 'flex' ? 'Start with Flex' : `Choose ${winner.plan.name}`}
            </a>
            <a href="#plans">Compare plan details</a>
          </div>
        </div>
      </div>

      <div className={styles.costRace} aria-label="Estimated annual plan costs">
        <div className={styles.costRaceHeading}>
          <span>Estimated annual cost <b>Lower is better</b></span>
          <small>Subscription + LGQ fee{includeVoice ? ' + AI Voice Receptionist' : ''}</small>
        </div>
        {results.map(({ plan, annualCost }) => {
          const isWinner = winner.plan.id === plan.id;
          return (
            <article className={isWinner ? styles.costBarWinner : undefined} data-plan={plan.id} key={plan.id}>
              <div className={styles.costBarHeading}>
                <span>{plan.name}</span>
                {isWinner ? <em>Best fit</em> : null}
              </div>
              <span className={styles.costBarTrack} aria-hidden="true">
                <span style={{ width: `${Math.max(6, (annualCost / highestCost) * 100)}%` }} />
              </span>
              <strong>{money(annualCost)}</strong>
            </article>
          );
        })}
      </div>

      <div className={styles.crossoverGrid}>
        <div>
          <p className={styles.miniEyebrow}>Where the math changes</p>
          <h3>Three natural handoff points.</h3>
          <p>
            These are price breakpoints, not forced upgrades. Team, phone, and workflow capacity still matter.
          </p>
        </div>
        <ol>
          {crossovers.map((crossover, index) => (
            <li key={`${crossover.from.id}-${crossover.to.id}`}>
              <span className={styles.crossoverNumber}>0{index + 1}</span>
              <div>
                <span>{PLAN_LABELS[crossover.from.id]} → {PLAN_LABELS[crossover.to.id]}</span>
                <strong>{money(crossover.volume)}/year</strong>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className={styles.calculatorFinePrint}>
        Estimate includes the selected subscription, LGQ payment fee, and the base AI Voice Receptionist package when
        selected. It assumes usage stays within included minutes and excludes Stripe processing, taxes, and optional
        top-ups. Stripe costs are paid separately by the contractor.
      </p>
    </div>
  );
}
