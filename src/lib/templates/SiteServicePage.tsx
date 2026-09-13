import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import { getColorScheme, getPublishedFaqs, getPublishedServices, getPublishedShowcase, getPublishedTestimonials, getSiteContent, glyphForContent, type SiteServiceItem } from '@/lib/site-content';
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

export default async function SiteServicePage({ site, service }: { site: Site; service: SiteServiceItem }) {
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
  const slug = encodeURIComponent(slugifyBlogTitle(service.title.trim()));
  
  const crumbs = breadcrumbJsonLd([
    HOME_CRUMB,
    { name: 'Services', path: '/#our-services' },
    { name: service.title, path: `/services/${slug}` },
  ], base);

  // Note: the local business emits Offer -> Service, but here we provide a detailed Service
  // with a provider matching the local business.
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.description || undefined,
    url: `${base}/services/${slug}`,
    provider: {
      '@type': 'LocalBusiness',
      name: site.company_name,
      url: base,
    },
  };

  const jsonLdScripts = `
    ${JSON.stringify(crumbs)}
    ${JSON.stringify(serviceJsonLd)}
  `.trim().split('\n').join('');

  // Reusing the blog article CSS for a clean reading experience
  return (
    <main id="main-content" className={`${templateFontVars} ${styles.site} ${styles[themeClass] || ''}`} style={themeStyle} data-mode={scheme ? undefined : site.portal_mode} data-logo-style={content.logoStyle}>
      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      
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
            <a href="/#our-services">Services</a>
            <span aria-hidden="true">/</span>
            <span>{service.title}</span>
          </nav>
          
          <article>
            <header className={styles.blogArticleHead}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--theme-accent)' }}>
                <ServiceIcon name={service.icon} />
              </div>
              <h1>{service.title}</h1>
            </header>
            
            <div className={styles.blogArticleBody} style={{ fontSize: '1.25rem', lineHeight: 1.6 }}>
              {service.description ? (
                <p>{service.description}</p>
              ) : (
                <p>Contact us today for a free estimate on our {service.title} services.</p>
              )}
            </div>

            <div style={{ marginTop: '3rem', textAlign: 'center' }}>
              <a href="/#contact" className={styles.blogChromeCta} style={{ display: 'inline-block', fontSize: '1.25rem', padding: '1rem 2rem' }}>
                Request a Quote
              </a>
            </div>
          </article>
        </div>
      </div>
      
      <SiteFooter site={site} />
    </main>
  );
}
