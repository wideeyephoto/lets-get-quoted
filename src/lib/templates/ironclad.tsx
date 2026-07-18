import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './ironclad.module.css';

export default function IroncladTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 3);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[0].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#e2231a',
    '--theme-display': site.header_font || 'var(--font-ironclad-display), Impact, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.ironclad}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={shared.logo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock}>I</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#work', label: 'Work' }, { href: '#about', label: 'Warranty' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Exterior protection project in progress" />
        <div className={styles.scrim} />
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Storm-ready roofing & exteriors</p>
          <h1>{site.headline || 'Built to outlast the warranty.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Roofing, siding, and exterior work backed by a crew that stands behind every job.'}</p>
          <a className={shared.primaryCta} href="#contact">Get a free inspection</a>
        </div>
        <div className={styles.index} aria-hidden="true">01 / 03</div>
      </section>

      <section className={styles.trust} aria-label="Business details">
        <div><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Availability</span><strong>{site.hours || 'Weekdays, 7-5'}</strong></div>
        <div><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

      <section className={styles.about} id="about">
        <p className={styles.sectionNumber}>02</p>
        <div><p className={shared.kicker}>Why we&apos;re different</p><h2>Nothing gets past this crew.</h2></div>
        <p>Every job is inspected before, during, and after — with a written warranty behind the work, not just a handshake.</p>
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>Recent work</p><h2>Weathered the storm. Still standing.</h2></div>
          <p>Roofs, siding, and exteriors built to handle whatever the season brings.</p>
        </div>
        <div className={styles.gallery}>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id} className={index === 0 ? styles.galleryLead : undefined}>
              <img src={image.url} alt={image.alt} />
              <figcaption><span>0{index + 1}</span>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <p className={shared.kicker}>Storm damage or a new roof?</p>
        <h2>Get a free inspection.</h2>
        {site.phone && <p>Prefer to talk? Call <a href={`tel:${site.phone}`}>{site.phone}</a>.</p>}
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
