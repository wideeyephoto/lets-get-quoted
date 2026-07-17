import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import shared from './themes.module.css';
import styles from './summit.module.css';

export default function SummitTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(3, 6);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[3].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#e8a33d',
    '--theme-display': site.header_font || 'var(--font-forge-display), Impact, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.summit}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={shared.logo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock}>S</span>}
          <strong>{site.company_name}</strong>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></nav>
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Outdoor living project in progress" />
        <div className={styles.scrim} />
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Decks, patios & outdoor living</p>
          <h1>{site.headline || 'Built for the outdoors you love.'}</h1>
          <p className={styles.heroText}>{site.tagline || `Decks, patios, and outdoor spaces built to handle ${site.service_area || 'every season'}.`}</p>
          <a className={shared.primaryCta} href="#contact">Plan your space</a>
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
        <div><p className={shared.kicker}>Built for real weather</p><h2>Made to be lived on, year-round.</h2></div>
        <p>We build for the way you&apos;ll actually use the space — sturdy framing, weather-ready materials, and details that hold up season after season.</p>
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}>
          <div><p className={shared.kicker}>Recent work</p><h2>Outdoor spaces, built to gather.</h2></div>
          <p>Decks, patios, pergolas, and outdoor kitchens delivered from design to final board.</p>
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

      <section className={styles.contact} id="contact">
        <p className={shared.kicker}>Ready to build your space?</p>
        <h2>Let&apos;s plan it out.</h2>
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
