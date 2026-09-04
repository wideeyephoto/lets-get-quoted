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

export default function ForgeTemplate({ site }: TemplateProps) {
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  const heroBadge = getHeroBadge(site.content);
  // 'default' means "the template's own built-in second badge" — Forge never had
  // one, so only an explicitly chosen badge renders here. Nothing is invented.
  const secondBadge = getHeroSecondBadge(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const defaultAccent = '#f0b429';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#111'),
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#10100f', scheme?.surface || '#1a1a17'])
      : (scheme?.accentText || defaultAccent),
    '--theme-display': site.header_font || 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
    '--c-on-photo': scheme?.onPhoto || '#f3f0e7',
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
    <main className={`${templateFontVars} ${styles.site} ${styles.forge}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)} data-header-name={content.hideHeaderCompanyName ? 'hidden' : undefined} data-hero-shadow={content.heroTextShadow}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.forgeHeader}>
        <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.brandBlock} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          {!content.hideHeaderCompanyName && <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>}
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []} />
        <div className={styles.forgeHeaderActions}>
          {site.phone && <a className={styles.headerPhone} data-edit="bizPhone" href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.forgeHeaderCta} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)}</a>
        </div>
      </header>
      <section className={styles.forgeHero} id="top">
        <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} className={styles.heroImage} alt="Home construction work" />
        <div className={styles.forgeScrim} />
        <div className={styles.forgeHeroCopy}>
          <div className={styles.forgeHeroTextColumn}>
            <p className={styles.kicker} data-edit="heroEyebrow">{heroEyebrow || 'Done right. Every time.'}</p>
            <h1>{site.headline || 'Serious work. Solid results.'}</h1>
            <p className={styles.heroText}>{site.tagline || `Trusted service across ${site.service_area || 'your community'}.`}</p>
            <SiteProofStrip site={site} />
          </div>
          <HeroQuickForm site={site} />
        </div>
        {heroBadge && (
          <div className={styles.forgeBadge} data-parallax="0.12" data-edit="heroBadge">
            <span className={styles.forgeBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
            <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}</div>
          </div>
        )}
        {secondBadge.mode === 'badge' && (
          <div className={`${styles.forgeBadge} ${styles.forgeBadgeSecond}`} data-parallax="0.2" data-edit="heroBadge">
            <span className={styles.forgeBadgeIcon} aria-hidden="true">{secondBadge.badge.icon}</span>
            <div><strong>{secondBadge.badge.title}</strong>{secondBadge.badge.subtitle && <small>{secondBadge.badge.subtitle}</small>}</div>
          </div>
        )}
        <div className={styles.forgeIndex} data-parallax="0.18" aria-hidden="true">01 / 03</div>
      </section>

      {/* Only the cells there is an answer for.
          These fell back to "Local & regional", "Weekdays, 7-5" and — worst of
          the three — "Licensed & insured", which asserted a regulated
          credential in exactly the case where the contractor had told us
          nothing about it. A homeowner reads that as a claim the business made;
          a licensing board would too. An empty field is not a licence, and a
          shorter strip is not a problem. */}
      {site.service_area || site.hours || site.license ? (
        <section className={styles.forgeTrust} data-reveal aria-label="Business details">
          {site.service_area ? <div data-edit="bizArea"><span>Service area</span><strong>{site.service_area}</strong></div> : null}
          {site.hours ? <div data-edit="bizHours"><span>Availability</span><strong>{site.hours}</strong></div> : null}
          {site.license ? <div data-edit="bizLicense"><span>Credentials</span><strong>{site.license}</strong></div> : null}
        </section>
      ) : null}

      <SiteContentSections site={site} />

      <section className={styles.forgeContact} id="contact">
        <div className={styles.forgeContactCopy}>
          <p className={styles.kicker}>Have a project in mind?</p>
          <h2>Let&apos;s get it done right.</h2>
          {site.phone && <p>Prefer to talk? Call <a href={`tel:${site.phone}`}>{site.phone}</a>.</p>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <SiteFooter site={site} />
    </main>
  );
}