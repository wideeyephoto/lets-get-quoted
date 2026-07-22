import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import type { SiteBlogPost } from '@/lib/site-content';
import styles from './themes.module.css';

// Standalone /blog index — lists every published post. Like SiteBlogArticle it
// renders outside the template shell, so it carries its own light shell + the
// site's accent, and reuses the homepage .blogCard styling for the cards.
function formatBlogDate(iso: string): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SiteBlogIndex({
  site,
  title,
  intro,
  posts,
}: {
  site: Site;
  title: string;
  intro: string;
  posts: SiteBlogPost[];
}) {
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;

  return (
    <main className={styles.blogArticleShell} style={themeStyle}>
      <div className={styles.blogIndex}>
        <a className={styles.blogBack} href="/">{site.company_name || 'Home'}</a>
        <header className={styles.blogIndexHead}>
          <p className={styles.blogIndexKicker}>Blog</p>
          <h1>{title}</h1>
          {intro && <p className={styles.blogIndexIntro}>{intro}</p>}
        </header>
        <div className={styles.blogGrid}>
          {posts.map((post) => (
            <a key={post.id} className={styles.blogCard} href={`/blog/${post.slug}`}>
              {post.coverImage && <img className={styles.blogCardImg} src={post.coverImage} alt="" loading="lazy" decoding="async" />}
              <div className={styles.blogCardBody}>
                {formatBlogDate(post.date) && <time className={styles.blogCardDate} dateTime={post.date}>{formatBlogDate(post.date)}</time>}
                <h3>{post.title}</h3>
                {post.excerpt && <p>{post.excerpt}</p>}
                <span className={styles.blogCardMore}>Read more <span aria-hidden="true">→</span></span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
