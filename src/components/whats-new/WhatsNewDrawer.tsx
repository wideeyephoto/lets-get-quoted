'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CHANGELOG_RELEASES,
  CHANGELOG_STORAGE_KEY,
  isNewReleaseAvailable,
  LATEST_RELEASE,
} from '@/lib/changelog';
import styles from './whats-new.module.css';

interface WhatsNewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onMarkRead?: () => void;
}

export function WhatsNewDrawer({ isOpen, onClose, onMarkRead }: WhatsNewDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Auto-mark latest release as read when opening drawer
    try {
      localStorage.setItem(CHANGELOG_STORAGE_KEY, LATEST_RELEASE.date);
      if (onMarkRead) onMarkRead();
    } catch {
      // Ignore localStorage errors
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onMarkRead]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.drawer} ref={drawerRef}>
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <span className={styles.sparkleIcon} aria-hidden="true">✨</span>
            <h2 id="whats-new-title" className={styles.headerTitle}>
              What&apos;s New in Let&apos;s Get Quoted
            </h2>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close What's New drawer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {CHANGELOG_RELEASES.map((release) => (
            <article key={release.id} className={styles.releaseCard}>
              <div className={styles.releaseHeader}>
                <div className={styles.badgeRow}>
                  <span className={styles.versionBadge}>{release.version}</span>
                  {release.badge === 'Major Release' && (
                    <span className={styles.majorBadge}>★ Major Release</span>
                  )}
                  <time className={styles.dateLabel} dateTime={release.date}>
                    {new Date(release.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </time>
                </div>
                <h3 className={styles.releaseTitle}>{release.title}</h3>
                <p className={styles.releaseSummary}>{release.summary}</p>
              </div>

              <ul className={styles.highlightsList}>
                {release.highlights.map((item, idx) => (
                  <li key={idx} className={styles.highlightItem}>
                    <div className={styles.highlightTitleRow}>
                      {item.badge && <span className={styles.pillBadge}>{item.badge}</span>}
                      <span className={styles.highlightTitle}>{item.title}</span>
                    </div>
                    <p className={styles.highlightDesc}>{item.description}</p>
                  </li>
                ))}
              </ul>

              <div className={styles.actionRow}>
                {release.primaryAction && (
                  <Link
                    href={release.primaryAction.href}
                    className={`${styles.actionBtn} ${styles.primaryAction}`}
                    onClick={onClose}
                  >
                    {release.primaryAction.label} →
                  </Link>
                )}
                {release.secondaryAction && (
                  <Link
                    href={release.secondaryAction.href}
                    className={`${styles.actionBtn} ${styles.secondaryAction}`}
                    onClick={onClose}
                  >
                    {release.secondaryAction.label}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className={styles.footer}>
          <Link
            href="/changelog"
            className={styles.fullChangelogLink}
            onClick={onClose}
          >
            View full public changelog →
          </Link>
          <button
            type="button"
            className={styles.markReadBtn}
            onClick={() => {
              try {
                localStorage.setItem(CHANGELOG_STORAGE_KEY, new Date().toISOString());
                if (onMarkRead) onMarkRead();
              } catch {}
              onClose();
            }}
          >
            Mark all as seen
          </button>
        </div>
      </div>
    </div>
  );
}

export function WhatsNewTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem(CHANGELOG_STORAGE_KEY);
      setHasUnread(isNewReleaseAvailable(lastSeen));
    } catch {
      setHasUnread(false);
    }
  }, []);

  const handleMarkRead = () => {
    setHasUnread(false);
  };

  return (
    <>
      <button
        type="button"
        className={styles.triggerBtn}
        onClick={() => setIsOpen(true)}
        title="What's New & Product Updates"
        aria-label="View What's New product updates"
      >
        <span className={styles.triggerIcon} aria-hidden="true">✨</span>
        <span className={styles.triggerLabel}>What&apos;s New</span>
        {hasUnread && <span className={styles.unreadPill}>New</span>}
      </button>

      <WhatsNewDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onMarkRead={handleMarkRead}
      />
    </>
  );
}
