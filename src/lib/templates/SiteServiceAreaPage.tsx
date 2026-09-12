import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import { getColorScheme, getPublishedFaqs, getPublishedServices, getPublishedShowcase, getPublishedTestimonials, getSiteContent, glyphForContent } from '@/lib/site-content';
import { siteOrigin } from '@/lib/seo/site-pages';
import ServiceIcon from './ServiceIcon';
import SiteFooter from './SiteFooter';
import { readableAccentText, readableOnAccent } from './theme-color';
import { templateFontVars } from './fonts';
import styles from './themes.module.css';
import { cspNonce } from '@/lib/csp-nonce';
import { breadcrumbJsonLd, HOME_CRUMB } from '@/lib/seo/breadcrumbs';
import { slugifyBlogTitle } from '@/lib/site-content';

const THEME_CLASS: Record<string, string> = {
  carbon: 'forge', professional: 'guild', modern: 'vista', handy: 'handy',
  coat: 'coat', fixit: 'fixit', reno: 'reno', shine: 'shine',
};

export default async function SiteServiceAreaPage({ site, city }: { site: Site; city: string }) {
  const content = getSiteContent(site.content);
  const scheme = getColorScheme(content.colorScheme);
  const defaultAccent = '#2563eb';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : (scheme?.onAccent || '#ffffff'),
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#ffffff', scheme?.surface || '#ffffff'])
      : (scheme?.accentText || defaultAccent),
    ...(site.header_font ? { '--theme-display': site.header_font } : {}),
    ...(content.brandFont ? { '--brand-font': content.brandFont } : {}),
    ...(scheme ? {
      '--c-bg': scheme.bg,
      '--c-surface': scheme.surface,
      '--c-ink': scheme.ink,
      '--c-muted': scheme.muted,
      '--c-surface-ink': scheme.surfaceInk || scheme.ink,
      '--c-surface-muted': scheme.surfaceMuted || scheme.muted,
      '--c-line': scheme.line,
      '--c-control-line': scheme.controlLine,
      '--c-deep': scheme.deep,
      '--c-on-deep': scheme.onDeep,
      '--c-on-photo': scheme.onPhoto,
    } : {}),
  } as CSSProperties;
  const themeClass = THEME_CLASS[site.template] || 'forge';

  const showcase = getPublishedShowcase(site.content);
  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '/#our-services', label: 'Services' }] : []),
    ...(showcase ? [{ href: '/#showcase', label: showcase.navLabel.trim() || 'Gallery' }] : []),
    ...(getPublishedTestimonials(site.content) ? [{ href: '/#reviews', label: 'Reviews' }] : []),
    ...(getPublishedFaqs(site.content) ? [{ href: '/#faqs', label: 'FAQs' }] : []),
  ];

  const base = siteOrigin(site) || 'https://letsgetquoted.com';
  const slug = encodeURIComponent(slugifyBlogTitle(city));
  const trade = content.trade?.trim() || 'Contractor';
  
  const crumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: city, path: `/service-areas/${slug}` },
  ], base);

  const jsonLdScripts = `
    ${JSON.stringify(crumbs)}
  `.trim();

  const services = getPublishedServices(site.content);
  const testimonials = getPublishedTestimonials(site.content);

  // Cross-link city pages to the services offered there, and back to the homepage.
  return (
    <main className={`${templateFontVars} ${styles.site} ${styles[themeClass] || ''}`} style={themeStyle} data-mode={scheme ? undefined : site.portal_mode} data-logo-style={content.logoStyle}>
      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      
      <header className={styles.blogChromeHeader}>
        <a className={styles.blogChromeBrand} href="/" aria-label={`${site.company_name} home`}>
          {site.logo_url
            ? <img className={styles.blogChromeLogo} src={site.logo_url} alt="" />
            : <span className={styles.blogChromeMark}><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          {(!content.hideHeaderCompanyName || content.headerTagline) && (
            <span className={styles.brandText}>
              {!content.hideHeaderCompanyName && <strong>{site.company_name}</strong>}
              {content.headerTagline && <span className={styles.headerTagline}>{content.headerTagline}</span>}
            </span>
          )}
        </a>
        <nav className={styles.blogChromeNav} aria-label="Site navigation">
          {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <a className={styles.blogChromeCta} href="/#contact">Get a free quote</a>
      </header>
      
      <div className={styles.blogArticleShell}>
        <div className={styles.blogArticle}>
          <nav className={styles.blogCrumb} aria-label="Breadcrumb">
            <a href="/">{site.company_name || 'Home'}</a>
            <span aria-hidden="true">/</span>
            <span>{city}</span>
          </nav>
          
          <article>
            <header className={styles.blogArticleHead}>
              <h1>{trade} in {city}</h1>
            </header>
            
            <div className={styles.blogArticleBody} style={{ fontSize: '1.15rem', lineHeight: 1.6 }}>
              <p>
                {site.company_name} is proud to provide professional {trade.toLowerCase()} services to {city} and the surrounding areas. 
                Whether you need a quick repair, a full installation, or ongoing maintenance, our experienced team is ready to help.
              </p>
              
              {services && services.items.length > 0 && (
                <>
                  <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Our Services in {city}</h2>
                  <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', listStyle: 'none', padding: 0 }}>
                    {services.items.map(service => (
                      <li key={service.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--c-surface)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--c-line)' }}>
                        <span style={{ color: 'var(--theme-accent)', display: 'flex' }}><ServiceIcon name={service.icon} /></span>
                        <a href={`/services/${encodeURIComponent(slugifyBlogTitle(service.title.trim()))}`} style={{ color: 'var(--theme-accent-text)', textDecoration: 'none', fontWeight: 600 }}>
                          {service.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {testimonials && testimonials.items.length > 0 && (
                <>
                  <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>What Our Customers Say</h2>
                  <div style={{ background: 'var(--c-surface)', padding: '2rem', borderRadius: '0.5rem', border: '1px solid var(--c-line)' }}>
                    <p style={{ fontStyle: 'italic', marginBottom: '1rem' }}>&quot;{testimonials.items[0].text}&quot;</p>
                    <p style={{ fontWeight: 600 }}>— {testimonials.items[0].author}</p>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '3rem', textAlign: 'center' }}>
              <a href="/#contact" className={styles.blogChromeCta} style={{ display: 'inline-block', fontSize: '1.25rem', padding: '1rem 2rem' }}>
                Request a Quote in {city}
              </a>
            </div>
          </article>
        </div>
      </div>
      
      <SiteFooter site={site} />
    </main>
  );
}
