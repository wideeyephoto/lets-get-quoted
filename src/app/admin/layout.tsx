/**
 * The full stylesheet, on top of the lite one the root layout already
 * loaded. This tree renders the product's own UI, which is exactly the
 * ~590KB of rules the lite sheet drops.
 *
 * Loading both is deliberate. globals.css contains every rule in
 * globals-lite.css, in the same order, and comes after it — so the last
 * matching declaration for any element is always the one from this file,
 * and the cascade here is identical to what it was when the root layout
 * imported globals.css for everybody. Importing only the DIFFERENCE would
 * be smaller and wrong: it would put rules like .priority-panel after the
 * generic .workspace-section-card that is meant to override them.
 */
import '../globals.css';
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
