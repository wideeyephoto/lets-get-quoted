import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getEstimateButtonLabel, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroVideo, getHeroSecondBadge, getLogoStyle, getLogoSize, getPublishedServices, getSiteContent, getSlotImage, glyphForContent } from '@/lib/site-content';
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
import { readableAccentText, readableOnAccent } from './theme-color';
import { templateFontVars } from './fonts';
import styles from './themes.module.css';

// Coat — bold painting / finishes aesthetic (Home Rakshak reference): a deep
// maroon hero with red bokeh + a cut-out-style worker photo, a red accent,
// rounded cards, and a dark "call us now" footer bar. Distinctive hero /
// header / footer; the mid-page content reuses the shared sections.
export default function CoatTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES;
  const heroImage = site.hero_url || gallery[0]?.url || STOCK_SITE_IMAGES[0].url;
  // Second shot for the hero collage — a distinct image so the two cards differ.
  const secondImage = getSlotImage(
    site.content,
    'heroSecondary',
    gallery.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES[2].url,
  );
  const heroBadge = getHeroBadge(site.content);
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  // Coat had no built-in second badge, so 'default' renders nothing here.
  const secondBadge = getHeroSecondBadge(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const defaultAccent = '#e5322a';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#ffffff'),
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#1a1412', scheme?.surface || '#271f1b'])
      : (scheme?.accentText || defaultAccent),
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
    '--c-on-deep': scheme?.onDeep || '#ffffff',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? {
      '--c-bg': scheme.bg,
      '--c-surface': scheme.surface,
      '--c-ink': scheme.ink,
      '--c-muted': scheme.muted,
      '--c-surface-ink': scheme.surfaceInk || scheme.ink,
      '--c-surface-muted': scheme.surfaceMuted || scheme.muted,
      '--c-line': scheme.line,
      '--c-control-line': scheme.controlLine,
      '--c-deep': scheme.deep,
      '--c-on-deep': scheme.onDeep,
      '--c-on-photo': scheme.onPhoto,
      background: scheme.bg,
      color: scheme.ink,
    } : {}),
  } as CSSProperties;

  return (
    <main className={`${templateFontVars} ${styles.site} ${styles.coat}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)} data-header-name={content.hideHeaderCompanyName ? 'hidden' : undefined} data-hero-shadow={content.heroTextShadow}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.coatHeader}>
        <a className={styles.coatBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.coatBrandMark} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          {!content.hideHeaderCompanyName && <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>}
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []} />
        <a className={styles.coatHeaderCta} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)} <span aria-hidden="true">↗</span></a>
      </header>

      <section className={styles.coatHero} id="top">
        <div className={styles.coatBokeh} data-parallax="0.2" aria-hidden="true">
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
          <span className={styles.coatCircle} />
        </div>
        <div className={styles.coatHeroCopy}>
          <p className={styles.coatEyebrowLight} data-edit="heroEyebrow">{heroEyebrow || 'Brushing dreams to life'}</p>
          <h1>{site.headline || 'We turn your space into living art.'}</h1>
          <p className={styles.coatHeroText}>{site.tagline || `Skilled painters and flawless, lasting finishes — inside and out${site.service_area ? `, across ${site.service_area}` : ''}.`}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.coatHeroMedia}>
          <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} className={styles.coatHeroImg} alt="Home painting work" />
          <figure className={styles.coatPhotoSide} data-parallax="0.13" data-edit="image-heroSecondary">
            <img src={secondImage} alt="A freshly finished interior" loading="lazy" decoding="async" />
          </figure>
          {heroBadge && (
            <div className={styles.coatHeroBadge} data-edit="heroBadge">
              <span className={styles.coatHeroBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}</div>
            </div>
          )}
          {secondBadge.mode === 'badge' && (
            <div className={`${styles.coatHeroBadge} ${styles.coatHeroBadgeSecond}`} data-parallax="0.19" data-edit="heroBadge">
              <span className={styles.coatHeroBadgeIcon} aria-hidden="true">{secondBadge.badge.icon}</span>
              <div><strong>{secondBadge.badge.title}</strong>{secondBadge.badge.subtitle && <small>{secondBadge.badge.subtitle}</small>}</div>
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

      <SiteFooter site={site} />

    </main>
  );
}
