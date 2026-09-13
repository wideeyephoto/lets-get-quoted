'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PlatformBlogPost } from '@/lib/platform-blog';
import styles from './blog.module.css';

interface BlogIndexClientProps {
  posts: PlatformBlogPost[];
  categories: string[];
}

export default function BlogIndexClient({ posts, categories }: BlogIndexClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const featuredPost = useMemo(() => {
    return posts.find((p) => p.featured) || posts[0];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesCategory =
        selectedCategory === 'All' || post.category.toLowerCase() === selectedCategory.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        post.tags.some((t) => t.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [posts, selectedCategory, searchQuery]);

  return (
    <>
      {/* Featured Post Card (Hero Highlight) */}
      {featuredPost && selectedCategory === 'All' && !searchQuery && (
        <section className={styles.featuredSection} aria-label="Featured Article">
          <Link href={`/blog/${featuredPost.slug}`} className={styles.featuredCard}>
            <div>
              <div className={styles.featuredTag}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Featured Guide · {featuredPost.category}</span>
              </div>
              <h2 className={styles.featuredTitle}>{featuredPost.title}</h2>
              <p className={styles.featuredExcerpt}>{featuredPost.excerpt}</p>
              <div className={styles.articleMeta}>
                <span className={styles.metaItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {featuredPost.readMinutes} min read
                </span>
                <span className={styles.metaItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {formatDate(featuredPost.datePublished)}
                </span>
                <span className={styles.metaItem}>By {featuredPost.author.name}</span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.categoryPills} role="tablist" aria-label="Filter blog posts by category">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'All'}
            onClick={() => setSelectedCategory('All')}
            className={`${styles.categoryPill} ${selectedCategory === 'All' ? styles.categoryPillActive : ''}`}
          >
            All Topics ({posts.length})
          </button>
          {categories.map((category) => {
            const count = posts.filter((p) => p.category.toLowerCase() === category.toLowerCase()).length;
            if (count === 0) return null;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={`${styles.categoryPill} ${
                  selectedCategory === category ? styles.categoryPillActive : ''
                }`}
              >
                {category} ({count})
              </button>
            );
          })}
        </div>

        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles, topics..."
            className={styles.searchInput}
            aria-label="Search articles"
          />
        </div>
      </div>

      {/* Articles Grid */}
      {filteredPosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No articles matched your criteria.</p>
          <p style={{ fontSize: '14px', color: 'var(--dim)' }}>Try clearing your search or picking another category.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('All');
              setSearchQuery('');
            }}
            className={styles.categoryPill}
            style={{ marginTop: '16px' }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className={styles.articlesGrid}>
          {filteredPosts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className={styles.articleCard}>
              <span className={styles.cardCategory}>{post.category}</span>
              <h3 className={styles.cardTitle}>{post.title}</h3>
              <p className={styles.cardExcerpt}>{post.excerpt}</p>
              <div className={styles.cardFooter}>
                <span>{post.readMinutes} min read</span>
                <span>{formatDate(post.datePublished)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* CTA Bottom Banner */}
      <section className={styles.ctaBanner}>
        <h2 className={styles.ctaTitle}>Ready to run your trade business without software bloat?</h2>
        <p className={styles.ctaLead}>
          Start with a free high-converting contractor website, 24/7 AI intake, and quotes-to-paid workflow. Flex starts at $0/mo with unlimited crew members.
        </p>
        <a href="https://app.letsgetquoted.com/start?goal=build_site&source=blog_cta" className={styles.ctaButton}>
          Build Your Free Site &rarr;
        </a>
      </section>
    </>
  );
}

function formatDate(iso: string): string {
  try {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}
