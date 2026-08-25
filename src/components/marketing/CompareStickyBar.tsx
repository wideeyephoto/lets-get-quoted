'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './compare-sticky-bar.module.css';

export type CompareStickyBarProps = {
  competitorName?: string;
};

export default function CompareStickyBar({
  competitorName = 'Jobber',
}: CompareStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 600) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible || dismissed) return null;

  return (
    <aside className={styles.bar} aria-label="Quick signup prompt">
      <div className={styles.content}>
        <div className={styles.textGroup}>
          <span className={styles.badge}>✦ $0/mo Entry</span>
          <span className={styles.mainText}>
            Switch from <strong>{competitorName}</strong> in 15 minutes. Custom website &amp; AI intake included.
          </span>
        </div>

        <div className={styles.actionGroup}>
          <Link href={APP_SIGNUP_URL} className={styles.ctaBtn}>
            Start Free on Flex &rarr;
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className={styles.closeBtn}
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
