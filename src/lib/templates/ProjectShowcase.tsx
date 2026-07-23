'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SiteProjectShowcaseStyle } from '@/lib/site-content';
import styles from './themes.module.css';

type ProjectShowcaseItem = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
};

type ProjectShowcaseProps = {
  eyebrow: string;
  title: string;
  style: SiteProjectShowcaseStyle;
  items: ProjectShowcaseItem[];
};

const AUTOPLAY_MS = 5000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

// The Care template's "Project showcase" band: an animated presentation of 3-5
// project photos in one of three styles. Autoplay pauses on hover/focus and is
// disabled entirely for reduced-motion users, who still get working controls.
export default function ProjectShowcase({ eyebrow, title, style, items }: ProjectShowcaseProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const count = items.length;
  const regionRef = useRef<HTMLDivElement>(null);

  const go = (next: number) => setActive(((next % count) + count) % count);

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion || style === 'spotlight') return;
    const id = setInterval(() => setActive((current) => (current + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [count, paused, reducedMotion, style]);

  // Keep the active index valid if the item set shrinks (owner removed a photo).
  useEffect(() => {
    if (active >= count) setActive(count > 0 ? count - 1 : 0);
  }, [active, count]);

  if (count === 0) return null;

  const activeItem = items[Math.min(active, count - 1)];
  const captionOf = (item: ProjectShowcaseItem, index: number) => item.caption?.trim() || item.alt || `Project ${index + 1}`;

  const controls = count > 1 ? (
    <div className={styles.psControls}>
      <button type="button" className={styles.psArrow} onClick={() => go(active - 1)} aria-label="Previous project">‹</button>
      <div className={styles.psDots} role="tablist" aria-label="Choose a project">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`${styles.psDot}${index === active ? ` ${styles.psDotActive}` : ''}`}
            aria-label={`Show project ${index + 1}`}
            aria-selected={index === active}
            role="tab"
            onClick={() => go(index)}
          />
        ))}
      </div>
      <button type="button" className={styles.psArrow} onClick={() => go(active + 1)} aria-label="Next project">›</button>
    </div>
  ) : null;

  return (
    <div
      className={styles.projectShowcase}
      data-ps-style={style}
      ref={regionRef}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(event) => {
        if (count <= 1) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
      }}
    >
      <div className={styles.careWorksHead} data-reveal data-edit="projectShowcase">
        <p className={styles.careEyebrowLight}>{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      {style === 'slideshow' && (
        <div className={styles.psSlideshow}>
          <div className={styles.psStage}>
            {items.map((item, index) => (
              <figure
                key={item.id}
                className={styles.psSlide}
                data-active={index === active}
                aria-hidden={index === active ? undefined : true}
              >
                <img src={item.url} alt={item.alt} loading={index === 0 ? undefined : 'lazy'} decoding="async" draggable={false} />
                <figcaption>{captionOf(item, index)}</figcaption>
              </figure>
            ))}
          </div>
          {controls}
        </div>
      )}

      {style === 'coverflow' && (
        <div className={styles.psCoverflow}>
          <div className={styles.psCoverflowTrack}>
            {items.map((item, index) => {
              const offset = index - active;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={styles.psCoverItem}
                  data-active={index === active}
                  aria-label={index === active ? captionOf(item, index) : `Show ${captionOf(item, index)}`}
                  aria-hidden={Math.abs(offset) > 2 ? true : undefined}
                  onClick={() => go(index)}
                  style={{
                    '--ps-offset': offset,
                    zIndex: count - Math.abs(offset),
                  } as CSSProperties}
                >
                  <img src={item.url} alt={item.alt} loading={Math.abs(offset) <= 1 ? undefined : 'lazy'} decoding="async" draggable={false} />
                </button>
              );
            })}
          </div>
          <p className={styles.psCaption} aria-live="polite">{captionOf(activeItem, active)}</p>
          {controls}
        </div>
      )}

      {style === 'spotlight' && (
        <div className={styles.psSpotlight}>
          <figure className={styles.psSpotlightMain}>
            <img key={activeItem.id} src={activeItem.url} alt={activeItem.alt} decoding="async" draggable={false} />
            <figcaption aria-live="polite">{captionOf(activeItem, active)}</figcaption>
          </figure>
          {count > 1 && (
            <div className={styles.psThumbs} role="tablist" aria-label="Choose a project">
              {items.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.psThumb}${index === active ? ` ${styles.psThumbActive}` : ''}`}
                  role="tab"
                  aria-selected={index === active}
                  aria-label={captionOf(item, index)}
                  onClick={() => go(index)}
                >
                  <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
