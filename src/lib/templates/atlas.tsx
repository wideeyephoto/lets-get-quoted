import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './atlas.module.css';

const CAPABILITIES = ['Pre-construction planning', 'General contracting', 'Progress reporting & walkthroughs'];

export default function AtlasTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(2, 5);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#2dd4bf',
    '--theme-display': site.header_font || 'var(--font-atlas-display), Arial, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.atlas}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#capabilities', label: 'Capabilities' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Contracting, run like a business</p>
          <h1>{site.headline || 'Every project, fully accounted for.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Clear scopes, real schedules, and a team that reports back — not one that disappears until it\u2019s done.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Request a project review</a>
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
          <div><p className={shared.kicker}>What we handle</p><h2>One team, start to finish.</h2></div>
          <p>From scoping to close-out, every phase is planned, tracked, and communicated clearly.</p>
        </div>
        <ol className={styles.capabilityList}>
          {CAPABILITIES.map((capability, index) => (
            <li key={capability}><span>0{index + 1}</span>{capability}</li>
          ))}
        </ol>
      </section>

      <section className={styles.gallery} id="work">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>Recent work</p><h2>Delivered on schedule.</h2></div>
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
          <p className={shared.kicker}>Start a project review</p>
          <h2>Tell us what you&apos;re planning.</h2>
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
