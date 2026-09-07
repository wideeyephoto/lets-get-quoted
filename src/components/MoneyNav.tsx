'use client';

import SubNav, { type SubNavItem } from '@/components/SubNav';

const MONEY_NAV_ITEMS: SubNavItem[] = [
  { href: '/dashboard/payments', label: 'Payments', exact: true },
  { href: '/dashboard/insights', label: 'Insights' },
  { href: '/dashboard/cash-flow', label: 'Cash Flow' },
  { href: '/dashboard/expenses', label: 'Expenses' },
  { href: '/dashboard/reports', label: 'Reports' },
];

export default function MoneyNav({ className }: { className?: string }) {
  return <SubNav items={MONEY_NAV_ITEMS} ariaLabel="Money & financial navigation" className={className} />;
}
