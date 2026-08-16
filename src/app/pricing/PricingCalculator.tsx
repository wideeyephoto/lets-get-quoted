'use client';

import { useMemo, useState } from 'react';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { PLANS, annualPlanEstimate, planCrossover, type BillingCycle, type PlanId } from './pricing-catalog';
import { rankPlanCosts } from './pricing-ranking';
import styles from './pricing.module.css';

type Props = {
  billing: BillingCycle; volume: number; includeVoice: boolean; officeUsers: number; needsDedicatedNumber: boolean;
  onBillingChange: (value: BillingCycle) => void; onVolumeChange: (value: number) => void;
  onOfficeUsersChange: (value: number) => void; onDedicatedNumberChange: (value: boolean) => void;
};

const LABELS: Record<PlanId, string> = { flex: 'Flex', solo: 'Solo', growth: 'Growth', scale: 'Scale' };
const MAX_VOLUME = 3_000_000;
const PRESETS = [
  { label: 'Seasonal', value: 40_000 }, { label: 'Owner-operator', value: 250_000 },
  { label: 'Growing team', value: 600_000 }, { label: 'High volume', value: 2_000_000 },
] as const;

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function signupHref(plan: PlanId, billing: BillingCycle, includeVoice: boolean) {
  return `${APP_SIGNUP_URL}&${[`plan=${plan}`, `billing=${billing}`, includeVoice ? 'voice=1' : ''].filter(Boolean).join('&')}`;
}

