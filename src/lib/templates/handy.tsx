import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getColorScheme, getEstimateButtonLabel, getHeaderStyle, getWordmarkStyle, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroVideo, getHeroSecondBadge, getLogoStyle, getLogoSize, getPublishedServices, getPublishedTrustBadges, getPublishedWhyUs, getSiteContent, getSlotImage, glyphForContent } from '@/lib/site-content';
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

// The trust strip used to be a hardcoded ['Licensed & insured', 'Same-day
// service', 'Free estimates', 'Satisfaction guaranteed'] shown on EVERY Care
// site. Those are specific, verifiable claims the contractor never made — a
// business that charges for estimates was advertising free ones. It now renders
// the owner's own trust badges (Your page → Trust badges) and hides entirely
// when they haven't set any.

// Care — a fresh home-services look modeled on the Hocare aesthetic: cyan→green
// gradients, worker photos in gradient circles with floating dots, rounded
// white cards on light blue-gray sections, teal CTAs, a dark navy footer.
export default function HandyTemplate({ site, galleryImages = [] }: TemplateProps) {
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const aboutImage = getSlotImage(site.content, 'about', STOCK_SITE_IMAGES[3].url);
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES;

  const content = getSiteContent(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const themeStyle = {
    '--theme-accent': site.accent_override || scheme?.accent || '#12c2c9',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#062b2e'),
    '--theme-radius': '10px',
    '--theme-display': site.header_font || 'var(--font-care), "Segoe UI", system-ui, sans-serif',
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? { '--c-bg': scheme.bg, '--c-surface': scheme.surface, '--c-ink': scheme.ink, '--c-muted': scheme.muted, '--c-line': scheme.line, '--c-deep': scheme.deep, '--c-on-deep': scheme.onDeep, background: scheme.bg, color: scheme.ink } : {}),
  } as CSSProperties;

  const headlineWords = (site.headline || 'Exceptional Home Service').trim().split(/\s+/);
  const headlineLast = headlineWords.length > 1 ? headlineWords.pop()! : '';
  const headlineMain = headlineWords.join(' ');

  const whyUs = getPublishedWhyUs(site.content);
  const trustBadges = getPublishedTrustBadges(site.content);
  const heroEyebrow = content.heroEyebrow;
  const heroBadge = getHeroBadge(site.content);
  const secondBadge = getHeroSecondBadge(site.content);

  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []),
    ...(whyUs ? [{ href: '#why', label: 'Why us' }] : []),
  ];

  return (
    <main className={`${styles.site} ${styles.handy}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={scheme ? undefined : site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)} data-logo-size={getLogoSize(site.content)} data-header={getHeaderStyle(site.template, site.content)} data-header-button={getSiteContent(site.content).headerButtonStyle || 'match'} data-header-cta={content.headerCta ? undefined : 'off'} data-menu-btn={content.menuButton} data-wordmark={getWordmarkStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <SiteHeaderUtilityBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.careHeader}>
        <a className={styles.careBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" data-edit="logo" /> : <span className={styles.careBrandMark} data-edit="brandIcon"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          <strong data-edit="identity"><WordmarkName name={site.company_name} /></strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={navLinks} />
        <div className={styles.careHeaderActions}>
          {site.phone && <a className={styles.careHeaderPhone} data-edit="bizPhone" href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.careBtn} data-edit="quoteForm" href="#contact">{getEstimateButtonLabel(content.quoteForm)}</a>
        </div>
      </header>

      <section className={styles.careHero} id="top">
        <div className={styles.careHeroCopy}>
          <p className={styles.careEyebrow} data-edit="heroEyebrow">{heroEyebrow || (site.service_area ? `Serving ${site.service_area}` : 'Trusted home services')}</p>
          <h1>{headlineMain} {headlineLast && <span className={styles.careAccentText}>{headlineLast}</span>}</h1>
          <p className={styles.careHeroText}>{site.tagline || 'Reliable, friendly help for every job around the home — booked in minutes, done right the first time.'}</p>
          {(heroBadge || secondBadge.mode !== 'none') && (
            <div className={styles.careHeroCards} data-edit="heroBadge">
              {heroBadge && (
                <div className={styles.careMiniCard}>
                  <strong><span aria-hidden="true">{heroBadge.icon}</span> {heroBadge.title}</strong>
                  {heroBadge.subtitle && <small>{heroBadge.subtitle}</small>}
                </div>
              )}
              {secondBadge.mode === 'badge' ? (
                <div className={styles.careMiniCard}>
                  <strong><span aria-hidden="true">{secondBadge.badge.icon}</span> {secondBadge.badge.title}</strong>
                  {secondBadge.badge.subtitle && <small>{secondBadge.badge.subtitle}</small>}
                </div>
              ) : secondBadge.mode === 'default' && site.service_area ? (
                /* Was "Best home service" — an unearned superlative on every Care
                   site. The built-in default now states only a fact. */
                <div className={styles.careMiniCard}><strong>Proudly local</strong><small>{site.service_area}</small></div>
              ) : null}
            </div>
          )}
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.careHeroMedia} data-parallax="0.08">
          <span className={styles.careDot1} aria-hidden="true" />
          <span className={styles.careDot2} aria-hidden="true" />
          <div className={styles.careHeroCircle}>
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} video={getHeroVideo(site.content)} alt="A friendly professional ready to help" />
          </div>
        </div>
      </section>

      {trustBadges && (
        <div className={styles.careTrustStrip} data-reveal data-edit="trustBadges">
          {trustBadges.badges.map((badge) => <span key={badge.id}>{badge.label}</span>)}
        </div>
      )}

      <SiteContentSections site={site} galleryImages={gallery} />

      {whyUs && (
        <section className={styles.careWhy} id="why">
          <div className={styles.careWhyMedia} data-reveal="left">
            <span className={styles.careDot1} aria-hidden="true" />
            <span className={styles.careDot2} aria-hidden="true" />
            <div className={styles.careHeroCircle} data-edit="image-about">
              <img src={aboutImage} alt="A professional at work" loading="lazy" decoding="async" />
            </div>
          </div>
          <div className={styles.careWhyCard} data-reveal="right" data-edit="whyUs">
            <p className={styles.careEyebrow}>Why choose us</p>
            <h2>{whyUs.title}</h2>
            <ul className={styles.careCheckList}>
              {whyUs.points.map((point) => (
                <li key={point}><span className={styles.careCheck} aria-hidden="true">✓</span>{point}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={styles.careContact} id="contact" data-reveal>
        <div className={styles.careContactCopy}>
          <p className={styles.careEyebrow}>Get started</p>
          <h2>Tell us about your project</h2>
          <p>{site.hours ? `We’re available ${site.hours}.` : 'We reply within about an hour.'} Free, no-obligation estimates.</p>
          {site.phone && <a className={styles.careBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <SiteFooter site={site} />
    </main>
  );
}
