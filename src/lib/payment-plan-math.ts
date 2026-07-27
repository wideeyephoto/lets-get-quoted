// Pure Payment Plan math — no app imports, so both the engine (payment-plans.ts)
// and the client dashboard loader (job-feed.ts) can use it without a circular
// import. Everything is integer cents; the schedule always sums to EXACTLY the
// total with the rounding remainder on the final installment.

export type PlanFrequency = 'weekly' | 'biweekly' | 'monthly';

// The out-of-the-box Payment Plan: half up front, then four equal monthly parts.
export const DEFAULT_PLAN = { depositPercent: 50, installmentCount: 4, frequency: 'monthly' as PlanFrequency };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Advance a YYYY-MM-DD key by one cadence step. Monthly adds a calendar month
// clamped to the target month's last day; weekly/biweekly add exact days in UTC.
// (Self-contained copy of the recurring cadence math to avoid importing that
// module's app dependencies here.)
export function advancePlanDate(dateKey: string, frequency: PlanFrequency): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (frequency === 'monthly') {
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, lastDay))}`;
  }
  const step = frequency === 'weekly' ? 7 : 14;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + step);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatPlanDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Split the amount left after the deposit into `count` installments whose sum is
// EXACTLY (totalCents - depositCents). Each installment is floor(remaining/count)
// except the LAST, which absorbs the rounding remainder — so a plan can never
// over- or under-charge the quote total, and the difference is at most (count-1)
// cents, always on the final payment.
export function allocateInstallments(totalCents: number, depositCents: number, count: number): number[] {
  if (count <= 0) return [];
  const remaining = totalCents - depositCents;
  const base = Math.floor(remaining / count);
  const parts = new Array<number>(count).fill(base);
  parts[count - 1] = remaining - base * (count - 1);
  return parts;
}

// Build the full schedule (deposit + installments, in cents) from a total and
// the plan shape. Deposit rounds to the nearest cent; installments take the exact
// remainder so deposit + installments === totalCents.
export function buildPlanSchedule(
  totalCents: number,
  depositPercent: number,
  installmentCount: number,
): { depositCents: number; installments: number[] } {
  const depositCents = Math.round(totalCents * (depositPercent / 100));
  return { depositCents, installments: allocateInstallments(totalCents, depositCents, installmentCount) };
}

// Live remaining balance = total minus everything webhook-confirmed as paid.
// Never negative.
export function planBalanceCents(totalCents: number, paidCentsList: number[]): number {
  const paid = paidCentsList.reduce((sum, cents) => sum + cents, 0);
  return Math.max(0, totalCents - paid);
}

// The concrete schedule a client sees BEFORE signing: each installment's amount
// (cents) and due date, from the cadence starting at first_installment_date.
export function planSchedulePreview(plan: {
  total_cents: number;
  deposit_cents: number;
  installment_count: number;
  frequency: PlanFrequency;
  first_installment_date: string;
}): Array<{ seq: number; amountCents: number; dueDate: string; label: string }> {
  const parts = allocateInstallments(plan.total_cents, plan.deposit_cents, plan.installment_count);
  let due = plan.first_installment_date;
  return parts.map((amountCents, index) => {
    const entry = { seq: index + 1, amountCents, dueDate: due, label: formatPlanDate(due) };
    due = advancePlanDate(due, plan.frequency);
    return entry;
  });
}
