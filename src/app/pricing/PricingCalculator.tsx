'use client';

import { useMemo } from 'react';
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

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
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

  const winner = results.reduce((best, result) =>
    result.annualCost < best.annualCost ? result : best,
  );
  const highestCost = Math.max(...results.map((result) => result.annualCost), 1);

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
      <div className={styles.calculatorControls}>
        <label htmlFor="pricing-volume" className={styles.volumeControl}>
          <span className={styles.controlLabel}>About how much will customers pay you through LGQ each year?</span>
          <output className={styles.volumeOutput} htmlFor="pricing-volume">
            {money(volume)}
          </output>
          <input
            id="pricing-volume"
            type="range"
            min={0}
            max={1_500_000}
            step={25_000}
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
          <span className={styles.rangeEnds} aria-hidden="true">
            <span>$0</span>
            <span>$1.5M+</span>
          </span>
        </label>

        <div className={styles.calculatorAnswer}>
          <span>Lowest estimated cost</span>
          <strong>{winner.plan.name}</strong>
          <small>{money(winner.annualCost)}/year · about {money(winner.annualCost / 12)}/month</small>
        </div>
      </div>

      <div className={styles.costBars} aria-label="Estimated annual plan costs">
        {results.map(({ plan, annualCost }) => {
          const isWinner = winner.plan.id === plan.id;
          return (
            <article
              className={`${styles.costBarCard}${isWinner ? ` ${styles.costBarWinner}` : ''}`}
              data-plan={plan.id}
              key={plan.id}
            >
              <div className={styles.costBarHeading}>
                <span>{plan.name}</span>
                {isWinner ? <em>Best estimate</em> : null}
              </div>
              <strong>{money(annualCost)}</strong>
              <span className={styles.costBarTrack} aria-hidden="true">
                <span style={{ width: `${Math.max(6, (annualCost / highestCost) * 100)}%` }} />
              </span>
              <small>{money(annualCost / 12)}/month effective</small>
            </article>
          );
        })}
      </div>

      <div className={styles.crossoverGrid}>
        <div>
          <p className={styles.miniEyebrow}>Where the math changes</p>
          <h3>Simple crossover points</h3>
          <p>
            These are price breakpoints, not forced upgrades. Choose the plan whose people, phone, and workflow
            capacity fit your business.
          </p>
        </div>
        <ol>
          {crossovers.map((crossover) => (
            <li key={`${crossover.from.id}-${crossover.to.id}`}>
              <span>{PLAN_LABELS[crossover.from.id]} → {PLAN_LABELS[crossover.to.id]}</span>
              <strong>{money(crossover.volume)}/year</strong>
            </li>
          ))}
        </ol>
      </div>

      <p className={styles.calculatorFinePrint}>
        Estimate includes the selected subscription, LGQ payment fee, and the base Receptionist package when
        selected. It assumes usage stays within included minutes and excludes Stripe processing, taxes, and optional
        top-ups. Stripe costs are paid separately by the contractor.
      </p>
    </div>
  );
}
