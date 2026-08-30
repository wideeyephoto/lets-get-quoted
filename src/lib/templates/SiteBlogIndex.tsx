'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Site } from '@/lib/sites';
import { estimateReadingTime, type SiteBlogPost } from '@/lib/site-content';
import styles from './themes.module.css';

// Standalone /blog index — lists every published post. Like SiteBlogArticle it
// renders outside the template shell, so it carries its own light shell + the
// site's accent, and renders the posts according to the chosen blog layout with
// client-side keyword search.
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
  layout = 'grid',
}: {
  site: Site;
  title: string;
  intro: string;
  posts: SiteBlogPost[];
  layout?: string;
}) {
  const [query, setQuery] = useState('');
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;

  const filtered = query.trim()
    ? posts.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          (p.excerpt && p.excerpt.toLowerCase().includes(q)) ||
          (p.trade && p.trade.toLowerCase().includes(q))
        );
      })
    : posts;

  const card = (post: SiteBlogPost) => (
    <a key={post.id} className={styles.blogCard} href={`/blog/${post.slug}`}>
      {post.coverImage ? (
        <div className={styles.blogCardImgWrap}>
          <img className={styles.blogCardImg} src={post.coverImage} alt="" loading="lazy" decoding="async" />
        </div>
      ) : (
        <div className={styles.blogCardFallbackImg}>
          <span className={styles.blogCardFallbackIcon} aria-hidden="true">✍️</span>
        </div>
      )}
      <div className={styles.blogCardBody}>
        <div className={styles.blogMetaRow}>
          {formatBlogDate(post.date) && <time className={styles.blogCardDate} dateTime={post.date}>{formatBlogDate(post.date)}</time>}
          <span className={styles.blogCardReadTime}>· {estimateReadingTime(post.body || post.excerpt)}</span>
          {post.trade && <span className={styles.blogCardTrade}>{post.trade}</span>}
        </div>
        <h3>{post.title}</h3>
        {post.excerpt && <p>{post.excerpt}</p>}
        <span className={styles.blogCardMore}>Read more <span aria-hidden="true">→</span></span>
      </div>
    </a>
  );

  let body: ReactNode;
  if (filtered.length === 0) {
    body = <div className={styles.blogNoResults}>No articles found matching &ldquo;{query}&rdquo;</div>;
  } else if (layout === 'featured' && filtered.length > 0) {
    body = (
      <div className={styles.blogFeatured}>
        {card(filtered[0])}
        {filtered.length > 1 && (
          <div className={styles.blogFeatureList}>
            {filtered.slice(1).map((post, idx) => (
              <a key={post.id} className={styles.blogListRow} href={`/blog/${post.slug}`}>
                <span className={styles.blogListIndex}>0{idx + 2}</span>
                <div className={styles.blogListContent}>
                  <div className={styles.blogMetaRow}>
                    {formatBlogDate(post.date) && <time className={styles.blogCardDate} dateTime={post.date}>{formatBlogDate(post.date)}</time>}
                    <span className={styles.blogCardReadTime}>· {estimateReadingTime(post.body || post.excerpt)}</span>
                  </div>
                  <h3>{post.title}</h3>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  } else if (layout === 'rows') {
    body = (
      <div className={styles.blogRows}>
        {filtered.map((post) => (
          <a key={post.id} className={styles.blogRow} href={`/blog/${post.slug}`}>
            {post.coverImage ? (
              <div className={styles.blogRowImgWrap}>
                <img className={styles.blogRowImg} src={post.coverImage} alt="" loading="lazy" decoding="async" />
              </div>
            ) : (
              <div className={styles.blogRowImgWrap}>
                <div className={styles.blogCardFallbackImg}>
                  <span className={styles.blogCardFallbackIcon} aria-hidden="true">✍️</span>
                </div>
              </div>
            )}
            <div className={styles.blogCardBody}>
              <div className={styles.blogMetaRow}>
                {formatBlogDate(post.date) && <time className={styles.blogCardDate} dateTime={post.date}>{formatBlogDate(post.date)}</time>}
                <span className={styles.blogCardReadTime}>· {estimateReadingTime(post.body || post.excerpt)}</span>
                {post.trade && <span className={styles.blogCardTrade}>{post.trade}</span>}
              </div>
              <h3>{post.title}</h3>
              {post.excerpt && <p>{post.excerpt}</p>}
            </div>
          </a>
        ))}
      </div>
    );
  } else if (layout === 'magazine' && filtered.length > 0) {
    body = (
      <div className={styles.blogMagazine}>
        <a className={styles.blogMagazineLead} href={`/blog/${filtered[0].slug}`}>
          {filtered[0].coverImage ? (
            <div className={styles.blogMagazineLeadImgWrap}>
              <img className={styles.blogMagazineLeadImg} src={filtered[0].coverImage} alt="" loading="lazy" decoding="async" />
            </div>
          ) : (
            <div className={styles.blogMagazineLeadImgWrap}>
              <div className={styles.blogCardFallbackImg}>
                <span className={styles.blogCardFallbackIcon} aria-hidden="true">✍️</span>
              </div>
            </div>
          )}
          <div className={styles.blogMagazineLeadBody}>
            <div className={styles.blogFeaturedBadge}>★ Featured Story</div>
            <div className={styles.blogMetaRow}>
              {formatBlogDate(filtered[0].date) && <time className={styles.blogCardDate} dateTime={filtered[0].date}>{formatBlogDate(filtered[0].date)}</time>}
              <span className={styles.blogCardReadTime}>· {estimateReadingTime(filtered[0].body || filtered[0].excerpt)}</span>
              {filtered[0].trade && <span className={styles.blogCardTrade}>{filtered[0].trade}</span>}
            </div>
            <h3>{filtered[0].title}</h3>
            {filtered[0].excerpt && <p>{filtered[0].excerpt}</p>}
            <span className={styles.blogCardMore}>Read featured story <span aria-hidden="true">→</span></span>
          </div>
        </a>
        {filtered.length > 1 && (
          <div className={styles.blogMagazineSubGrid}>
            {filtered.slice(1).map(card)}
          </div>
        )}
      </div>
    );
  } else {
    body = <div className={styles.blogGrid}>{filtered.map(card)}</div>;
  }

  return (
    <main className={styles.blogArticleShell} style={themeStyle}>
      <div className={styles.blogIndex}>
        <a className={styles.blogBack} href="/">{site.company_name || 'Home'}</a>
        <header className={styles.blogIndexHead}>
          <p className={styles.blogIndexKicker}>Blog</p>
          <h1>{title}</h1>
          {intro && <p className={styles.blogIndexIntro}>{intro}</p>}
        </header>

        {posts.length > 2 && (
          <div className={styles.blogSearchBox}>
            <span className={styles.blogSearchIcon} aria-hidden="true">🔍</span>
            <input
              type="search"
              className={styles.blogSearchInput}
              placeholder="Search articles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search articles"
            />
          </div>
        )}

        {body}
      </div>
    </main>
  );
}
