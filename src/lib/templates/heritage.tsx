import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import shared from './themes.module.css';
import styles from './heritage.module.css';

const SERVICES = ['Additions & renovations', 'Historic restoration', 'New construction'];

export default function HeritageTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 2).concat(STOCK_SITE_IMAGES[5]);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[0].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#8c1f2b',
    '--theme-display': site.header_font || 'var(--font-heritage-display), Georgia, serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.heritage}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#services">Services</a><a href="#work">Work</a><a href="#contact">Contact</a></nav>
        <a className={styles.navCta} href="#contact">Quick Quote</a>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Trusted builders since day one</p>
          <h1>{site.headline || 'Traditional craft. Modern reliability.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Time-tested building methods paired with clear communication and dependable scheduling.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Request a consultation</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
        <div className={styles.heroMedia}>
          <img src={heroImage} alt="Completed home renovation" />
          <div className={styles.badge}><strong>Est. locally trusted</strong><span>{site.service_area || 'Serving our community'}</span></div>
        </div>
      </section>

      <section className={styles.intro} id="services">
        <div><p className={shared.kicker}>Our promise</p><h2>Built the right way, every time.</h2></div>
        <p>We combine proven techniques with careful project management, so the finished work is as solid as it looks.</p>
      </section>

      <section className={styles.services} aria-label="Services">
        {SERVICES.map((service, index) => (
          <article key={service}><span>0{index + 1}</span><h3>{service}</h3><p>Careful planning, quality materials, and a finish built to stand the test of time.</p></article>
        ))}
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}><div><p className={shared.kicker}>Recent work</p><h2>Craftsmanship you can trust.</h2></div></div>
        <div className={styles.gallery}>
          {gallery.slice(0, 3).map((image) => <figure key={image.id}><img src={image.url} alt={image.alt} /><figcaption>{image.alt}</figcaption></figure>)}
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div><p className={shared.kicker}>Ready when you are</p><h2>Tell us about your project.</h2></div>
        <div>
          <p>{site.hours || 'Monday-Friday, 7am-5pm'}</p>
          <p>{site.service_area || 'Local and regional projects'}</p>
          {site.phone && <a className={shared.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}
        </div>
        <QuoteRequestForm siteId={site.id} enabled={site.published} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.license || 'Licensed & insured'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
