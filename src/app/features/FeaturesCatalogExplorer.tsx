'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { FEATURE_CATEGORIES, ALL_FEATURES, FEATURE_COUNT } from '@/lib/features';
import styles from './features-theme.module.css';

const CATEGORY_MAP_TO_SLUG: Record<string, string> = {
  website: '/features/website-builder',
  'getting-found': '/features/website-builder',
  leads: '/features/ai-intake',
  quotes: '/features/quotes',
  payments: '/features/payments',
  scheduling: '/features/scheduling',
  jobs: '/features/crew',
  recurring: '/features/recurring',
  clients: '/features/client-portal',
  reviews: '/features/reviews',
  marketing: '/features/ai-ads',
  insights: '/features/cash-flow',
};

const FEATURE_DEEP_LINKS: Record<string, string> = {
  'sparky-ai': '/features/sparky',
  'text-to-job': '/features/text-to-job',
  'ai-smart-intake': '/features/ai-intake',
  'video-sections': '/features/website-builder',
  'quick-stops': '/features/quick-stops',
  'ai-ads-autopilot': '/features/ai-ads',
  'speed-to-lead-sms': '/features/ai-ads',
  'message-match-hero': '/features/ai-ads',
  'weather-ad-surge': '/features/ai-ads',
  'closed-loop-conversions': '/features/ai-ads',
};

export default function FeaturesCatalogExplorer() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const headingId = useId();

  const filteredFeatures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return ALL_FEATURES.filter((feature) => {
      // Find its category
      const cat = FEATURE_CATEGORIES.find((c) => c.features.some((f) => f.id === feature.id));
      if (!cat) return false;

      if (selectedCategory !== 'all' && cat.slug !== selectedCategory) {
        return false;
      }

      if (!q) return true;

      return (
        feature.name.toLowerCase().includes(q) ||
        feature.desc.toLowerCase().includes(q) ||
        cat.title.toLowerCase().includes(q)
      );
    }).map((feature) => {
      const cat = FEATURE_CATEGORIES.find((c) => c.features.some((f) => f.id === feature.id))!;
      const deepLink = FEATURE_DEEP_LINKS[feature.id] || CATEGORY_MAP_TO_SLUG[cat.slug] || '/features';
      return {
        ...feature,
        categoryTitle: cat.title,
        categorySlug: cat.slug,
        deepLink,
      };
    });
  }, [searchQuery, selectedCategory]);

  return (
    <section
      className={styles.catalogSection}
      id="features-explorer"
      aria-labelledby={headingId}
    >
      <div className={styles.catalogHeader}>
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> COMPLETE CONTRACTOR OPERATING SYSTEM
        </p>
        <h2 id={headingId}>
          Explore all <em>{FEATURE_COUNT} shipped features.</em>
        </h2>
        <p className={styles.catalogSubhead}>
          Search and filter every contractor capability built into Let’s Get Quoted. Every feature connects
          to the same core job record.
        </p>
      </div>

      {/* Search Input and Live Filter Pills */}
      <div className={styles.searchBarWrap}>
        <div className={styles.searchInputBox}>
          <span className={styles.searchIcon} aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder="Search features (e.g. Stripe, SMS, e-signature, GPS routing, reviews...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.catalogSearchInput}
            aria-label="Search contractor features"
          />
          {searchQuery ? (
            <button
              type="button"
              className={styles.clearSearchBtn}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Category Pills */}
        <div className={styles.categoryFilterRow} role="tablist" aria-label="Feature categories">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            className={`${styles.catPill} ${selectedCategory === 'all' ? styles.catPillActive : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Features <span className={styles.catCount}>{FEATURE_COUNT}</span>
          </button>

          {FEATURE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                key={cat.slug}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`${styles.catPill} ${isSelected ? styles.catPillActive : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
              >
                {cat.title} <span className={styles.catCount}>{cat.features.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Count Banner */}
      <div className={styles.catalogResultsBar}>
        <span>
          Showing <strong>{filteredFeatures.length}</strong> of {FEATURE_COUNT} features
          {searchQuery ? ` matching "${searchQuery}"` : ''}
        </span>
        {searchQuery || selectedCategory !== 'all' ? (
          <button
            type="button"
            className={styles.resetFilterBtn}
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {/* Feature Grid */}
      <div className={styles.featureCatalogGrid}>
        {filteredFeatures.length > 0 ? (
          filteredFeatures.map((feat) => (
            <div key={feat.id} className={styles.featureCatalogCard}>
              <div className={styles.featureCardTop}>
                <span className={styles.featureCategoryTag}>{feat.categoryTitle}</span>
                {feat.favorite ? (
                  <span className={styles.featureFavoriteTag}>★ Core Advantage</span>
                ) : null}
              </div>
              <h3 className={styles.featureCardTitle}>{feat.name}</h3>
              <p className={styles.featureCardDesc}>{feat.desc}</p>
              <Link href={feat.deepLink} className={styles.featureDeepLink}>
                Learn more <span aria-hidden="true">→</span>
              </Link>
            </div>
          ))
        ) : (
          <div className={styles.emptyResultsBox}>
            <p>No features matched &ldquo;{searchQuery}&rdquo; in this category.</p>
            <button
              type="button"
              className={styles.calcPrimaryBtn}
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Show all {FEATURE_COUNT} features
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
