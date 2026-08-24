'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@/lib/staff';
import AdminNav from './AdminNav';
import SearchBox from './SearchBox';
import styles from './admin.module.css';

function getInitials(email: string): string {
  const namePart = email.split('@')[0] || 'ST';
  const parts = namePart.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return namePart.slice(0, 2).toUpperCase();
}

function roleDisplay(role: string): string {
  return role.replace(/_/g, ' ').toUpperCase();
}

export default function AdminChrome({ adminEmail, role }: { adminEmail: string; role: StaffRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const initials = getInitials(adminEmail);

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
          <div className={styles.userCard} title={`Signed in as ${adminEmail} (${role})`}>
            <div className={styles.userAvatar}>
              {initials}
              <span className={styles.userStatusDot} aria-label="Online" />
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userEmail}>{adminEmail}</span>
              <span className={styles.userRolePill}>{roleDisplay(role)}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
