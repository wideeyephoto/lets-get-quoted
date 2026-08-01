import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/jobs';
import { FREQUENCY_LABEL, type RecurringPlan } from '@/lib/recurring';
import { planMonthlyValue, shortDate, upcomingVisits, visitCountdown } from '@/lib/recurring-display';

// Everything inside a plan card except the actions, which differ between the real
// page (server actions) and the read-only demo. Shared so the two can't drift.

const CADENCE_MARK: Record<RecurringPlan['frequency'], string> = {
  weekly: '7d',
  biweekly: '14d',
  monthly: '1mo',
};

export default function RecurringPlanCard({
  plan,
  today,
  resendLink,
  children,
}: {
  plan: RecurringPlan;
  today: string;
  resendLink: ReactNode;
  children: ReactNode;
}) {
  const paused = !plan.active;
  const countdown = plan.active ? visitCountdown(plan.next_run_date, today) : null;
  // Three visits is enough to read a rhythm without turning the card into a calendar.
  const visits = plan.active ? upcomingVisits(plan.next_run_date, plan.frequency, 3, plan.anchor_day) : [];
  const monthly = planMonthlyValue(plan.amount, plan.frequency);

  return (
    <div className={`recurring-card${paused ? ' is-paused' : ''}`}>
      <span className="recurring-cadence-mark" aria-hidden="true">{CADENCE_MARK[plan.frequency]}</span>

      <div className="recurring-card-main">
        <div className="recurring-card-head">
          <strong>{plan.title}</strong>
          <span className="recurring-freq">{FREQUENCY_LABEL[plan.frequency]}</span>
          {paused ? <span className="recurring-paused-tag">Paused</span> : null}
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
        </div>
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
