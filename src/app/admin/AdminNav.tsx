'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

const ITEMS: { href: string; label: string }[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/quick-stops', label: 'Quick Stops' },
  { href: '/admin/money', label: 'Money' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {ITEMS.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`${styles.navItem} ${active ? styles.active : ''}`}>
            <span className={styles.navDot} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
