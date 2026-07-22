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

  return (
    <main className={styles.blogArticleShell} style={themeStyle}>
      <BlogReadingProgress />
      <div className={styles.blogArticle}>
        <a className={styles.blogBack} href="/">{site.company_name || 'Home'}</a>
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
