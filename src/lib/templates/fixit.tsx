import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroBadge, getHeroBadgeStyle, getHeroShowStats, HERO_BADGE_PRESETS } from '@/lib/site-content';
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

// Fixit — clean, professional handyman look (Handify reference): white ground,
// orange accent, an angular orange shape behind a worker photo with a floating
// "24-hour" card + dotted decorations (parallax), a staggered hero entrance,
// and hover motion. Mid-page reuses the shared sections.
export default function FixitTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  void gallery;
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const heroBadge = getHeroBadge(site.content);
  // Second floating card: always a DIFFERENT preset than the selected badge so
  // the two cards never duplicate (the default badge is 'licensed', which used
  // to collide with this card's hardcoded Licensed & insured copy).
  const secondBadge = HERO_BADGE_PRESETS.find((preset) => preset.key !== heroBadge?.key) ?? HERO_BADGE_PRESETS[0];
  const showStats = getHeroShowStats(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#f15a29',
    '--theme-on-accent': '#ffffff',
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.fixit}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.fixitHeader}>
        <a className={styles.fixitBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.fixitBrandMark} aria-hidden="true">✖</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#our-services', label: 'Services' }, { href: '#work', label: 'Works' }, { href: '#contact', label: 'Contact' }]} />
        {site.phone && <a className={styles.fixitHeaderPhone} href={`tel:${site.phone}`}><span className={styles.fixitPhoneIcon} aria-hidden="true">✆</span>{site.phone}</a>}
      </header>

      <section className={styles.fixitHero} id="top">
        <div className={styles.fixitHeroCopy}>
          <p className={styles.fixitEyebrow}><span aria-hidden="true">✖</span> Professional handyman services</p>
          <h1>{site.headline || 'Expert repairs, done right, every time.'}</h1>
          <p className={styles.fixitHeroText}>{site.tagline || 'Book a trusted handyman in a few clicks — installs, repairs, and assembly, quickly and hassle-free.'}</p>
          <div className={styles.fixitHeroActions}>
            <a className={styles.fixitBtn} href="#contact">Get a free quote <span aria-hidden="true">↗</span></a>
            {site.phone && <a className={styles.fixitHeroCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong></a>}
          </div>
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.fixitHeroMedia}>
          <span className={styles.fixitHeroBlob} aria-hidden="true" />
          <span className={styles.fixitHeroShape} data-parallax="0.07" aria-hidden="true" />
          <img className={styles.fixitHeroImg} src={heroImage} alt="Professional handyman ready to help" fetchPriority="high" decoding="async" />
          {heroBadge && (
            <div className={styles.fixitHeroCard} data-parallax="0.14" data-edit="heroBadge">
              <span className={styles.fixitHeroCardIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong><small>{heroBadge.subtitle}</small></div>
            </div>
          )}
          {showStats && (
            <div className={`${styles.fixitHeroCard} ${styles.fixitHeroStat}`} data-parallax="0.2" data-edit="heroBadge">
              <span className={styles.fixitHeroCardIcon} aria-hidden="true">{secondBadge.icon}</span>
              <div><strong>{secondBadge.title}</strong><small>{secondBadge.subtitle}</small></div>
            </div>
          )}
          <span className={styles.fixitDots} data-parallax="0.24" aria-hidden="true" />
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.fixitContact} id="contact">
        <div className={styles.fixitContactCopy} data-reveal>
          <p className={styles.fixitEyebrow}><span aria-hidden="true">✖</span> Make an appointment</p>
          <h2>Looking for help with a repair or install?</h2>
          <p>Tell us what you need and we&apos;ll match you with the right pro — free, no obligation.</p>
          {site.phone && <a className={styles.fixitBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.fixitFooter}>
        <div className={styles.fixitFooterBar}>
          <a className={styles.fixitFooterBrand} href="#top"><span className={styles.fixitBrandMark} aria-hidden="true">✖</span>{site.company_name}</a>
          {site.phone && <a className={styles.fixitFooterCall} href={`tel:${site.phone}`}><span aria-hidden="true">✆</span> Call us now — {site.phone}</a>}
          <small>Powered by Let&apos;s Get Quoted</small>
        </div>
      </footer>

      <SiteDesktopCta site={site} />
    </main>
  );
}
