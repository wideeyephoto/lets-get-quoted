'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SubNav.module.css';

export type SubNavItem = {
  href: string;
  label: string;
  badge?: string | number;
  exact?: boolean;
};

export type SubNavProps = {
  items: SubNavItem[];
  ariaLabel?: string;
  className?: string;
};

export default function SubNav({ items, ariaLabel = 'Section navigation', className }: SubNavProps) {
  const pathname = usePathname();

  const isItemActive = (item: SubNavItem) => {
    if (item.exact) return pathname === item.href;
    if (pathname === item.href) return true;
    return pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav className={`${styles.subNav}${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      <ul className={styles.subNavList}>
        {items.map((item) => {
          const active = isItemActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.subNavLink}${active ? ` ${styles.isActive}` : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== null ? (
                  <span className={styles.subNavBadge}>{item.badge}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
