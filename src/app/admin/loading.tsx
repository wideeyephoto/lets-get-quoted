import styles from './admin.module.css';

/**
 * Instant streaming shell for the staff console.
 *
 * Rendered immediately by Next.js while the page's asynchronous queries
 * (Command Center metrics and alert signals) resolve in parallel on the server.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading command center…">
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Staff console</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Command Center</h1>
        </div>
        <p className={styles.lead}>
          Exceptions and open work across every account. Verified clear checks collapse below.
        </p>
      </header>

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Performance period</span>
        <div className={styles.filterTabs} aria-hidden="true">
          <span className={`${styles.filterTab} ${styles.on}`}>30 days</span>
          <span className={styles.filterTab}>7 days</span>
          <span className={styles.filterTab}>90 days</span>
        </div>
      </div>

      <section className={styles.metricsRow} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${styles.panel} ${styles.statCard} ${styles.skelCard}`}>
            <div className={`${styles.skeletonPulse} ${styles.skelStatValue}`} />
            <div className={`${styles.skeletonPulse} ${styles.skelLine}`} style={{ width: '55%', marginTop: '0.4rem' }} />
            <div className={`${styles.skeletonPulse} ${styles.skelLine}`} style={{ width: '35%', marginTop: '0.2rem' }} />
          </div>
        ))}
      </section>

      <div className={styles.boardGrid} aria-hidden="true" style={{ marginTop: '1.5rem' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${styles.panel} ${styles.skelCard}`}>
            <div className={`${styles.skeletonPulse} ${styles.skelLine}`} style={{ width: '40%', marginBottom: '0.75rem' }} />
            <div className={`${styles.skeletonPulse} ${styles.skelLine}`} style={{ width: '85%' }} />
            <div className={`${styles.skeletonPulse} ${styles.skelLine}`} style={{ width: '65%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
