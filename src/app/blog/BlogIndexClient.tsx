'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PlatformBlogPost } from '@/lib/platform-blog';
import styles from './blog.module.css';

interface BlogIndexClientProps {
  posts: PlatformBlogPost[];
  categories: string[];
}

function getCategoryBadgeClass(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('pricing') || cat.includes('cash')) return styles.badgePricing;
  if (cat.includes('software') || cat.includes('tech')) return styles.badgeSoftware;
  if (cat.includes('marketing') || cat.includes('lead') || cat.includes('growth')) return styles.badgeMarketing;
  if (cat.includes('operation') || cat.includes('crew') || cat.includes('dispatch')) return styles.badgeOperations;
  if (cat.includes('review') || cat.includes('trust') || cat.includes('brand')) return styles.badgeTrust;
  return styles.badgeMarketing;
}

export default function BlogIndexClient({ posts, categories }: BlogIndexClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      const cat = params.get('category');
      if (q) setSearchQuery(q);
      if (cat) setSelectedCategory(cat);
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

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

  const isFiltering = selectedCategory !== 'All' || Boolean(searchQuery.trim());

  return (
    <>
      {/* Featured Post Card (Hero Highlight) */}
      {featuredPost && selectedCategory === 'All' && !searchQuery && (
        <section className={styles.featuredSection} aria-label="Featured Article">
          <Link href={`/blog/${featuredPost.slug}`} className={styles.featuredCard}>
            <div className={styles.featuredContent}>
              <div className={styles.featuredTag}>
                <span className={styles.featuredTagBadge}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Featured Guide
                </span>
                <span>·</span>
                <span>{featuredPost.category}</span>
              </div>
              <h2 className={styles.featuredTitle}>{featuredPost.title}</h2>
              <p className={styles.featuredExcerpt}>{featuredPost.excerpt}</p>
              <div className={styles.featuredActionRow}>
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
                <span className={styles.featuredReadBtn}>
                  Read Playbook
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </div>
            </div>
            {featuredPost.coverImage && (
              <div className={styles.featuredImageWrapper}>
                <img
                  src={featuredPost.coverImage}
                  alt={featuredPost.coverAlt || featuredPost.title}
                  className={styles.featuredImage}
                  loading="eager"
                />
              </div>
            )}
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
            All Topics
            <span className={styles.categoryPillCount}>{posts.length}</span>
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
                {category}
                <span className={styles.categoryPillCount}>{count}</span>
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
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={styles.searchClearBtn}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Real-time Result Count */}
      {isFiltering && (
        <div className={styles.resultsCounter}>
          <span>
            Showing <b>{filteredPosts.length}</b> {filteredPosts.length === 1 ? 'playbook' : 'playbooks'}
            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('All');
              setSearchQuery('');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--orange-light)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Articles Grid */}
      {filteredPosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 20px', color: 'var(--muted)' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
            No playbooks matched your criteria.
          </p>
          <p style={{ fontSize: '15px', color: 'var(--dim)', maxWidth: '440px', margin: '0 auto 20px' }}>
            Try adjusting your search terms or selecting a different category to view more guides.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('All');
              setSearchQuery('');
            }}
            className={styles.categoryPill}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className={styles.articlesGrid}>
          {filteredPosts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className={styles.articleCard}>
              {post.coverImage && (
                <div className={styles.cardImageWrapper}>
                  <img
                    src={post.coverImage}
                    alt={post.coverAlt || post.title}
                    className={styles.cardImage}
                    loading="lazy"
                  />
                  <span className={`${styles.cardFloatingBadge} ${getCategoryBadgeClass(post.category)}`}>
                    {post.category}
                  </span>
                  <span className={styles.cardReadChip}>
                    ⏱ {post.readMinutes}m
                  </span>
                </div>
              )}
              <h3 className={styles.cardTitle}>{post.title}</h3>
              <p className={styles.cardExcerpt}>{post.excerpt}</p>
              <div className={styles.cardFooter}>
                <div className={styles.cardFooterAuthor}>
                  <img
                    src={post.author.avatarUrl || '/apple-icon.png'}
                    alt={post.author.name}
                    className={styles.cardFooterAvatar}
                    width={20}
                    height={20}
                  />
                  <span>{formatDate(post.datePublished)}</span>
                </div>
                <span className={styles.cardReadLink}>
                  Read Guide
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* CTA Bottom Banner */}
      <section className={styles.ctaBanner}>
        <h2 className={styles.ctaTitle}>Ready to run your trade business without software bloat?</h2>
        <p className={styles.ctaLead}>
          Start with a free high-converting contractor website, 24/7 AI intake, and quotes-to-paid workflow. Flex starts at $0/mo with 2 office seats and 2 crew members included.
        </p>
        <div className={styles.ctaPillsRow}>
          <span className={styles.ctaPillItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Free High-Converting Website
          </span>
          <span className={styles.ctaPillItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            24/7 AI Call &amp; SMS Intake
          </span>
          <span className={styles.ctaPillItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Instant Price Calculators
          </span>
          <span className={styles.ctaPillItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            $0/mo Free Tier · Unlimited Crew
          </span>
        </div>
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
