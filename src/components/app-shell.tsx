'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
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

// A leading line icon per sidebar destination, so the grouped rail reads at a
// glance. Stored as raw SVG inner markup (stroke, 24x24) and injected into a
// shared <svg> shell — the strings are static, so there's no hydration mismatch.
const NAV_ICON_PATHS: Record<string, string> = {
  '/dashboard': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  '/dashboard/leads': '<circle cx="10" cy="8.5" r="3.1"/><path d="M4 20a6 6 0 0 1 12 0"/><path d="M19 7.5v5M16.5 10h5"/>',
  '/dashboard/jobs': '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
  '/dashboard/schedule': '<rect x="3.5" y="4.8" width="17" height="15.7" rx="2"/><path d="M3.5 9.4h17M8 2.6v4M16 2.6v4"/>',
  '/dashboard/clients': '<circle cx="9" cy="8.5" r="3"/><path d="M3.6 20a5.4 5.4 0 0 1 10.8 0"/><path d="M16 5.7a3 3 0 0 1 0 5.6"/><path d="M18.4 20a5.4 5.4 0 0 0-3.2-4.9"/>',
  '/dashboard/crew': '<path d="M2.6 17.5h18.8"/><path d="M4.5 17.5a7.5 7.5 0 0 1 15 0"/><path d="M9.4 8.6V6.4A1.6 1.6 0 0 1 11 4.8h2a1.6 1.6 0 0 1 1.6 1.6v2.2"/>',
  '/dashboard/payroll': '<rect x="2.6" y="6.5" width="18.8" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  '/dashboard/recurring': '<path d="M17 3l3.2 3.2L17 9.4"/><path d="M20.2 6.2H8.5a4.3 4.3 0 0 0-4.3 4.3v.6"/><path d="M7 21l-3.2-3.2L7 14.6"/><path d="M3.8 17.8h11.7a4.3 4.3 0 0 0 4.3-4.3v-.6"/>',
  '/dashboard/services': '<path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l7.5 7.5a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-7.5-7.5A1.5 1.5 0 0 0 11.5 3.5z"/><circle cx="8" cy="8" r="1.3"/>',
  '/dashboard/insights': '<path d="M3.5 17.5l5.5-5.5 3.5 3.5 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  '/dashboard/messages': '<path d="M3.6 6.6A2 2 0 0 1 5.6 4.6h12.8a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2H9l-4.2 3.6v-3.6H5.6a2 2 0 0 1-2-2z"/>',
  '/dashboard/campaigns': '<path d="M3.5 10.5v3a1 1 0 0 0 1 1h2.2l5.3 3.6V6.4L6.7 9.5H4.5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  '/dashboard/rebook': '<path d="M4 11.5a8 8 0 1 1 2.3 6.3"/><path d="M3.5 4.5v5h5"/>',
  '/dashboard/reviews': '<path d="M12 3.7l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.72l-5.1 2.68.97-5.68L3.75 9.7l5.7-.83z"/>',
  '/dashboard/settings': '<circle cx="12" cy="8.4" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
};

function NavIcon({ href }: { href: string }) {
  const inner = NAV_ICON_PATHS[href];
  if (!inner) return null;
  return <svg className="sidenav-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />;
}

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
            <Link href="/dashboard/jobs?new=1#new-job" className="sidenav-new">
              <span className="sidenav-new-plus" aria-hidden="true">+</span> New job
            </Link>
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