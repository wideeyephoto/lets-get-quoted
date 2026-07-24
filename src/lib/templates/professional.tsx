import type { CSSProperties } from 'react';
import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getEstimateButtonLabel, getHeroBadge, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getLogoStyle, getPublishedServices, getSiteContent, getSlotImage, getWorkBand } from '@/lib/site-content';
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
  const estimateLabel = getEstimateButtonLabel(getSiteContent(site.content).quoteForm);
  const heroBadge = getHeroBadge(site.content);
  // Guild ships three generic service cards as filler. Once the owner has real
  // services the shared #our-services section renders them, so the filler would
  // sit above the real list saying different things — drop it in that case.
  // Sites that never configured services keep the block, so nothing shortens.
  const services = getPublishedServices(site.content);
  const second = getHeroSecondBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#a5472d',
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : '#fff',
    '--theme-display': site.header_font || 'var(--font-guild-display), Georgia, Times New Roman, serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.guild}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)} data-logo-style={getLogoStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.guildHeader}>
        <a className={styles.guildBrand} href="#top">
          {site.logo_url && <img className={styles.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: services ? '#our-services' : '#services', label: 'Services' }, { href: '#work', label: 'Projects' }, { href: '#contact', label: 'Contact' }]} />
        <a className={styles.guildQuote} href="#contact">{estimateLabel}</a>
      </header>

      <section className={styles.guildHero} id="top">
        <div className={styles.guildHeroCopy}>
          <p className={styles.kicker}>Work you can count on</p>
          <h1>{site.headline || 'A better way to get the job done.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Thoughtful planning, dependable crews, and results you will be glad you called us for.'}</p>
          <HeroQuickForm site={site} />
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.guildHeroMedia}>
          <div className={styles.guildHeroFrame}>
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} alt="" />
          </div>
          <figure className={styles.guildHeroInset} data-parallax="0.12" data-edit="image-heroSecondary">
            <img src={secondImage} alt="Close-up detail of service work" loading="lazy" decoding="async" />
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

      <section className={styles.guildIntro} data-reveal id="services">
        <div><p className={styles.kicker}>One team, start to finish</p><h2>Experience that makes the process easier.</h2></div>
        <p>We pair hands-on trade experience with straightforward, no-surprises service, so every job feels considered and under control.</p>
      </section>

      {!services && (
        <section className={styles.guildServices} data-reveal aria-label="Services">
          {[
            { title: 'Repairs & tune-ups', body: 'Fast, reliable service when something needs fixing.' },
            { title: 'Installs & upgrades', body: 'Quality work when it is time to replace or upgrade.' },
            { title: 'Inspections & maintenance', body: 'Preventive care that catches small issues before they grow.' },
          ].map((service, index) => (
            <article key={service.title}><span>0{index + 1}</span><h3>{service.title}</h3><p>{service.body}</p></article>
          ))}
        </section>
      )}

      {work.items.length > 0 && (
        <section className={styles.guildWork} data-reveal id="work">
          <div className={styles.sectionHeading}><div data-edit="workGallery"><p className={styles.kicker}>{work.eyebrow}</p><h2>{work.title}</h2></div></div>
          <div className={styles.guildGallery}>
            {work.items.slice(0, 3).map((image) => <figure key={image.id} data-edit={`showcase-${image.id}`}><SafeImage src={image.url} alt={image.alt} width={1200} height={1500} sizes="(max-width: 820px) 100vw, 32vw" /><figcaption>{image.caption || image.alt}</figcaption></figure>)}
          </div>
        </section>
      )}

      <SiteContentSections site={site} />

      <section className={styles.guildContact} id="contact">
        <div><p className={styles.kicker}>Ready when you are</p><h2>Tell us what you need.</h2></div>
        <div><p>{site.hours || 'Monday-Friday, 7am-5pm'}</p><p>{site.service_area || 'Local and regional projects'}</p>{site.phone && <a className={styles.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}</div>
        <SiteProofStrip site={site} />
        <QuoteRequestForm site={site} />
      </section>

      <SiteDesktopCta site={site} />
      <footer className={styles.guildFooter}><strong>{site.company_name}</strong><span>{site.license || 'Licensed & insured'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}