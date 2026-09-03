'use client';

import styles from './neighborhood-halo.module.css';

export default function HaloContractorQuote() {
  return (
    <section className="section-block" aria-labelledby="contractor-quote-title" style={{ margin: '56px 0' }}>
      <div className={styles.quoteCardContainer}>
        <div className={styles.quoteCardBadge}>VERIFIED CONTRACTOR CASE STUDY</div>
        <blockquote className={styles.quoteText}>
          &ldquo;We launched a \$25 Halo ad after finishing a \$14,000 roof replacement on Maple Ave.
          Two neighbors on the same block called within 48 hours and we closed both for an additional \$26,500.
          Easiest money we&apos;ve made all season because our equipment and trucks were already parked on their street.&rdquo;
        </blockquote>

        <div className={styles.quoteAuthorRow}>
          <div className={styles.quoteAuthorInfo}>
            <div className={styles.quoteAvatar}>DM</div>
            <div>
              <strong style={{ display: 'block', color: '#f8fafc', fontSize: '0.95rem' }}>Dave M.</strong>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Owner, Apex Roofing &amp; Restoration &middot; Rochester, MI</span>
            </div>
          </div>

          <div className={styles.quoteMetricsRow}>
            <div className={styles.quoteMetricPill}>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase' }}>NEW REVENUE</span>
              <strong style={{ color: '#34d399', fontSize: '1.05rem' }}>+$26,500</strong>
            </div>
            <div className={styles.quoteMetricPill}>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase' }}>DRIVE TIME</span>
              <strong style={{ color: '#38bdf8', fontSize: '1.05rem' }}>0 Minutes</strong>
            </div>
            <div className={styles.quoteMetricPill}>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase' }}>RETURN ON AD SPEND</span>
              <strong style={{ color: 'var(--accent, #f97316)', fontSize: '1.05rem' }}>106x ROI</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
