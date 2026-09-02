'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { permissionsFor, type Permission, type StaffRole } from '@/lib/staff';
import styles from './admin.module.css';

// `permission` hides a destination a role cannot use at all. Everything without
// one is readable by any active staff member — the console's read surfaces are
// deliberately open, and hiding a page somebody can look at but not change
// would make the product feel broken rather than governed.
const ITEMS: { href: string; label: string; permission?: Permission }[] = [
  { href: '/admin', label: 'Command Center' },
  { href: '/admin/search', label: 'Search' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/discounts', label: 'Discounts & Perks' },
  { href: '/admin/cases', label: 'Cases' },
  { href: '/admin/quick-stops', label: 'Quick Stops' },
  { href: '/admin/risk', label: 'Review queue' },
  { href: '/admin/money', label: 'Money' },
  { href: '/admin/payments', label: 'Payment ledger' },
  { href: '/admin/billing-operations', label: 'Billing operations' },
  { href: '/admin/health', label: 'Service health' },
  { href: '/admin/messaging', label: 'Messaging' },
  { href: '/admin/failures', label: 'Failures' },
  { href: '/admin/incidents', label: 'Incidents' },
  { href: '/admin/audit', label: 'Audit log' },
  // The only page that is nothing BUT a write surface, so it is the only one
  // worth hiding. Linking it to somebody who would be refused on arrival is a
  // dead end with no explanation.
  { href: '/admin/staff', label: 'Staff', permission: 'staff.manage' },
  { href: '/admin/security', label: 'Security' },
];

export default function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Staff console">
      {ITEMS.map((item) => {
        if (item.permission && !permissionsFor(role).includes(item.permission)) return null;
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`${styles.navItem} ${active ? styles.active : ''}`}>
            <span className={styles.navDot} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
