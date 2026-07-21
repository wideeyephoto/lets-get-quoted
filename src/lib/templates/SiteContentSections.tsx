import type { Site } from '@/lib/sites';
import {
  getPublishedCertifications,
  getPublishedFaqs,
  getPublishedFinancing,
  getPublishedRatingBadge,
  getPublishedServiceAreas,
  getPublishedShowcase,
  getPublishedStats,
  getPublishedStickyCallBar,
  getPublishedTestimonials,
  getPublishedTrustBadges,
} from '@/lib/site-content';
import StatCounters from './StatCounters';
import styles from './themes.module.css';

type SiteContentSectionsProps = {
  site: Site;
};

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function SiteContentSections({ site }: SiteContentSectionsProps) {
  const showcase = getPublishedShowcase(site.content);
  const testimonials = getPublishedTestimonials(site.content);
  const faqs = getPublishedFaqs(site.content);
  const ratingBadge = getPublishedRatingBadge(site.content);
  const trustBadges = getPublishedTrustBadges(site.content);
  const financing = getPublishedFinancing(site.content);
  const serviceAreas = getPublishedServiceAreas(site.content);
  const certifications = getPublishedCertifications(site.content);
  const stats = getPublishedStats(site.content);
  const stickyCallBar = getPublishedStickyCallBar(site.content, site.phone);

  const hasInFlowSections = Boolean(showcase || testimonials || faqs || serviceAreas || certifications || stats);
  const hasTrustCluster = Boolean(ratingBadge || trustBadges || financing);

  if (!hasInFlowSections && !hasTrustCluster && !stickyCallBar) return null;

  // Only ever render an outbound apply link for an explicit https URL — never a
  // contractor-typed javascript:/data: string. Trim + case-insensitive scheme so
  // a valid "HTTPS://" isn't silently dropped.
  const rawApplyUrl = financing ? financing.applyUrl.trim() : '';
  const financingApplyUrl = /^https:\/\//i.test(rawApplyUrl) ? rawApplyUrl : '';

  // NOTE: no aggregateRating/Review JSON-LD is emitted here. Google's policy
  // disallows self-serving review structured data on a LocalBusiness (owner-
  // entered ratings about their own business), so it wouldn't earn a rich
  // result and could risk a manual action. The visible badge below is fine as
  // plain on-page content; schema will follow once reviews come from a verified
  // third-party source (the Google-reviews import).
  const roundedRating = ratingBadge ? Math.round(ratingBadge.rating) : 0;

  return (
    <>
      {ratingBadge && (
        <section className={styles.ratingBadge} aria-label="Customer rating">
          <div className={styles.ratingStars} aria-hidden="true">{'★'.repeat(roundedRating)}{'☆'.repeat(5 - roundedRating)}</div>
          <p className={styles.ratingValue}>{ratingBadge.rating.toFixed(1)}</p>
          <p className={styles.ratingMeta}>from {ratingBadge.reviewCount} {ratingBadge.sourceLabel}</p>
        </section>
      )}

      {trustBadges && (
        <section className={styles.trustBadges} aria-label="Credentials">
          <ul className={styles.trustBadgeList}>
            {trustBadges.badges.map((badge) => (
              <li key={badge.id} className={styles.trustChip}>
                <span className={styles.trustChipMark} aria-hidden="true">✓</span>
                {badge.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {financing && (
        <section className={styles.financing} aria-label="Financing">
          <div className={styles.financingInner}>
            <p className={styles.financingLead}>Projects from <strong>{formatMoney(financing.monthlyFrom)}/mo</strong></p>
            {financing.blurb && <p className={styles.financingBlurb}>{financing.blurb}</p>}
            {financingApplyUrl && (
              <a className={styles.financingApply} href={financingApplyUrl} target="_blank" rel="noopener noreferrer nofollow">Check your rate</a>
            )}
          </div>
        </section>
      )}

      {hasInFlowSections && (
        <div className={styles.extraSections}>
          {showcase && (
            <section className={styles.extraSection} id="showcase">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Showcase</p>
                <h2>{showcase.title}</h2>
                {showcase.intro && <p>{showcase.intro}</p>}
              </div>
              <div className={`${styles.showcaseGrid} ${styles[`showcase-${showcase.layout}`] || ''}`}>
                {showcase.items.map((item, index) => (
                  <figure key={`${item.id}-${index}`}>
                    <img src={item.url} alt={item.alt} />
                    <figcaption>{item.caption || item.alt}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {testimonials && (
            <section className={styles.extraSection} id="reviews">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Reviews</p>
                <h2>{testimonials.title}</h2>
              </div>
              <div className={styles.testimonialGrid}>
                {testimonials.items.map((item) => (
                  <article key={item.id} className={styles.testimonialCard}>
                    {item.imageUrl && <img className={styles.testimonialImage} src={item.imageUrl} alt={item.imageAlt || item.author || 'Customer review image'} />}
                    <div aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>
                    <p>“{item.text}”</p>
                    <footer><strong>{item.author || 'Homeowner'}</strong>{item.label && <span>{item.label}</span>}</footer>
                  </article>
                ))}
              </div>
            </section>
          )}

          {faqs && (
            <section className={styles.extraSection} id="faqs">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>FAQs</p>
                <h2>{faqs.title}</h2>
              </div>
              <div className={styles.faqList}>
                {faqs.items.map((item) => (
                  <details key={item.id} className={styles.faqItem}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {serviceAreas && (
            <section className={styles.extraSection} id="areas">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Service area</p>
                <h2>{serviceAreas.title}</h2>
                {serviceAreas.intro && <p>{serviceAreas.intro}</p>}
              </div>
              <ul className={styles.serviceAreaList}>
                {serviceAreas.cities.map((city, index) => (
                  <li key={`${city}-${index}`} className={styles.serviceAreaChip}>{city}</li>
                ))}
              </ul>
            </section>
          )}

          {stats && <StatCounters title={stats.title} items={stats.items} />}

          {certifications && (
            <section className={styles.extraSection} id="certifications">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Credentials</p>
                <h2>{certifications.title}</h2>
              </div>
              <ul className={styles.certList}>
                {certifications.items.map((item) => (
                  <li key={item.id} className={styles.certItem}>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.imageAlt || item.label || 'Certification'} />}
                    {item.label && <span>{item.label}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {stickyCallBar && site.phone && (
        <div className={styles.stickyCallBar} role="region" aria-label="Quick contact">
          <a className={styles.stickyCall} href={`tel:${site.phone}`}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" fill="currentColor"/></svg>
            Call now
          </a>
          {stickyCallBar.showQuote && (
            <a className={styles.stickyQuote} href="#contact">Free quote</a>
          )}
        </div>
      )}
    </>
  );
}
