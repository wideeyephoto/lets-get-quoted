import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroBadge, getSlotImage } from '@/lib/site-content';
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

// Coat — bold painting / finishes aesthetic (Home Rakshak reference): a deep
// maroon hero with red bokeh + a cut-out-style worker photo, a red accent,
// rounded cards, and a dark "call us now" footer bar. Distinctive hero /
// header / footer; the mid-page content reuses the shared sections.
export default function CoatTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  // Second shot for the hero collage — a distinct image so the two cards differ.
  const secondImage = getSlotImage(
    site.content,
    'heroSecondary',
    gallery.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES[2].url,
  );
  const heroBadge = getHeroBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#e5322a',
    '--theme-on-accent': '#ffffff',
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.coat}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.coatHeader}>
        <a className={styles.coatBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.coatBrandMark} aria-hidden="true">◆</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#our-services', label: 'Services' }, { href: '#work', label: 'Projects' }, { href: '#contact', label: 'Contact' }]} />
        <a className={styles.coatHeaderCta} href="#contact">Book appointment <span aria-hidden="true">↗</span></a>
      </header>

      <section className={styles.coatHero} id="top">
        <div className={styles.coatBokeh} data-parallax="0.2" aria-hidden="true">
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
        </div>
        <div className={styles.coatHeroCopy}>
          <p className={styles.coatEyebrowLight}>Brushing dreams to life</p>
          <h1>{site.headline || 'We turn your space into living art.'}</h1>
          <p className={styles.coatHeroText}>{site.tagline || `Skilled painters and flawless, lasting finishes — inside and out${site.service_area ? `, across ${site.service_area}` : ''}.`}</p>
          <div className={styles.coatHeroActions}>
            <a className={styles.coatBtn} href="#contact">Get a free quote <span aria-hidden="true">↗</span></a>
            {site.phone && <a className={styles.coatHeroCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong></a>}
          </div>
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.coatHeroMedia}>
          <img className={styles.coatHeroImg} src={heroImage} alt="Recent painting project" fetchPriority="high" decoding="async" />
          <figure className={styles.coatPhotoSide} data-parallax="0.13" data-edit="image-heroSecondary">
            <img src={secondImage} alt="A freshly finished interior" loading="lazy" decoding="async" />
          </figure>
          {heroBadge && (
            <div className={styles.coatHeroBadge} data-edit="heroBadge">
              <span className={styles.coatHeroBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong><small>{heroBadge.subtitle}</small></div>
            </div>
          )}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.coatContact} id="contact">
        <div className={styles.coatContactCopy}>
          <p className={styles.coatEyebrow}>Make an appointment</p>
          <h2>Looking for help with your dream paint job?</h2>
          <p>Tell us about the project and we&apos;ll get back to you — free, no obligation.</p>
          {site.phone && <a className={styles.coatBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.coatFooter}>
        <div className={styles.coatFooterBar}>
          <a className={styles.coatFooterBrand} href="#top"><span className={styles.coatBrandMark} aria-hidden="true">◆</span>{site.company_name}</a>
          {site.phone && <a className={styles.coatFooterCall} href={`tel:${site.phone}`}><span aria-hidden="true">✆</span> Call us now — {site.phone}</a>}
          <small>Powered by Let&apos;s Get Quoted</small>
        </div>
      </footer>

      <SiteDesktopCta site={site} />
    </main>
  );
}
