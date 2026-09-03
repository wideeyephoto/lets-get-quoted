'use client';

import Link from 'next/link';
import styles from './ClientNextActionBanner.module.css';

export interface ClientNextActionBannerProps {
  copy: string;
  href: string | null;
  label: string | null;
  businessName: string;
  jobRef?: string;
}

export default function ClientNextActionBanner({
  copy,
  href,
  label,
  businessName,
  jobRef,
}: ClientNextActionBannerProps) {
  const isComplete = !href || !label;

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (!targetId.startsWith('#')) return;
    const element = document.getElementById(targetId.slice(1));
    if (element) {
      e.preventDefault();
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update hash in URL without jump
      window.history.pushState(null, '', targetId);
    }
  };

  return (
    <aside
      className={styles.banner}
      data-state={isComplete ? 'complete' : 'pending'}
      aria-label="Next Action Guidance"
    >
      <div className={styles.content}>
        <div className={styles.badgeRow}>
          <span className={styles.badge} data-state={isComplete ? 'complete' : 'pending'}>
            {isComplete ? '✓ Up to date' : '⚡ Your Next Step'}
          </span>
          {jobRef && (
            <span style={{ fontSize: '0.74rem', color: 'var(--muted, #94a3b8)' }}>
              Project #{jobRef}
            </span>
          )}
        </div>
        <h3 className={styles.headline}>
          {isComplete ? 'Everything is on track' : 'Action needed to keep your project moving'}
        </h3>
        <p className={styles.copy}>{copy}</p>
      </div>

      {!isComplete && href && label && (
        href.startsWith('#') ? (
          <a
            href={href}
            className={styles.actionBtn}
            onClick={(e) => handleSmoothScroll(e, href)}
          >
            {label} →
          </a>
        ) : (
          <Link href={href} className={styles.actionBtn}>
            {label} →
          </Link>
        )
      )}
    </aside>
  );
}
