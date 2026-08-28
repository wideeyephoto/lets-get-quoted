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

export default function VistaTemplate({ site }: TemplateProps) {
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[0].url;
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  const heroBadge = getHeroBadge(site.content);
  // Vista had no built-in second badge, so 'default' renders nothing here.
  // Vista's work heading is an eyebrow/count row with no h2, so a title renders
  // above it — additive, never changing a page that has no title set.
  const secondBadge = getHeroSecondBadge(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const defaultAccent = '#35dd9e';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#111'),
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#0f1115', scheme?.surface || '#171a20'])
      : (scheme?.accentText || defaultAccent),
    '--theme-display': site.header_font || 'var(--font-display), Arial Black, Helvetica, sans-serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? {
      '--c-bg': scheme.bg,
      '--c-surface': scheme.surface,
      '--c-ink': scheme.ink,
      '--c-muted': scheme.muted,
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
    <main className={`${templateFontVars} ${styles.site} ${styles.vista}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.vistaHeader}>
        <a className={styles.vistaBrand} href="#top" data-edit="identity">{site.logo_url ? <img className={styles.logo} src={site.logo_url} alt={site.company_name} data-edit="logo" /> : <><span className={styles.vistaBrandMark} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span><WordmarkName name={site.company_name} /></>}</a>
        <SiteNavLinks site={site} className={styles.navLinks} links={getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []} />
        <div className={styles.vistaActions}>
          {site.phone && <a className={styles.vistaPhone} data-edit="bizPhone" href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.vistaMenu} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)} <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <section className={styles.vistaHero} id="top">
        <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} className={styles.heroImage} alt="Featured completed project" />
        <div className={styles.vistaHeroCopy}>
          <span className={styles.vistaBigType} data-parallax="0.1" aria-hidden="true">{site.company_name}</span>
          <p className={styles.kicker} data-edit="heroEyebrow">{heroEyebrow || 'Diagnose / Repair / Deliver'}</p>
          <h1>{site.headline || 'Service with purpose.'}</h1>
          <p>{site.tagline || 'We show up, solve the problem, and treat your home like our own.'}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        {heroBadge && (
          <div className={styles.vistaBadge} data-parallax="0.12" data-edit="heroBadge">
            <span className={styles.vistaBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
            <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}</div>
          </div>
        )}
        {secondBadge.mode === 'badge' && (
          <div className={`${styles.vistaBadge} ${styles.vistaBadgeSecond}`} data-parallax="0.18" data-edit="heroBadge">
            <span className={styles.vistaBadgeIcon} aria-hidden="true">{secondBadge.badge.icon}</span>
            <div><strong>{secondBadge.badge.title}</strong>{secondBadge.badge.subtitle && <small>{secondBadge.badge.subtitle}</small>}</div>
          </div>
        )}
        <a className={styles.vistaScroll} href="#contact" aria-label="Skip to contact section">Explore <span aria-hidden="true">↓</span></a>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.vistaContact} id="contact">
        <div className={styles.vistaContactCopy}>
          <p className={styles.kicker}>Next project</p><h2>Ready when you are?</h2>
          {site.phone && <a href={`tel:${site.phone}`}>Call {site.phone} <span aria-hidden="true">↗</span></a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <SiteFooter site={site} />
    </main>
  );
}