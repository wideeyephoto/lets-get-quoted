'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import { DEMO_COMPANY_NAME, DEMO_SITE_HOST, DEMO_NAV_COUNTS } from '@/lib/demo-data';

const DEMO_HOST = DEMO_SITE_HOST;

// Attention-count badges beside the pipeline links, same as the live rail.
const COUNT_BY_HREF: Record<string, number> = {
  '/demo/leads': DEMO_NAV_COUNTS.leads,
  '/demo/jobs': DEMO_NAV_COUNTS.jobs,
  '/demo/schedule': DEMO_NAV_COUNTS.schedule,
};

type DemoItem = {
  // `icon` is the /dashboard/* key into the shared icon set; `href` is where the
  // row actually links. Every row now has a real demo page — the whole app is
  // explorable, nothing gated.
  icon: string;
  label: string;
  href: string;
  preview?: boolean;
};

const GROUPS: { label: string; items: DemoItem[] }[] = [
  {
    label: 'Work',
    items: [
      { icon: '/dashboard/leads', label: 'Leads', href: '/demo/leads' },
      { icon: '/dashboard/jobs', label: 'Jobs', href: '/demo/jobs' },
      { icon: '/dashboard/schedule', label: 'Schedule', href: '/demo/schedule' },
      { icon: '/dashboard/clients', label: 'Clients', href: '/demo/clients' },
    ],
  },
  {
    label: 'Team',
    items: [
      { icon: '/dashboard/crew', label: 'Crew & Labor', href: '/demo/crew' },
      { icon: '/dashboard/crew', label: 'Hours & pay', href: '/demo/payroll' },
    ],
  },
  {
    label: 'Money',
    items: [
      { icon: '/dashboard/recurring', label: 'Recurring', href: '/demo/recurring' },
      { icon: '/dashboard/services', label: 'Price book', href: '/demo/services' },
      { icon: '/dashboard/insights', label: 'Insights', href: '/demo/insights' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { icon: '/dashboard/messages', label: 'Messages', href: '/demo/messages' },
      { icon: '/dashboard/campaigns', label: 'Marketing', href: '/demo/campaigns' },
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

  const isActive = (href: string) => (href === '/demo' ? pathname === '/demo' : pathname.startsWith(href));

  const renderItem = (item: DemoItem, extraClass = '') => (
    <Link
      key={item.label}
      href={item.href}
      className={`sidenav-link${extraClass ? ` ${extraClass}` : ''}${item.preview ? ' preview' : ''}${!item.preview && isActive(item.href) ? ' active' : ''}`}
      title={item.preview ? 'Available in the full app — create a free account to use it' : undefined}
    >
      <NavIcon href={item.icon} />
      <span>{item.label}</span>
      {COUNT_BY_HREF[item.href] ? <span className="sidenav-count">{COUNT_BY_HREF[item.href]}</span> : null}
      {item.preview ? <LockGlyph /> : null}
    </Link>
  );

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
          <Link href="/login" className="sidenav-new" title="Create a free account to add work">
            <span className="sidenav-new-plus" aria-hidden="true">+</span> New
          </Link>
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
          {renderItem({ icon: '/dashboard', label: 'Dashboard', href: '/demo' }, 'sidenav-top')}
          {GROUPS.map((group) => (
            <div className="sidenav-group" key={group.label}>
              <p className="sidenav-glabel">{group.label}</p>
              {group.items.map((item) => renderItem(item))}
            </div>
          ))}
        </nav>

        <div className="sidenav-foot">
          <div className="sidenav-fcard">
            {renderItem({ icon: '/dashboard/settings', label: 'Account', href: '/demo/settings' })}
            <Link href="/demo/settings" className="sidenav-sublink">
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
