'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ActionIcon from './action-icon';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import { DEMO_COMPANY_NAME, DEMO_SITE_HOST, DEMO_NAV_COUNTS } from '@/lib/demo-data';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

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
  // row actually links. Every row now has a real demo page — the whole app is
  // explorable, nothing gated.
  icon: string;
  label: string;
  href: string;
  preview?: boolean;
  /** Quick Stops wears its own wordmark in the rail rather than an icon + label. */
  brand?: boolean;
};

// Mirrors NAV_GROUPS in app-shell.tsx. A row that sits somewhere else here would
// be showing a prospect a product that does not exist.
// `accent` is the group's hue and mirrors NAV_GROUPS too — a prospect looking
// at the demo should see the same four section colors the product uses. The
// value itself lives in globals.css, on .sidenav-group--*.
const GROUPS: { label: string; accent: string; items: DemoItem[] }[] = [
  {
    label: 'Work',
    accent: 'work',
    items: [
      { icon: '/dashboard/leads', label: 'Leads', href: '/demo/leads' },
      { icon: '/dashboard/jobs', label: 'Jobs', href: '/demo/jobs' },
      { icon: '/dashboard/schedule', label: 'Schedule', href: '/demo/schedule' },
      { icon: '/dashboard/schedule/booking', label: 'Online Booking', href: '/demo/schedule/booking' },
      { icon: '/dashboard/quick-stops', label: 'Quick Stops', href: '/demo/quick-stops', brand: true },
      { icon: '/dashboard/clients', label: 'Clients', href: '/demo/clients' },
    ],
  },
  {
    label: 'Team',
    accent: 'team',
    // Hours & pay is a TAB inside Crew & Labor in the live app, not its own rail
    // row — /demo/payroll still exists and the Crew page links to it.
    items: [
      { icon: '/dashboard/crew', label: 'Crew & Labor', href: '/demo/crew' },
    ],
  },
  {
    label: 'Money',
    accent: 'money',
    items: [
      // Same order as NAV_GROUPS in app-shell — two sidebars that drift apart
      // is the thing the demo exists not to do.
      { icon: '/dashboard/insights', label: 'Insights', href: '/demo/insights' },
      { icon: '/dashboard/recurring', label: 'Recurring', href: '/demo/recurring' },
      { icon: '/dashboard/services', label: 'Price book', href: '/demo/services' },
      { icon: '/dashboard/cash-flow', label: 'Cash flow', href: '/demo/cash-flow' },
    ],
  },
  {
    label: 'Grow',
    accent: 'grow',
    items: [
      // Leads the group here too. It was a sublink under Account in both rails;
      // moving it in one and not the other is exactly the drift the note at the
      // top of GROUPS exists to prevent. /demo has no automations page of its
      // own, so it points at the demo settings screen — the same place the row
      // pointed before, now under the right heading.
      { icon: '/dashboard/automations', label: 'Automations', href: '/demo/settings' },
      { icon: '/dashboard/messages', label: 'Messages', href: '/demo/messages' },
      // The demo's marketing area mirrors the real one's shape now, so the rail
      // points at its overview exactly as the live rail does. The old
      // /demo/campaigns URL redirects into it.
      { icon: '/dashboard/marketing', label: 'Marketing', href: '/demo/marketing' },
      // Rebook is a section on Marketing in the real app, not a rail row, and
      // /demo/rebook is reached the same way — from the Marketing page.
      { icon: '/dashboard/reviews', label: 'Reviews', href: '/demo/reviews' },
    ],
  },
];

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

  // `/demo/schedule` would otherwise light up for /demo/schedule/booking and
  // /demo/schedule/plan as well, so its children have to be excluded by name.
  const SCHEDULE_CHILDREN = ['/demo/schedule/booking', '/demo/schedule/plan'];
  const isActive = (href: string) => {
    if (href === '/demo') return pathname === '/demo';
    if (href === '/demo/schedule') {
      return pathname.startsWith(href) && !SCHEDULE_CHILDREN.some((child) => pathname.startsWith(child));
    }
    return pathname.startsWith(href);
  };

  const renderItem = (item: DemoItem, extraClass = '') => {
    const state = STATE_BY_HREF[item.href];
    return (
      <Link
        key={item.label}
        href={item.href}
        className={`sidenav-link${extraClass ? ` ${extraClass}` : ''}${item.preview ? ' preview' : ''}${!item.preview && isActive(item.href) ? ' active' : ''}`}
        // On the row as well as the pill, so the row can carry the state's
        // color without CSS reaching into a child with :has().
        data-state={state ? 'on' : undefined}
        title={item.preview ? 'Available in the full app — create a free account to use it' : undefined}
      >
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
              Plan my day
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
