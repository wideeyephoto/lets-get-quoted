import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import shared from './themes.module.css';
import styles from './lumen.module.css';

const SERVICES = ['Kitchens & baths', 'Interior remodels', 'Finish carpentry'];

export default function LumenTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(3, 6);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#ff9d81',
    '--theme-display': site.header_font || 'var(--font-lumen-display), Poppins, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.lumen}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#services">Services</a><a href="#work">Work</a><a href="#contact">Contact</a></nav>
        <a className={styles.navCta} href="#contact">Quick Quote</a>
      </header>

      <section className={styles.hero} id="top">
        <p className={shared.kicker}>Bright spaces, done right</p>
        <h1>{site.headline || 'Interiors that feel like you.'}</h1>
        <p className={styles.heroText}>{site.tagline || 'Thoughtful remodels and finish work that make every room feel lighter and more like home.'}</p>
        <div className={shared.contactActions}>
          <a className={shared.primaryCta} href="#contact">Get a quick quote</a>
          {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
        </div>
      </section>

      <section className={styles.services} id="services">
        {SERVICES.map((service, index) => (
          <article key={service}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{service}</h3>
            <p>Clean execution, tidy job sites, and finishes you&apos;ll want to show off.</p>
          </article>
        ))}
      </section>

      <section className={styles.gallery} id="work">
        <p className={shared.kicker}>Recent work</p>
        <h2>Light-filled rooms, freshly finished.</h2>
        <div className={styles.galleryGrid}>
          {gallery.slice(0, 3).map((image) => (
            <figure key={image.id}>
              <img src={image.url} alt={image.alt} />
              <figcaption>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <p className={shared.kicker}>Let&apos;s get started</p>
        <h2>Tell us about your space.</h2>
        <QuoteRequestForm siteId={site.id} enabled={site.published} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.service_area || 'Proudly serving our local community'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
