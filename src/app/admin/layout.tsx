import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';
import AdminNav from './AdminNav';
import SearchBox from './SearchBox';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff console' };

// Every /admin route inherits this guard: requireAdmin() 404s anyone who isn't
// on the ADMIN_EMAILS allowlist before a single child renders.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { adminEmail, role } = await requireAdmin();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            Let&rsquo;s Get <span>Quoted</span>
          </span>
          <span className={styles.staffTag}>Staff</span>
        </div>
        <SearchBox />
        <AdminNav role={role} />
        <div className={styles.sidebarFoot}>
          Signed in as
          <br />
          <strong>{adminEmail}</strong>
          {/* The role is on screen at all times on purpose. A console where you
              cannot tell what you are allowed to do until something refuses you
              teaches people to avoid trying. */}
          <br />
          <span className={styles.staffTag}>{role.replace('_', ' ')}</span>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
