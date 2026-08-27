'use client';

import React, { useState, useEffect, useId, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ALL_FEATURES_CATALOG,
  TOTAL_CATALOG_FEATURE_COUNT,
} from '@/lib/all-features-catalog';
import { SIGNUP_LABEL, SIGNUP_URL } from '@/components/flagship/site-chrome';
import styles from './AllFeaturesModal.module.css';


export type AllFeaturesModalProps = {
  triggerLabel?: React.ReactNode;
  triggerVariant?: 'primary' | 'secondary' | 'text' | 'custom';
  triggerClassName?: string;
  defaultOpen?: boolean;
};

export default function AllFeaturesModal({
  triggerLabel = 'See all our features',
  triggerVariant = 'secondary',
  triggerClassName,
  defaultOpen = false,
}: AllFeaturesModalProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    // Focus search on open
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalStyle;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [open]);

  // Filter categories and features based on live search
  const filteredCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return ALL_FEATURES_CATALOG;

    return ALL_FEATURES_CATALOG.map((category) => {
      const catMatches =
        category.title.toLowerCase().includes(query) ||
        category.intro.toLowerCase().includes(query);

      const matchingFeatures = category.features.filter((feat) => {
        if (catMatches) return true;
        const nameMatch = feat.name.toLowerCase().includes(query);
        const descMatch = feat.desc.toLowerCase().includes(query);
        const tagMatch = feat.tags?.some((t) => t.toLowerCase().includes(query));
        const subMatch = feat.subBullets.some((b) => b.toLowerCase().includes(query));
        return nameMatch || descMatch || tagMatch || subMatch;
      });

      return {
        ...category,
        features: matchingFeatures,
      };
    }).filter((category) => category.features.length > 0);
  }, [searchQuery]);

  const totalFilteredCount = useMemo(() => {
    return filteredCatalog.reduce((sum, cat) => sum + cat.features.length, 0);
  }, [filteredCatalog]);

  const toggleCategory = (slug: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [slug]: !prev[slug],
    }));
  };

  const handleExpandAll = () => {
    setCollapsedCategories({});
  };

  const handleCollapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    ALL_FEATURES_CATALOG.forEach((cat) => {
      allCollapsed[cat.slug] = true;
    });
    setCollapsedCategories(allCollapsed);
  };

  const scrollToCategory = (slug: string) => {
    setActiveCategory(slug);
    // Ensure section is expanded
    setCollapsedCategories((prev) => ({ ...prev, [slug]: false }));

    const element = document.getElementById(`cat-sec-${slug}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const triggerClass =
    triggerClassName ||
    (triggerVariant === 'primary'
      ? `${styles.triggerBtn} ${styles.triggerBtnPrimary}`
      : triggerVariant === 'text'
      ? `${styles.triggerBtn} ${styles.triggerBtnText}`
      : `${styles.triggerBtn} ${styles.triggerBtnSecondary}`);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">✦</span> {triggerLabel}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className={styles.backdrop}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <div
                id={dialogId}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Let's Get Quoted Comprehensive Feature Catalog"
              >
                {/* Header with Title & Controls */}
                <div className={styles.header}>
                  <div className={styles.topRow}>
                    <div className={styles.titleArea}>
                      <span className={styles.eyebrow}>
                        <span aria-hidden="true">✦</span> Full Platform Capabilities
                      </span>
                      <h2 className={styles.title}>
                        All Features & Tools
                        <span className={styles.badgeTotal}>
                          {TOTAL_CATALOG_FEATURE_COUNT}+ features across {ALL_FEATURES_CATALOG.length} categories
                        </span>
                      </h2>
                    </div>
                    <button
                      type="button"
                      className={styles.closeButton}
                      aria-label="Close features modal"
                      onClick={() => {
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Search Bar & Expand/Collapse Toggle */}
                  <div className={styles.controlsRow}>
                    <div className={styles.searchWrap}>
                      <span className={styles.searchIcon} aria-hidden="true">
                        🔍
                      </span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search features (e.g. voice, permit, photos, stripe, gps, change order)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search all features"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className={styles.clearSearchBtn}
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className={styles.toggleGroup}>
                      <button
                        type="button"
                        className={styles.expandToggleBtn}
                        onClick={
                          Object.values(collapsedCategories).some(Boolean)
                            ? handleExpandAll
                            : handleCollapseAll
                        }
                      >
                        {Object.values(collapsedCategories).some(Boolean)
                          ? 'Expand All'
                          : 'Collapse All'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Category Jump Bar */}
                <div className={styles.categoryBar} role="navigation" aria-label="Feature categories">
                  {ALL_FEATURES_CATALOG.map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      className={`${styles.categoryPill} ${
                        activeCategory === cat.slug ? styles.categoryPillActive : ''
                      }`}
                      onClick={() => scrollToCategory(cat.slug)}
                    >
                      <span aria-hidden="true">{cat.icon}</span>
                      <span>{cat.title}</span>
                    </button>
                  ))}
                </div>

                {/* Scrollable Feature Catalog Body */}
                <div ref={scrollBodyRef} className={styles.body}>
                  {filteredCatalog.length === 0 ? (
                    <div className={styles.emptySearch}>
                      <h3>No matching features found for &quot;{searchQuery}&quot;</h3>
                      <p>Try searching for keywords like &quot;quote&quot;, &quot;crew&quot;, &quot;intake&quot;, &quot;invoice&quot;, or &quot;sms&quot;.</p>
                      <button
                        type="button"
                        className={styles.expandToggleBtn}
                        onClick={() => setSearchQuery('')}
                        style={{ marginTop: '1rem' }}
                      >
                        Reset Search
                      </button>
                    </div>

                  ) : (
                    filteredCatalog.map((category) => {
                      const isCollapsed = Boolean(collapsedCategories[category.slug]);
                      return (
                        <section
                          key={category.slug}
                          id={`cat-sec-${category.slug}`}
                          className={styles.categorySection}
                        >
                          <div
                            className={styles.categoryHead}
                            onClick={() => toggleCategory(category.slug)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={!isCollapsed}
                            aria-controls={!isCollapsed ? `cat-body-${category.slug}` : undefined}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleCategory(category.slug);
                              }
                            }}
                          >
                            <div className={styles.categoryHeadLeft}>
                              <span className={styles.categoryNum}>{category.num}</span>
                              <span className={styles.categoryIcon} aria-hidden="true">
                                {category.icon}
                              </span>
                              <h3 className={styles.categoryTitle}>
                                {category.title}
                                <span className={styles.categoryFeatureCount}>
                                  ({category.features.length} {category.features.length === 1 ? 'feature' : 'features'})
                                </span>
                              </h3>
                            </div>
                            <span
                              className={`${styles.categoryChevron} ${
                                !isCollapsed ? styles.categoryChevronOpen : ''
                              }`}
                              aria-hidden="true"
                            >
                              ▼
                            </span>
                          </div>

                          {!isCollapsed && (
                            <div id={`cat-body-${category.slug}`}>
                              <p className={styles.categoryIntro}>{category.intro}</p>
                              <ul className={styles.featureList}>
                                {category.features.map((feature) => (
                                  <li key={feature.id} className={styles.featureCard}>
                                    <div className={styles.featureTop}>
                                      <h4 className={styles.featureName}>{feature.name}</h4>
                                      {feature.tags && feature.tags.length > 0 && (
                                        <div className={styles.tagGroup}>
                                          {feature.tags.map((tag) => (
                                            <span key={tag} className={styles.tag}>
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <p className={styles.featureDesc}>{feature.desc}</p>
                                    {feature.subBullets && feature.subBullets.length > 0 && (
                                      <ul className={styles.subBulletList}>
                                        {feature.subBullets.map((bullet, idx) => (
                                          <li key={idx} className={styles.subBulletItem}>
                                            <span className={styles.subBulletMarker} aria-hidden="true">
                                              ✦
                                            </span>
                                            <span>{bullet}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </section>
                      );
                    })
                  )}
                </div>

                {/* Footer Bar */}
                <div className={styles.footer}>
                  <span>
                    Showing {totalFilteredCount} of {TOTAL_CATALOG_FEATURE_COUNT} features
                  </span>
                  <div className={styles.footerActions}>
                    <button
                      type="button"
                      className={styles.expandToggleBtn}
                      onClick={() => {
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      Close
                    </button>
                    <a className={styles.footerSignupBtn} href={SIGNUP_URL}>
                      {SIGNUP_LABEL} →
                    </a>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
