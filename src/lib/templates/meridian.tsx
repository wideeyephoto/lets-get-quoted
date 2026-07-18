import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import shared from './themes.module.css';
import styles from './meridian.module.css';

export default function MeridianTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(2, 5);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#b08d3e',
    '--theme-display': site.header_font || 'var(--font-haven-display), Georgia, serif',
  } as CSSProperties;

  return (
    <main className={`${shared.site} ${styles.meridian}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          {site.logo_url && <img className={shared.logo} src={site.logo_url} alt="" />}
          <span>{site.company_name}</span>
        </a>
        <SiteNavLinks site={site} className={shared.navLinks} links={[{ href: '#studio', label: 'Studio' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.hero} id="top">
        <span className={styles.heroLine} aria-hidden="true" />
        <div>
          <p className={shared.kicker}>Architecture-led construction</p>
          <h1>{site.headline || 'Built to a higher standard.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Custom homes and additions planned like architecture and built with total precision.'}</p>
          <div className={shared.contactActions}>
            <a className={shared.primaryCta} href="#contact">Request a consultation</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
      </section>

      <section className={styles.intro} id="studio">
        <div>
          <p className={shared.kicker}>01 — Studio</p>
          <h2>Precision, from first sketch to final walkthrough.</h2>
        </div>
        <p>{`We pair design discipline with hands-on project management — ${site.license ? `licensed under ${site.license}, ` : ''}every phase documented, every detail signed off before it's built.`}</p>
      </section>

      <section className={styles.gallery} id="work">
        {gallery.slice(0, 3).map((image, index) => (
          <figure key={image.id} className={index === 0 ? styles.galleryLead : undefined}>
            <img src={image.url} alt={image.alt} />
            <figcaption><span>0{index + 1}</span>{image.alt}</figcaption>
          </figure>
        ))}
      </section>

      <SiteContentSections site={site} />

      <section className={styles.contact} id="contact">
        <div>
          <p className={shared.kicker}>02 — Next steps</p>
          <h2>Tell us about the project.</h2>
          <p className={styles.contactMeta}>{site.service_area || 'Local & regional'} · {site.hours || 'By appointment'}</p>
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
