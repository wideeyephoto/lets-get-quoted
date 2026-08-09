'use client';

import type { ReactNode } from 'react';
import CashFlowBoard from '@/app/dashboard/cash-flow/CashFlowBoard';
import type { CashEvent } from '@/lib/cash-forecast';

// The demo has nothing to save to, and a server component cannot hand a plain
// function across the client boundary — so the no-op lives here, on the client
// side of it. The alternative is a real `'use server'` action that deliberately
// does nothing, which is a POST endpoint on a public page for no reason.

type Props = {
  events: CashEvent[];
  todayKey: string;
  savedBalance: number;
  savedBuffer: number;
  savedCreditLine: number;
  paymentLagDays: number;
  billsPanel: ReactNode;
  /** Which of the 30/60/90 tabs the URL asked for. */
  windowKey: string;
  horizonDays: number;
};

const WINDOWS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '60', label: '60 days', days: 60 },
  { key: '90', label: '90 days', days: 90 },
];

export default function DemoCashBoard({
  events,
  todayKey,
  savedBalance,
  savedBuffer,
  savedCreditLine,
  paymentLagDays,
  billsPanel,
  windowKey,
  horizonDays,
}: Props) {
  return (
    <CashFlowBoard
      windows={WINDOWS}
      selectedKey={windowKey}
      events={events}
      todayKey={todayKey}
      horizonDays={horizonDays}
      // The demo's event list spans the full quarter whichever tab is on, so
      // the outlook can look past the chart here the same way it does for a
      // real account.
      longDays={90}
      savedBalance={savedBalance}
      savedBuffer={savedBuffer}
      savedCreditLine={savedCreditLine}
      balanceAt={todayKey}
      paymentLagDays={paymentLagDays}
      paymentLagMeasured
      unbilled={{ count: 2, total: 9400 }}
      accuracy={null}
      settingsAvailable
      saveSettings={() => {}}
      billsPanel={billsPanel}
      // Shown but inert here. The form behind it posts to a Server Action that
      // requires an owner, so on this public page it would take a prospect to
      // the login wall in the middle of the demo.
      canAddExpense={false}
      // Keeps the window tabs inside the demo instead of the login wall.
      basePath="/demo"
    />
  );
}
