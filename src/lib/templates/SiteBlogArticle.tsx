import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import { estimateReadingTime, getColorScheme, getPublishedFaqs, getPublishedServices, getPublishedShowcase, getPublishedTestimonials, getSiteContent, glyphForContent, type SiteBlogPost } from '@/lib/site-content';
import BlogReadingProgress from './BlogReadingProgress';
import ServiceIcon from './ServiceIcon';
import SiteFooter from './SiteFooter';
import { readableAccentText, readableOnAccent } from './theme-color';
import { templateFontVars } from './fonts';
import styles from './themes.module.css';
import { cspNonce } from '@/lib/csp-nonce';

// Maps the stored template id to its themes.module.css skin class, so the blog
// article can borrow the same palette tokens (--c-deep etc.) the header and
// footer need — keeping posts visually part of the site.
const THEME_CLASS: Record<string, string> = {
  carbon: 'forge', professional: 'guild', modern: 'vista', handy: 'handy',
  coat: 'coat', fixit: 'fixit', reno: 'reno', shine: 'shine',
};

// Standalone article page for a single published post. Rendered outside the
// template shell (its own route), so it carries its own readable layout and
// just borrows the site's accent + company name for a branded feel. Both the
// subdomain and custom-domain blog routes reuse this.
function formatBlogDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function SiteBlogArticle({ site, post }: { site: Site; post: SiteBlogPost }) {
  const paragraphs = post.body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
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
  const date = formatBlogDate(post.date);

  // The site's nav, pointing back to the homepage sections (and /blog), so a
  // reader can jump into the rest of the site from a post.
  const showcase = getPublishedShowcase(site.content);
  const navLinks = [
    ...(getPublishedServices(site.content) ? [{ href: '/#our-services', label: 'Services' }] : []),
    ...(showcase ? [{ href: '/#showcase', label: showcase.navLabel.trim() || 'Gallery' }] : []),
    ...(getPublishedTestimonials(site.content) ? [{ href: '/#reviews', label: 'Reviews' }] : []),
    ...(getPublishedFaqs(site.content) ? [{ href: '/#faqs', label: 'FAQs' }] : []),
    { href: '/blog', label: 'Blog' },
  ];

  // BlogPosting schema so the post can qualify for article rich results. This is
  // legitimate content markup (not the disallowed self-serving review schema).
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const base = site.custom_domain_verified_at && site.custom_domain
    ? `https://${site.custom_domain}`
    : `https://${site.subdomain}.${rootDomain}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || undefined,
    datePublished: post.date || undefined,
    image: post.coverImage || site.hero_url || undefined,
    author: {
      '@type': 'Organization',
      name: site.company_name,
      url: base,
    },
    publisher: {
      '@type': 'Organization',
      name: site.company_name,
      url: base,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${base}/blog/${encodeURIComponent(post.slug)}`,
    },
  };

  return (
    <main className={`${templateFontVars} ${styles.site} ${styles[themeClass] || ''}`} style={themeStyle} data-mode={scheme ? undefined : site.portal_mode} data-logo-style={content.logoStyle}>
      <script type="application/ld+json" nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogReadingProgress />
      <header className={styles.blogChromeHeader}>
        <a className={styles.blogChromeBrand} href="/" aria-label={`${site.company_name} home`}>
          {site.logo_url
            ? <img className={styles.blogChromeLogo} src={site.logo_url} alt="" />
            : <span className={styles.blogChromeMark}><ServiceIcon name={glyphForContent(content)} className={styles.brandGlyph} /></span>}
          {!content.hideHeaderCompanyName && <strong>{site.company_name}</strong>}
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
            <a href="/blog">Blog</a>
          </nav>
          <article>
            <header className={styles.blogArticleHead}>
              <div className={styles.blogArticleMeta}>
                {date && <time className={styles.blogArticleDate} dateTime={post.date}>{date}</time>}
                <span className={styles.blogArticleReadTime}>· {estimateReadingTime(post.body)}</span>
              </div>
              <h1>{post.title}</h1>
            </header>
            {post.coverImage && <img className={styles.blogArticleImg} src={post.coverImage} alt="" />}
            <div className={styles.blogArticleBody}>
              {paragraphs.map((block, index) => (
                <p key={index}>{block}</p>
              ))}
            </div>
          </article>
          <a className={styles.blogBackBottom} href="/">← Back to {site.company_name || 'home'}</a>
        </div>
      </div>
      <SiteFooter site={site} />
    </main>
  );
}
