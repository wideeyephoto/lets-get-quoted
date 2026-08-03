import type { ReactNode } from 'react';
import type { Site } from '@/lib/sites';
import {
  getSiteContent, getFooterStyle, glyphForContent,
  getPublishedServices, getPublishedShowcase, getPublishedTestimonials, getPublishedFaqs, getPublishedBlog,
} from '@/lib/site-content';
import ServiceIcon from './ServiceIcon';
import SocialLinks from './SocialLinks';
import { siteLegalLinks } from '@/lib/legal/site-legal';
import styles from './themes.module.css';

// One footer for every theme. The layout is the owner's choice (Brand → Footer
// style): 'columns' | 'cta' | 'centered' | 'grid'. Colors/fonts come entirely
// from the theme tokens (--c-deep, --c-on-deep, --theme-accent, --theme-display),
// so the same markup looks native on Forge, Haven, Blueprint, etc. Click-to-edit
// markers (identity/bizTagline/bizArea/bizHours/bizPhone/bizLicense/brandIcon)
// keep the footer editable straight from the live preview.

type FooterLink = { href: string; label: string };

function footerLinks(site: Site): FooterLink[] {
  const c = site.content;
  const links: FooterLink[] = [];
  if (getPublishedServices(c)) links.push({ href: '#our-services', label: 'Services' });
  const showcase = getPublishedShowcase(c);
  if (showcase) links.push({ href: '#showcase', label: showcase.navLabel.trim() || 'Gallery' });
  if (getPublishedTestimonials(c)) links.push({ href: '#reviews', label: 'Reviews' });
  if (getPublishedFaqs(c)) links.push({ href: '#faqs', label: 'FAQs' });
  if (getPublishedBlog(c)) links.push({ href: '#blog', label: 'Blog' });
  return links;
}

const PinIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
);
const ClockIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const PhoneIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" /></svg>
);

export default function SiteFooter({ site }: { site: Site }) {
  const content = getSiteContent(site.content);
  const style = getFooterStyle(site.content);
  const links = footerLinks(site);
  // The footer's service-area line now comes from the Cities-you-serve intro
  // (edited in that section), falling back to the legacy service_area value.
  const areaLine = content.serviceAreas.intro.trim() || site.service_area || '';

  const mark = site.logo_url
    ? <img className={styles.footerLogo} src={site.logo_url} alt="" />
    : <span className={styles.sfMark} data-edit="brandIcon" aria-hidden="true"><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>;
  const brand = <span className={styles.sfBrandRow}>{mark}<span className={styles.sfName} data-edit="identity">{site.company_name}</span></span>;
  const tagline = <p className={styles.sfTagline} data-edit="bizTagline">{site.tagline || 'Trusted local service, done right.'}</p>;
  const quoteBtn = <a className={styles.sfBtn} href="#contact">Get a free quote</a>;
  const linkList = links.length > 0 ? <nav className={styles.sfLinks}>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</nav> : null;
  // Renders null when the owner has added none, so every layout below can place
  // it unconditionally without each one repeating the emptiness check.
  const socials = <SocialLinks site={site} />;

  const contactLines = (
    <>
      {site.phone && <a className={styles.sfPhone} href={`tel:${site.phone}`} data-edit="bizPhone">{site.phone}</a>}
      {areaLine && <span data-edit="bizArea">{areaLine}</span>}
      {site.hours && <span data-edit="bizHours">{site.hours}</span>}
      {site.license && <span data-edit="bizLicense">{site.license}</span>}
    </>
  );

  const legal = siteLegalLinks(site);
  const bar = (
    <div className={styles.sfBar}>
      <span>© {site.company_name}</span>
      {(legal.privacy || legal.terms) && (
        <nav className={styles.sfLegal} aria-label="Legal" data-edit="legal">
          {legal.privacy && <a href="/privacy">Privacy Policy</a>}
          {legal.terms && <a href="/terms">Terms of Service</a>}
        </nav>
      )}
      <small>Powered by Let&apos;s Get Quoted</small>
    </div>
  );

  let body: ReactNode = null;

  if (style === 'cta') {
    body = (
      <>
        <div className={styles.sfCtaBand}>
          <div><h2>Ready to get started?</h2><p>Free estimates — reach out today.</p></div>
          {quoteBtn}
        </div>
        <div className={styles.sfPad}>
          <div className={styles.sfTwo}>
            <div className={styles.sfBrandCol}>{brand}{tagline}{linkList}{socials}</div>
            <div className={styles.sfCol}><h3>Get in touch</h3>{contactLines}</div>
          </div>
        </div>
      </>
    );
  } else if (style === 'centered') {
    body = (
      <div className={styles.sfCenter}>
        {brand}
        {tagline}
        <div className={styles.sfChips}>
          {areaLine && <span className={styles.sfChip} data-edit="bizArea">{PinIcon}{areaLine}</span>}
          {site.hours && <span className={styles.sfChip} data-edit="bizHours">{ClockIcon}{site.hours}</span>}
          {site.phone && <a className={styles.sfChip} href={`tel:${site.phone}`} data-edit="bizPhone">{PhoneIcon}{site.phone}</a>}
        </div>
        {(links.length > 0 || site.license) && (
          <nav className={styles.sfLinksRow}>
            {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            {site.license && <span data-edit="bizLicense">{site.license}</span>}
          </nav>
        )}
        {socials}
      </div>
    );
  } else if (style === 'grid') {
    body = (
      <div className={styles.sfPad}>
        <div className={styles.sfTop}>{brand}{tagline}{socials}</div>
        <div className={styles.sfGrid}>
          {links.length > 0 && <div className={styles.sfCol}><h3>Explore</h3>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</div>}
          {areaLine && <div className={styles.sfCol}><h3>Areas served</h3><span data-edit="bizArea">{areaLine}</span></div>}
          {site.hours && <div className={styles.sfCol}><h3>Hours</h3><span data-edit="bizHours">{site.hours}</span></div>}
          <div className={styles.sfCol}><h3>Contact</h3>{site.phone && <a href={`tel:${site.phone}`} data-edit="bizPhone">{site.phone}</a>}{site.license && <span data-edit="bizLicense">{site.license}</span>}</div>
        </div>
      </div>
    );
  } else {
    // 'columns' (default) — three columns, no "Company" header on the links.
    body = (
      <div className={styles.sfPad}>
        <div className={styles.sfThree}>
          <div className={styles.sfBrandCol}>{brand}{tagline}{quoteBtn}{socials}</div>
          {linkList}
          <div className={styles.sfCol}><h3>Get in touch</h3>{contactLines}</div>
        </div>
      </div>
    );
  }

  return (
    <footer className={styles.siteFooter} data-footer={style}>
      {body}
      {bar}
    </footer>
  );
}
