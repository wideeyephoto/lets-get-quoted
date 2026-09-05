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

import { useEffect, useState } from 'react';

const SECTIONS: { path: string; label: string; demo?: boolean }[] = [
  { path: '', label: 'Overview' },
  { path: '/campaigns', label: 'Email & Text' },
  { path: '/ads', label: 'Paid Ads' },
  { path: '/blog', label: 'Blog & SEO' },
  { path: '/links', label: 'Tracking' },
  { path: '/performance', label: 'Results' },
  { path: '/merchandise', label: 'Merch Studio' },
  { path: '/referrals', label: 'Referrals' },
];

export default function MarketingNav({
  basePath = '/dashboard',
  /**
   * Which sections to offer. The app has all four; the demo is being converted
   * one section at a time and lists only the ones it has actually built, because
   * a tab that 404s is a worse advertisement than a tab that isn't there yet.
   * Remove this argument at the demo's call sites as each section lands.
   */
  only,
  referralsOwedCount,
}: {
  basePath?: string;
  only?: string[];
  referralsOwedCount?: number | null;
}) {
  const pathname = usePathname();
  const [owedCount, setOwedCount] = useState<number | null>(referralsOwedCount ?? null);

  const root = `${basePath}/marketing`;
  const inDemo = basePath !== '/dashboard';

  useEffect(() => {
    if (referralsOwedCount !== undefined) {
      setOwedCount(referralsOwedCount);
      return;
    }
    if (inDemo) return;
    let active = true;
    fetch('/api/marketing/referrals/count')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.count === 'number') {
          setOwedCount(data.count);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [referralsOwedCount, inDemo]);

  const tabs = SECTIONS.filter((section) => (!only || only.includes(section.path)) && !(inDemo && section.demo === false)).map((section) => {
    const isReferrals = section.path === '/referrals';
    const countSuffix = isReferrals && owedCount && owedCount > 0 ? ` · ${owedCount}` : '';
    return {
      href: section.path === '/merchandise' ? `${basePath}/merchandise` : `${root}${section.path}`,
      label: `${section.label}${countSuffix}`,
    };
  });

  // Overview is the only exact match. Everything else owns its sub-paths, so a
  // post editor at /blog/<id> keeps Blog lit rather than lighting nothing.
  const isActive = (href: string) =>
    href === root
      ? pathname === href || pathname === `${root}/email-theme`
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="mkt-nav" aria-label="Marketing sections">
      <ul className="mkt-nav-list">
        {tabs.map((tab) => {
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
