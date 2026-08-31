import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth';
import {
  getPermittedManualChapters,
  getPermittedManualSummaries,
  MANUAL_LAST_VERIFIED_DATE,
  MANUAL_LAST_VERIFIED_COMMIT,
} from '@/lib/admin-manual';
import AdminManualExplorer from './_components/AdminManualExplorer';
import styles from './manual.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Operating Manual · Staff console',
  description: 'Authoritative runbooks, payment rails, flow diagrams, and operating procedures for staff.',
  robots: { index: false, follow: false },
};

export default async function AdminManualPage() {
  const { role, staff } = await requireAdmin();
  const active = staff?.active ?? true;

  const chapters = getPermittedManualChapters(role, active);
  const summaries = getPermittedManualSummaries(role, active);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.title}>Admin Operating Manual</h1>
          <div className={styles.cardBadgeRow}>
            <span className={styles.badge}>Role: {role.replace(/_/g, ' ')}</span>
            <span className={styles.badge}>Verified: {MANUAL_LAST_VERIFIED_DATE}</span>
          </div>
        </div>
        <p className={styles.subtitle}>
          Authoritative operating procedures, architecture maps, payment rails, and incident runbooks.
          Articles and sensitive chapters are server-filtered according to your staff permissions.
        </p>
        <div className={styles.metaRow}>
          <span>Active Chapters: <strong>{chapters.length}</strong></span>
          <span>Accessible Guides: <strong>{summaries.length}</strong></span>
          <span>Repository Commit: <code>{MANUAL_LAST_VERIFIED_COMMIT}</code></span>
        </div>
      </header>

      <AdminManualExplorer chapters={chapters} summaries={summaries} />
    </div>
  );
}
