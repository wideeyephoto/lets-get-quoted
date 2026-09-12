import os
import re

nav_path = 'src/app/admin/AdminNav.tsx'
with open(nav_path, 'r', encoding='utf-8') as f:
    nav_content = f.read()

# Replace the ITEMS list with GROUPS
groups_code = """
export type NavCounts = {
  closures: number;
  privacy: number;
  risk: number;
  failures: number;
  incidents: number;
};

export const GROUPS: {
  label: string;
  items: { href: string; label: string; permission?: Permission; countKey?: keyof NavCounts }[];
}[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin', label: 'Command Center' },
      { href: '/admin/operator', label: 'AI Operator ✨', permission: 'ops.manage' },
      { href: '/admin/search', label: 'Search' },
    ]
  },
  {
    label: 'Accounts & Lifecycle',
    items: [
      { href: '/admin/accounts', label: 'Accounts' },
      { href: '/admin/accounts/closures', label: 'Closures & Trash', countKey: 'closures' },
      { href: '/admin/privacy-requests', label: 'Privacy requests', countKey: 'privacy' },
    ]
  },
  {
    label: 'Trust & Safety',
    items: [
      { href: '/admin/risk', label: 'Review queue', countKey: 'risk' },
      { href: '/admin/cases', label: 'Cases' },
      { href: '/admin/quick-stops', label: 'Quick Stops' },
    ]
  },
  {
    label: 'Revenue & Operations',
    items: [
      { href: '/admin/money', label: 'Money' },
      { href: '/admin/payments', label: 'Payment ledger' },
      { href: '/admin/billing-operations', label: 'Billing operations' },
    ]
  },
  {
    label: 'Systems & Infrastructure',
    items: [
      { href: '/admin/health', label: 'Service health' },
      { href: '/admin/messaging', label: 'Messaging' },
      { href: '/admin/voice/numbers', label: 'AI Voice numbers' },
      { href: '/admin/campaigns', label: 'Email campaigns' },
      { href: '/admin/failures', label: 'Failures', countKey: 'failures' },
      { href: '/admin/incidents', label: 'Incidents', countKey: 'incidents' },
    ]
  },
  {
    label: 'Internal',
    items: [
      { href: '/admin/audit', label: 'Audit log' },
      { href: '/admin/staff', label: 'Staff', permission: 'staff.manage' },
      { href: '/admin/security', label: 'Security' },
      { href: '/admin/manual', label: 'Admin manual' },
    ]
  }
];
"""

# Extract the ITEMS block and replace it
items_regex = re.compile(r'export const ITEMS: \{ href: string; label: string; permission\?: Permission \}\[\] = \[.*?\];', re.DOTALL)
nav_content = items_regex.sub(groups_code, nav_content)

# Refactor the AdminNav component
component_regex = re.compile(r'export default function AdminNav\(\{ role \}: \{ role: StaffRole \}\) \{.*\}', re.DOTALL)
new_component = """export default function AdminNav({ role, counts }: { role: StaffRole, counts?: NavCounts }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Staff console">
      {GROUPS.map((group) => {
        const visibleItems = group.items.filter(item => !item.permission || permissionsFor(role).includes(item.permission));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.label} className={styles.navGroup}>
            <div className={styles.navGroupTitle}>{group.label}</div>
            {visibleItems.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              const iconSvg = ICONS[item.href];
              const count = item.countKey && counts ? counts[item.countKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                >
                  {iconSvg ? (
                    <svg
                      className={styles.navIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: iconSvg }}
                    />
                  ) : null}
                  <span>{item.label}</span>
                  {count > 0 && <span className={styles.navBadge}>{count > 99 ? '99+' : count}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}"""
nav_content = component_regex.sub(new_component, nav_content)

with open(nav_path, 'w', encoding='utf-8') as f:
    f.write(nav_content)

chrome_path = 'src/app/admin/AdminChrome.tsx'
with open(chrome_path, 'r', encoding='utf-8') as f:
    chrome_content = f.read()

chrome_content = chrome_content.replace(
    "import AdminNav from './AdminNav';",
    "import AdminNav, { type NavCounts } from './AdminNav';"
)
chrome_content = chrome_content.replace(
    "export default function AdminChrome({ adminEmail, role }: { adminEmail: string; role: StaffRole }) {",
    "export default function AdminChrome({ adminEmail, role, counts }: { adminEmail: string; role: StaffRole; counts?: NavCounts }) {"
)
chrome_content = chrome_content.replace(
    "<AdminNav role={role} />",
    "<AdminNav role={role} counts={counts} />"
)

with open(chrome_path, 'w', encoding='utf-8') as f:
    f.write(chrome_content)

print("Nav and Chrome updated!")
