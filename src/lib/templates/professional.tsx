import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getEstimateButtonLabel, getColorScheme, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroVideo, getHeroSecondBadge, getLogoStyle, getLogoSize, getPublishedServices, getSiteContent, getSlotImage, glyphForContent, getWorkBand } from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import SiteFooter from './SiteFooter';
import WordmarkName from './WordmarkName';
import HeroImageCycle from './HeroImageCycle';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import SiteHeaderUtilityBar from './SiteHeaderUtilityBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import { readableOnAccent } from './theme-color';
import styles from './themes.module.css';

export default function GuildTemplate({ site }: TemplateProps) {
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[3].url;
  const work = getWorkBand(site.content, 'Recent work', 'Quality is visible in the details.');
  // Second shot for the stacked hero photo — a distinct image from the main one.
  // Prefers a real gallery photo so the two cards don't duplicate.
  const secondImage = getSlotImage(
    site.content,
    'heroSecondary',
    work.items.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES[5].url,
  );
  // A third floating photo pinned to the hero's upper-right — a distinct shot
  // from the main and inset photos so the three don't repeat.
  const thirdImage = getSlotImage(
    site.content,
    'heroTertiary',
    work.items.find((image) => image.url !== heroImage && image.url !== secondImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage && image.url !== secondImage)?.url ||
      STOCK_SITE_IMAGES[4].url,
  );
  const estimateLabel = getEstimateButtonLabel(getSiteContent(site.content).quoteForm);
  const heroBadge = getHeroBadge(site.content);
  // Guild ships three generic service cards as filler. Once the owner has real
  // services the shared #our-services section renders them, so the filler would
  // sit above the real list saying different things — drop it in that case.
  // Sites that never configured services keep the block, so nothing shortens.
  const services = getPublishedServices(site.content);
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  const second = getHeroSecondBadge(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const themeStyle = {
    '--theme-accent': site.accent_override || scheme?.accent || '#a5472d',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#fff'),
    '--theme-display': site.header_font || 'var(--font-guild-display), Georgia, Times New Roman, serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? { '--c-bg': scheme.bg, '--c-surface': scheme.surface, '--c-ink': scheme.ink, '--c-muted': scheme.muted, '--c-line': scheme.line, '--c-deep': scheme.deep, '--c-on-deep': scheme.onDeep, background: scheme.bg, color: scheme.ink } : {}),
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.guild}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.guildHeader}>
        <a className={styles.guildBrand} href="#top">
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.guildBrandMark} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          <span><strong data-edit="identity"><WordmarkName name={site.company_name} /></strong><small data-edit="bizLicense">{site.license || 'Licensed contractor'}</small></span>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: services ? '#our-services' : '#services', label: 'Services' }]} />
        <a className={styles.guildQuote} data-edit="quoteForm" href="#contact">{estimateLabel}</a>
      </header>

      <section className={styles.guildHero} id="top">
        <div className={styles.guildHeroCopy}>
          <p className={styles.kicker} data-edit="heroEyebrow">{heroEyebrow || 'Work you can count on'}</p>
          <h1>{site.headline || 'A better way to get the job done.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Thoughtful planning, dependable crews, and results you will be glad you called us for.'}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.guildHeroMedia}>
          <div className={styles.guildHeroFrame}>
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} alt="" />
          </div>
          <figure className={styles.guildHeroInset} data-edit="image-heroSecondary">
            <img src={secondImage} alt="Close-up detail of service work" loading="lazy" decoding="async" />
          </figure>
          <figure className={styles.guildHeroInsetTop} data-edit="image-heroTertiary">
            <img src={thirdImage} alt="Additional service work" loading="lazy" decoding="async" />
          </figure>
          {heroBadge && (
            <div className={`${styles.guildBadge} ${styles.guildBadgePrimary}`} data-edit="heroBadge">
              <span className={styles.guildBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <span>{heroBadge.subtitle}</span>}</div>
            </div>
          )}
          {second.mode !== 'none' && (
            <div className={styles.guildBadge} data-edit="heroBadge">
              {second.mode === 'default'
                ? <><strong>Proudly local</strong><span>{site.service_area || 'Serving our community'}</span></>
                : <><strong>{second.badge.title}</strong>{second.badge.subtitle && <span>{second.badge.subtitle}</span>}</>}
            </div>
          )}
        </div>
      </section>

      {!services && (
        <section className={styles.guildServices} data-reveal id="services" aria-label="Services">
          {[
            { title: 'Repairs & tune-ups', body: 'Fast, reliable service when something needs fixing.' },
            { title: 'Installs & upgrades', body: 'Quality work when it is time to replace or upgrade.' },
            { title: 'Inspections & maintenance', body: 'Preventive care that catches small issues before they grow.' },
          ].map((service, index) => (
            <article key={service.title}><span>0{index + 1}</span><h3>{service.title}</h3><p>{service.body}</p></article>
          ))}
        </section>
      )}


      <SiteContentSections site={site} />

      <section className={styles.guildContact} id="contact">
        <div className={styles.guildContactCopy}>
          <div><p className={styles.kicker}>Ready when you are</p><h2>Tell us what you need.</h2></div>
          <p className={styles.guildContactMeta}>{site.hours || 'Monday-Friday, 7am-5pm'}<br />{site.service_area || 'Local and regional projects'}</p>
          {site.phone && <a className={styles.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <SiteFooter site={site} />
    </main>
  );
}