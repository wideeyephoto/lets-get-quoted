import type { CSSProperties } from 'react';
import { getPublishedHowItWorks, getPublishedServices } from '@/lib/site-content';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import ScrollReveal from './ScrollReveal';
import styles from './themes.module.css';

// Handy — bright, friendly home-services look (handyman / repair). Sticky
// header, a copy + quick-capture-form hero on a light ground with a soft accent
// blob, then the shared content sections (Services grid leads). Reuses every
// shared component so it's mostly chrome + palette.
export default function HandyTemplate({ site }: TemplateProps) {
  const themeStyle = {
    '--theme-accent': site.accent_override || '#ee5a1a',
    '--theme-on-accent': '#111',
    '--theme-radius': '14px',
    '--theme-display': site.header_font || 'var(--font-display), "Segoe UI", system-ui, sans-serif',
  } as CSSProperties;

  // Only link nav to sections that are actually published, so a disabled
  // Services/How-it-works section never leaves a dead anchor in the header.
  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []),
    ...(getPublishedHowItWorks(site.content) ? [{ href: '#how-it-works', label: 'How it works' }] : []),
    { href: '#contact', label: 'Contact' },
  ];

  return (
    <main className={`${styles.site} ${styles.handy}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode}>
      <SiteAnnouncementBar site={site} />
      <ScrollReveal />
      <header className={styles.handyHeader}>
        <a className={styles.handyBrand} href="#top" aria-label={`${site.company_name} home`}>
          {site.logo_url ? <img className={styles.logo} src={site.logo_url} alt="" /> : <span className={styles.handyBrandMark} aria-hidden="true">{(site.company_name || 'H').charAt(0)}</span>}
          <strong>{site.company_name}</strong>
        </a>
        <SiteNavLinks site={site} className={styles.navLinks} links={navLinks} />
        <div className={styles.handyHeaderActions}>
          {site.phone && <a className={styles.handyHeaderPhone} href={`tel:${site.phone}`}>{site.phone}</a>}
          <a className={styles.primaryCta} href="#contact">Get a quote</a>
        </div>
      </header>

      <section className={styles.handyHero} id="top">
        <div className={styles.handyHeroBlob} aria-hidden="true" />
        <div className={styles.handyHeroCopy}>
          <p className={styles.kicker}>{site.service_area ? `Serving ${site.service_area}` : 'Local · Licensed · Insured'}</p>
          <h1>{site.headline || 'Home repairs, done right the first time.'}</h1>
          <p className={styles.handyHeroText}>{site.tagline || 'Trusted help for every job around the house — fast, tidy, and guaranteed. One call and it’s handled.'}</p>
          <div className={styles.handyHeroActions}>
            <a className={styles.primaryCta} href="#contact">Get my free estimate</a>
            {site.phone && <a className={styles.handyHeroCall} href={`tel:${site.phone}`}>or call {site.phone}</a>}
          </div>
          <SiteProofStrip site={site} />
        </div>
        <div className={styles.handyHeroForm}>
          <HeroQuickForm site={site} />
        </div>
      </section>

      <SiteContentSections site={site} />

      <section className={styles.handyContact} id="contact">
        <div className={styles.handyContactCopy}>
          <p className={styles.kicker}>Get started</p>
          <h2>Tell us about your project</h2>
          <p>{site.hours ? `We’re available ${site.hours}.` : 'We reply within about an hour.'} Free, no-obligation estimates.</p>
          {site.phone && <a className={styles.primaryCta} href={`tel:${site.phone}`}>Call {site.phone}</a>}
          <SiteProofStrip site={site} />
        </div>
        <QuoteRequestForm site={site} />
      </section>

      <footer className={styles.handyFooter}>
        <strong>{site.company_name}</strong>
        <span>{site.service_area || 'Proudly serving our local community'}{site.license ? ` · ${site.license}` : ''}</span>
        <small>Powered by Let&apos;s Get Quoted</small>
      </footer>
    </main>
  );
}
