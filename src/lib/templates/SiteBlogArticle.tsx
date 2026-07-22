import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import type { SiteBlogPost } from '@/lib/site-content';
import BlogReadingProgress from './BlogReadingProgress';
import styles from './themes.module.css';

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

export default function SiteBlogArticle({ site, post }: { site: Site; post: SiteBlogPost }) {
  const paragraphs = post.body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;
  const date = formatBlogDate(post.date);

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
    author: { '@type': 'Organization', name: site.company_name || 'Local business' },
    publisher: { '@type': 'Organization', name: site.company_name || 'Local business' },
    mainEntityOfPage: `${base}/blog/${post.slug}`,
  };

  return (
    <main className={styles.blogArticleShell} style={themeStyle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlogReadingProgress />
      <div className={styles.blogArticle}>
        <nav className={styles.blogCrumb} aria-label="Breadcrumb">
          <a href="/">{site.company_name || 'Home'}</a>
          <span aria-hidden="true">/</span>
          <a href="/blog">Blog</a>
        </nav>
        <article>
          <header className={styles.blogArticleHead}>
            {date && <time className={styles.blogArticleDate} dateTime={post.date}>{date}</time>}
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
    </main>
  );
}