export default function PricingCalculator({ billing, volume, includeVoice, officeUsers, needsDedicatedNumber, onBillingChange, onVolumeChange, onOfficeUsersChange, onDedicatedNumberChange }: Props) {
  const [volumeCadence, setVolumeCadence] = useState<BillingCycle>('annual');
  const divisor = volumeCadence === 'monthly' ? 12 : 1;
  const displayedVolume = Math.round(volume / divisor);
  const results = useMemo(() => PLANS.map((plan) => ({
    plan,
    annualCost: annualPlanEstimate(plan, billing, volume, includeVoice, officeUsers, needsDedicatedNumber),
  })), [billing, includeVoice, needsDedicatedNumber, officeUsers, volume]);
  const eligible = results.filter((result): result is typeof result & { annualCost: number } => result.annualCost !== null);
  const ranking = rankPlanCosts(results.map(({ plan, annualCost }) => ({ planId: plan.id, annualCost })));
  const winner = eligible.find((result) => result.plan.id === ranking.winner?.planId) ?? eligible[0];
  const runnerUp = eligible.find((result) => result.plan.id === ranking.runnerUp?.planId);
  const tiedPlans = ranking.tiedPlanIds
    .filter((planId) => planId !== winner.plan.id)
    .map((planId) => LABELS[planId]);
  const savings = runnerUp ? Math.max(0, runnerUp.annualCost - winner.annualCost) : 0;
  const highestCost = Math.max(...eligible.map((result) => result.annualCost), 1);
  const updateDisplayedVolume = (value: number) => onVolumeChange(Math.min(MAX_VOLUME, Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * divisor))));
  const crossovers = useMemo(() => [
    { from: PLANS[0], to: PLANS[1], volume: planCrossover(PLANS[0], PLANS[1], billing, includeVoice) },
    { from: PLANS[1], to: PLANS[2], volume: planCrossover(PLANS[1], PLANS[2], billing, includeVoice) },
    { from: PLANS[2], to: PLANS[3], volume: planCrossover(PLANS[2], PLANS[3], billing, includeVoice) },
  ], [billing, includeVoice]);

  return <div className={styles.calculatorShell}>
    <div className={styles.calculatorRequirements}>
      <div><span className={styles.controlLabel}>Billing cycle</span><div className={styles.calculatorBillingToggle} role="group" aria-label="Calculator billing cycle">
        <button type="button" aria-pressed={billing === 'monthly'} onClick={() => onBillingChange('monthly')}>Monthly</button>
        <button type="button" aria-pressed={billing === 'annual'} onClick={() => onBillingChange('annual')}>Annual</button>
      </div></div>
      <label><span className={styles.controlLabel}>Office users needed</span><input type="number" min={1} max={25} value={officeUsers} onChange={(event) => onOfficeUsersChange(Number(event.target.value))} /></label>
      <div><span className={styles.controlLabel}>Dedicated business number</span><button className={styles.requirementToggle} type="button" aria-pressed={needsDedicatedNumber} onClick={() => onDedicatedNumberChange(!needsDedicatedNumber)}>{needsDedicatedNumber ? 'Required' : 'Not required'}</button></div>
      <p>Flex supports one office user and a shared texting number. Extra office users on Solo+ are $15/month.</p>
    </div>

    <div className={styles.calculatorLead}>
      <div className={styles.volumeControl}>
        <div className={styles.volumeControlHeader}><label htmlFor="pricing-volume-exact" className={styles.controlLabel}>Payments collected through LGQ</label><div className={styles.volumeCadence} role="group" aria-label="Payment volume cadence">
          <button type="button" aria-pressed={volumeCadence === 'monthly'} onClick={() => setVolumeCadence('monthly')}>Monthly</button><button type="button" aria-pressed={volumeCadence === 'annual'} onClick={() => setVolumeCadence('annual')}>Annual</button>
        </div></div>
        <div className={styles.volumeEntry}><span aria-hidden="true">$</span><input id="pricing-volume-exact" type="text" inputMode="numeric" value={displayedVolume.toLocaleString('en-US')} onChange={(event) => updateDisplayedVolume(Number(event.target.value.replace(/\D/g, '')))} /></div>
        <div className={styles.volumePresets} aria-label={`Common ${volumeCadence} payment amounts`}>{PRESETS.map((preset) => <button type="button" key={preset.label} data-active={volume === preset.value} aria-pressed={volume === preset.value} onClick={() => onVolumeChange(preset.value)}><span>{preset.label}</span><strong>{money(Math.round(preset.value / divisor))}{volumeCadence === 'monthly' ? '/mo' : ''}</strong></button>)}</div>
        <input id="pricing-volume" type="range" min={0} max={MAX_VOLUME / divisor} step={volumeCadence === 'monthly' ? 500 : 5_000} value={displayedVolume} aria-label={`${volumeCadence} payments collected through LGQ`} onChange={(event) => updateDisplayedVolume(Number(event.target.value))} />
        <span className={styles.rangeEnds} aria-hidden="true"><span>$0</span><span>{volumeCadence === 'monthly' ? '$250K+' : '$3M+'}</span></span>
        <p className={styles.volumeDefinition}>Use the discount-adjusted service subtotal you expect to collect through LGQ. Monthly entries are annualized. Taxes, tips, refunds, credits, and Stripe processing are excluded.</p>
      </div>

      <div className={styles.calculatorAnswer} data-plan={winner.plan.id}>
        <span className={styles.srOnly} aria-live="polite">{tiedPlans.length > 0 ? `${winner.plan.name} ties ${tiedPlans.join(' and ')} for lowest cost and is recommended for its additional included capability` : `${winner.plan.name} is the lowest-cost eligible plan`} at {money(volume)} in annual payments.</span>
        <span>At {money(volume)} in annual payments</span><div className={styles.answerPlan}><small>{tiedPlans.length > 0 ? 'Lowest-cost tie · more included capability' : 'Your lowest-cost eligible plan'}</small><strong>{winner.plan.name}</strong></div>
        <div className={styles.answerCost}><strong>{money(winner.annualCost / 12)}</strong><span>/month effective</span></div>
        <p>{money(winner.annualCost)}/year total{tiedPlans.length > 0 ? ` · same estimated price as ${tiedPlans.join(' and ')}` : runnerUp ? ` · saves ${money(savings)}/year compared with ${runnerUp.plan.name}` : ''}</p><span className={styles.answerStripe}>Stripe processing is paid separately.</span>
        <div className={styles.answerActions}><a className={styles.calculatorCta} href={signupHref(winner.plan.id, billing, includeVoice)}>{winner.plan.id === 'flex' ? 'Start with Flex' : `Choose ${winner.plan.name}`}</a><a href="#plans">Compare plan details</a></div>
      </div>
    </div>

    <div className={styles.costRace} aria-label="Estimated annual plan costs">
      <div className={styles.costRaceHeading}><span>Estimated annual cost <b>Lower is better</b></span><small>Subscription + LGQ platform fee{includeVoice ? ' + each plan’s base AI Voice package' : ''}</small></div>
      {results.map(({ plan, annualCost }) => { const isWinner = winner.plan.id === plan.id; const isTied = !isWinner && ranking.tiedPlanIds.includes(plan.id); const excluded = annualCost === null; return <article className={isWinner ? styles.costBarWinner : excluded ? styles.costBarIneligible : undefined} data-plan={plan.id} key={plan.id}>
        <div className={styles.costBarHeading}><span>{plan.name}</span>{isWinner ? <em>Best fit</em> : isTied ? <em>Same price</em> : excluded ? <em>Not eligible</em> : null}</div><span className={styles.costBarTrack} aria-hidden="true"><span style={{ width: excluded ? '0%' : `${Math.max(6, (annualCost / highestCost) * 100)}%` }} /></span><strong>{excluded ? 'Needs Solo+' : money(annualCost)}</strong>
      </article>; })}
    </div>

    <div className={styles.crossoverGrid}><div><p className={styles.miniEyebrow}>Where the math changes</p><h3>Three natural handoff points.</h3><p>These are price breakpoints, not forced upgrades. Team, phone, and workflow capacity still matter.{includeVoice ? ' Voice breakpoints compare each plan’s base package, not equal minute allowances.' : ''}</p></div><ol>{crossovers.map((item, index) => <li key={`${item.from.id}-${item.to.id}`}><span className={styles.crossoverNumber}>0{index + 1}</span><div><span>{LABELS[item.from.id]} → {LABELS[item.to.id]}</span><strong>{money(item.volume)}/year</strong></div></li>)}</ol></div>
    <p className={styles.calculatorFinePrint}>Estimate includes the selected subscription, LGQ platform fee, extra office users, and each plan’s base AI Voice Receptionist package when selected. Growth includes 200 AI-connected minutes; Flex, Solo, and Scale include 100. The comparison assumes usage stays within each package and excludes Stripe processing, taxes, and optional top-ups.</p>
  </div>;
}
