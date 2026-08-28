'use client';

import styles from './integration-trust-strip.module.css';

const TRUST_BADGES = [
  {
    id: 'stripe',
    title: 'Stripe Direct Payouts',
    subtitle: 'Direct bank deposits · PCI Level 1 · 0% hold',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <path d="M6 15h2" />
        <path d="M10 15h4" />
      </svg>
    ),
  },
  {
    id: 'quickbooks',
    title: 'QuickBooks Online Sync',
    subtitle: '2-way invoice, payment & customer sync',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 21h5v-5" />
      </svg>
    ),
  },
  {
    id: 'google-reviews',
    title: 'Google 5★ Reviews',
    subtitle: 'Automated request dispatch upon job done',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    id: 'custom-domains',
    title: 'Custom Domain & SSL',
    subtitle: 'Your own address · Automated HTTPS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'mobile-pay',
    title: 'Apple & Google Pay',
    subtitle: '1-tap deposit checkout from SMS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
];

export default function IntegrationTrustStrip() {
  return (
    <section className={styles.wrapper} aria-label="Platform Integrations and Security Guarantees">
      <div className={styles.strip}>
        {TRUST_BADGES.map((badge) => (
          <div key={badge.id} className={styles.card}>
            <div className={styles.iconWrap}>{badge.icon}</div>
            <div className={styles.textGroup}>
              <span className={styles.title}>{badge.title}</span>
              <span className={styles.subtitle}>{badge.subtitle}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
