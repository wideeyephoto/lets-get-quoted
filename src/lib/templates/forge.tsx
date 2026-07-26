import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getLogoStyle, getLogoSize, getSiteContent, glyphForContent } from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import WordmarkName from './WordmarkName';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroImageCycle from './HeroImageCycle';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteDesktopCta from './SiteDesktopCta';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import { readableOnAccent } from './theme-color';
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
  const themeStyle = {
    '--theme-accent': site.accent_override || scheme?.accent || '#f0b429',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#111'),
    '--theme-display': site.header_font || 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? { '--c-bg': scheme.bg, '--c-surface': scheme.surface, '--c-ink': scheme.ink, '--c-muted': scheme.muted, '--c-line': scheme.line, '--c-deep': scheme.deep, '--c-on-deep': scheme.onDeep, background: scheme.bg, color: scheme.ink } : {}),
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.forge}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />
      <section className={styles.forgeHero} id="top">
        {/* Header lives inside the hero so its absolute overlay pins to the hero
            top (below the availability bar), not the page top. */}
        <header className={styles.forgeHeader}>
          <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
            {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.brandBlock} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
            <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>
          </a>
          <SiteNavLinks site={site} className={styles.navLinks} links={[]} />
          {site.phone && <a className={styles.headerPhone} data-edit="bizPhone" href={`tel:${site.phone}`}>{site.phone}</a>}
        </header>
        <HeroImageCycle images={getHeroImages(site.content, heroImage)} className={styles.heroImage} alt="Home construction work" />
        <div className={styles.forgeScrim} />
        <div className={styles.forgeHeroCopy}>
          <p className={styles.kicker} data-edit="heroEyebrow">{heroEyebrow || 'Done right. Every time.'}</p>
          <h1>{site.headline || 'Serious work. Solid results.'}</h1>
          <p className={styles.heroText}>{site.tagline || `Trusted service across ${site.service_area || 'your community'}.`}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
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

      <section className={styles.forgeTrust} data-reveal aria-label="Business details">
        <div data-edit="bizArea"><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div data-edit="bizHours"><span>Availability</span><strong>{site.hours || 'Weekdays, 7-5'}</strong></div>
        <div data-edit="bizLicense"><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

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

      <SiteDesktopCta site={site} />
      <footer className={styles.forgeFooter}><strong data-edit="identity">{site.logo_url ? <img className={styles.footerLogo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock} data-edit="brandIcon" aria-hidden="true"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>} {site.company_name}</strong><span data-edit="bizArea">{site.service_area || 'Proudly serving our local community'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}