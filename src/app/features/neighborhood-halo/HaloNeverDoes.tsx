'use client';

import styles from './neighborhood-halo.module.css';

const NEVER_ITEMS = [
  {
    icon: '🚫',
    title: 'Never exposes house numbers or names',
    desc: 'Customer privacy is guarded programmatically. Ads only reference the street name and general neighborhood, never exact addresses, phone numbers, or invoice amounts.',
  },
  {
    icon: '🛡️',
    title: 'Never bills beyond your $25 budget cap',
    desc: 'Traditional agencies burn budgets on autopilot. Halo micro-campaigns hard-cap at $25 ($5/day pacing) and automatically shut down after 5 days unless renewed.',
  },
  {
    icon: '⚡',
    title: 'Never runs past 72h on dead audiences',
    desc: 'If an ad logs 150+ impressions with zero clicks after 72 hours, the engine automatically pauses the campaign and refunds remaining dollars to your primary search budget.',
  },
  {
    icon: '💻',
    title: 'Never requires Facebook Ads Manager',
    desc: 'No business manager accounts, no tracking pixels, and no $2,500/mo agency retainers. Campaigns dispatch via our Master MCC ad infrastructure with 1 tap.',
  },
];

export default function HaloNeverDoes() {
  return (
    <section className="section-block" aria-labelledby="never-does-title" style={{ margin: '56px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2rem' }}>
        <p className="eyebrow" style={{ color: '#f87171', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🛡️ Contractor Guarantees
        </p>
        <h2 id="never-does-title" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.35rem 0 0.75rem', letterSpacing: '-0.02em' }}>
          What Neighborhood Halo will NEVER do.
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, fontSize: '0.98rem' }}>
          Contractors are rightfully skeptical of ad platforms and marketing agencies.
          Here are our explicit commitments to protecting your margin and customer relationships.
        </p>
      </div>

      <div className={styles.neverGrid}>
        {NEVER_ITEMS.map((item) => (
          <div key={item.title} className={styles.neverCard}>
            <div className={styles.neverIcon}>{item.icon}</div>
            <h3 className={styles.neverTitle}>{item.title}</h3>
            <p className={styles.neverDesc}>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
