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

const SECTIONS: { path: string; label: string; demo?: boolean }[] = [
  { path: '', label: 'Overview' },
  { path: '/campaigns', label: 'Email & Text' },
  { path: '/ads', label: 'Paid Ads' },
  { path: '/blog', label: 'Blog & SEO' },
  { path: '/links', label: 'Tracking' },
  { path: '/performance', label: 'Results' },
  // demo:false because there is no /demo/marketing/referrals route. The "only"
  // allowlist below would also cover this, but nothing passes it today — so a
  // tab added here would have appeared in the logged-out demo and 404'd, which
  // is the exact failure the note on "only" is about. Marking it at the section
  // is the version nobody has to remember at four call sites.
  { path: '/referrals', label: 'Referrals', demo: false },
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
}: {
  basePath?: string;
  only?: string[];
}) {
  const pathname = usePathname();

  // Built from basePath rather than hardcoded, so the logged-out demo's nav
  // links stay inside the demo. Hardcoded, every tab here sent a prospect to
  // /login — which is the same reason the demo used to have no marketing nav at
  // all, and therefore no way to see that Marketing has four sections.
  const root = `${basePath}/marketing`;
  const inDemo = basePath !== '/dashboard';
  const tabs = SECTIONS.filter((section) => (!only || only.includes(section.path)) && !(inDemo && section.demo === false)).map((section) => ({
    href: `${root}${section.path}`,
    label: section.label,
  }));

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
