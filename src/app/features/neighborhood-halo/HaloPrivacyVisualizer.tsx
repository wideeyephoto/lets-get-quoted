'use client';

import styles from './neighborhood-halo.module.css';

type HaloPrivacyVisualizerProps = {
  streetName?: string;
  city?: string;
  trade?: string;
};

export default function HaloPrivacyVisualizer({
  streetName = 'Maple Ave',
  city = 'Rochester, MI',
  trade = 'Roofing',
}: HaloPrivacyVisualizerProps) {
  return (
    <section className="section-block" aria-labelledby="privacy-visualizer-title" style={{ margin: '48px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 1.75rem' }}>
        <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          🛡️ Privacy Shield Architecture
        </p>
        <h2 id="privacy-visualizer-title" style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0.35rem 0 0.75rem' }}>
          Real street clout. Zero homeowner privacy leaks.
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5, fontSize: '0.95rem' }}>
          Homeowners love seeing work done on their street, but hate having their exact house number or personal details advertised.
          Our automatic address sanitizer scrubs sensitive CRM fields before ad creative ever deploys to Google or Meta.
        </p>
      </div>

      <div className={styles.privacyGrid}>
        {/* Card 1: Private Contractor Record */}
        <div className={`${styles.privacyCard} ${styles.privacyPrivate}`}>
          <span className={`${styles.privacyBadge} ${styles.privacyBadgeRed}`}>
            🔒 Private Contractor CRM Record
          </span>
          <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '0 0 1rem' }}>
            Stored securely inside your Let’s Get Quoted account. Never visible to the public or ad networks.
          </p>

          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Customer Name</span>
            <span className={styles.dataValue}>Sarah Jenkins</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Exact Address</span>
            <span className={styles.dataValue}>1428 {streetName}, {city}</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Customer Phone</span>
            <span className={styles.dataValue}>(555) 234-8901</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Paid Invoice Amount</span>
            <span className={styles.dataValue}>$14,850.00 (Stripe Paid)</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Field Access Notes</span>
            <span className={styles.dataValue}>Gate code #4421, dog in yard</span>
          </div>
        </div>

        {/* Card 2: Public Halo Ad Copy */}
        <div className={`${styles.privacyCard} ${styles.privacyPublic}`}>
          <span className={`${styles.privacyBadge} ${styles.privacyBadgeGreen}`}>
            📢 Public Neighborhood Halo Ad
          </span>
          <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '0 0 1rem' }}>
            Programmatically sanitized before deployment. Only street recognition and verified craftsmanship are shared.
          </p>

          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Customer Name</span>
            <span className={styles.dataValue}>
              <span className={styles.redacted}>Sarah Jenkins</span> → <em>Omitted entirely</em>
            </span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Public Location</span>
            <span className={styles.dataValue}>
              <span className={styles.redacted}>1428</span> <strong>{streetName}, {city}</strong>
            </span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Phone Routing</span>
            <span className={styles.dataValue}>Your business line (direct call)</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Neighbor Incentive</span>
            <span className={styles.dataValue}>$100–$500 Street Cluster Discount</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataLabel}>Ad Copy Hook</span>
            <span className={styles.dataValue}>&ldquo;Just completed on {streetName}&rdquo;</span>
          </div>
        </div>
      </div>
    </section>
  );
}
