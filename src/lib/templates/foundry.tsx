import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './foundry.module.css';

export default function FoundryTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[2].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#ff6a1a',
    '--theme-display': site.header_font || 'var(--font-foundry-display), Arial Narrow, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.foundry}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={shared.logo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock}>F</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#work', label: 'Work' }, { href: '#about', label: 'About' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Concrete and masonry project underway" />
        <div className={styles.scrim} />
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Concrete & masonry, poured right</p>
          <h1>{site.headline || 'Poured right. Built to hold.'}</h1>
          <p className={styles.heroText}>{site.tagline || `Foundations, flatwork, and masonry that stand up to ${site.service_area || 'anything the ground throws at them'}.`}</p>
          <a className={shared.primaryCta} href="#contact">Get a project quote</a>
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
        <div><p className={shared.kicker}>How we work</p><h2>Right mix, right forms, right the first time.</h2></div>
        <p>We over-prep every pour — proper base, proper forms, proper cure time — so the finished work holds up for decades, not just for the walkthrough.</p>
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>Recent work</p><h2>Poured, cured, and still standing.</h2></div>
          <p>Driveways, foundations, retaining walls, and flatwork built for the long haul.</p>
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
        <p className={shared.kicker}>Have a pour coming up?</p>
        <h2>Let&apos;s get it scheduled.</h2>
        {site.phone && <p>Prefer to talk? Call <a href={`tel:${site.phone}`}>{site.phone}</a>.</p>}
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.service_area || 'Proudly serving our local community'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
