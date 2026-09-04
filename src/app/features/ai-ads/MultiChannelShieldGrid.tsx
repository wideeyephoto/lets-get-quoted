'use client';

import Link from 'next/link';
import styles from './flywheel.module.css';

type ShieldItem = {
  id: string;
  icon: string;
  badge: string;
  title: string;
  desc: string;
  features: string[];
};

const SHIELDS: ShieldItem[] = [
  {
    id: 'google-ppc',
    icon: '🚀',
    badge: 'Live PPC Pacing',
    title: 'Google Search Ads & RSA',
    desc: 'Bids on local homeowners searching with urgent intent. Automatically tests 15 responsive headlines and 4 descriptions per ad group.',
    features: [
      '100+ negative keyword waste scrubbers',
      'Location radius targeting (10–60 miles)',
      'Direct call extension & sitelink ads',
    ],
  },
  {
    id: 'retargeting',
    icon: '🎯',
    badge: 'Display Network',
    title: 'Lost Visitor Retargeting',
    desc: 'Re-engages homeowners who visited your website but didn’t submit an estimate with a dynamic $100–$250 off seasonal incentive.',
    features: [
      'Google Display banner placements',
      '30-day cookie re-engagement window',
      'Auto-suppresses converted customers',
    ],
  },
  {
    id: 'meta-feed',
    icon: '📸',
    badge: 'Social Ads',
    title: 'Meta Social Feed (FB & IG)',
    desc: 'Showcases before-and-after transformations and seasonal repair offers directly in local homeowners’ Facebook & Instagram feeds.',
    features: [
      'Visual ad copy with urgency hooks',
      'Geo-fenced neighborhood radius',
      'Lead form & message-match routing',
    ],
  },
  {
    id: 'neighborhood-halo',
    icon: '📡',
    badge: 'Hyper-Local Radius',
    title: 'Neighborhood Halo Geo-Fencing',
    desc: 'Automatically triggers hyper-targeted radius ads around active jobsites with privacy fuzzing and social proof.',
    features: [
      'Automatic jobsite radius triggers',
      'Privacy-preserving location fuzzing',
      'Zero agency markup (5% platform fee)',
    ],
  },
  {
    id: 'smart-shield',
    icon: '⛈️',
    badge: 'Zero-Config Guard',
    title: 'Weather Surge & Capacity Guard',
    desc: 'Autonomous budget intelligence that reacts to external conditions in real-time without you lifting a finger.',
    features: [
      '+25% budget boost during storms/freezes',
      'Auto-pauses ads when schedule is full',
      'Prevents burned ad spend when booked',
    ],
  },
];

export default function MultiChannelShieldGrid() {
  return (
    <section className={styles.shieldGridSection} aria-labelledby="shield-grid-title">
      <div className={styles.sectionHeader}>
        <span className={styles.badge}>
          <span aria-hidden="true">🛡️</span> MULTI-CHANNEL SMART SHIELD
        </span>
        <h2 id="shield-grid-title" className={styles.sectionTitle}>
          Full-funnel contractor marketing with autonomous safeguards.
        </h2>
        <p className={styles.sectionDesc}>
          Everything is managed programmatically under our Master MCC architecture. No complex dashboards to configure, no scripts to install.
        </p>
      </div>

      <div className={styles.shieldGrid}>
        {SHIELDS.map((item) => (
          <div key={item.id} className={styles.shieldCard}>
            <div>
              <div className={styles.shieldCardHeader}>
                <div className={styles.shieldIcon} aria-hidden="true">{item.icon}</div>
                <span className={styles.shieldStatus}>
                  <span className={styles.statusDot} /> {item.badge}
                </span>
              </div>
              <h3 className={styles.shieldTitle}>{item.title}</h3>
              <p className={styles.shieldDesc}>{item.desc}</p>
            </div>

            <ul className={styles.shieldFeatureList} aria-label={`${item.title} key features`}>
              {item.features.map((feat) => (
                <li key={feat} className={styles.shieldFeatureItem}>
                  <span className={styles.checkIcon} aria-hidden="true">✓</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            {item.id === 'neighborhood-halo' ? (
              <div style={{ marginTop: '0.9rem' }}>
                <Link
                  href="/features/neighborhood-halo"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--accent, #f97316)',
                    textDecoration: 'underline',
                  }}
                >
                  Explore Neighborhood Halo →
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
