'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@/lib/staff';
import AdminNav from './AdminNav';
import SearchBox from './SearchBox';
import styles from './admin.module.css';

export default function AdminChrome({ adminEmail, role }: { adminEmail: string; role: StaffRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTop}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Let&rsquo;s Get <span>Quoted</span></span>
          <span className={styles.staffTag}>Staff</span>
        </div>
        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <div id="admin-navigation" className={`${styles.sidebarContents} ${open ? styles.sidebarContentsOpen : ''}`}>
        <SearchBox />
        <AdminNav role={role} />
        <div className={styles.sidebarFoot}>
          Signed in as<br />
          <strong>{adminEmail}</strong><br />
          <span className={styles.staffTag}>{role.replace('_', ' ')}</span>
        </div>
      </div>
    </aside>
  );
}
