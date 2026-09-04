import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getEstimateButtonLabel, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroVideo, getHeroSecondBadge, getLogoStyle, getLogoSize, getPublishedServices, getSiteContent, glyphForContent } from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import SiteFooter from './SiteFooter';
import WordmarkName from './WordmarkName';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroImageCycle from './HeroImageCycle';
import HeroQuickForm from './HeroQuickForm';
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

// Reno — dark-navy + golden-yellow renovation look (Renovation/ThemeMove
// reference): hexagon motifs, an angular slanted hero photo, bold white
// headlines on navy, yellow accents. Mid-page reuses the shared sections.
export default function RenoTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  void gallery;
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const heroBadge = getHeroBadge(site.content);
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  // Reno had no built-in second badge, so 'default' renders nothing here.
  const secondBadge = getHeroSecondBadge(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const defaultAccent = '#f5b421';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#1b2431'),
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#111722', scheme?.surface || '#1b2431'])
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
    <main className={`${templateFontVars} ${styles.site} ${styles.reno}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)} data-header-name={content.hideHeaderCompanyName ? 'hidden' : undefined} data-hero-shadow={content.heroTextShadow}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.renoHeader}>
        <a className={styles.renoBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.renoHex} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          {(!content.hideHeaderCompanyName || content.headerTagline) && (
            <span className={styles.brandText}>
              {!content.hideHeaderCompanyName && <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>}
              {content.headerTagline && <span className={styles.headerTagline} data-edit="headerTagline">{content.headerTagline}</span>}
            </span>
          )}
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []} />
        <div className={styles.renoHeaderActions}>
          {site.phone && (
            <a className={styles.renoHeaderPhone} data-edit="bizPhone" href={`tel:${site.phone}`}>
              <span className={styles.renoHex} aria-hidden="true">✆</span>{site.phone}
            </a>
          )}
          <a className={styles.renoHeaderCta} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)}</a>
        </div>
      </header>

      <section className={styles.renoHero} id="top">
        <div className={styles.renoHeroCopy}>
          <p className={styles.renoEyebrow} data-edit="heroEyebrow">{heroEyebrow || 'Professional renovation & repair'}</p>
          <h1>{site.headline || 'Handyman services, done right.'}</h1>
          <p className={styles.renoHeroText}>{site.tagline || `Renovation, repair, and remodeling — a wide range of affordable, reliable work${site.service_area ? ` across ${site.service_area}` : ''}.`}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.renoHeroMedia}>
          <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} className={styles.renoHeroImg} alt="Home renovation work" />
          {heroBadge ? (
            <div className={styles.renoBadge} data-parallax="0.16" data-edit="heroBadge">
              <span className={styles.renoBadgeHex} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}</div>
            </div>
          ) : (
            /* No badge chosen — keep the purely decorative hex the hero was built around. */
            <span className={styles.renoHexBadge} data-parallax="0.16" aria-hidden="true">⌂</span>
          )}
          {secondBadge.mode === 'badge' && (
            <div className={`${styles.renoBadge} ${styles.renoBadgeSecond}`} data-parallax="0.22" data-edit="heroBadge">
              <span className={styles.renoBadgeHex} aria-hidden="true">{secondBadge.badge.icon}</span>
              <div><strong>{secondBadge.badge.title}</strong>{secondBadge.badge.subtitle && <small>{secondBadge.badge.subtitle}</small>}</div>
            </div>
          )}
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

      <SiteFooter site={site} />

    </main>
  );
}
