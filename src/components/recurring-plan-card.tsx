import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/jobs';
import { FREQUENCY_LABEL, type RecurringPlan } from '@/lib/recurring';
import {
  PLAN_HEALTH_LABEL,
  nextChargeLabel,
  planHealth,
  planMonthlyValue,
  shortDate,
  upcomingVisits,
  visitCountdown,
} from '@/lib/recurring-display';
import { EMPTY_PLAN_CONTEXT, formatDuration, type PlanContext } from '@/lib/recurring-context';

// Everything inside a plan card except the actions, which differ between the real
// page (server actions) and the read-only demo. Shared so the two can't drift.
//
// The card answers five questions: what the service is, WHERE it is, when it
// happens, WHO is doing it, and when the money moves. It used to answer two, so
// confirming any of the rest meant opening the plan.

const CADENCE_MARK: Record<RecurringPlan['frequency'], string> = {
  weekly: '7d',
  biweekly: '14d',
  monthly: '1mo',
};

export default function RecurringPlanCard({
  plan,
  today,
  resendLink,
  autopayToggle = null,
  context = EMPTY_PLAN_CONTEXT,
  children,
}: {
  plan: RecurringPlan;
  today: string;
  resendLink: ReactNode;
  /**
   * Switches the plan between autopay and manual billing. It lives in the
   * billing row rather than with the actions because it changes what that row
   * SAYS — putting it in the button strip would make the owner read one part of
   * the card to find the control for another. Optional, like the demo's cards,
   * which have no server actions to bind.
   */
  autopayToggle?: ReactNode;
  /** Optional so the demo can render a card without a database behind it. */
  context?: PlanContext;
  children: ReactNode;
}) {
  const paused = !plan.active;
  const countdown = plan.active ? visitCountdown(plan.next_run_date, today) : null;
  // Three visits is enough to read a rhythm without turning the card into a calendar.
  const visits = plan.active ? upcomingVisits(plan.next_run_date, plan.frequency, 3, plan.anchor_day) : [];
  const monthly = planMonthlyValue(plan.amount, plan.frequency);
  const hasCard = Boolean(plan.card_last4);

  const health = planHealth({
    active: plan.active,
    autoCharge: plan.auto_charge,
    hasCard,
    amount: plan.amount,
    daysUntilNext: countdown ? countdown.days : null,
    nextVisitAssigned: context.nextVisitAssigned,
    prepaid: plan.prepaid,
    lastPaymentFailed: context.lastPaymentFailed,
  });

  const charge = plan.active
    ? nextChargeLabel({
        amount: plan.amount,
        nextRunDate: plan.next_run_date,
        autoCharge: plan.auto_charge,
        hasCard,
        formatMoney,
        prepaid: plan.prepaid,
      })
    : null;

  const duration = formatDuration(context.estimatedHours);
  // A map link rather than plain text: the address on a recurring plan is a
  // place somebody has to drive to, and retyping it into a phone is the thing
  // this saves.
  const mapHref = plan.address ? `https://maps.google.com/?q=${encodeURIComponent(plan.address)}` : null;

  return (
    <div className={`recurring-card${paused ? ' is-paused' : ''}`}>
      <span className="recurring-cadence-mark" aria-hidden="true">{CADENCE_MARK[plan.frequency]}</span>

      <div className="recurring-card-main">
        <div className="recurring-card-head">
          <strong>{plan.title}</strong>
          <span className="recurring-freq">{FREQUENCY_LABEL[plan.frequency]}</span>
          {paused ? <span className="recurring-paused-tag">Paused</span> : null}
          {/* Only shown when it is not healthy. A green "Healthy" badge on every
              row is decoration; the point is to make the exceptions findable. */}
          {!paused && health.level !== 'healthy' ? (
            <span className={`recurring-health is-${health.level}`} title={health.reasons.join(' · ')}>
              {PLAN_HEALTH_LABEL[health.level]}
            </span>
          ) : null}
          {countdown ? (
            <span className={`recurring-next ${countdown.tone}`} title={`Next visit ${plan.next_run_date}`}>
              {countdown.label}
            </span>
          ) : null}
        </div>

        <p className="recurring-card-meta">
          {plan.client_name}
          {plan.active && plan.remaining_cycles != null
            ? ` · ${plan.remaining_cycles} visit${plan.remaining_cycles === 1 ? '' : 's'} left`
            : ''}
        </p>

        {/* Where it is, who is doing it, how long it takes. The three facts that
            used to require opening the plan. */}
        {mapHref || context.crewNames.length > 0 || context.nextVisitAssigned === false || duration ? (
          <div className="recurring-facts">
            {mapHref ? (
              <a className="recurring-fact" href={mapHref} target="_blank" rel="noreferrer">
                <span aria-hidden="true">📍</span>
                {plan.address}
              </a>
            ) : null}
            {context.crewNames.length > 0 ? (
              <span className="recurring-fact">
                <span aria-hidden="true">👷</span>
                {context.crewNames.slice(0, 2).join(' + ')}
                {context.crewNames.length > 2 ? ` +${context.crewNames.length - 2}` : ''}
              </span>
            ) : context.nextVisitAssigned === false ? (
              <span className="recurring-fact is-warn">
                <span aria-hidden="true">👷</span>
                Unassigned
              </span>
            ) : null}
            {duration ? (
              <span className="recurring-fact">
                <span aria-hidden="true">⏱</span>
                {duration} per visit
              </span>
            ) : null}
          </div>
        ) : null}

        {visits.length > 0 ? (
          <div className="recurring-rail">
            {visits.map((date, index) => (
              <span key={date} className={`recurring-rail-dot${index === 0 ? ' is-next' : ''}`}>
                {shortDate(date)}
                {index < visits.length - 1 ? <span className="recurring-rail-sep">→</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="recurring-billing">
          {plan.auto_charge ? (
            plan.card_last4 ? (
              <span className="recurring-card-onfile">
                {plan.card_brand ? plan.card_brand.replace(/^\w/, (c) => c.toUpperCase()) : 'Card'} •••• {plan.card_last4}
              </span>
            ) : (
              <span className="recurring-card-pending">
                Awaiting card
                {resendLink}
              </span>
            )
          ) : (
            <span className="recurring-manual">Manual billing</span>
          )}
          {autopayToggle}
        </div>

        {/* When money moves, and proof the plan is actually progressing. The
            card showed only future dates, so there was no way to tell a plan
            that is running from one that has never run at all. */}
        {charge || context.lastCompletedDate ? (
          <div className="recurring-ledger">
            {charge ? (
              <span className="recurring-ledger-row">
                <strong>Next charge:</strong> {charge}
              </span>
            ) : null}
            {context.lastCompletedDate ? (
              <span className="recurring-ledger-row is-done">
                <span aria-hidden="true">✓</span> Last completed {shortDate(context.lastCompletedDate)}
                {context.lastCompletedPaid ? <> · paid {formatMoney(context.lastCompletedPaid)}</> : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {plan.amount > 0 ? (
        <div className="recurring-money">
          <span className="recurring-money-amount">{formatMoney(plan.amount)}</span>
          <span className="recurring-money-unit">per visit</span>
          {plan.active ? <span className="recurring-money-rate">{formatMoney(monthly)}/mo</span> : null}
        </div>
      ) : null}

      <div className="recurring-card-actions">{children}</div>
    </div>
  );
}
