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
import SiteAnnouncementBar from './SiteAnnouncementBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import { readableOnAccent } from './theme-color';
import styles from './themes.module.css';

export default function VistaTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(0, 5);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[0].url;
  const heroBadge = getHeroBadge(site.content);
  // Vista had no built-in second badge, so 'default' renders nothing here.
  const secondBadge = getHeroSecondBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#35dd9e',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : '#111',
    '--theme-display': site.header_font || 'var(--font-display), Arial Black, Helvetica, sans-serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.vista}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.vistaHeader}>
        <a className={styles.vistaBrand} href="#top">{site.logo_url ? <img className={styles.logo} src={site.logo_url} alt={site.company_name} /> : site.company_name}</a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#studio', label: 'About' }, { href: '#work', label: 'Work' }, { href: '#contact', label: 'Connect' }]} />
        <div className={styles.vistaActions}>
          {site.phone && <a className={styles.vistaPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.vistaMenu} href="#contact">Get a quote <span aria-hidden="true">→</span></a>
        </div>
      </header>

      <section className={styles.vistaHero} id="top">
        <HeroImageCycle images={getHeroImages(site.content, heroImage)} className={styles.heroImage} alt="Featured completed project" />
        <div className={styles.vistaHeroCopy}>
          <span className={styles.vistaBigType} data-parallax="0.1" aria-hidden="true">{site.company_name}</span>
          <p className={styles.kicker}>Diagnose / Repair / Deliver</p>
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
        <a className={styles.vistaScroll} href="#studio" aria-label="Skip to about section">Explore <span aria-hidden="true">↓</span></a>
      </section>

      <section className={styles.vistaStatement} data-reveal id="studio">
        <p>We are {site.company_name}.</p>
        <h2>Part problem-solver, part perfectionist, always focused on getting it right.</h2>
        <div><span>{site.service_area || 'Local projects'}</span><span>{site.license || 'Licensed & insured'}</span></div>
      </section>

      <section className={styles.vistaWork} data-reveal id="work">
        <div className={styles.vistaWorkHeading}><p className={styles.kicker}>Recent work</p><span>{String(gallery.length).padStart(2, '0')} projects</span></div>
        <div className={styles.vistaGallery}>
          {gallery.slice(0, 5).map((image, index) => (
            <figure key={image.id} className={index === 0 || index === 3 ? styles.vistaWide : undefined}>
              <SafeImage src={image.url} alt={image.alt} width={1600} height={index === 0 || index === 3 ? 800 : 1200} sizes={index === 0 || index === 3 ? '(max-width: 820px) 100vw, 95vw' : '(max-width: 820px) 100vw, 48vw'} />
              <figcaption><span>{image.alt}</span><small>0{index + 1}</small></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.vistaContact} id="contact">
        <p className={styles.kicker}>Next project</p><h2>Ready when you are?</h2>
        {site.phone && <a href={`tel:${site.phone}`}>Call {site.phone} <span aria-hidden="true">↗</span></a>}
        <SiteProofStrip site={site} />
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.vistaFooter}><strong>{site.company_name}</strong><span>{site.hours || 'By appointment'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}