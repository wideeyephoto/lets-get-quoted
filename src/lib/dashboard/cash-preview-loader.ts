import { ready, type CashPreview, type CashPreviewItem, type Loadable } from '@/lib/dashboard-types';

export function buildCashPreview(input: {
  outstandingTotal: number;
  bookedWorkTotal: number;
  horizonDays?: 14 | 30;
  basePath?: string;
}): Loadable<CashPreview> {
  const { outstandingTotal, bookedWorkTotal, horizonDays = 14, basePath = '/dashboard' } = input;

  // Expected incoming payments based on booked work deposits and outstanding invoices
  const expectedIncoming = Math.round(outstandingTotal * 0.7 + bookedWorkTotal * 0.4);
  const scheduledRefunds = 0;
  const failedInstallments = 0;
  const netExpectedCash = expectedIncoming - scheduledRefunds - failedInstallments;

  const upcomingMovements: CashPreviewItem[] = [
    {
      id: 'open-invoices',
      dateKey: 'Next 14 days',
      label: 'Outstanding invoice collections',
      amount: Math.round(outstandingTotal * 0.7),
      type: 'incoming' as const,
    },
    {
      id: 'booked-deposits',
      dateKey: 'Next 14 days',
      label: 'Scheduled work deposits & progress payments',
      amount: Math.round(bookedWorkTotal * 0.4),
      type: 'incoming' as const,
    },
  ].filter((m) => m.amount > 0);

  return ready({
    horizonDays,
    expectedIncoming,
    scheduledRefunds,
    failedInstallments,
    outstandingInvoiceBalance: outstandingTotal,
    netExpectedCash,
    upcomingMovements,
    href: `${basePath}/cash-flow`,
  });
}
