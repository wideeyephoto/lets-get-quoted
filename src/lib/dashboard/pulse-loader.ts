import { formatMoney } from '@/lib/jobs';
import { ready, type BusinessPulse, type Loadable } from '@/lib/dashboard-types';

export function buildBusinessPulse(input: {
  collectedThisMonth: { total: number; count: number };
  collectedMonthLabel: string;
  outstanding: { total: number; count: number };
  openQuotes: { total: number; count: number };
  bookedWork: { total: number; count: number };
  newLeadsThisMonthCount: number;
  basePath?: string;
}): Loadable<BusinessPulse> {
  const {
    collectedThisMonth,
    collectedMonthLabel,
    outstanding,
    openQuotes,
    bookedWork,
    newLeadsThisMonthCount,
    basePath = '/dashboard',
  } = input;

  return ready({
    monthLabel: collectedMonthLabel,
    collectedThisMonth: {
      amount: collectedThisMonth.total,
      count: collectedThisMonth.count,
      label: `Collected in ${collectedMonthLabel}`,
      formattedValue: formatMoney(collectedThisMonth.total),
      subtitle:
        collectedThisMonth.count === 0
          ? 'Nothing collected yet this month.'
          : `${collectedThisMonth.count} payment${collectedThisMonth.count === 1 ? '' : 's'} settled`,
      tooltip: 'Payments received this calendar month, net of refunds, cut in your account timezone.',
      href: `${basePath}/cash-flow`,
    },
    outstandingInvoices: {
      amount: outstanding.total,
      count: outstanding.count,
      label: 'Outstanding invoices',
      formattedValue: formatMoney(outstanding.total),
      subtitle:
        outstanding.count === 0
          ? 'Nothing outstanding.'
          : `across ${outstanding.count} invoice${outstanding.count === 1 ? '' : 's'} owed`,
      tooltip: 'Sent or signed invoices awaiting payment, deducting all deposits and partial payments already made.',
      href: `${basePath}/jobs?owing=1`,
      accent: outstanding.total > 0,
    },
    quotesAwaitingApproval: {
      amount: openQuotes.total,
      count: openQuotes.count,
      label: 'Quotes awaiting approval',
      formattedValue: formatMoney(openQuotes.total),
      subtitle:
        openQuotes.count === 0
          ? 'No open quotes.'
          : `${openQuotes.count} proposal${openQuotes.count === 1 ? '' : 's'} out with customers`,
      tooltip: 'Priced jobs still at the quote stage waiting for customer acceptance.',
      href: `${basePath}/jobs`,
    },
    bookedWorkNext30Days: {
      amount: bookedWork.total,
      count: bookedWork.count,
      label: 'Booked work, next 30 days',
      formattedValue: formatMoney(bookedWork.total),
      subtitle:
        bookedWork.count === 0
          ? 'Nothing booked yet.'
          : `${bookedWork.count} job${bookedWork.count === 1 ? '' : 's'} on the calendar`,
      tooltip: 'The quoted value of approved/in-progress jobs on your calendar in the next 30 days. Work value, not cash.',
      href: `${basePath}/schedule`,
    },
    newLeadsThisMonth: {
      count: newLeadsThisMonthCount,
      label: 'New leads this month',
      formattedValue: String(newLeadsThisMonthCount),
      subtitle:
        newLeadsThisMonthCount === 0
          ? 'No new leads this month.'
          : `${newLeadsThisMonthCount} new inquiry${newLeadsThisMonthCount === 1 ? '' : 's'}`,
      tooltip: 'Total customer inquiries and leads captured during the current calendar month.',
      href: `${basePath}/leads`,
    },
  });
}
