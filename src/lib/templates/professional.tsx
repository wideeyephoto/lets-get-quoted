import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import SiteContentSections from './SiteContentSections';
import styles from './themes.module.css';

export default function GuildTemplate({ site, galleryImages = [] }: TemplateProps) {
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(3, 6);
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[3].url;
  const themeStyle = {
    '--theme-accent': site.accent_override || '#a33a2b',
    '--theme-display': site.header_font || 'var(--font-guild-display), Georgia, Times New Roman, serif',
  } as CSSProperties;

  return (
    <main className={`${styles.site} ${styles.guild}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <header className={styles.guildHeader}>
        <a className={styles.guildBrand} href="#top">
          {site.logo_url && <img className={styles.logo} src={site.logo_url} alt="" />}
          <span><strong>{site.company_name}</strong><small>{site.license || 'Licensed contractor'}</small></span>
        </a>
        <nav className={styles.navLinks} aria-label="Main navigation"><a href="#services">Services</a><a href="#work">Projects</a><a href="#contact">Contact</a></nav>
        <a className={styles.guildQuote} href="#contact">Quick Quote</a>
      </header>

      <section className={styles.guildHero} id="top">
        <div className={styles.guildHeroCopy}>
          <p className={styles.kicker}>Craftsmanship you can count on</p>
          <h1>{site.headline || 'A better way to build and renovate.'}</h1>
          <p className={styles.heroText}>{site.tagline || 'Thoughtful planning, dependable crews, and a finish you will be proud to live with.'}</p>
          <div className={styles.contactActions}>
            <a className={styles.primaryCta} href="#contact">Plan your project</a>
            {site.phone && <a className={styles.textLink} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          </div>
        </div>
        <div className={styles.guildHeroMedia}>
          <img src={heroImage} alt="Completed contractor project" />
          <div className={styles.guildBadge}><strong>Built locally</strong><span>{site.service_area || 'Serving our community'}</span></div>
        </div>
      </section>

      <section className={styles.guildIntro} id="services">
        <div><p className={styles.kicker}>One team, start to finish</p><h2>Experience that makes the process easier.</h2></div>
        <p>We pair practical construction knowledge with straightforward project management, so every phase feels considered and under control.</p>
      </section>

      <section className={styles.guildServices} aria-label="Services">
        {['Renovations & additions', 'Kitchens & interiors', 'New construction'].map((service, index) => (
          <article key={service}><span>0{index + 1}</span><h3>{service}</h3><p>Detailed scopes, durable materials, and crews who respect your property.</p></article>
        ))}
      </section>

      <section className={styles.guildWork} id="work">
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Recent work</p><h2>Quality is visible in the details.</h2></div></div>
        <div className={styles.guildGallery}>
          {gallery.slice(0, 3).map((image) => <figure key={image.id}><img src={image.url} alt={image.alt} /><figcaption>{image.alt}</figcaption></figure>)}
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.guildContact} id="contact">
        <div><p className={styles.kicker}>Ready when you are</p><h2>Tell us what you&apos;re planning.</h2></div>
        <div><p>{site.hours || 'Monday-Friday, 7am-5pm'}</p><p>{site.service_area || 'Local and regional projects'}</p>{site.phone && <a className={styles.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}</div>
        <QuoteRequestForm siteId={site.id} enabled={site.published} />
      </section>

      <footer className={styles.guildFooter}><strong>{site.company_name}</strong><span>{site.license || 'Licensed & insured'}</span><small>Powered by Let&apos;s Get Quoted</small></footer>
    </main>
  );
}