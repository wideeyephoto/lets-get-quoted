'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The local nav across the top of every Marketing screen.
 *
 * Real links, not tab buttons. Each destination is its own route with its own
 * data, so a tab bar that swapped panels client-side would mean loading the
 * campaign composer and the whole post list on every visit to any of them.
 * Links also mean back works, each screen is bookmarkable, and cmd-click
 * opens one in a tab.
 *
 * `aria-current="page"` rather than `aria-selected`: this is navigation, not a
 * tablist, and calling it a tablist would promise arrow-key semantics that
 * links do not have.
 */

const TABS = [
  { href: '/dashboard/marketing', label: 'Overview' },
  { href: '/dashboard/marketing/campaigns', label: 'Campaigns' },
  { href: '/dashboard/marketing/blog', label: 'Blog' },
  { href: '/dashboard/marketing/performance', label: 'Performance' },
];

export default function MarketingNav() {
  const pathname = usePathname();

  // Overview is the only exact match. Everything else owns its sub-paths, so a
  // post editor at /blog/<id> keeps Blog lit rather than lighting nothing.
  const isActive = (href: string) =>
    href === '/dashboard/marketing' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="mkt-nav" aria-label="Marketing sections">
      <ul className="mkt-nav-list">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link href={tab.href} className={`mkt-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
