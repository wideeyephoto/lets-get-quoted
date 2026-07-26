'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';

const DEMO_HOST = 'northlinebuilders.letsgetquoted.com';

type DemoItem = {
  // `icon` is the /dashboard/* key into the shared icon set; `href` is where the
  // row actually links. Preview rows (no demo page) nudge to sign up.
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
      { icon: '/dashboard/clients', label: 'Clients', href: '/login', preview: true },
    ],
  },
  {
    label: 'Team',
    items: [
      { icon: '/dashboard/crew', label: 'Crew', href: '/demo/crew' },
      { icon: '/dashboard/payroll', label: 'Payroll', href: '/login', preview: true },
    ],
  },
  {
    label: 'Money',
    items: [
      { icon: '/dashboard/recurring', label: 'Recurring', href: '/login', preview: true },
      { icon: '/dashboard/services', label: 'Price book', href: '/login', preview: true },
      { icon: '/dashboard/insights', label: 'Insights', href: '/login', preview: true },
    ],
  },
  {
    label: 'Grow',
    items: [
      { icon: '/dashboard/messages', label: 'Messages', href: '/login', preview: true },
      { icon: '/dashboard/campaigns', label: 'Campaigns', href: '/login', preview: true },
      { icon: '/dashboard/rebook', label: 'Rebook', href: '/login', preview: true },
      { icon: '/dashboard/reviews', label: 'Reviews', href: '/login', preview: true },
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

        <div className="sidenav-lead">
          <p className="sidenav-bizname">Northline Builders</p>
          <Link href="/login" className="sidenav-new" title="Create a free account to add work">
            <span className="sidenav-new-plus" aria-hidden="true">+</span> New
          </Link>
        </div>

        <Link href="/demo/sites" className="website-nav-badge sidenav-website live" title="This contractor's website is live">
          <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
          <span className="website-nav-live-text">
            <span className="website-nav-live-label">Website: Live</span>
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
