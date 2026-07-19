import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './minimal.module.css';

export default function HavenTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 3);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#a98a5b',
    '--theme-display': site.header_font || 'var(--font-haven-display), Cormorant, Georgia, serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.haven}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#approach', label: 'Approach' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <p className={shared.kicker}>Quiet, considered building</p>
        <h1>{site.headline || 'Spaces made with intention.'}</h1>
        <p className={styles.heroText}>{site.tagline || 'We design and build homes that feel calm, considered, and entirely yours.'}</p>
        <a className={shared.primaryCta} href="#contact">Start a conversation</a>
      </section>

      <section className={styles.details} aria-label="Business details">
        <div><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Availability</span><strong>{site.hours || 'By appointment'}</strong></div>
        <div><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

      <section className={styles.statement} id="approach">
        <p className={shared.kicker}>Our approach</p>
        <h2>Less noise. More craft.</h2>
        <p>We keep the process unhurried and the details deliberate — clear plans, honest timelines, and a finish that holds up to a closer look.</p>
      </section>

      <section className={styles.gallery} id="work">
        {gallery.slice(0, 3).map((image) => (
          <figure key={image.id}>
            <img src={image.url} alt={image.alt} />
            <figcaption>{image.alt}</figcaption>
          </figure>
        ))}
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <p className={shared.kicker}>Ready when you are</p>
        <h2>Let&apos;s talk about your project.</h2>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.service_area || 'Local & regional projects'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
