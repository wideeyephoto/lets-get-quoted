'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ActionIcon from './action-icon';
import ThemeToggle from './theme-toggle';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import { DEMO_COMPANY_NAME, DEMO_SITE_HOST, DEMO_NAV_COUNTS } from '@/lib/demo-data';
import { AUTOMATIONS_BOLT_PATH } from '@/lib/nav-helpers';

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
    title: 'Quick Stops is ON — customers can ask to be squeezed into today',
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
const GROUPS: { label: string; items: DemoItem[] }[] = [
  {
    label: 'Work',
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
    // Hours & pay is a TAB inside Crew & Labor in the live app, not its own rail
    // row — /demo/payroll still exists and the Crew page links to it.
    items: [
      { icon: '/dashboard/crew', label: 'Crew & Labor', href: '/demo/crew' },
    ],
  },
  {
    label: 'Money',
    items: [
      { icon: '/dashboard/cash-flow', label: 'Cash flow', href: '/demo/cash-flow' },
      { icon: '/dashboard/recurring', label: 'Recurring', href: '/demo/recurring' },
      { icon: '/dashboard/services', label: 'Price book', href: '/demo/services' },
      { icon: '/dashboard/insights', label: 'Insights', href: '/demo/insights' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { icon: '/dashboard/messages', label: 'Messages', href: '/demo/messages' },
      // The icon key follows the real nav to /dashboard/marketing; the demo's
      // own URL stays /demo/campaigns, which is public and has no reason to move.
      { icon: '/dashboard/marketing', label: 'Marketing', href: '/demo/campaigns' },
      { icon: '/dashboard/rebook', label: 'Rebook', href: '/demo/rebook' },
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
        // colour without CSS reaching into a child with :has().
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
            <Link href="/login" className="sidenav-new" title="Create a free account to add work">
              <span className="sidenav-new-plus" aria-hidden="true">+</span> New
            </Link>
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
            <div className="sidenav-group" key={group.label}>
              <p className="sidenav-glabel">{group.label}</p>
              {group.items.map((item) => renderItem(item))}
            </div>
          ))}
          {/* Last, matching the real rail. The demo is what a prospect is shown
              the app as, so a row sitting somewhere else here would be showing
              them a product that does not exist. */}
          {renderItem({ icon: '/dashboard', label: 'Dashboard', href: '/demo' }, 'sidenav-bottom')}
          {/* The theme is a real setting, not a demo prop — the cookie it writes
              is the same one the app reads, so a prospect who prefers light can
              see the whole product that way before signing up. */}
          <ThemeToggle />
        </nav>

        <div className="sidenav-foot">
          <div className="sidenav-fcard">
            {renderItem({ icon: '/dashboard/settings', label: 'Account', href: '/demo/settings' })}
            <Link href="/demo/settings" className="sidenav-sublink sidenav-automations">
              <span className="sidenav-bolt" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d={AUTOMATIONS_BOLT_PATH} /></svg>
              </span>
              <span className="sidenav-subtick" aria-hidden="true" />
              Automations
            </Link>
          </div>
          <span className="stripe-status-pill sidenav-stripe connected" title="Payouts connected in this sample account">
            <span className="stripe-status-tile" aria-hidden="true">$</span>
            Stripe connected
          </span>
        </div>
      </aside>
    </>
  );
}
