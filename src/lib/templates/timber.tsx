import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './timber.module.css';

const SERVICES = ['Custom carpentry', 'Cabinetry & built-ins', 'Trim & finish work'];

export default function TimberTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(4, 6).concat(STOCK_SITE_IMAGES[1]);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[4].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#a5673f',
    '--theme-display': site.header_font || 'var(--font-timber-display), Georgia, serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.timber}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#services', label: 'Services' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        <a className={styles.navCta} href="#contact">Quick Quote</a>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={shared.kicker}>Custom carpentry & fine finish work</p>
          <h1>{site.headline || 'Woodwork worth a second look.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Custom cabinetry, trim, and built-ins crafted by hand and finished to last generations.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Discuss your project</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
        <div className={styles.heroMedia}>
          <img src={heroImage} alt="Custom woodwork project" />
          <div className={styles.badge}><strong>Handcrafted</strong><span>{site.service_area || 'Serving our community'}</span></div>
        </div>
      </section>

      <section className={styles.intro} id="services">
        <div><p className={shared.kicker}>Our craft</p><h2>Built by hand. Finished with patience.</h2></div>
        <p>Every piece is measured twice, joined properly, and finished with a level of care that off-the-shelf work can&apos;t match.</p>
      </section>

      <section className={styles.services} aria-label="Services">
        {SERVICES.map((service, index) => (
          <article key={service}><span>0{index + 1}</span><h3>{service}</h3><p>Solid materials, honest joinery, and a finish that ages well.</p></article>
        ))}
      </section>

      <section className={styles.work} id="work">
        <div className={shared.sectionHeading}><div><p className={shared.kicker}>Recent work</p><h2>Quality you can run your hand across.</h2></div></div>
        <div className={styles.gallery}>
          {gallery.slice(0, 3).map((image) => <figure key={image.id}><img src={image.url} alt={image.alt} /><figcaption>{image.alt}</figcaption></figure>)}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <div><p className={shared.kicker}>Ready when you are</p><h2>Tell us what you&apos;re building.</h2></div>
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
