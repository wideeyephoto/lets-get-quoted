import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getLogoStyle, getLogoSize, getSiteContent, getSlotImage } from '@/lib/site-content';
import HeroImageCycle from './HeroImageCycle';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
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

// Shine — modern, premium cleaning look (Purely reference): deep-navy ground,
// bright-yellow accent, a rounded hero photo with floating "24/7" + "500+"
// badge cards (parallax), rounded cards throughout. Mid-page reuses the
// shared sections.
export default function ShineTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 4);
  const heroImage = site.hero_url || gallery[0]?.url || STOCK_SITE_IMAGES[0].url;
  // Second photo for the floating collage — prefer a distinct gallery shot so
  // the two cards don't duplicate, falling back to a different stock image.
  const secondImage = getSlotImage(
    site.content,
    'heroSecondary',
    gallery.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES[1].url,
  );
  const heroBadge = getHeroBadge(site.content);
  const second = getHeroSecondBadge(site.content);
  const heroBackground = getSlotImage(site.content, 'heroBackground', '');
  // Shine ships without a hero eyebrow, so this only appears once the owner sets
  // one — additive, no existing Shine site changes.
  const content = getSiteContent(site.content);
  const heroEyebrow = content.heroEyebrow;
  // A chosen color scheme owns the whole palette via the shared --c-* tokens and
  // supersedes the light/dark toggle (data-mode is dropped below so its rules
  // don't fight the scheme). The accent picker still wins over a scheme's accent.
  const scheme = getColorScheme(content.colorScheme);
  const themeStyle = {
    '--theme-accent': site.accent_override || scheme?.accent || '#ffd60a',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#0f1b2d'),
    '--theme-display': site.header_font || 'var(--font-display), system-ui, sans-serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? {
      '--c-bg': scheme.bg, '--c-surface': scheme.surface, '--c-ink': scheme.ink,
      '--c-muted': scheme.muted, '--c-line': scheme.line, '--c-deep': scheme.deep,
      '--c-on-deep': scheme.onDeep, background: scheme.bg, color: scheme.ink,
    } : {}),
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.shine}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.shineHeader}>
        <a className={styles.shineBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.shineBrandMark} aria-hidden="true">◧</span>}
          <strong data-edit="identity">{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#our-services', label: 'Services' }, { href: '#work', label: 'Work' }]} />
        <a className={styles.shineHeaderCta} data-edit="quoteForm" href="#contact">Book a call <span aria-hidden="true">→</span></a>
      </header>

      <section className={`${styles.shineHero}${heroBackground ? ` ${styles.shineHeroHasBg}` : ''}`} id="top">
        {/* Full-bleed hero background. Always present so it's hover-to-replace in
            the preview even before a photo is chosen; shows the photo + scrim
            once set, otherwise stays transparent over the navy gradient. */}
        <div className={`${styles.shineHeroBg}${heroBackground ? ` ${styles.shineHeroBgActive}` : ''}`} data-edit="image-heroBackground">
          {heroBackground && <img src={heroBackground} alt="" fetchPriority="high" decoding="async" />}
        </div>
        <span className={styles.shineGlow1} aria-hidden="true" />
        <span className={styles.shineGlow2} aria-hidden="true" />
        <div className={styles.shineHeroCopy}>
          {heroEyebrow && <p className={styles.shineEyebrow} data-edit="heroEyebrow">{heroEyebrow}</p>}
          <h1>{site.headline || 'Pure living starts with a spotless home.'}</h1>
          <p className={styles.shineHeroText}>{site.tagline || 'Professional home cleaning and maintenance, designed to give you comfort, hygiene, and peace of mind.'}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.shineHeroMedia}>
          {/* Aligned 2x2 grid (Purely): photo · card / card · photo. */}
          <figure className={`${styles.shinePhotoCard} ${styles.shinePhotoMain}`}>
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} className={styles.shinePhoto} alt="Home cleaning work" />
          </figure>
          {heroBadge ? (
            <div className={`${styles.shineBadge} ${styles.shineBadgeSupport}`} data-edit="heroBadge">
              <span className={styles.shineBadgeIcon} aria-hidden="true">{heroBadge.icon}</span>
              <div><strong>{heroBadge.title}</strong>{heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}</div>
            </div>
          ) : <span className={styles.shineBadgeSupport} aria-hidden="true" />}
          {second.mode === 'none' || (second.mode === 'default' && !site.service_area) ? (
            <span className={styles.shineBadgeCustomers} aria-hidden="true" />
          ) : second.mode === 'default' ? (
            /* Was a hardcoded "500+ Satisfied customers" — a fabricated figure on
               every Shine site, including brand-new businesses. The built-in
               default now states only something true: where they work. */
            <div className={`${styles.shineBadge} ${styles.shineBadgeCustomers}`} data-edit="heroBadge">
              <span className={styles.shineAvatars} aria-hidden="true"><span /><span /><span /></span>
              <div><strong>Proudly local</strong><small>{site.service_area}</small></div>
            </div>
          ) : (
            <div className={`${styles.shineBadge} ${styles.shineBadgeCustomers}`} data-edit="heroBadge">
              <span className={styles.shineBadgeIcon} aria-hidden="true">{second.badge.icon}</span>
              <div><strong>{second.badge.title}</strong>{second.badge.subtitle && <small>{second.badge.subtitle}</small>}</div>
            </div>
          )}
          <figure className={`${styles.shinePhotoCard} ${styles.shinePhotoSide}`} data-edit="image-heroSecondary">
            <img className={styles.shinePhoto} src={secondImage} alt="Close-up detail of cleaning work" loading="lazy" decoding="async" />
          </figure>
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.shineContact} id="contact">
        <div className={styles.shineContactCopy} data-reveal>
          <p className={styles.shineEyebrow}>Book a service</p>
          <h2>Ready to get started?</h2>
          <p>Tell us what you need and we&apos;ll get you a free quote — fast, no obligation.</p>
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
