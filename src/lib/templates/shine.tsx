import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroBadge } from '@/lib/site-content';
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

// Shine — modern, premium cleaning look (Purely reference): deep-navy ground,
// bright-yellow accent, a rounded hero photo with floating "24/7" + "500+"
// badge cards (parallax), rounded cards throughout. Mid-page reuses the
// shared sections.
export default function ShineTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  const heroImage = site.hero_url || gallery[0]?.url || STOCK_SITE_IMAGES[0].url;
  // Second photo for the floating collage — prefer a distinct gallery shot so
  // the two cards don't duplicate, falling back to a different stock image.
  const secondImage =
    gallery.find((image) => image.url !== heroImage)?.url ||
    STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
    STOCK_SITE_IMAGES[1].url;
  const heroBadge = getHeroBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#ffd60a',
    '--theme-on-accent': '#0f1b2d',
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.shine}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.shineHeader}>
        <a className={styles.shineBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.shineBrandMark} aria-hidden="true">◧</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#our-services', label: 'Services' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Contact' }]} />
        <a className={styles.shineHeaderCta} href="#contact">Book a call <span aria-hidden="true">→</span></a>
      </header>

      <section className={styles.shineHero} id="top">
        <div className={styles.shineHeroCopy}>
          <h1>{site.headline || 'Pure living starts with a spotless home.'}</h1>
          <p className={styles.shineHeroText}>{site.tagline || 'Professional home cleaning and maintenance, designed to give you comfort, hygiene, and peace of mind.'}</p>
          <div className={styles.shineHeroActions}>
            <a className={styles.shineBtn} href="#contact">Book a service <span aria-hidden="true">→</span></a>
            {site.phone ? <a className={styles.shineBtnGhost} href={`tel:${site.phone}`}>Call {site.phone}</a> : <a className={styles.shineBtnGhost} href="#contact">Get a free quote</a>}
          </div>
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.shineHeroMedia}>
          <div className={styles.shineCollage}>
            <figure className={`${styles.shinePhotoCard} ${styles.shinePhotoMain}`} data-parallax="0.05">
              <img className={styles.shinePhoto} src={heroImage} alt="Recent cleaning project" fetchPriority="high" decoding="async" />
            </figure>
            <figure className={`${styles.shinePhotoCard} ${styles.shinePhotoSide}`} data-parallax="0.13">
              <img className={styles.shinePhoto} src={secondImage} alt="Our cleaning team at work" loading="lazy" decoding="async" />
            </figure>
          </div>
          {heroBadge && (
            <div className={`${styles.shineBadge} ${styles.shineBadgeSupport}`} data-parallax="0.2">
              <span className={styles.shineBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
              <strong>{heroBadge.title}</strong>
            </div>
          )}
          <div className={`${styles.shineBadge} ${styles.shineBadgeCustomers}`} data-parallax="0.26">
            <span className={styles.shineAvatars} aria-hidden="true"><span /><span /><span /></span>
            <div><strong>500+</strong><small>Satisfied customers</small></div>
          </div>
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.shineContact} id="contact">
        <div className={styles.shineContactCopy} data-reveal>
          <p className={styles.shineEyebrow}>Book a service</p>
          <h2>Ready for a spotless home?</h2>
          <p>Tell us what you need cleaned and we&apos;ll get you a free quote — fast, no obligation.</p>
          {site.phone && <a className={styles.shineBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.shineFooter}>
        <div className={styles.shineFooterBar}>
          <a className={styles.shineFooterBrand} href="#top"><span className={styles.shineBrandMark} aria-hidden="true">◧</span>{site.company_name}</a>
          {site.phone && <a className={styles.shineFooterCall} href={`tel:${site.phone}`}>Book a call — {site.phone}</a>}
          <small>Powered by Let&apos;s Get Quoted</small>
        </div>
      </footer>

      <SiteDesktopCta site={site} />
    </main>
  );
}
