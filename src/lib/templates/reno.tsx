import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteDesktopCta from './SiteDesktopCta';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import styles from './themes.module.css';

// Reno — dark-navy + golden-yellow renovation look (Renovation/ThemeMove
// reference): hexagon motifs, an angular slanted hero photo, bold white
// headlines on navy, yellow accents. Mid-page reuses the shared sections.
export default function RenoTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  void gallery;
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#f5b421',
    '--theme-on-accent': '#1b2431',
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.reno}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.renoHeader}>
        <a className={styles.renoBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.renoHex} aria-hidden="true">⚒</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#our-services', label: 'Services' }, { href: '#work', label: 'Projects' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && (
          <a className={styles.renoHeaderPhone} href={`tel:${site.phone}`}>
            <span className={styles.renoHex} aria-hidden="true">✆</span>{site.phone}
          </a>
        )}
      </header>

      <section className={styles.renoHero} id="top">
        <div className={styles.renoHeroCopy}>
          <p className={styles.renoEyebrow}>Professional renovation &amp; repair</p>
          <h1>{site.headline || 'Handyman services, done right.'}</h1>
          <p className={styles.renoHeroText}>{site.tagline || `Renovation, repair, and remodeling — a wide range of affordable, reliable work${site.service_area ? ` across ${site.service_area}` : ''}.`}</p>
          <div className={styles.renoHeroActions}>
            <a className={styles.renoBtn} href="#contact">Find out more <span aria-hidden="true">»</span></a>
            {site.phone && <a className={styles.renoHeroCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong></a>}
          </div>
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.renoHeroMedia}>
          <img className={styles.renoHeroImg} src={heroImage} alt="Recent renovation project" fetchPriority="high" decoding="async" />
          <span className={styles.renoHexBadge} data-parallax="0.16" aria-hidden="true">⌂</span>
          <span className={styles.renoHexGhost} data-parallax="0.26" aria-hidden="true" />
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.renoContact} id="contact">
        <div className={styles.renoContactCopy} data-reveal>
          <p className={styles.renoEyebrow}>Get a free estimate</p>
          <h2>Have a project in mind?</h2>
          <p>Tell us what needs doing and we&apos;ll follow up with a plan and a price — free, no obligation.</p>
          {site.phone && <a className={styles.renoBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.renoFooter}>
        <div className={styles.renoFooterBar}>
          <a className={styles.renoFooterBrand} href="#top"><span className={styles.renoHex} aria-hidden="true">⚒</span>{site.company_name}</a>
          {site.phone && <a className={styles.renoFooterCall} href={`tel:${site.phone}`}><span aria-hidden="true">✆</span> Call us now — {site.phone}</a>}
          <small>Powered by Let&apos;s Get Quoted</small>
        </div>
      </footer>

      <SiteDesktopCta site={site} />
    </main>
  );
}
