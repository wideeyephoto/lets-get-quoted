import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { Site } from '@/lib/sites';
import {
  getPublishedBeforeAfter,
  getPublishedCertifications,
  getPublishedFaqs,
  getPublishedFinancing,
  getPublishedHowItWorks,
  getPublishedServiceAreas,
  getPublishedServices,
  getPublishedShowcase,
  getPublishedStats,
  getPublishedStickyCallBar,
  getPublishedTestimonials,
} from '@/lib/site-content';
import BeforeAfterSlider from './BeforeAfterSlider';
import SiteServices from './SiteServices';
import SiteProcess from './SiteProcess';
import StatCounters from './StatCounters';
import styles from './themes.module.css';

type SiteContentSectionsProps = {
  site: Site;
};

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function SiteContentSections({ site }: SiteContentSectionsProps) {
  const services = getPublishedServices(site.content);
  const howItWorks = getPublishedHowItWorks(site.content);
  const showcase = getPublishedShowcase(site.content);
  const testimonials = getPublishedTestimonials(site.content);
  const faqs = getPublishedFaqs(site.content);
  const financing = getPublishedFinancing(site.content);
  const serviceAreas = getPublishedServiceAreas(site.content);
  const certifications = getPublishedCertifications(site.content);
  const stats = getPublishedStats(site.content);
  const beforeAfter = getPublishedBeforeAfter(site.content);
  const stickyCallBar = getPublishedStickyCallBar(site.content, site.phone);

  const hasInFlowSections = Boolean(services || howItWorks || showcase || testimonials || faqs || serviceAreas || certifications || stats || beforeAfter);
  const hasFinancing = Boolean(financing);

  if (!hasInFlowSections && !hasFinancing && !stickyCallBar) return null;

  // Only ever render an outbound apply link for an explicit https URL — never a
  // contractor-typed javascript:/data: string. Trim + case-insensitive scheme so
  // a valid "HTTPS://" isn't silently dropped.
  const rawApplyUrl = financing ? financing.applyUrl.trim() : '';
  const financingApplyUrl = /^https:\/\//i.test(rawApplyUrl) ? rawApplyUrl : '';

  // Rating + credential proof now render in <SiteProofStrip> directly beside the
  // hero and contact forms (where proof converts), not mid-page. Financing stays
  // here as a standalone callout. No self-serving aggregateRating JSON-LD is
  // emitted (Google disallows owner-entered review markup on a LocalBusiness).

  return (
    <>
      {financing && (
        <section className={styles.financing} data-reveal aria-label="Financing">
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
          {services && <SiteServices title={services.title} intro={services.intro} items={services.items} />}
          {howItWorks && <SiteProcess title={howItWorks.title} intro={howItWorks.intro} steps={howItWorks.steps} />}
          {showcase && (
            <section className={styles.extraSection} data-reveal id="showcase">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Showcase</p>
                <h2>{showcase.title}</h2>
                {showcase.intro && <p>{showcase.intro}</p>}
              </div>
              <div className={`${styles.showcaseGrid} ${styles[`showcase-${showcase.layout}`] || ''}`}>
                {showcase.items.map((item, index) => (
                  <figure key={`${item.id}-${index}`}>
                    <SafeImage src={item.url} alt={item.alt} width={1200} height={900} sizes={index === 0 && showcase.layout === 'featured' ? '60vw' : '30vw'} />
                    <figcaption>{item.caption || item.alt}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {testimonials && (
            <section className={styles.extraSection} id="reviews">
              <div className={styles.extraSectionHeader} data-reveal>
                <p className={styles.kicker}>Reviews</p>
                <h2>{testimonials.title}</h2>
              </div>
              <div className={styles.testimonialGrid} data-stagger>
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
            <section className={styles.extraSection} data-reveal id="faqs">
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
            <section className={styles.extraSection} data-reveal id="areas">
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

          {stats && <StatCounters title={stats.title} items={stats.items} photo={site.hero_url || STOCK_SITE_IMAGES[2].url} />}

          {beforeAfter && <BeforeAfterSlider title={beforeAfter.title} intro={beforeAfter.intro} items={beforeAfter.items} />}

          {certifications && (
            <section className={styles.extraSection} data-reveal id="certifications">
              <div className={styles.extraSectionHeader}>
                <p className={styles.kicker}>Credentials</p>
                <h2>{certifications.title}</h2>
              </div>
              <ul className={styles.certList}>
                {certifications.items.map((item) => (
                  <li key={item.id} className={styles.certItem}>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.imageAlt || item.label || 'Certification'} loading="lazy" decoding="async" />}
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
