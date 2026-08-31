'use client';

import Link from 'next/link';
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
  const initials = getInitials(adminEmail);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarTop}>
        <Link href="/admin" className={styles.brand} aria-label="Let's Get Quoted Admin">
          <picture className={styles.brandLogo}>
            <source srcSet="/lets-get-quoted-logo.webp" type="image/webp" />
            <img
              src="/lets-get-quoted-logo.png"
              alt="Let’s Get Quoted"
              className={styles.brandLogoImg}
              width={140}
              height={49}
            />
          </picture>
          <span className={styles.staffTag}>Staff</span>
        </Link>
      </div>
      <div className={styles.sidebarContents}>
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

