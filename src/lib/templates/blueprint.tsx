import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './blueprint.module.css';

export default function BlueprintTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#eaf2ff',
    '--theme-display': site.header_font || 'var(--font-mono), monospace',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.blueprint}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#specs', label: 'Specs' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <p className={styles.docLabel}>DWG-001 / ELEVATION</p>
        <h1>{site.headline || 'Precision, drafted and built.'}</h1>
        <p className={styles.heroText}>{site.tagline || 'Every project starts with a plan you can actually read — clear scope, clear cost, clear schedule.'}</p>
        <a className={shared.primaryCta} href="#contact">Request specs &amp; pricing</a>
      </section>

      <section className={styles.specs} id="specs" aria-label="Business details">
        <div><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Hours</span><strong>{site.hours || 'Mon–Fri, 7am–5pm'}</strong></div>
        <div><span>License</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

      <section className={styles.gallery} id="work">
        <p className={styles.docLabel}>FIG. 01–03 / BUILT WORK</p>
        <h2>Recent drawings, realized.</h2>
        <div className={styles.galleryGrid}>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id}>
              <img src={image.url} alt={image.alt} />
              <figcaption>FIG. 0{index + 1} — {image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <p className={styles.docLabel}>DWG-002 / SCOPE REQUEST</p>
        <h2>Send us the project brief.</h2>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.license || 'Licensed & insured'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
