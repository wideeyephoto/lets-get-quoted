import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import styles from './themes.module.css';

export default function VistaTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 5);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[0].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#d8ff45',
    '--theme-display': site.header_font || 'var(--font-display), Arial Black, Helvetica, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.vista}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.vistaHeader}>
        <a className={styles.vistaBrand} href="#top">{site.logo_url ? <img className={styles.logo} src={site.logo_url} alt={site.company_name} /> : site.company_name}</a>
        <nav className={styles.navLinks} aria-label="Main navigation"><a href="#studio">Studio</a><a href="#work">Work</a><a href="#contact">Connect</a></nav>
        <a className={styles.vistaMenu} href="#contact" aria-label="Contact us">↗</a>
      </header>

      <section className={styles.vistaHero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Featured completed project" />
        <div className={styles.vistaHeroCopy}>
          <p className={styles.kicker}>Build / Renovate / Refine</p>
          <h1>{site.headline || 'Spaces with purpose.'}</h1>
          <p>{site.tagline || 'We build considered homes and interiors for how you actually live.'}</p>
        </div>
        <a className={styles.vistaScroll} href="#studio">Explore ↓</a>
      </section>

      <section className={styles.vistaStatement} id="studio">
        <p>We are {site.company_name}.</p>
        <h2>Part builder, part problem-solver, always focused on the finish.</h2>
        <div><span>{site.service_area || 'Local projects'}</span><span>{site.license || 'Licensed & insured'}</span></div>
      </section>

      <section className={styles.vistaWork} id="work">
        <div className={styles.vistaWorkHeading}><p className={styles.kicker}>Selected spaces</p><span>{String(gallery.length).padStart(2, '0')} projects</span></div>
        <div className={styles.vistaGallery}>
          {gallery.slice(0, 5).map((image, index) => (
            <figure key={image.id} className={index === 0 || index === 3 ? styles.vistaWide : undefined}>
              <img src={image.url} alt={image.alt} />
              <figcaption><span>{image.alt}</span><small>0{index + 1}</small></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.vistaContact} id="contact">
        <p className={styles.kicker}>Next project</p><h2>Have a space in mind?</h2>
        {site.phone && <a href={`tel:${site.phone}`}>{site.phone} <span>↗</span></a>}
        <QuoteRequestForm siteId={site.id} enabled={site.published} />
      </section>

      <footer className={styles.vistaFooter}><strong>{site.company_name}</strong><span>{site.hours || 'By appointment'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}