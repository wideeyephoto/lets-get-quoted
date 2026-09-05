import styles from './crew.module.css';

export default function CrewLoading() {
  return (
    <main className="wide-shell workspace-shell crew-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading crew and labor data…</span>
      <section className={`panel workspace-section-card ${styles.crewPanel}`}>
        <header className={styles.pageHead}>
          <div>
            <p className="eyebrow">Team &amp; Labor</p>
            <h1 className={styles.pageTitle}>Crew &amp; Labor</h1>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Loading sections">
          <span className={`${styles.tab} ${styles.tabOn}`}>Loading…</span>
        </nav>

        <div className="skeleton-block" style={{ height: '56px', borderRadius: '12px', margin: '1rem 0' }} aria-hidden="true" />
        <div className="skeleton-block" style={{ height: '340px', borderRadius: '12px' }} aria-hidden="true" />
      </section>
    </main>
  );
}
