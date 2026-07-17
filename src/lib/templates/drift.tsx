import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import shared from './themes.module.css';
import styles from './drift.module.css';

export default function DriftTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 5);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[5].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#5ec6d8',
    '--theme-display': site.header_font || 'var(--font-drift-display), Arial, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.drift}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#studio">Studio</a><a href="#work">Work</a><a href="#contact">Connect</a></nav>
        <a className={styles.menu} href="#contact" aria-label="Contact us">↗</a>
      </header>

      <section className={styles.hero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Featured coastal remodel project" />
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Coastal Remodels / Additions / Refresh</p>
          <h1>{site.headline || 'Easy living, built right in.'}</h1>
          <p>{site.tagline || 'Relaxed, light-filled spaces built for salt air, sandy feet, and slow mornings.'}</p>
        </div>
        <a className={styles.scroll} href="#studio">Explore ↓</a>
      </section>

      <section className={styles.statement} id="studio">
        <p>We are {site.company_name}.</p>
        <h2>Part builder, part beach-day planner, always focused on ease.</h2>
        <div><span>{site.service_area || 'Local projects'}</span><span>{site.license || 'Licensed & insured'}</span></div>
      </section>

      <section className={styles.work} id="work">
        <div className={styles.workHeading}><p className={shared.kicker}>Selected spaces</p><span>{String(gallery.length).padStart(2, '0')} projects</span></div>
        <div className={styles.gallery}>
          {gallery.slice(0, 5).map((image, index) => (
            <figure key={image.id} className={index === 0 || index === 3 ? styles.wide : undefined}>
              <img src={image.url} alt={image.alt} />
              <figcaption><span>{image.alt}</span><small>0{index + 1}</small></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <p className={shared.kicker}>Next project</p><h2>Have a space in mind?</h2>
        {site.phone && <a href={`tel:${site.phone}`}>{site.phone} <span>↗</span></a>}
        <QuoteRequestForm siteId={site.id} enabled={site.published} />
      </section>

      <footer className={styles.footer}>
        <strong>{site.company_name}</strong>
        <span>{site.hours || 'By appointment'}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
