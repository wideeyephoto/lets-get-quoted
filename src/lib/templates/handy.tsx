import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getLogoStyle, getPublishedHowItWorks, getPublishedServices, getPublishedTrustBadges, getPublishedWhyUs, getSiteContent, getSlotImage, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS } from '@/lib/site-content';
import HeroImageCycle from './HeroImageCycle';
import ProjectShowcase from './ProjectShowcase';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteAnnouncementBar from './SiteAnnouncementBar';
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

  const themeStyle = {
    '--theme-accent': site.accent_override || '#12c2c9',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : '#062b2e',
    '--theme-radius': '10px',
    '--theme-display': site.header_font || 'var(--font-care), "Segoe UI", system-ui, sans-serif',
  } as CSSProperties;

  const headlineWords = (site.headline || 'Exceptional Home Service').trim().split(/\s+/);
  const headlineLast = headlineWords.length > 1 ? headlineWords.pop()! : '';
  const headlineMain = headlineWords.join(' ');

  const whyUs = getPublishedWhyUs(site.content);
  const trustBadges = getPublishedTrustBadges(site.content);
  const projectShowcase = getSiteContent(site.content).projectShowcase;
  const ownShowcase = projectShowcase.items.filter((item) => item.url && item.alt);
  // The owner's own project photos once they've added any (up to 10); otherwise
  // 5 placeholders from the shared gallery so the band is never empty.
  const showcaseItems = ownShowcase.length > 0
    ? ownShowcase.map((item) => ({ id: item.id, url: item.url, alt: item.alt, caption: item.caption }))
    : gallery.slice(0, DEFAULT_PROJECT_SHOWCASE_PLACEHOLDERS).map((item) => ({ id: item.id, url: item.url, alt: item.alt }));
  const heroBadge = getHeroBadge(site.content);
  const secondBadge = getHeroSecondBadge(site.content);

  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []),
    ...(whyUs ? [{ href: '#why', label: 'Why us' }] : []),
    ...(getPublishedHowItWorks(site.content) ? [{ href: '#how-it-works', label: 'How it works' }] : []),
    { href: '#contact', label: 'Contact' },
  ];

  return (
    <main className={`${styles.site} ${styles.handy}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />

      <header className={styles.careHeader}>
        <a className={styles.careBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.careBrandMark} aria-hidden="true">⌂</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={navLinks} />
        <div className={styles.careHeaderActions}>
          {site.phone && <a className={styles.careHeaderPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.careBtn} href="#contact">Contact us</a>
        </div>
      </header>

      <section className={styles.careHero} id="top">
        <div className={styles.careHeroCopy}>
          <p className={styles.careEyebrow}>{site.service_area ? `Serving ${site.service_area}` : 'Trusted home services'}</p>
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
          <div className={styles.careHeroActions}>
            <a className={styles.careBtn} href="#estimate">Get my free estimate</a>
            {site.phone && <a className={styles.careBtnGhost} href={`tel:${site.phone}`}>Call us now</a>}
          </div>
        </div>
        <div className={styles.careHeroMedia} data-parallax="0.08">
          <span className={styles.careDot1} aria-hidden="true" />
          <span className={styles.careDot2} aria-hidden="true" />
          <div className={styles.careHeroCircle}>
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} alt="A friendly professional ready to help" />
          </div>
        </div>
      </section>

      {trustBadges && (
        <div className={styles.careTrustStrip} data-reveal data-edit="trustBadges">
          {trustBadges.badges.map((badge) => <span key={badge.id}>{badge.label}</span>)}
        </div>
      )}

      <SiteContentSections site={site} />

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

      {projectShowcase.enabled && (
        <section className={styles.careWorks} aria-label="Project showcase">
          <ProjectShowcase
            eyebrow={projectShowcase.eyebrow}
            title={projectShowcase.title}
            style={projectShowcase.style}
            items={showcaseItems}
          />
        </section>
      )}

      <section className={styles.careEstimate} id="estimate" data-reveal>
        <div className={styles.careEstimateCopy}>
          <p className={styles.careEyebrow}>Instant estimate</p>
          <h2>See your price in about 60 seconds</h2>
          <p>Answer a couple of quick questions and get a ballpark range — no waiting, no obligation.</p>
          <SiteProofStrip site={site} />
        </div>
        <HeroQuickForm site={site} />
      </section>

      <section className={styles.careCta} aria-label="Get started">
        <div className={styles.careCtaInner} data-reveal>
          <div>
            <h2>Ready to get it done?</h2>
            <p>Free estimates and a satisfaction guarantee on every job.</p>
          </div>
          <div className={styles.careCtaActions}>
            {site.phone && <a className={styles.careCtaCall} href={`tel:${site.phone}`}>Call {site.phone}</a>}
            <a className={styles.careCtaGhost} href="#contact">Get a free estimate</a>
          </div>
        </div>
      </section>

      <section className={styles.careContact} id="contact" data-reveal>
        <div className={styles.careContactCopy}>
          <p className={styles.careEyebrow}>Get started</p>
          <h2>Tell us about your project</h2>
          <p>{site.hours ? `We’re available ${site.hours}.` : 'We reply within about an hour.'} Free, no-obligation estimates.</p>
          {site.phone && <a className={styles.careBtn} href={`tel:${site.phone}`}>Call {site.phone}</a>}
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.careFooter}>
        <div className={styles.careFooterMain}>
          <div className={styles.careFooterBrand}>
            <span className={styles.careFooterLogo}><span aria-hidden="true">⌂</span> {site.company_name}</span>
            <p>{site.tagline || 'Trusted, friendly home services for your neighborhood.'}</p>
          </div>
          <div className={styles.careFooterCol}>
            <h3>Company</h3>
            {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </div>
          <div className={styles.careFooterCol}>
            <h3>Get in touch</h3>
            {site.phone && <a href={`tel:${site.phone}`}>{site.phone}</a>}
            {site.service_area && <span>{site.service_area}</span>}
            {site.hours && <span>{site.hours}</span>}
            {site.license && <span>{site.license}</span>}
          </div>
        </div>
        <div className={styles.careFooterBar}>
          <span>© {site.company_name}</span>
          <small>Powered by Let&apos;s Get Quoted</small>
        </div>
      </footer>
    </main>
  );
}
