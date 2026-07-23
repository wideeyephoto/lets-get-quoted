import type { CSSProperties } from 'react';
import SafeImage from './SafeImage';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getEstimateButtonLabel, getHeroBadgeStyle, getHeroImages, getHeroSecondBadge, getSiteContent, getSlotImage } from '@/lib/site-content';
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
import styles from './themes.module.css';

export default function GuildTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(3, 6);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[3].url;
  // Second shot for the stacked hero photo — a distinct image from the main one.
  const secondImage = getSlotImage(
    site.content,
    'heroSecondary',
    gallery.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES.find((image) => image.url !== heroImage)?.url ||
      STOCK_SITE_IMAGES[5].url,
  );
  const estimateLabel = getEstimateButtonLabel(getSiteContent(site.content).quoteForm);
  const second = getHeroSecondBadge(site.content);
  const themeStyle = {
    '--theme-accent': site.accent_override || '#a5472d',
    '--theme-on-accent': '#fff',
    '--theme-display': site.header_font || 'var(--font-guild-display), Georgia, Times New Roman, serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.guild}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-badge-style={getHeroBadgeStyle(site.content)}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <Parallax />
      <header className={styles.guildHeader}>
        <a className={styles.guildBrand} href="#top">
          {site.logo_url && <img className={styles.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={[{ href: '#services', label: 'Services' }, { href: '#work', label: 'Projects' }, { href: '#contact', label: 'Contact' }]} />
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
            <HeroImageCycle images={getHeroImages(site.content, heroImage)} alt="Recent completed job" />
          </div>
          <figure className={styles.guildHeroInset} data-parallax="0.12" data-edit="image-heroSecondary">
            <img src={secondImage} alt="A detail from our recent work" loading="lazy" decoding="async" />
          </figure>
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

      <section className={styles.guildServices} data-reveal aria-label="Services">
        {[
          { title: 'Repairs & tune-ups', body: 'Fast, reliable service when something needs fixing.' },
          { title: 'Installs & upgrades', body: 'Quality work when it is time to replace or upgrade.' },
          { title: 'Inspections & maintenance', body: 'Preventive care that catches small issues before they grow.' },
        ].map((service, index) => (
          <article key={service.title}><span>0{index + 1}</span><h3>{service.title}</h3><p>{service.body}</p></article>
        ))}
      </section>

      <section className={styles.guildWork} data-reveal id="work">
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Recent work</p><h2>Quality is visible in the details.</h2></div></div>
        <div className={styles.guildGallery}>
          {gallery.slice(0, 3).map((image) => <figure key={image.id}><SafeImage src={image.url} alt={image.alt} width={1200} height={1500} sizes="(max-width: 820px) 100vw, 32vw" /><figcaption>{image.alt}</figcaption></figure>)}
        </div>
      </section>

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