'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { permissionsFor, type Permission, type StaffRole } from '@/lib/staff';
import styles from './admin.module.css';

const ICONS: Record<string, string> = {
  '/admin': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  '/admin/search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  '/admin/accounts': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  '/admin/cases': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  '/admin/quick-stops': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  '/admin/risk': '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  '/admin/money': '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  '/admin/payments': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  '/admin/billing-operations': '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  '/admin/health': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  '/admin/messaging': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  '/admin/campaigns': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  '/admin/failures': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  '/admin/incidents': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  '/admin/audit': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  '/admin/staff': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  '/admin/security': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};

const ITEMS: { href: string; label: string; permission?: Permission }[] = [
  { href: '/admin', label: 'Command Center' },
  { href: '/admin/search', label: 'Search' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/cases', label: 'Cases' },
  { href: '/admin/quick-stops', label: 'Quick Stops' },
  { href: '/admin/risk', label: 'Review queue' },
  { href: '/admin/money', label: 'Money' },
  { href: '/admin/payments', label: 'Payment ledger' },
  { href: '/admin/billing-operations', label: 'Billing operations' },
  { href: '/admin/health', label: 'Service health' },
  { href: '/admin/messaging', label: 'Messaging' },
  { href: '/admin/campaigns', label: 'Email campaigns' },
  { href: '/admin/failures', label: 'Failures' },
  { href: '/admin/incidents', label: 'Incidents' },
  { href: '/admin/audit', label: 'Audit log' },
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
        const iconSvg = ICONS[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`${styles.navItem} ${active ? styles.active : ''}`}
          >
            {iconSvg ? (
              <svg
                className={styles.navIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: iconSvg }}
              />
            ) : null}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
