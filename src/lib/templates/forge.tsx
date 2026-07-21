import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import styles from './themes.module.css';

export default function ForgeTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#f0b429',
    '--theme-display': site.header_font || 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.forge}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.forgeHeader}>
        <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock}>F</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#work', label: 'Work' }, { href: '#about', label: 'About' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
      </header>

      <section className={styles.forgeHero} id="top">
        <img className={styles.heroImage} src={heroImage} alt="Contractor project in progress" />
        <div className={styles.forgeScrim} />
        <div className={styles.forgeHeroCopy}>
          <p className={styles.kicker}>Built right. Built to last.</p>
          <h1>{site.headline || 'Serious work. Solid results.'}</h1>
          <p className={styles.heroText}>{site.tagline || `Trusted construction across ${site.service_area || 'your community'}.`}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.forgeIndex} aria-hidden="true">01 / 03</div>
      </section>

      <section className={styles.forgeTrust} aria-label="Business details">
        <div><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Availability</span><strong>{site.hours || 'Weekdays, 7-5'}</strong></div>
        <div><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

      <section className={styles.forgeAbout} id="about">
        <p className={styles.sectionNumber}>02</p>
        <div><p className={styles.kicker}>What we bring</p><h2>Clear plans. Skilled hands. No surprises.</h2></div>
        <p>From the first walkthrough to the final clean-up, we keep the work organized, the communication direct, and the standards high.</p>
      </section>

      <section className={styles.forgeWork} id="work">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>Selected work</p><h2>Made for real life.</h2></div>
          <p>Renovations, additions, and ground-up work delivered with practical care.</p>
        </div>
        <div className={styles.forgeGallery}>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id} className={index === 0 ? styles.forgeGalleryLead : undefined}>
              <img src={image.url} alt={image.alt} />
              <figcaption><span>0{index + 1}</span>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.forgeContact} id="contact">
        <p className={styles.kicker}>Have a project in mind?</p>
        <h2>Let&apos;s build something that holds up.</h2>
        {site.phone && <p>Prefer to talk? Call <a href={`tel:${site.phone}`}>{site.phone}</a>.</p>}
        <SiteProofStrip site={site} />
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.forgeFooter}><strong>{site.company_name}</strong><span>{site.service_area || 'Proudly serving our local community'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}