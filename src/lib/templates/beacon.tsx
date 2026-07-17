import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import shared from './themes.module.css';
import styles from './beacon.module.css';

const SERVICES = ['Home repairs & handyman', 'Remodels & additions', 'Property maintenance'];

export default function BeaconTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(3, 6);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[4].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#ff8a3d',
    '--theme-display': site.header_font || 'var(--font-beacon-display), Arial, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.beacon}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <nav className={shared.navLinks} aria-label="Main navigation"><a href="#services">Services</a><a href="#work">Work</a><a href="#contact">Contact</a></nav>
        <a className={styles.navCta} href="#contact">Quick Quote</a>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Friendly, family-owned & local</p>
          <h1>{site.headline || 'The crew your neighbors already trust.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Honest pricing, tidy job sites, and a team that treats your home like it\u2019s ours.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Get a quick quote</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
        <div className={styles.heroMedia}>
          <img src={heroImage} alt="Completed home project" />
          <div className={styles.badge}><strong>Family owned</strong><span>{site.service_area || 'Serving our community'}</span></div>
        </div>
      </section>

      <section className={styles.intro} id="services">
        <div><p className={shared.kicker}>Why neighbors call us first</p><h2>Friendly people. Serious craftsmanship.</h2></div>
        <p>We keep things simple — clear pricing, easy scheduling, and a crew that actually shows up when they say they will.</p>
      </section>

      <section className={styles.services} aria-label="Services">
        {SERVICES.map((service, index) => (
          <article key={service}><span>0{index + 1}</span><h3>{service}</h3><p>Straightforward work, done with care, from a team you&apos;ll want to call again.</p></article>
        ))}
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}><div><p className={shared.kicker}>Recent work</p><h2>See what the neighbors are talking about.</h2></div></div>
        <div className={styles.gallery}>
          {gallery.slice(0, 3).map((image) => <figure key={image.id}><img src={image.url} alt={image.alt} /><figcaption>{image.alt}</figcaption></figure>)}
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div><p className={shared.kicker}>Ready when you are</p><h2>Tell us what you need done.</h2></div>
        <div>
          <p>{site.hours || 'Monday-Friday, 7am-5pm'}</p>
          <p>{site.service_area || 'Local and regional projects'}</p>
          {site.phone && <a className={shared.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}
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
