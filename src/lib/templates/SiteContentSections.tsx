import type { Site } from '@/lib/sites';
import { getPublishedFaqs, getPublishedShowcase, getPublishedTestimonials } from '@/lib/site-content';
import styles from './themes.module.css';

type SiteContentSectionsProps = {
  site: Site;
};

export default function SiteContentSections({ site }: SiteContentSectionsProps) {
  const showcase = getPublishedShowcase(site.content);
  const testimonials = getPublishedTestimonials(site.content);
  const faqs = getPublishedFaqs(site.content);

  if (!showcase && !testimonials && !faqs) return null;

  return (
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
                <div aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>
                <p>“{item.text}”</p>
                <footer><strong>{item.author}</strong>{item.label && <span>{item.label}</span>}</footer>
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
    </div>
  );
}
