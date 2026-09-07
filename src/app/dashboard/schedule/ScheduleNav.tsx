'use client';

import SubNav, { type SubNavItem } from '@/components/SubNav';

const SCHEDULE_NAV_ITEMS: SubNavItem[] = [
  { href: '/dashboard/schedule', label: 'Calendar', exact: true },
  { href: '/dashboard/schedule/plan', label: 'Plan Day' },
  { href: '/dashboard/schedule/intake', label: 'Intake Channels' },
  { href: '/dashboard/schedule/booking', label: 'Online Booking' },
  { href: '/dashboard/schedule/dispatch', label: 'Dispatch' },
  { href: '/dashboard/schedule/requests', label: 'Requests' },
];

export default function ScheduleNav({ className }: { className?: string }) {
  return <SubNav items={SCHEDULE_NAV_ITEMS} ariaLabel="Schedule navigation" className={className} />;
}
