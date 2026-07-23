import { Fragment, type ReactNode } from 'react';
import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { Site } from '@/lib/sites';
import {
  getHeroBandImages,
  getSectionOrder,
  getPublishedBeforeAfter,
  getPublishedBlog,
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
  getSlotImage,
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

// Format a stored 'YYYY-MM-DD' blog date. Parse as local midnight so the day
// never shifts under the server timezone; empty string on anything unparseable.
function formatBlogDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
  const blog = getPublishedBlog(site.content);
  const stickyCallBar = getPublishedStickyCallBar(site.content, site.phone);

  const hasInFlowSections = Boolean(services || howItWorks || showcase || testimonials || faqs || serviceAreas || certifications || stats || beforeAfter || blog);
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

  // Each in-flow section keyed by its REORDERABLE_SECTIONS id; a disabled section
  // is a falsy no-op that still holds its place. Rendered in the owner's saved
  // order so rearranging the builder's "Page order" list reflows the page.
  const sectionBlocks: Record<string, ReactNode> = {
    services: services && <SiteServices title={services.title} intro={services.intro} items={services.items} />,
    howItWorks: howItWorks && <SiteProcess title={howItWorks.title} intro={howItWorks.intro} steps={howItWorks.steps} />,
    showcase: showcase && (
      <section className={styles.extraSection} id="showcase">
        <div className={styles.extraSectionHeader} data-reveal>
          <p className={styles.kicker}>Showcase</p>
          <h2>{showcase.title}</h2>
          {showcase.intro && <p>{showcase.intro}</p>}
        </div>
        <div className={`${styles.showcaseGrid} ${styles[`showcase-${showcase.layout}`] || ''}`} data-stagger>
          {showcase.items.map((item, index) => (
            <figure key={`${item.id}-${index}`} data-edit={`showcase-${item.id}`}>
              <SafeImage src={item.url} alt={item.alt} width={1200} height={900} sizes={index === 0 && showcase.layout === 'featured' ? '60vw' : '30vw'} />
              <figcaption>{item.caption || item.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    ),
    testimonials: testimonials && (
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
    ),
    faqs: faqs && (
      <section className={styles.extraSection} id="faqs">
        <div className={styles.extraSectionHeader} data-reveal>
          <p className={styles.kicker}>FAQs</p>
          <h2>{faqs.title}</h2>
        </div>
        <div className={styles.faqList} data-stagger>
          {faqs.items.map((item) => (
            <details key={item.id} className={styles.faqItem}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    ),
    serviceAreas: serviceAreas && (
      <section className={styles.extraSection} id="areas">
        <div className={styles.extraSectionHeader} data-reveal>
          <p className={styles.kicker}>Service area</p>
          <h2>{serviceAreas.title}</h2>
          {serviceAreas.intro && <p>{serviceAreas.intro}</p>}
        </div>
        <ul className={styles.serviceAreaList} data-stagger>
          {serviceAreas.cities.map((city, index) => (
            <li key={`${city}-${index}`} className={styles.serviceAreaChip}>{city}</li>
          ))}
        </ul>
      </section>
    ),
    stats: stats && <StatCounters title={stats.title} items={stats.items} photo={getSlotImage(site.content, 'stats', site.hero_url || STOCK_SITE_IMAGES[2].url)} />,
    beforeAfter: beforeAfter && <BeforeAfterSlider title={beforeAfter.title} intro={beforeAfter.intro} items={beforeAfter.items} />,
    blog: blog && (
      <section className={styles.extraSection} id="blog">
        <div className={styles.extraSectionHeader} data-reveal>
          <p className={styles.kicker}>Blog</p>
          <h2>{blog.title}</h2>
          {blog.intro && <p>{blog.intro}</p>}
        </div>
        <div className={styles.blogGrid} data-stagger>
          {blog.posts.slice(0, 6).map((post) => (
            <a key={post.id} className={styles.blogCard} href={`/blog/${post.slug}`}>
              {post.coverImage && <img className={styles.blogCardImg} src={post.coverImage} alt="" loading="lazy" decoding="async" />}
              <div className={styles.blogCardBody}>
                {formatBlogDate(post.date) && <time className={styles.blogCardDate} dateTime={post.date}>{formatBlogDate(post.date)}</time>}
                <h3>{post.title}</h3>
                {post.excerpt && <p>{post.excerpt}</p>}
                <span className={styles.blogCardMore}>Read more <span aria-hidden="true">→</span></span>
              </div>
            </a>
          ))}
        </div>
        <a className={styles.blogViewAll} href="/blog">View all posts <span aria-hidden="true">→</span></a>
      </section>
    ),
    certifications: certifications && (
      <section className={styles.extraSection} id="certifications">
        <div className={styles.extraSectionHeader} data-reveal>
          <p className={styles.kicker}>Credentials</p>
          <h2>{certifications.title}</h2>
        </div>
        <ul className={styles.certList} data-stagger>
          {certifications.items.map((item) => (
            <li key={item.id} className={styles.certItem}>
              {item.imageUrl && <img src={item.imageUrl} alt={item.imageAlt || item.label || 'Certification'} loading="lazy" decoding="async" />}
              {item.label && <span>{item.label}</span>}
            </li>
          ))}
        </ul>
      </section>
    ),
  };

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
          {(() => {
            const bands = getHeroBandImages(site.content);
            const nodes: ReactNode[] = [];
            let bandIndex = 0;
            let shown = 0;
            for (const key of getSectionOrder(site.content)) {
              const block = sectionBlocks[key];
              if (!block) continue;
              nodes.push(<Fragment key={key}>{block}</Fragment>);
              shown += 1;
              // Drop a parallax band in after every 3rd visible section.
              if (shown % 3 === 0 && bandIndex < bands.length) {
                nodes.push(<div key={`band-${bandIndex}`} className={styles.heroBand}><img data-parallax="0.2" src={bands[bandIndex]} alt="" loading="lazy" decoding="async" /></div>);
                bandIndex += 1;
              }
            }
            // Any leftover bands trail the sections.
            while (bandIndex < bands.length) {
              nodes.push(<div key={`band-${bandIndex}`} className={styles.heroBand}><img data-parallax="0.2" src={bands[bandIndex]} alt="" loading="lazy" decoding="async" /></div>);
              bandIndex += 1;
            }
            return nodes;
          })()}
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
