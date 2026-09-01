'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../manual.module.css';

interface AdminManualDrawerProps {
  slug?: string;
  title?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export default function AdminManualDrawer({
  slug = 'start-here',
  title = 'SOP Runbook',
  triggerLabel = '📖 Open Runbook',
  triggerClassName,
}: AdminManualDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={triggerClassName || styles.drawerTriggerBtn}
        aria-label={`Open runbook for ${title}`}
      >
        <span>{triggerLabel}</span>
      </button>

      {isOpen && (
        <div className={styles.drawerBackdrop} onClick={() => setIsOpen(false)}>
          <div
            className={styles.drawerPanel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.drawerBadge}>Contextual Runbook</span>
                <h3 className={styles.drawerTitle}>{title}</h3>
              </div>
              <div className={styles.drawerHeaderActions}>
                <Link
                  href={`/admin/manual/${slug}`}
                  target="_blank"
                  className={styles.drawerExpandLink}
                  title="Open full page in new tab"
                >
                  ↗ Full Page
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className={styles.drawerCloseBtn}
                  aria-label="Close runbook drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.drawerBody}>
              <iframe
                src={`/admin/manual/${slug}?embed=1`}
                className={styles.drawerIframe}
                title={`Embedded Runbook: ${title}`}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
