'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';

const baseNavItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads' },
  { href: '/dashboard/jobs', label: 'Jobs' },
  { href: '/dashboard/schedule', label: 'Schedule' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
  { href: '/docs', label: 'Docs' },
];

function getPrimaryAction(pathname: string) {
  if (pathname.startsWith('/login')) {
    return { href: '/docs', label: 'Setup docs' };
  }

  return { href: '/login', label: 'Sign in' };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const isDashboard = pathname.startsWith('/dashboard');
  const primaryAction = getPrimaryAction(pathname);
  // Signed-in contractors live under /dashboard — the marketing "Home" and
  // "Docs" links aren't relevant to them once they're in the app, and the
  // "Jobs" nav link already covers what the "Open jobs" CTA would do.
  const navItems = isDashboard
    ? baseNavItems.filter((item) => item.href !== '/' && item.href !== '/docs')
    : baseNavItems;
  const isStandaloneSite =
    pathname.startsWith('/site/') ||
    pathname.startsWith('/site-domain/') ||
    pathname.startsWith('/themes/') ||
    pathname === '/site-preview-frame' ||
    pathname === '/dashboard/sites/preview';

  useEffect(() => {
    closeNav();
  }, [pathname, closeNav]);

  if (isStandaloneSite) {
    return <>{children}</>;
  }

  return (
    <div className="chrome-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand-mark" aria-label="Let&apos;s Get Quoted home">
            <span className="brand-kicker">LGQ</span>
            <span className="brand-copy">
              <strong>Let&apos;s Get Quoted</strong>
              <span>Quote to paid for contractors</span>
            </span>
          </Link>

          <button
            type="button"
            className="nav-toggle"
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="primary-nav"
          >
            Menu
          </button>

          <div className={`nav-panel${isNavOpen ? ' open' : ''}`} id="primary-nav">
            <nav className="topnav" aria-label="Primary">
              {navItems.map((item) => {
                const active = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`topnav-link${active ? ' active' : ''}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {!isDashboard ? (
              <Link href={primaryAction.href} className="btn primary topbar-cta">
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="app-main">{children}</div>
    </div>
  );
}