'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
import { supabase } from '@/lib/supabase';

const baseNavItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Quote Requests', flowAfter: true },
  { href: '/dashboard/jobs', label: 'Jobs' },
  { href: '/dashboard/crew', label: 'Crew' },
  { href: '/dashboard/schedule', label: 'Schedule' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
];

type AccountStatus = {
  onboarded: boolean;
  sitePublished: boolean;
  newQuoteRequestCount: number;
  newestQuoteRequestId: string | null;
  newestQuoteRequestCreatedAt: string | null;
};

const QUOTE_REQUEST_ALERT_DISMISSED_KEY = 'lgq-dismissed-quote-request-alert';

function getPrimaryAction() {
  return { href: '/login', label: 'Sign in' };
}

export function AppShell({ children, forceStandaloneSite = false }: { children: ReactNode; forceStandaloneSite?: boolean }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [newQuoteRequestCount, setNewQuoteRequestCount] = useState(0);
  const [newestQuoteRequestId, setNewestQuoteRequestId] = useState<string | null>(null);
  const [newestQuoteRequestCreatedAt, setNewestQuoteRequestCreatedAt] = useState<string | null>(null);
  const [dismissedQuoteRequestId, setDismissedQuoteRequestId] = useState<string | null>(null);
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
  // site — have no use for internal app links like Dashboard/Quote Requests/Jobs that
  // just dead-end at a login wall, so they see just a "Create account" CTA
  // (the same magic-link flow handles both sign-in and account creation).
  const navItems = isLoggedIn
    ? baseNavItems.filter((item) => item.href !== '/' && item.href !== '/dashboard/sites')
    : isStandaloneSite || pathname.startsWith('/demo')
      ? []
      : [{ href: '/login', label: 'Create Free Account' }];

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
      setNewQuoteRequestCount(0);
      setNewestQuoteRequestId(null);
      setNewestQuoteRequestCreatedAt(null);
      return;
    }
    let cancelled = false;
    fetch('/api/account/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() as Promise<AccountStatus> : null))
      .then((data) => {
        if (!cancelled && data) {
          setStripeOnboarded(Boolean(data.onboarded));
          setSitePublished(Boolean(data.sitePublished));
          setNewQuoteRequestCount(Number(data.newQuoteRequestCount ?? 0));
          setNewestQuoteRequestId(data.newestQuoteRequestId ?? null);
          setNewestQuoteRequestCreatedAt(data.newestQuoteRequestCreatedAt ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDashboard, isLoggedIn, pathname]);

  useEffect(() => {
    if (!isDashboard || !isLoggedIn) return;
    setDismissedQuoteRequestId(window.localStorage.getItem(QUOTE_REQUEST_ALERT_DISMISSED_KEY));
  }, [isDashboard, isLoggedIn, newestQuoteRequestId]);

  if (isStandaloneSite) {
    return <>{children}</>;
  }

  const brandHref = isLoggedIn ? '/dashboard' : '/';
  const showQuoteRequestAlert = isDashboard && isLoggedIn && newQuoteRequestCount > 0 && newestQuoteRequestId && dismissedQuoteRequestId !== newestQuoteRequestId;
  const newestQuoteRequestAge = newestQuoteRequestCreatedAt
    ? Math.max(1, Math.round((Date.now() - new Date(newestQuoteRequestCreatedAt).getTime()) / 3600000))
    : null;

  function dismissQuoteRequestAlert() {
    if (!newestQuoteRequestId) return;
    window.localStorage.setItem(QUOTE_REQUEST_ALERT_DISMISSED_KEY, newestQuoteRequestId);
    setDismissedQuoteRequestId(newestQuoteRequestId);
  }

  return (
    <div className="chrome-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link
            href={brandHref}
            className={`brand-mark${isDashboard && isLoggedIn ? ' brand-mark-compact' : ''}`}
            aria-label="Let&apos;s Get Quoted home"
          >
            <Image src="/SITE-LOGO-1.png" alt="Let's Get Quoted" width={160} height={33} className="brand-logo-img" priority />
            <strong className="brand-title">LET&apos;S GET QUOTED</strong>
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
                  <Fragment key={item.href}>
                    <Link
                      href={item.href}
                      className={`topnav-link${active ? ' active' : ''}`}
                    >
                      {item.label}
                      {item.href === '/dashboard/leads' && newQuoteRequestCount > 0 ? <span className="topnav-count">{newQuoteRequestCount}</span> : null}
                    </Link>
                    {item.flowAfter ? <span className="topnav-flow-arrow" aria-hidden="true">-&gt;</span> : null}
                  </Fragment>
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

      {showQuoteRequestAlert ? (
        <aside className="quote-request-alert" role="status" aria-live="polite">
          <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss quote request alert">x</button>
          <p>New quote request needs a response</p>
          <strong>{newQuoteRequestCount === 1 ? '1 website request is waiting' : `${newQuoteRequestCount} website requests are waiting`}</strong>
          {newestQuoteRequestAge ? <span>Newest request received {newestQuoteRequestAge}h ago.</span> : null}
          <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">View request</Link>
        </aside>
      ) : null}

      <div className="app-main">{children}</div>
    </div>
  );
}