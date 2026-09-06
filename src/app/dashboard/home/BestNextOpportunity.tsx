'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { BestOpportunity, Loadable } from '@/lib/dashboard-types';
import styles from './NextSuggestionsScroller.module.css';

export default function BestNextOpportunity({
  opportunity,
  opportunities,
}: {
  opportunity?: Loadable<BestOpportunity | null>;
  opportunities?: Loadable<BestOpportunity[]>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Normalize suggestions from either opportunities list or single opportunity
  const items: BestOpportunity[] = useMemo(() => {
    if (opportunities && opportunities.kind === 'ready' && opportunities.data.length > 0) {
      return opportunities.data;
    }
    if (opportunity && opportunity.kind === 'ready' && opportunity.data) {
      return [opportunity.data];
    }
    return [];
  }, [opportunity, opportunities]);

  const scrollTo = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.children[index] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      setActiveIndex(index);
    }
  }, []);

  const handlePrev = useCallback(() => {
    const nextIdx = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
    scrollTo(nextIdx);
  }, [activeIndex, items.length, scrollTo]);

  const handleNext = useCallback(() => {
    const nextIdx = activeIndex >= items.length - 1 ? 0 : activeIndex + 1;
    scrollTo(nextIdx);
  }, [activeIndex, items.length, scrollTo]);

  // Keep active index in sync when user swipes or manually scrolls
  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const itemWidth = scroller.clientWidth;
    if (itemWidth > 0) {
      const idx = Math.round(scroller.scrollLeft / itemWidth);
      if (idx >= 0 && idx < items.length && idx !== activeIndex) {
        setActiveIndex(idx);
      }
    }
  };

  // Keyboard navigation when focused in the scroller
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  // Gentle auto-advance (paused on hover, focus, or when user prefers reduced motion)
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % items.length;
        const scroller = scrollerRef.current;
        if (scroller) {
          const target = scroller.children[next] as HTMLElement | undefined;
          target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
        return next;
      });
    }, 8000);

    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  if (items.length === 0) {
    return null;
  }

  // Single recommendation view without carousel controls
  if (items.length === 1) {
    const opp = items[0];
    return (
      <section className="panel workspace-section-card next-opportunity-panel" aria-label="Recommended next step">
        <div className={styles.slideContent}>
          <div className={styles.infoCol}>
            <div className={styles.headerRow}>
              <span className="next-opportunity-badge">
                ★ {opp.badgeLabel || 'Recommended Next Step'}
              </span>
            </div>
            <h2 className="next-opportunity-headline">
              {opp.headline}
            </h2>
            <p className="next-opportunity-reason">
              {opp.reason}
            </p>
          </div>
          <div className={styles.actionCol}>
            <Link href={opp.actionHref} className="btn primary" style={{ minHeight: '44px', padding: '0.55rem 1.25rem' }}>
              {opp.actionLabel} &rarr;
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Multi-suggestion carousel scroller
  return (
    <section
      className="panel workspace-section-card next-opportunity-panel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Next suggestions"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <div className={styles.container}>
        <div
          ref={scrollerRef}
          className={styles.scroller}
          onScroll={handleScroll}
        >
          {items.map((opp, idx) => (
            <div
              key={opp.id}
              className={styles.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`Suggestion ${idx + 1} of ${items.length}: ${opp.headline}`}
            >
              <div className={styles.slideContent}>
                <div className={styles.infoCol}>
                  <div className={styles.headerRow}>
                    <span className="next-opportunity-badge">
                      ★ {opp.badgeLabel || 'Recommended Next Step'}
                    </span>
                    <span className={styles.counterBadge}>
                      {idx + 1} of {items.length}
                    </span>
                  </div>
                  <h2 className="next-opportunity-headline">
                    {opp.headline}
                  </h2>
                  <p className="next-opportunity-reason">
                    {opp.reason}
                  </p>
                </div>
                <div className={styles.actionCol}>
                  <div className={styles.controls} aria-label="Suggestion scroller controls">
                    <button
                      type="button"
                      onClick={handlePrev}
                      className={styles.navBtn}
                      aria-label="Previous suggestion"
                      title="Previous suggestion"
                    >
                      &#8249;
                    </button>
                    <div className={styles.dotsRow} role="tablist" aria-label="Suggestion navigation dots">
                      {items.map((it, dIdx) => (
                        <button
                          key={`dot-${it.id}`}
                          type="button"
                          role="tab"
                          aria-selected={dIdx === activeIndex}
                          aria-label={`Go to suggestion ${dIdx + 1} of ${items.length}`}
                          className={`${styles.dot} ${dIdx === activeIndex ? styles.activeDot : ''}`}
                          onClick={() => scrollTo(dIdx)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleNext}
                      className={styles.navBtn}
                      aria-label="Next suggestion"
                      title="Next suggestion"
                    >
                      &#8250;
                    </button>
                  </div>
                  <Link href={opp.actionHref} className="btn primary" style={{ minHeight: '44px', padding: '0.55rem 1.25rem' }}>
                    {opp.actionLabel} &rarr;
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
