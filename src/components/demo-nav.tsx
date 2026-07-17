import Link from 'next/link';

const DEMO_NAV_ITEMS = [
  { href: '/demo', label: 'Overview' },
  { href: '/demo/leads', label: 'Leads' },
  { href: '/demo/jobs', label: 'Jobs' },
  { href: '/demo/crew', label: 'Crew' },
  { href: '/demo/schedule', label: 'Schedule' },
] as const;

export default function DemoNav({ active }: { active: (typeof DEMO_NAV_ITEMS)[number]['href'] }) {
  return (
    <div className="wide-shell demo-nav-wrap">
      <nav className="status-tabs workspace-status-tabs demo-nav" aria-label="Demo dashboard">
        {DEMO_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`status-tab${item.href === active ? ' active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
