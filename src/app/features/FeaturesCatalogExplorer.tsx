'use client';

import { useId, useMemo, useRef, useState } from 'react';
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
  'ai-copilot': '/features/ai-copilot',
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
  'neighborhood-halo': '/features/neighborhood-halo',
};

export default function FeaturesCatalogExplorer() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExpandedAll, setIsExpandedAll] = useState<boolean>(false);
  const headingId = useId();

  const allTabs = useMemo(() => [
    { slug: 'all', title: 'All Features', count: FEATURE_COUNT },
    ...FEATURE_CATEGORIES.map((c) => ({ slug: c.slug, title: c.title, count: c.features.length })),
  ], []);

  const catTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleCatKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % allTabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + allTabs.length) % allTabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = allTabs.length - 1;
    }
    if (nextIndex !== index) {
      setSelectedCategory(allTabs[nextIndex].slug);
      catTabRefs.current[nextIndex]?.focus();
    }
  };

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

  const displayedFeatures = useMemo(() => {
    // When on "All Features" without search, display first 16 cards initially with expand button
    if (selectedCategory === 'all' && !searchQuery && !isExpandedAll) {
      return filteredFeatures.slice(0, 16);
    }
    return filteredFeatures;
  }, [filteredFeatures, selectedCategory, searchQuery, isExpandedAll]);

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
          {allTabs.map((cat, index) => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                key={cat.slug}
                ref={(el) => { catTabRefs.current[index] = el; }}
                id={`cat-tab-${cat.slug}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls="catalog-features-panel"
                tabIndex={isSelected ? 0 : -1}
                className={`${styles.catPill} ${isSelected ? styles.catPillActive : ''}`}
                onClick={() => setSelectedCategory(cat.slug)}
                onKeyDown={(e) => handleCatKeyDown(e, index)}
              >
                {cat.title} <span className={styles.catCount}>{cat.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Count Banner */}
      <div className={styles.catalogResultsBar}>
        <span>
          Showing <strong>{displayedFeatures.length}</strong> of {filteredFeatures.length} matching features ({FEATURE_COUNT} total)
          {searchQuery ? ` matching "${searchQuery}"` : ''}
        </span>
        {searchQuery || selectedCategory !== 'all' || isExpandedAll ? (
          <button
            type="button"
            className={styles.resetFilterBtn}
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
              setIsExpandedAll(false);
            }}
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {/* Feature Grid */}
      <div
        className={styles.featureCatalogGrid}
        id="catalog-features-panel"
        role="tabpanel"
        aria-labelledby={`cat-tab-${selectedCategory}`}
      >
        {displayedFeatures.length > 0 ? (
          <>
            {displayedFeatures.map((feat) => (
              <div key={feat.id} className={styles.featureCatalogCard}>
                <div className={styles.featureCardTop}>
                  <span className={styles.featureCategoryTag}>{feat.categoryTitle}</span>
                  {feat.favorite ? (
                    <span className={styles.featureFavoriteTag}>★ Core Advantage</span>
                  ) : null}
                </div>
                <h3 className={styles.featureCardTitle}>{feat.name}</h3>
                <p className={styles.featureCardDesc}>{feat.desc}</p>
                <Link
                  href={feat.deepLink}
                  className={styles.featureDeepLink}
                  aria-label={`Learn more about ${feat.name} (${feat.categoryTitle})`}
                >
                  Learn more <span aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
            {selectedCategory === 'all' && !searchQuery && !isExpandedAll && filteredFeatures.length > displayedFeatures.length && (
              <div className={styles.showMoreCatalogWrap}>
                <button
                  type="button"
                  className={styles.showMoreCatalogBtn}
                  onClick={() => setIsExpandedAll(true)}
                >
                  Show all {FEATURE_COUNT} features ({filteredFeatures.length - displayedFeatures.length} more) ↓
                </button>
              </div>
            )}
          </>
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
