import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import shared from './themes.module.css';
import styles from './cascade.module.css';

const CAPABILITIES = ['Leak detection & repair', 'Water heater installation', 'Drain & sewer service'];

export default function CascadeTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(4, 6).concat(STOCK_SITE_IMAGES[0]);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#38bdf8',
    '--theme-display': site.header_font || 'var(--font-atlas-display), Arial, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.cascade}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#capabilities">Services</a><a href="#work">Work</a><a href="#contact">Contact</a></nav>
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Plumbing that just works</p>
          <h1>{site.headline || 'Fast fixes. Fair pricing. No drama.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'From a dripping faucet to a full repipe, we show up on time and leave the job site clean.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Request service</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
        <div className={styles.heroPanel}>
          <span className={styles.heroPanelLabel}>Coverage area</span>
          <strong className={styles.heroPanelValue}>{site.service_area || 'Local & regional'}</strong>
          <span className={styles.heroPanelFoot}>{site.hours || 'Weekdays, 7am\u20135pm'}</span>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Business details">
        <div><span>Coverage</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Availability</span><strong>{site.hours || 'Weekdays, 7-5'}</strong></div>
        <div><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
        <div><span>Direct line</span><strong>{site.phone || 'Request a callback'}</strong></div>
      </section>

      <section className={styles.capabilities} id="capabilities">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>What we fix</p><h2>Every job, done once, done right.</h2></div>
          <p>Upfront pricing before we start, and a clean, tested finish before we leave.</p>
        </div>
        <ol className={styles.capabilityList}>
          {CAPABILITIES.map((capability, index) => (
            <li key={capability}><span>0{index + 1}</span>{capability}</li>
          ))}
        </ol>
      </section>

      <section className={styles.gallery} id="work">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>Recent work</p><h2>Tidy jobs, tested twice.</h2></div>
        </div>
        <div className={styles.galleryGrid}>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id}>
              <img src={image.url} alt={image.alt} />
              <figcaption><span>0{index + 1}</span>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <div>
          <p className={shared.kicker}>Need a hand fast?</p>
          <h2>Tell us what&apos;s going on.</h2>
          <ul className={styles.contactFacts}>
            <li>{site.service_area || 'Local & regional'}</li>
            <li>{site.hours || 'Weekdays, 7am\u20135pm'}</li>
            <li>{site.license || 'Licensed & insured'}</li>
          </ul>
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
