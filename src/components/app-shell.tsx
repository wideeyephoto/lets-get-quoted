'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import { supabase } from '@/lib/supabase';

// Order follows the pipeline (Leads -> Jobs -> Schedule) with Crew, a resource,
// after the stages instead of splitting them. `hint` surfaces the vocabulary
// each stage owns (quotes/invoices/payments live inside Jobs) as a hover title.
const baseNavItems: { href: string; label: string; hint?: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads', hint: 'New & website leads' },
  { href: '/dashboard/jobs', label: 'Jobs', hint: 'Quotes · Invoices · Payments' },
  { href: '/dashboard/clients', label: 'Clients', hint: 'Customer profiles & history' },
  { href: '/dashboard/schedule', label: 'Schedule', hint: 'Calendar & unscheduled work' },
  { href: '/dashboard/recurring', label: 'Recurring', hint: 'Repeating jobs & auto-billing' },
  { href: '/dashboard/services', label: 'Price book', hint: 'Saved services & prices' },
  { href: '/dashboard/crew', label: 'Crew', hint: 'Your team & assignments' },
  { href: '/dashboard/payroll', label: 'Payroll', hint: 'Crew hours & pay by period' },
  { href: '/dashboard/messages', label: 'Messages', hint: 'Two-way customer texts' },
  { href: '/dashboard/campaigns', label: 'Campaigns', hint: 'Email & text past customers' },
  { href: '/dashboard/rebook', label: 'Rebook', hint: 'Win back past customers' },
  { href: '/dashboard/insights', label: 'Insights', hint: 'Funnel & revenue trends' },
  { href: '/dashboard/reviews', label: 'Reviews', hint: 'Ratings & private feedback' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
];

// The connected-pill "flow" styling now spans all three pipeline stages.
const FLOW_CLASS: Record<string, string> = {
  '/dashboard/leads': ' flow-link flow-start',
  '/dashboard/jobs': ' flow-link flow-mid',
  '/dashboard/schedule': ' flow-link flow-end',
};

// Grouping used only by the signed-in dashboard's left sidebar. The flat
// `baseNavItems` order still drives the marketing/top-bar render; here the same
// items are bucketed so the rail reads as labeled sections instead of one long
// list. Dashboard (home) sits above the groups; Website is promoted to its own
// badge and Account drops to the sidebar footer, so neither appears here.
const NAV_GROUPS: { label: string; hrefs: string[] }[] = [
  { label: 'Work', hrefs: ['/dashboard/leads', '/dashboard/jobs', '/dashboard/schedule', '/dashboard/clients'] },
  { label: 'Team', hrefs: ['/dashboard/crew', '/dashboard/payroll'] },
  { label: 'Money', hrefs: ['/dashboard/recurring', '/dashboard/services', '/dashboard/insights'] },
  { label: 'Grow', hrefs: ['/dashboard/messages', '/dashboard/campaigns', '/dashboard/rebook', '/dashboard/reviews'] },
];

type AccountStatus = {
  onboarded: boolean;
  sitePublished: boolean;
  siteUrl: string | null;
  businessName: string | null;
  newQuoteRequestCount: number;
  jobsNeedingAttentionCount: number;
  unscheduledJobCount: number;
  newestQuoteRequestId: string | null;
  newestQuoteRequestCreatedAt: string | null;
};

const QUOTE_REQUEST_ALERT_DISMISSED_KEY = 'lgq-dismissed-quote-request-alert';

function getPrimaryAction() {
  return { href: '/login', label: 'Create Free Account' };
}

export function AppShell({ children, forceStandaloneSite = false }: { children: ReactNode; forceStandaloneSite?: boolean }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [newQuoteRequestCount, setNewQuoteRequestCount] = useState(0);
  const [jobsNeedingAttentionCount, setJobsNeedingAttentionCount] = useState(0);
  const [unscheduledJobCount, setUnscheduledJobCount] = useState(0);
  const [newestQuoteRequestId, setNewestQuoteRequestId] = useState<string | null>(null);
  const [newestQuoteRequestCreatedAt, setNewestQuoteRequestCreatedAt] = useState<string | null>(null);
  const [dismissedQuoteRequestId, setDismissedQuoteRequestId] = useState<string | null>(null);
  const isDashboard = pathname.startsWith('/dashboard');
  const primaryAction = getPrimaryAction();
  // The bare host for the live badge — "yoursite.letsgetquoted.com", no scheme.
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
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
    pathname.startsWith('/field') ||
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
      : [{ href: '/login', label: 'Sign in' }];

  useEffect(() => {
    closeNav();
    setNewMenuOpen(false);
  }, [pathname, closeNav]);

  // Escape closes the mobile nav drawer (it already closes on scrim tap and on
  // navigation) — the keyboard equivalent of tapping the scrim.
  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isNavOpen, closeNav]);

  // The "+ New" menu closes on outside click or Escape.
  useEffect(() => {
    if (!newMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) setNewMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

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
      setJobsNeedingAttentionCount(0);
      setUnscheduledJobCount(0);
      setNewestQuoteRequestId(null);
      setNewestQuoteRequestCreatedAt(null);
      setSiteUrl(null);
      setBusinessName(null);
      return;
    }
    let cancelled = false;
    const loadStatus = () => {
      fetch('/api/account/status', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() as Promise<AccountStatus> : null))
        .then((data) => {
          if (!cancelled && data) {
            setStripeOnboarded(Boolean(data.onboarded));
            setSitePublished(Boolean(data.sitePublished));
            setSiteUrl(data.siteUrl ?? null);
            setBusinessName(data.businessName ?? null);
            setNewQuoteRequestCount(Number(data.newQuoteRequestCount ?? 0));
            setJobsNeedingAttentionCount(Number(data.jobsNeedingAttentionCount ?? 0));
            setUnscheduledJobCount(Number(data.unscheduledJobCount ?? 0));
            setNewestQuoteRequestId(data.newestQuoteRequestId ?? null);
            setNewestQuoteRequestCreatedAt(data.newestQuoteRequestCreatedAt ?? null);
          }
        })
        .catch(() => {});
    };
    loadStatus();
    // Surface a new lead/job even while the owner sits on one page: re-check on
    // an interval, and immediately whenever they switch back to the tab.
    const interval = window.setInterval(loadStatus, 60000);
    const onFocus = () => loadStatus();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isDashboard, isLoggedIn, pathname]);

  useEffect(() => {
    if (!isDashboard || !isLoggedIn) return;
    setDismissedQuoteRequestId(window.localStorage.getItem(QUOTE_REQUEST_ALERT_DISMISSED_KEY));
  }, [isDashboard, isLoggedIn, newestQuoteRequestId]);

  if (isStandaloneSite) {
    return <>{children}</>;
  }

  // The /demo experience renders its own sidebar chrome (see demo/layout.tsx),
  // so the app shell stays out of its way — no marketing top bar wrapping it.
  if (pathname.startsWith('/demo')) {
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

  // Signed-in dashboard pages get a grouped left sidebar instead of the top bar.
  // The Website badge and Stripe pill move into the rail (top and footer), and
  // the live counts ride along on Leads / Jobs / Schedule exactly as before.
  if (isDashboard && isLoggedIn) {
    const byHref = new Map(baseNavItems.map((item) => [item.href, item] as const));
    const countByHref: Record<string, number> = {
      '/dashboard/leads': newQuoteRequestCount,
      '/dashboard/jobs': jobsNeedingAttentionCount,
      '/dashboard/schedule': unscheduledJobCount,
    };
    const renderSideLink = (href: string, extraClass = '') => {
      const item = byHref.get(href);
      if (!item) return null;
      // Dashboard home would otherwise match every /dashboard/* path, so it
      // needs an exact check; the rest highlight on their subtree.
      const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
      const count = countByHref[href] ?? 0;
      return (
        <Link
          href={href}
          key={href}
          className={`sidenav-link${extraClass ? ` ${extraClass}` : ''}${active ? ' active' : ''}`}
          title={item.hint}
        >
          <NavIcon href={href} />
          <span>{item.label}</span>
          {count > 0 ? <span className="sidenav-count">{count}</span> : null}
        </Link>
      );
    };

    return (
      <div className="chrome-shell chrome-shell-sidenav">
        <header className="sidenav-mobilebar">
          <Link href={brandHref} className="brand-mark brand-mark-compact" aria-label="Let&apos;s Get Quoted home">
            <Image src="/SITE-LOGO-1.png" alt="Let's Get Quoted" width={160} height={33} className="brand-logo-img" priority />
            <strong className="brand-title">LET&apos;S GET QUOTED</strong>
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
        </header>

        {isNavOpen ? <div className="sidenav-scrim" onClick={closeNav} aria-hidden="true" /> : null}

        <aside id="primary-nav" className={`sidenav${isNavOpen ? ' open' : ''}`} aria-label="Primary">
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">
            <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>
          </Link>

          <div className="sidenav-lead">
            {businessName ? <p className="sidenav-bizname" title={businessName}>{businessName}</p> : null}
            <div className="sidenav-new-wrap" ref={newMenuRef}>
              <button
                type="button"
                className="sidenav-new"
                aria-haspopup="menu"
                aria-expanded={newMenuOpen}
                onClick={() => setNewMenuOpen((open) => !open)}
              >
                <span className="sidenav-new-plus" aria-hidden="true">+</span> New
                <span className={`sidenav-new-caret${newMenuOpen ? ' open' : ''}`} aria-hidden="true">▾</span>
              </button>
              {newMenuOpen ? (
                <div className="sidenav-new-menu" role="menu">
                  <Link href="/dashboard/jobs?new=1#new-job" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                    <NavIcon href="/dashboard/jobs" />
                    New job
                  </Link>
                  <Link href="/dashboard/leads?add=1#add-lead" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                    <NavIcon href="/dashboard/leads" />
                    New lead
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <Link
            href="/dashboard/sites"
            className={`website-nav-badge sidenav-website${sitePublished ? ' live' : ''}`}
            title={sitePublished ? `Your website is live${siteHost ? ` at ${siteHost}` : ''} — manage it` : 'Build your free contractor website'}
          >
            {sitePublished ? (
              <>
                <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
                {siteHost ? (
                  <span className="website-nav-live-text">
                    <span className="website-nav-live-label">Website: Live</span>
                    <span className="website-nav-live-host">{siteHost}</span>
                  </span>
                ) : (
                  'Website: Live'
                )}
              </>
            ) : (
              <>
                <span aria-hidden="true">✨</span> Build your Website
              </>
            )}
          </Link>

          <nav className="sidenav-nav" aria-label="Dashboard">
            {renderSideLink('/dashboard', 'sidenav-top')}
            {NAV_GROUPS.map((group) => (
              <div className="sidenav-group" key={group.label}>
                <p className="sidenav-glabel">{group.label}</p>
                {group.hrefs.map((href) => renderSideLink(href))}
              </div>
            ))}
          </nav>

          <div className="sidenav-foot">
            <div className="sidenav-fcard">
              {renderSideLink('/dashboard/settings')}
              <Link href="/dashboard/settings#automations" className="sidenav-sublink">
                <span className="sidenav-subtick" aria-hidden="true" />
                Automations
              </Link>
            </div>
            <Link
              href="/dashboard/settings"
              className={`stripe-status-pill sidenav-stripe${stripeOnboarded === null ? ' checking' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              <span className="stripe-status-tile" aria-hidden="true">$</span>
              {stripeOnboarded === null ? 'Stripe: checking…' : stripeOnboarded ? 'Stripe connected' : 'Connect Stripe'}
            </Link>
          </div>
        </aside>

        {showQuoteRequestAlert ? (
          <aside className="quote-request-alert" role="status" aria-live="polite">
            <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">x</button>
            <p>New lead needs a response</p>
            <strong>{newQuoteRequestCount === 1 ? '1 website lead is waiting' : `${newQuoteRequestCount} website leads are waiting`}</strong>
            {newestQuoteRequestAge ? <span>Newest lead received {newestQuoteRequestAge}h ago.</span> : null}
            <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">View lead</Link>
          </aside>
        ) : null}

        <div className="app-main app-main-sidenav">{children}</div>
      </div>
    );
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
              className={`website-nav-badge${sitePublished ? ' live' : ''}`}
              title={sitePublished ? `Your website is live${siteHost ? ` at ${siteHost}` : ''} — manage it` : 'Build your free contractor website'}
            >
              {sitePublished ? (
                <>
                  <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
                  {siteHost ? (
                    <span className="website-nav-live-text">
                      <span className="website-nav-live-label">Website: Live</span>
                      <span className="website-nav-live-host">{siteHost}</span>
                    </span>
                  ) : (
                    'Website: Live'
                  )}
                </>
              ) : (
                <>
                  <span aria-hidden="true">✨</span> Build your Website
                </>
              )}
            </Link>
          ) : null}

          {isDashboard && isLoggedIn ? (
            <Link
              href="/dashboard/settings"
              className={`stripe-status-pill${stripeOnboarded === null ? ' checking' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              {/* A constant "$" mark — the state is carried by the tile colour AND
                  the label wording ("connected" / "Connect" / "checking"), so it
                  never depends on colour alone. */}
              <span className="stripe-status-tile" aria-hidden="true">$</span>
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
                const flowClass = FLOW_CLASS[item.href] ?? '';

                return (
                  <Link
                    href={item.href}
                    className={`topnav-link${active ? ' active' : ''}${flowClass}`}
                    key={item.href}
                    title={item.hint}
                  >
                    {item.label}
                    {item.href === '/dashboard/leads' && newQuoteRequestCount > 0 ? <span className="topnav-count">{newQuoteRequestCount}</span> : null}
                    {item.href === '/dashboard/jobs' && jobsNeedingAttentionCount > 0 ? <span className="topnav-count">{jobsNeedingAttentionCount}</span> : null}
                    {item.href === '/dashboard/schedule' && unscheduledJobCount > 0 ? <span className="topnav-count">{unscheduledJobCount}</span> : null}
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

      {showQuoteRequestAlert ? (
        <aside className="quote-request-alert" role="status" aria-live="polite">
          <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">x</button>
          <p>New lead needs a response</p>
          <strong>{newQuoteRequestCount === 1 ? '1 website lead is waiting' : `${newQuoteRequestCount} website leads are waiting`}</strong>
          {newestQuoteRequestAge ? <span>Newest lead received {newestQuoteRequestAge}h ago.</span> : null}
          <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">View lead</Link>
        </aside>
      ) : null}

      <div className="app-main">{children}</div>
    </div>
  );
}