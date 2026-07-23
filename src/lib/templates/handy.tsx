import type { CSSProperties } from 'react';
import { STOCK_SITE_IMAGES } from '@/lib/site-images';
import { getHeroImages, getLogoStyle, getPublishedHowItWorks, getPublishedServices, getSlotImage } from '@/lib/site-content';
import HeroImageCycle from './HeroImageCycle';
import type { TemplateProps } from '@/lib/templates/types';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from './HeroQuickForm';
import SiteContentSections from './SiteContentSections';
import SiteNavLinks from './SiteNavLinks';
import SiteProofStrip from './SiteProofStrip';
import SiteAnnouncementBar from './SiteAnnouncementBar';
import ScrollReveal from './ScrollReveal';
import Parallax from './Parallax';
import styles from './themes.module.css';

const WHY_POINTS = [
  'Verified, background-checked pros',
  'Upfront, honest pricing',
  'Fast, friendly response',
  'Quality work, guaranteed',
];

const TRUST_ITEMS = ['Licensed & insured', 'Same-day service', 'Free estimates', 'Satisfaction guaranteed'];

// Care — a fresh home-services look modeled on the Hocare aesthetic: cyan→green
// gradients, worker photos in gradient circles with floating dots, rounded
// white cards on light blue-gray sections, teal CTAs, a dark navy footer.
export default function HandyTemplate({ site, galleryImages = [] }: TemplateProps) {
  const heroImage = site.hero_url || STOCK_SITE_IMAGES[1].url;
  const aboutImage = getSlotImage(site.content, 'about', STOCK_SITE_IMAGES[3].url);
  const gallery = galleryImages.length > 0 ? galleryImages : STOCK_SITE_IMAGES.slice(1, 4);

  const themeStyle = {
    '--theme-accent': site.accent_override || '#12c2c9',
    '--theme-on-accent': '#062b2e',
    '--theme-radius': '10px',
    '--theme-display': site.header_font || 'var(--font-care), "Segoe UI", system-ui, sans-serif',
  } as CSSProperties;

  const headlineWords = (site.headline || 'Exceptional Home Service').trim().split(/\s+/);
  const headlineLast = headlineWords.length > 1 ? headlineWords.pop()! : '';
  const headlineMain = headlineWords.join(' ');

  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '#our-services', label: 'Services' }] : []),
    { href: '#why', label: 'Why us' },
    ...(getPublishedHowItWorks(site.content) ? [{ href: '#how-it-works', label: 'How it works' }] : []),
    { href: '#contact', label: 'Contact' },
  ];

  return (
    <main className={`${styles.site} ${styles.handy}`} style={themeStyle} data-button={site.button_style || 'solid'} data-mode={site.portal_mode} data-logo-style={getLogoStyle(site.content)}>
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
          <div className={styles.careHeroCards}>
            <div className={styles.careMiniCard}><strong>Best home service</strong><small>for your home</small></div>
            <div className={styles.careMiniCard}><strong>Licensed &amp; insured</strong><small>vetted local pros</small></div>
          </div>
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

      <div className={styles.careTrustStrip} data-reveal>
        {TRUST_ITEMS.map((item) => <span key={item}>{item}</span>)}
      </div>

      <SiteContentSections site={site} />

      <section className={styles.careWhy} id="why">
        <div className={styles.careWhyMedia} data-reveal="left">
          <span className={styles.careDot1} aria-hidden="true" />
          <span className={styles.careDot2} aria-hidden="true" />
          <div className={styles.careHeroCircle} data-edit="image-about">
            <img src={aboutImage} alt="Our team on the job" loading="lazy" decoding="async" />
          </div>
        </div>
        <div className={styles.careWhyCard} data-reveal="right">
          <p className={styles.careEyebrow}>Why choose us</p>
          <h2>Quality work, every single time</h2>
          <ul className={styles.careCheckList}>
            {WHY_POINTS.map((point) => (
              <li key={point}><span className={styles.careCheck} aria-hidden="true">✓</span>{point}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.careWorks} aria-label="Recent work">
        <div className={styles.careWorksHead} data-reveal>
          <p className={styles.careEyebrowLight}>Our work</p>
          <h2>Quality you can see</h2>
        </div>
        <div className={styles.careWorksGrid} data-stagger>
          {gallery.slice(0, 3).map((image, index) => (
            <figure key={image.id}>
              <img src={image.url} alt={image.alt} loading="lazy" decoding="async" />
              <figcaption>0{index + 1}. {image.alt}</figcaption>
            </figure>
          ))}
        </div>
      </section>

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
