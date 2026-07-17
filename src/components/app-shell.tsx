'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
import { supabase } from '@/lib/supabase';

const baseNavItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads' },
  { href: '/dashboard/jobs', label: 'Jobs' },
  { href: '/dashboard/crew', label: 'Crew' },
  { href: '/dashboard/schedule', label: 'Schedule' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
];

function getPrimaryAction() {
  return { href: '/login', label: 'Sign in' };
}

export function AppShell({ children, forceStandaloneSite = false }: { children: ReactNode; forceStandaloneSite?: boolean }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const isDashboard = pathname.startsWith('/dashboard');
  const primaryAction = getPrimaryAction();
  // Middleware rewrites a wildcard subdomain/custom-domain request to
  // /site/[subdomain] (or /site-domain/[host]) internally, but that rewrite
  // is transparent to the browser — usePathname() still reports the
  // ORIGINAL external path (e.g. "/"), not the rewritten one. So the
  // pathname-based check below only catches direct navigation to these
  // routes (e.g. dashboard preview links); `forceStandaloneSite` (set from
  // a request header middleware attaches on rewrite) catches the subdomain
  // case where the visible pathname doesn't reveal it's a site route.
  const isStandaloneSite =
    forceStandaloneSite ||
    pathname.startsWith('/site/') ||
    pathname.startsWith('/site-domain/') ||
    pathname.startsWith('/themes/') ||
    pathname === '/site-preview-frame' ||
    pathname === '/dashboard/sites/preview';
  // Signed-in contractors get the full app nav (minus "Home", which isn't
  // relevant once inside the app, and "Website", which is promoted to
  // its own always-visible badge below instead of a plain link). Logged-out
  // visitors — homeowners paying an invoice, or a prospect on the marketing
  // site — have no use for internal app links like Dashboard/Leads/Jobs that
  // just dead-end at a login wall, so they see just a "Create account" CTA
  // (the same magic-link flow handles both sign-in and account creation).
  const navItems = isLoggedIn
    ? baseNavItems.filter((item) => item.href !== '/' && item.href !== '/dashboard/sites')
    : isStandaloneSite || pathname.startsWith('/demo')
      ? []
      : [{ href: '/login', label: 'Create account' }];

  useEffect(() => {
    closeNav();
  }, [pathname, closeNav]);

  // Track sign-in state client-side so the logo can route logged-in
  // contractors straight to their dashboard from anywhere in the app
  // (marketing pages, etc.), not just while already inside /dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Stripe payouts are core to the business — keep a persistent, always-
  // visible status pill in the topbar across every dashboard page (not just
  // the dashboard home), so the owner can never lose track of onboarding
  // status. Re-checked on every dashboard navigation (e.g. right after
  // returning from Stripe's hosted onboarding flow).
  useEffect(() => {
    if (!isDashboard || !isLoggedIn) {
      return;
    }
    let cancelled = false;
    fetch('/api/account/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setStripeOnboarded(Boolean(data.onboarded));
          setSitePublished(Boolean(data.sitePublished));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDashboard, isLoggedIn, pathname]);

  if (isStandaloneSite) {
    return <>{children}</>;
  }

  const brandHref = isLoggedIn ? '/dashboard' : '/';

  return (
    <div className="chrome-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={brandHref} className="brand-mark" aria-label="Let&apos;s Get Quoted home">
            <span className="brand-kicker">LGQ</span>
            <span className="brand-copy">
              <strong>Let&apos;s Get Quoted</strong>
              <span>Quote to paid for contractors</span>
            </span>
          </Link>

          {isDashboard && isLoggedIn ? (
            <Link
              href="/dashboard/sites"
              className="website-nav-badge"
              title={sitePublished ? 'Your website is live — manage it' : 'Build your free contractor website'}
            >
              ✨ {sitePublished ? 'Website: Live' : 'Build your Website'}
            </Link>
          ) : null}

          {isDashboard && isLoggedIn ? (
            <Link
              href="/dashboard/settings"
              className={`stripe-status-pill${stripeOnboarded === null ? '' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              <span className="stripe-status-dot" aria-hidden="true" />
              {stripeOnboarded === null ? 'Stripe: checking…' : stripeOnboarded ? 'Stripe connected' : 'Connect Stripe'}
            </Link>
          ) : null}

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

            {!isDashboard && !pathname.startsWith('/login') ? (
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