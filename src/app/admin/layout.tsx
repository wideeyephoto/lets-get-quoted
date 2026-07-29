import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';
import AdminNav from './AdminNav';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff console' };

// Every /admin route inherits this guard: requireAdmin() 404s anyone who isn't
// on the ADMIN_EMAILS allowlist before a single child renders.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { adminEmail } = await requireAdmin();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            Let&rsquo;s Get <span>Quoted</span>
          </span>
          <span className={styles.staffTag}>Staff</span>
        </div>
        <AdminNav />
        <div className={styles.sidebarFoot}>
          Signed in as
          <br />
          <strong>{adminEmail}</strong>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
