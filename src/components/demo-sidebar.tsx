'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ActionIcon from './action-icon';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import { DEMO_COMPANY_NAME, DEMO_SITE_HOST, DEMO_NAV_COUNTS } from '@/lib/demo-data';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

import { NAV_GROUPS, baseNavItems } from './app-shell';

const DEMO_HOST = DEMO_SITE_HOST;

// Attention-count badges beside the pipeline links, same as the live rail.
const COUNT_BY_HREF: Record<string, number> = {
  '/demo/leads': DEMO_NAV_COUNTS.leads,
  '/demo/jobs': DEMO_NAV_COUNTS.jobs,
  '/demo/schedule': DEMO_NAV_COUNTS.schedule,
};

// The two automations that can put work on the calendar without the owner
// touching anything. The live rail says which way each is set from wherever you
// are standing; the sample account has both on, so the demo says so too.
const STATE_BY_HREF: Record<string, { label: string; title: string }> = {
  '/demo/schedule': {
    label: 'ON',
    title: 'Schedule intake is live — online booking and quick stops active',
  },
  '/demo/schedule/booking': {
    label: 'ON',
    title: 'Online booking is live — customers can grab an open slot from your website',
  },
  '/demo/quick-stops': {
    label: 'ON',
    title: 'Quick Stops is ON — nearby customers can pay to be fitted in sooner',
  },
};

type DemoItem = {
  // `icon` is the /dashboard/* key into the shared icon set; `href` is where the
  // row actually links.
  icon: string;
  label: string;
  href: string;
  preview?: boolean;
  /** Quick Stops wears its own wordmark in the rail rather than an icon + label. */
  brand?: boolean;
};

const LABEL_BY_DASHBOARD_HREF = new Map(baseNavItems.map((item) => [item.href, item.label] as const));

type DemoRouteOverride = {
  demoHref?: string;
  preview?: boolean;
  brand?: boolean;
};

const DEMO_ROUTE_OVERRIDES: Record<string, DemoRouteOverride> = {
  '/dashboard/inventory': { preview: true, demoHref: APP_SIGNUP_URL },
  '/dashboard/claims': { preview: true, demoHref: APP_SIGNUP_URL },
  '/dashboard/text-to-job': { preview: true, demoHref: APP_SIGNUP_URL },
  '/dashboard/quick-stops': { brand: true },
  '/dashboard/voice-calls': { demoHref: '/demo/settings#automations' },
  '/dashboard/payments': { preview: true, demoHref: APP_SIGNUP_URL },
  '/dashboard/expenses': { preview: true, demoHref: APP_SIGNUP_URL },
  '/dashboard/automations': { demoHref: '/demo/settings#automations' },
  '/dashboard/merchandise': { preview: true, demoHref: APP_SIGNUP_URL },
};

function resolveDemoItem(dashboardHref: string): DemoItem {
  const override = DEMO_ROUTE_OVERRIDES[dashboardHref];
  const label = LABEL_BY_DASHBOARD_HREF.get(dashboardHref) ?? dashboardHref;
  const href = override?.demoHref ?? dashboardHref.replace('/dashboard', '/demo');
  return {
    icon: dashboardHref,
    label,
    href,
    preview: override?.preview,
    brand: override?.brand,
  };
}

// Mirrors NAV_GROUPS in app-shell.tsx by importing and deriving from it directly.
// A row that sits somewhere else here would be showing a prospect a product that does not exist.
// `accent` is the group's hue and mirrors NAV_GROUPS too — a prospect looking
// at the demo should see the same four section colors the product uses. The
// value itself lives in globals.css, on .sidenav-group--*.
const GROUPS: { label: string; accent: string; items: DemoItem[] }[] = NAV_GROUPS.map((group) => ({
  label: group.label,
  accent: group.accent,
  items: group.hrefs.map(resolveDemoItem),
}));

