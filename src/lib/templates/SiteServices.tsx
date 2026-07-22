import type { SiteServicesContent } from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import styles from './themes.module.css';

// Icon service-card grid. Rendered once from SiteContentSections, so it appears
// on every template. currentColor-based surfaces + accent-tinted icons adapt to
// each template's palette (light or dark).
export default function SiteServices({ title, intro, items }: Pick<SiteServicesContent, 'title' | 'intro' | 'items'>) {
  return (
    <section className={styles.extraSection} data-reveal id="our-services">
      <div className={styles.extraSectionHeader}>
        <p className={styles.kicker}>Services</p>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      <div className={styles.serviceGrid}>
        {items.map((item) => (
          <article key={item.id} className={styles.serviceCard}>
            <span className={styles.serviceIcon}><ServiceIcon name={item.icon} /></span>
            <h3>{item.title}</h3>
            {item.description && <p>{item.description}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
