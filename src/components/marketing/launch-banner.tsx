import { LAUNCH_DETAIL, LAUNCH_LABEL, isLaunchBannerEnabled } from '@/lib/launch-status';
import styles from './launch-banner.module.css';

/**
 * The compressed pre-launch notice at the very top of our public pages.
 * Uses native details/summary disclosure so it remains a server component.
 */
export default function LaunchBanner({
  offsetHeader = false,
}: { offsetHeader?: boolean } = {}) {
  if (!isLaunchBannerEnabled()) return null;

  return (
    <div className={`${styles.banner}${offsetHeader ? ` ${styles.offsetHeader}` : ''}`} role="status">
      <div className={styles.inner}>
        <span className={styles.badge}>{LAUNCH_LABEL}</span>
        <span className={styles.summary}>
          Automatic text messaging is awaiting carrier approval. Everything else is available to explore.
        </span>
        <details className={styles.detailsTag}>
          <summary className={styles.summaryBtn}>Details</summary>
          <p className={styles.detail}>{LAUNCH_DETAIL}</p>
        </details>
      </div>
    </div>
  );
}
