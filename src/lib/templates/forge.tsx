import type { CSSProperties } from 'react';
import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getLogoStyle } from '@/lib/site-content';
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

export default function ForgeTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const heroBadge = getHeroBadge(site.content);
  // 'default' means "the template's own built-in second badge" — Forge never had
  // one, so only an explicitly chosen badge renders here. Nothing is invented.
  const secondBadge = getHeroSecondBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#f0b429',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : '#111',
    '--theme-display': site.header_font || 'var(--font-forge-display), Impact, Haettenschweiler, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.forge}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />
      <section className={styles.forgeHero} id="top">
        {/* Header lives inside the hero so its absolute overlay pins to the hero
            top (below the availability bar), not the page top. */}
        <header className={styles.forgeHeader}>
          <a className={styles.brand} href="#top" aria-label={`${site.company_name} home`}>
            {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.brandBlock}>F</span>}
            <strong>{site.company_name}</strong>
          </a>
          <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#work', label: 'Work' }, { href: '#about', label: 'About' }, { href: '#contact', label: 'Contact' }]} />
          {site.phone && <a className={styles.headerPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
        </header>
        <HeroImageCycle images={getHeroImages(site.content, heroImage)} className={styles.heroImage} alt="Home construction work" />
        <div className={styles.forgeScrim} />
        <div className={styles.forgeHeroCopy}>
          <p className={styles.kicker}>Done right. Every time.</p>
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
        <div><span>Service area</span><strong>{site.service_area || 'Local & regional'}</strong></div>
        <div><span>Availability</span><strong>{site.hours || 'Weekdays, 7-5'}</strong></div>
        <div><span>Credentials</span><strong>{site.license || 'Licensed & insured'}</strong></div>
      </section>

      <section className={styles.forgeAbout} data-reveal id="about">
        <p className={styles.sectionNumber} data-parallax="0.14">02</p>
        <div><p className={styles.kicker}>What we bring</p><h2>Clear plans. Skilled hands. No surprises.</h2></div>
        <p>From the first walkthrough to the final clean-up, we keep the work organized, the communication direct, and the standards high.</p>
      </section>

      <section className={styles.forgeWork} data-reveal id="work">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>Selected work</p><h2>Made for real life.</h2></div>
          <p>Every job delivered with practical care, start to finish.</p>
        </div>
        <div className={styles.forgeGallery}>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id} className={index === 0 ? styles.forgeGalleryLead : undefined}>
              <SafeImage src={image.url} alt={image.alt} width={1600} height={index === 0 ? 2000 : 1000} sizes={index === 0 ? '(max-width: 820px) 100vw, 60vw' : '(max-width: 820px) 100vw, 35vw'} />
              <figcaption><span>0{index + 1}</span>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.forgeContact} id="contact">
        <p className={styles.kicker}>Have a project in mind?</p>
        <h2>Let&apos;s get it done right.</h2>
        {site.phone && <p>Prefer to talk? Call <a href={`tel:${site.phone}`}>{site.phone}</a>.</p>}
        <SiteProofStrip site={site} />
        <QuoteRequestForm site={site} />
      </section>

      <SiteDesktopCta site={site} />
      <footer className={styles.forgeFooter}><strong>{site.company_name}</strong><span>{site.service_area || 'Proudly serving our local community'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}