import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getEstimateButtonLabel, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroVideo, getHeroSecondBadge, getLogoStyle, getLogoSize, getPublishedServices, getSiteContent, glyphForContent } from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import SiteFooter from './SiteFooter';
import WordmarkName from './WordmarkName';
import HeroImageCycle from './HeroImageCycle';
import HeroQuickForm from './HeroQuickForm';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import SiteHeaderUtilityBar from './SiteHeaderUtilityBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import { readableOnAccent } from './theme-color';
import { templateFontVars } from './fonts';
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
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  // Second floating card. Its built-in default used to auto-pick whichever
  // preset differed from the primary badge — so a site shipped asserting "Free
  // Estimates" or "Same-Day Service" that the owner never chose. The default now
  // states only a fact (where they work), and renders nothing without one; any
  // claim on this card has to be picked deliberately in the builder.
  const second = getHeroSecondBadge(site.content);
  const autoSecond = site.service_area
    ? { key: 'local', icon: '⌂', title: 'Proudly local', subtitle: site.service_area }
    : null;
  const secondBadge = second.mode === 'none' ? null : second.mode === 'default' ? autoSecond : second.badge;
  const scheme = getColorScheme(content.colorScheme);
  const themeStyle = {
    '--theme-accent': site.accent_override || scheme?.accent || '#f15a29',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#ffffff'),
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? { '--c-bg': scheme.bg, '--c-surface': scheme.surface, '--c-ink': scheme.ink, '--c-muted': scheme.muted, '--c-line': scheme.line, '--c-deep': scheme.deep, '--c-on-deep': scheme.onDeep, background: scheme.bg, color: scheme.ink } : {}),
  } as CSSProperties;

  return (
    <main className={`${templateFontVars} ${styles.site} ${styles.fixit}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.fixitHeader}>
        <a className={styles.fixitBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.fixitBrandMark} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []} />
        <div className={styles.fixitHeaderActions}>
          {site.phone && <a className={styles.fixitHeaderPhone} data-edit="bizPhone" href={`tel:${site.phone}`}><span className={styles.fixitPhoneIcon} aria-hidden="true">✆</span>{site.phone}</a>}
          <a className={styles.fixitHeaderCta} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)}</a>
        </div>
      </header>

      <section className={styles.fixitHero} id="top">
        <div className={styles.fixitHeroCopy}>
          <p className={styles.fixitEyebrow} data-edit="heroEyebrow"><span aria-hidden="true">✖</span> {heroEyebrow || 'Professional handyman services'}</p>
          <h1>{site.headline || 'Expert repairs, done right, every time.'}</h1>
          <p className={styles.fixitHeroText}>{site.tagline || 'Book a trusted handyman in a few clicks — installs, repairs, and assembly, quickly and hassle-free.'}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.fixitHeroMedia}>
          <span className={styles.fixitHeroBlob} aria-hidden="true" />
          <span className={styles.fixitHeroShape} data-parallax="0.07" aria-hidden="true" />
          <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} className={styles.fixitHeroImg} alt="Professional handyman ready to help" />
          {heroBadge && (
            <div className={styles.fixitHeroCard} data-parallax="0.14" data-edit="heroBadge">
              <span className={styles.fixitHeroCardIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong><small>{heroBadge.subtitle}</small></div>
            </div>
          )}
          {secondBadge && (
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
          {/* Was "we'll match you with the right pro", which reads as a lead-matching
              marketplace — this is the contractor's own site. */}
          <p>Tell us what you need and we&apos;ll get back to you with a quote — free, no obligation.</p>
          {site.phone && <a className={styles.fixitBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <SiteFooter site={site} />

    </main>
  );
}
