import { Fragment, type ReactNode } from 'react';
import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES, type SiteImage } from '@/lib/site-images';
import type { Site } from '@/lib/sites';
import {
  DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS,
  getHeroBandImages,
  getSectionOrder,
  getPublishedBeforeAfter,
  getPublishedBlog,
  getPublishedFaqs,
  getPublishedHowItWorks,
  getPublishedServiceAreas,
  getPublishedServices,
  getPublishedShowcase,
  getPublishedStats,
  getPublishedStickyCallBar,
  getPublishedTestimonials,
  getSiteContent,
  getSlotImage,
} from '@/lib/site-content';
import BeforeAfterSlider from './BeforeAfterSlider';
import FilmstripScroller from './FilmstripScroller';
import ProjectShowcase from './ProjectShowcase';
import TestimonialSlider from './TestimonialSlider';
import SiteServices from './SiteServices';
import SiteProcess from './SiteProcess';
import StatCounters from './StatCounters';
import styles from './themes.module.css';

type SiteContentSectionsProps = {
  site: Site;
  // Only Haven passes this — its Project showcase falls back to gallery
  // placeholders when the owner hasn't added their own photos yet.
  galleryImages?: SiteImage[];
};

// Format a stored 'YYYY-MM-DD' blog date. Parse as local midnight so the day
// never shifts under the server timezone; empty string on anything unparseable.
function formatBlogDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SiteContentSections({ site, galleryImages = [] }: SiteContentSectionsProps) {
  const services = getPublishedServices(site.content);
  const howItWorks = getPublishedHowItWorks(site.content);
  const showcaseContent = getPublishedShowcase(site.content);
  const testimonials = getPublishedTestimonials(site.content);
  const faqs = getPublishedFaqs(site.content);
  const serviceAreas = getPublishedServiceAreas(site.content);
  const stats = getPublishedStats(site.content);
  const beforeAfter = getPublishedBeforeAfter(site.content);
  const blog = getPublishedBlog(site.content);
  const stickyCallBar = getPublishedStickyCallBar(site.content, site.phone);

  // The Photo gallery renders in-flow (and reorderable) on every template. It was
  // once suppressed on Forge/Guild/Vista for a native work band those templates no
  // longer have, so it just goes through the shared stack like the rest now.
  const showcase = showcaseContent;

  // The Project showcase now renders in this reorderable stack on EVERY theme,
  // Haven (handy) included, so the owner can move it like any other section.
  // Haven keeps its two behaviours: its own band styling (.careWorks, below) and
  // a fallback to gallery placeholders so the band is never empty. Every other
  // theme shows the section only once real project photos exist, so placeholder
  // photos never go live where they aren't expected.
  const isHaven = site.template === 'handy';
  const projectContent = getSiteContent(site.content).projectShowcase;
  const projectOwnItems = projectContent.items.filter((item) => item.url && item.alt);
  const projectShowcase =
    projectContent.enabled && (isHaven || projectOwnItems.length > 0) ? projectContent : null;
  const projectItems = projectOwnItems.length > 0
    ? projectOwnItems.map((item) => ({ id: item.id, url: item.url, alt: item.alt, caption: item.caption }))
    : isHaven
      ? (galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES)
          .slice(0, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS)
          .map((item) => ({ id: item.id, url: item.url, alt: item.alt }))
      : [];

  const hasInFlowSections = Boolean(services || howItWorks || showcase || testimonials || faqs || serviceAreas || stats || beforeAfter || blog || projectShowcase);

  if (!hasInFlowSections && !stickyCallBar) return null;

  // Rating + credential proof now render in <SiteProofStrip> directly beside the
  // hero and contact forms (where proof converts), not mid-page. Financing stays
  // here as a standalone callout. No self-serving aggregateRating JSON-LD is
  // emitted (Google disallows owner-entered review markup on a LocalBusiness).

  // Each in-flow section keyed by its REORDERABLE_SECTIONS id; a disabled section
  // is a falsy no-op that still holds its place. Rendered in the owner's saved
  // order so rearranging the builder's "Page order" list reflows the page.
  const sectionBlocks: Record<string, ReactNode> = {
    services: services && <SiteServices title={services.title} intro={services.intro} items={services.items} />,
    projectShowcase: projectShowcase && (
      <section className={isHaven ? styles.careWorks : styles.projectBand} id="project-showcase" aria-label="Project showcase">
        <ProjectShowcase
          eyebrow={projectShowcase.eyebrow}
          title={projectShowcase.title}
          style={projectShowcase.style}
          items={projectItems}
        />
      </section>
    ),
    howItWorks: howItWorks && <SiteProcess title={howItWorks.title} intro={howItWorks.intro} steps={howItWorks.steps} />,
    showcase: showcase && (() => {
      // The visible tile title must ADVERTISE a service, never describe the
      // photo. Stock tiles saved without a caption (older generations, picker
      // picks) fall back to the site's service names round-robin, then the
      // trade — the descriptive alt stays on the img for accessibility only.
      const raw = getSiteContent(site.content);
      const adTitles = raw.services.items.map((svc) => svc.title.trim()).filter(Boolean);
      const trade = raw.trade.trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
      const adTitleFor = (index: number): string => (adTitles.length ? adTitles[index % adTitles.length] : trade ? `Expert ${trade}` : '');
      return (
        <section className={styles.extraSection} id="showcase">
          <div className={styles.extraSectionHeader} data-reveal>
            <p className={styles.kicker}>See the Results</p>
            <h2>{showcase.title}</h2>
            {showcase.intro && <p>{showcase.intro}</p>}
          </div>
          {(() => {
            const gridClass = `${styles.showcaseGrid} ${styles[`showcase-${showcase.layout}`] || ''}`;
            const figures = showcase.items.map((item, index) => (
              <figure key={`${item.id}-${index}`} data-edit={`showcase-${item.id}`}>
                <SafeImage src={item.url} alt={item.alt} width={1200} height={900} sizes={index === 0 && showcase.layout === 'featured' ? '60vw' : '30vw'} />
                <figcaption>{item.caption || (item.source === 'stock' ? adTitleFor(index) : item.alt)}</figcaption>
              </figure>
            ));
            // The filmstrip row drifts on its own; the other layouts are static.
            return showcase.layout === 'filmstrip'
              ? <FilmstripScroller className={gridClass}>{figures}</FilmstripScroller>
              : <div className={gridClass} data-stagger>{figures}</div>;
          })()}
        </section>
      );
    })(),
    testimonials: testimonials && (() => {
      const cards = [
        ...testimonials.items.map((item) => (
          <article key={item.id} className={styles.testimonialCard}>
            {item.imageUrl && <img className={styles.testimonialImage} src={item.imageUrl} alt={item.imageAlt || item.author || 'Customer review image'} />}
            <div aria-label={`${item.rating} out of 5 stars`}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>
            <p>“{item.text}”</p>
            <footer><strong>{item.author || 'Homeowner'}</strong>{item.label && <span>{item.label}</span>}</footer>
          </article>
        )),
        ...testimonials.googleReviews.map((review) => {
          const stars = Math.round(review.rating);
          return (
            <article key={review.id} className={`${styles.testimonialCard} ${styles.googleCard}`}>
              <div className={styles.googleCardHead}>
                {review.authorPhoto
                  ? <img className={styles.googleAvatar} src={review.authorPhoto} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                  : <span className={styles.googleAvatar} aria-hidden="true">{(review.author[0] || 'G').toUpperCase()}</span>}
                <div>
                  <strong>{review.author || 'Google reviewer'}</strong>
                  <a href={review.url || testimonials.googleUrl} target="_blank" rel="noopener noreferrer nofollow" className={styles.googleTag}>Review on Google</a>
                </div>
              </div>
              <div aria-label={`${stars} out of 5 stars`}>{'★'.repeat(stars)}{'☆'.repeat(Math.max(0, 5 - stars))}</div>
              <p>“{review.text}”</p>
            </article>
          );
        }),
      ];
      return (
        <section className={styles.extraSection} id="reviews">
          <div className={styles.extraSectionHeader} data-reveal>
            <p className={styles.kicker}>Reviews</p>
            <h2>{testimonials.title}</h2>
          </div>
          {testimonials.displayStyle === 'grid'
            ? <div className={styles.testimonialGrid} data-stagger>{cards}</div>
            : <TestimonialSlider mode={testimonials.displayStyle}>{cards}</TestimonialSlider>}
        {testimonials.googleReviews.length > 0 && (
          <p className={styles.googleAttribution} data-reveal>
            {testimonials.googleRating > 0 && <strong>{testimonials.googleRating.toFixed(1)} ★ on Google{testimonials.googleReviewCount > 0 ? ` · ${testimonials.googleReviewCount.toLocaleString('en-US')} reviews` : ''}</strong>}
            {testimonials.googleUrl && <a href={testimonials.googleUrl} target="_blank" rel="noopener noreferrer nofollow">See all reviews on Google →</a>}
            <span className={styles.googlePoweredBy}>Powered by Google</span>
          </p>
        )}
        </section>
      );
    })(),
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
  };

  return (
    <>
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
            {stickyCallBar.callLabel || 'Call now'}
          </a>
          {stickyCallBar.showQuote && (
            <a className={styles.stickyQuote} href="#contact">{stickyCallBar.quoteLabel || 'Free quote'}</a>
          )}
        </div>
      )}

    </>
  );
}