function LockGlyph() {
  return (
    <svg className="sidenav-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.8" y="10.5" width="14.4" height="9" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export default function DemoSidebar() {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();

  const DEMO_MONEY_SUBROUTES = ['/demo/insights', '/demo/cash-flow', '/demo/expenses'];
  const isActive = (href: string) => {
    if (href === '/demo') return pathname === '/demo';
    if (
      href === '/demo/payments' &&
      DEMO_MONEY_SUBROUTES.some((sub) => pathname === sub || pathname.startsWith(`${sub}/`))
    ) {
      return true;
    }
    return pathname.startsWith(href);
  };

  const renderItem = (item: DemoItem, extraClass = '') => {
    const state = STATE_BY_HREF[item.href];
    const isExternal = item.href.startsWith('http://') || item.href.startsWith('https://');
    const className = `sidenav-link${extraClass ? ` ${extraClass}` : ''}${item.preview ? ' preview' : ''}${!item.preview && isActive(item.href) ? ' active' : ''}`;
    const title = item.preview ? 'Available in the full app — create a free account to use it' : undefined;

    const content = (
      <>
        {item.brand ? (
          <Image
            src="/brand/quick-stops-wordmark.png"
            alt={item.label}
            width={287}
            height={50}
            className="sidenav-brandmark"
          />
        ) : (
          <>
            <NavIcon href={item.icon} />
            <span>{item.label}</span>
          </>
        )}
        {state ? <span className="sidenav-state" data-state="on" title={state.title}>{state.label}</span> : null}
        {COUNT_BY_HREF[item.href] ? <span className="sidenav-count">{COUNT_BY_HREF[item.href]}</span> : null}
        {item.preview ? <LockGlyph /> : null}
      </>
    );

    if (isExternal) {
      return (
        <a
          key={item.label}
          href={item.href}
          className={className}
          data-state={state ? 'on' : undefined}
          title={title}
        >
          {content}
        </a>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        className={className}
        data-state={state ? 'on' : undefined}
        title={title}
      >
        {content}
      </Link>
    );
  };

  const brand = (
    <span className="sidenav-wordmark">
      Let&apos;s Get <span>Quoted</span>
    </span>
  );

  return (
    <>
      <header className="sidenav-mobilebar">
        <Link href="/demo" className="sidenav-brand" aria-label="Demo dashboard home">{brand}</Link>
        <button type="button" className="nav-toggle" onClick={toggleNav} aria-expanded={isNavOpen} aria-controls="demo-nav">
          Menu
        </button>
      </header>

      {isNavOpen ? <div className="sidenav-scrim" onClick={closeNav} aria-hidden="true" /> : null}

      <aside id="demo-nav" className={`sidenav demo-sidenav${isNavOpen ? ' open' : ''}`} aria-label="Demo dashboard">
        <Link href="/demo" className="sidenav-brand" aria-label="Demo dashboard home">{brand}</Link>

        {/* Always-visible way out of the demo, back to the marketing site. */}
        <Link href="/" className="demo-exit">
          <span aria-hidden="true">←</span> Exit the LIVE Demo
        </Link>

        <Link
          href="/demo/tour/site"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(80, 227, 189, 0.12)',
            border: '1px solid rgba(80, 227, 189, 0.35)',
            color: '#50e3bd',
            fontSize: '12px',
            fontWeight: 750,
            padding: '6px 12px',
            borderRadius: '6px',
            margin: '0 16px 12px',
            textDecoration: 'none',
          }}
        >
          <span>✦</span>
          <span>Start 5-Min Tour</span>
          <span style={{ marginLeft: 'auto' }}>&rarr;</span>
        </Link>

        <div className="sidenav-lead">
          <p className="sidenav-bizname">{DEMO_COMPANY_NAME}</p>
          {/* The two things a contractor starts the day with, on one row — same
              pairing and same widths as the live rail. */}
          <div className="sidenav-actions">
            <Link
              href="/demo/schedule/plan"
              className={`action-btn action-btn--plan sidenav-plan${pathname.startsWith('/demo/schedule/plan') ? ' active' : ''}`}
              title="Order today's stops into the shortest sensible route"
            >
              <ActionIcon name="plan" />
              Plan Day
            </Link>
            <a href={APP_SIGNUP_URL} className="sidenav-new" title="Create a free account to add work">
              <span className="sidenav-new-plus" aria-hidden="true">+</span> New
            </a>
          </div>
        </div>

        <Link href="/demo/sites" className="website-nav-badge sidenav-website live" title="This contractor's website is live">
          <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
          <span className="website-nav-live-text">
            <span className="website-nav-live-top">
              <span className="website-nav-live-label">Website: Live</span>
              <span className="website-nav-live-edit">(edit)</span>
            </span>
            <span className="website-nav-live-host">{DEMO_HOST}</span>
          </span>
        </Link>

        <nav className="sidenav-nav" aria-label="Demo dashboard">
          {GROUPS.map((group) => (
            <div className={`sidenav-group sidenav-group--${group.accent}`} key={group.label}>
              <p className="sidenav-glabel">{group.label}</p>
              {group.items.map((item) => renderItem(item))}
            </div>
          ))}
          {/* Last, matching the real rail. The demo is what a prospect is shown
              the app as, so a row sitting somewhere else here would be showing
              them a product that does not exist. */}
          {renderItem({ icon: '/dashboard', label: 'Dashboard', href: '/demo' }, 'sidenav-bottom')}
        </nav>

        {/* Same footer as the real rail — a prospect should not be shown a
            layout the product does not have. Account and Stripe, one line, and
            nothing else: the live rail's menu is gone and its theme control
            moved to the Account page and the floating switch, which the demo
            renders too (see /demo/layout.tsx). It says "Account", not "Sample
            account": the two pills share a 244px line and the word "Sample" is
            what pushed them onto two — and a page that opens with "You're
            viewing a live demo" does not need the rail to say it again. */}
        <div className="sidenav-foot">
          <Link href="/demo/settings" className="sidenav-account">
            <NavIcon href="/dashboard/settings" />
            <span className="sidenav-account-name">Account</span>
          </Link>
          <span className="stripe-status-pill sidenav-stripe connected" title="Payouts connected in this sample account">
            <span className="stripe-status-tile" aria-hidden="true">$</span>
            {/* One word, like the live rail — the green tile and underline are
                already saying "connected" twice. */}
            <span className="stripe-status-label">Stripe</span>
          </span>
        </div>
      </aside>
    </>
  );
}
