import Link from 'next/link';
import styles from './features-theme.module.css';

const SECRET_WEAPONS = [
  {
    id: 'quick-stops',
    icon: '📍',
    badge: '✦ Route Density',
    badgeTone: 'mint',
    title: 'Quick-Stops Neighbor Fills',
    desc: 'Fill schedule gaps with 0 added drive time. Automatically broadcast discount slots to nearby homes within 2 miles of active jobs.',
    impact: '+$850 Avg. extra day revenue per truck',
    href: '/features/quick-stops',
    cta: 'Explore Quick-Stops',
  },
  {
    id: 'ai-vision',
    icon: '📸',
    badge: '✦ Instant Scoping',
    badgeTone: 'yellow',
    title: 'AI Photo Vision & Scoping',
    desc: 'Homeowners or techs snap photos of roofs, panels, or rooms. AI measures square footage, detects pitch, and drafts line-item scope on the spot.',
    impact: '30s Automated dimension & takeoff',
    href: '/features/ai-vision',
    cta: 'Explore AI Vision',
  },
  {
    id: 'text-to-job',
    icon: '💬',
    badge: '✦ 2-Second Reply',
    badgeTone: 'orange',
    title: 'Text-to-Job 2-Way SMS Dispatch',
    desc: 'Turn incoming customer text messages and photos directly into scheduled job records. Send automated on-my-way alerts and deposit links via SMS.',
    impact: '100% Conversational job dispatch via SMS',
    href: '/features/text-to-job',
    cta: 'Explore Text-to-Job',
  },
  {
    id: 'recurring',
    icon: '🔁',
    badge: '✦ Predictable MRR',
    badgeTone: 'blue',
    title: 'Recurring Maintenance Clubs',
    desc: 'Lock in predictable cash flow. Sell seasonal tune-up clubs, roof inspections, and annual service memberships with automated Stripe auto-billing.',
    impact: 'Automated monthly recurring revenue',
    href: '/features/recurring',
    cta: 'Explore Recurring Plans',
  },
];

export default function ContractorSecretWeapons() {
  return (
    <section className={styles.secretWeaponsSection} aria-labelledby="secret-weapons-title">
      <div className={styles.secretWeaponsHead}>
        <div className={styles.secretWeaponsEyebrow}>
          <span>✦</span> CONTRACTOR SECRET WEAPONS
        </div>
        <h2 id="secret-weapons-title" className={styles.secretWeaponsTitle}>
          High-margin capabilities built for <em>serious growth.</em>
        </h2>
        <p className={styles.secretWeaponsSubtitle}>
          Beyond basic software—these automated growth engines help you win more jobs, squeeze more revenue per route, and lock in recurring cash flow.
        </p>
      </div>

      <div className={styles.secretWeaponsGrid}>
        {SECRET_WEAPONS.map((item) => (
          <div key={item.id} className={styles.secretWeaponCard}>
            <div className={styles.secretWeaponTopRow}>
              <div className={styles.secretWeaponIconSquircle}>{item.icon}</div>
              <span className={`${styles.secretWeaponBadge} ${styles[`badge_${item.badgeTone}`]}`}>
                {item.badge}
              </span>
            </div>

            <h3 className={styles.secretWeaponCardTitle}>{item.title}</h3>
            <p className={styles.secretWeaponCardDesc}>{item.desc}</p>

            <div className={styles.secretWeaponMetricPill}>
              <span className={styles.secretWeaponMetricIcon}>⚡</span>
              <span>{item.impact}</span>
            </div>

            <div className={styles.secretWeaponActionRow}>
              <Link href={item.href} className={styles.secretWeaponCta}>
                {item.cta} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
