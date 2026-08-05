import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/jobs';
import { FREQUENCY_LABEL, type RecurringPlan } from '@/lib/recurring';
import {
  PLAN_HEALTH_LABEL,
  nextChargeLabel,
  planHealth,
  planMonthlyValue,
  shortDate,
  visitCountdown,
} from '@/lib/recurring-display';
import { EMPTY_PLAN_CONTEXT, formatDuration, type PlanContext } from '@/lib/recurring-context';
import { avatarTone } from '@/lib/avatar-tone';
import { initialsFor } from '@/lib/message-context';

/**
 * One plan on one row — the Operations view's answer to the plan card.
 *
 * The card and this row hold the same facts and neither is a reduction of the
 * other. A card is for reading one plan; a row is for scanning twenty and
 * finding the one that is wrong. So the row spends its width on the five things
 * you compare ACROSS plans — who, what, how often, when next, how much — and
 * folds the things you only ever read about one plan (its billing state, its
 * ledger, its actions) into a disclosure.
 *
 * It is a <details>, not a click handler. The list is server-rendered because
 * every action inside it is a bound Server Action, and a disclosure that needs
 * no JavaScript keeps it that way — the row expands before React has hydrated,
 * and it expands with the keyboard for free.
 *
 * There is no time-of-day column, which the mockup had. A recurring plan stores
 * a DATE; the arrival time lives on the visit's job and only once that job
 * exists. Printing "9:00 AM" against a plan would be inventing it.
 */

export default function RecurringPlanRow({
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
  autopayToggle?: ReactNode;
  context?: PlanContext;
  children: ReactNode;
}) {
  const paused = !plan.active;
  const countdown = plan.active ? visitCountdown(plan.next_run_date, today) : null;
  const monthly = planMonthlyValue(plan.amount, plan.frequency);
  const hasCard = Boolean(plan.card_last4);

  const health = planHealth({
    active: plan.active,
    autoCharge: plan.auto_charge,
    hasCard,
    amount: plan.amount,
    daysUntilNext: countdown ? countdown.days : null,
    nextVisitAssigned: context.nextVisitAssigned,
  });

  const charge = plan.active
    ? nextChargeLabel({
        amount: plan.amount,
        nextRunDate: plan.next_run_date,
        autoCharge: plan.auto_charge,
        hasCard,
        formatMoney,
      })
    : null;

  const duration = formatDuration(context.estimatedHours);
  const mapHref = plan.address ? `https://maps.google.com/?q=${encodeURIComponent(plan.address)}` : null;
  const tone = avatarTone(plan.client_name);

  // Per-month is the only figure two plans on different cadences can be compared
  // on, so it sits under the per-visit price rather than replacing it — the
  // per-visit price is what the customer is told, and both have to be true.
  const perMonth = plan.active && plan.frequency !== 'monthly' ? `${formatMoney(monthly)}/mo` : null;

  return (
    <details className={`ropsrow${paused ? ' is-paused' : ''}`}>
      <summary className="ropsrow-head">
        <span className="rops-avatar" data-avatar-tone={tone} aria-hidden="true">
          {initialsFor(plan.client_name)}
        </span>

        <span className="ropsrow-who">
          <strong>{plan.client_name}</strong>
          {plan.address ? <small className="ropsrow-addr">{plan.address}</small> : null}
          {context.crewNames.length > 0 ? (
            <small className="ropsrow-crew">
              {context.crewNames.slice(0, 2).join(' + ')}
              {context.crewNames.length > 2 ? ` +${context.crewNames.length - 2}` : ''}
            </small>
          ) : context.nextVisitAssigned === false ? (
            <small className="ropsrow-crew is-warn">Unassigned</small>
          ) : null}
        </span>

        <span className="ropsrow-what">
          <strong>{plan.title}</strong>
          {duration ? <small>{duration} per visit</small> : null}
        </span>

        <span className="ropsrow-tags">
          <span className="ropsrow-freq">{FREQUENCY_LABEL[plan.frequency]}</span>
          {paused ? (
            <span className="ropsrow-state is-paused">Paused</span>
          ) : health.level === 'healthy' ? (
            <span className="ropsrow-state is-ok">Active</span>
          ) : (
            <span className={`ropsrow-state is-${health.level}`} title={health.reasons.join(' · ')}>
              {PLAN_HEALTH_LABEL[health.level]}
            </span>
          )}
          {!plan.auto_charge && plan.active ? <span className="ropsrow-state is-manual">Manual billing</span> : null}
        </span>

        <span className="ropsrow-next">
          {countdown ? (
            <>
              <small>Next visit</small>
              <strong>{shortDate(plan.next_run_date)}</strong>
              <em className={countdown.tone}>{countdown.label}</em>
            </>
          ) : (
            <small>No visits while paused</small>
          )}
        </span>

        <span className="ropsrow-money">
          {plan.amount > 0 ? (
            <>
              <strong>{formatMoney(plan.amount)}</strong>
              <small>per visit</small>
              {perMonth ? <em>{perMonth}</em> : null}
            </>
          ) : (
            <small className="is-warn">No price</small>
          )}
        </span>

        <span className="ropsrow-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="ropsrow-body">
        <div className="ropsrow-facts">
          {mapHref ? (
            <a className="ropsrow-fact" href={mapHref} target="_blank" rel="noreferrer">
              <span aria-hidden="true">📍</span>
              {plan.address}
            </a>
          ) : null}
          {plan.active && plan.remaining_cycles != null ? (
            <span className="ropsrow-fact">
              <span aria-hidden="true">⏳</span>
              {plan.remaining_cycles} visit{plan.remaining_cycles === 1 ? '' : 's'} left
            </span>
          ) : null}
          {plan.auto_charge ? (
            plan.card_last4 ? (
              <span className="ropsrow-fact">
                <span aria-hidden="true">💳</span>
                {plan.card_brand ? plan.card_brand.replace(/^\w/, (c) => c.toUpperCase()) : 'Card'} •••• {plan.card_last4}
              </span>
            ) : (
              <span className="ropsrow-fact is-warn">
                <span aria-hidden="true">💳</span>
                Awaiting card
                {resendLink}
              </span>
            )
          ) : (
            <span className="ropsrow-fact">
              <span aria-hidden="true">🧾</span>
              Manual billing
            </span>
          )}
          {autopayToggle}
        </div>

        {charge || context.lastCompletedDate ? (
          <div className="ropsrow-ledger">
            {charge ? (
              <span>
                <strong>Next charge:</strong> {charge}
              </span>
            ) : null}
            {context.lastCompletedDate ? (
              <span className="is-done">
                <span aria-hidden="true">✓</span> Last completed {shortDate(context.lastCompletedDate)}
                {context.lastCompletedPaid ? <> · paid {formatMoney(context.lastCompletedPaid)}</> : null}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="ropsrow-actions">{children}</div>
      </div>
    </details>
  );
}
