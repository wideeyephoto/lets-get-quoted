'use client';

import { useRef, useState } from 'react';
import type { SiteBeforeAfterItem } from '@/lib/site-content';
import styles from './themes.module.css';

function Slider({ item }: { item: SiteBeforeAfterItem }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [pos, setPos] = useState(50);

  function updateFromClientX(clientX: number) {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, next)));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    // Capture for mouse so a drag tracks outside the frame; skip for touch so
    // touch-action:pan-y still lets a vertical swipe scroll the page.
    if (event.pointerType === 'mouse') event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) updateFromClientX(event.clientX);
  }

  function stopDragging() {
    draggingRef.current = false;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') { setPos((p) => Math.max(0, p - 4)); event.preventDefault(); }
    else if (event.key === 'ArrowRight') { setPos((p) => Math.min(100, p + 4)); event.preventDefault(); }
    else if (event.key === 'Home') { setPos(0); event.preventDefault(); }
    else if (event.key === 'End') { setPos(100); event.preventDefault(); }
  }

  return (
    <figure className={styles.baItem}>
      <div
        ref={frameRef}
        className={styles.baFrame}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <img className={styles.baImg} src={item.afterUrl} alt={item.afterAlt || item.label || 'After'} loading="lazy" decoding="async" draggable={false} />
        <div className={styles.baBefore} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img className={styles.baImg} src={item.beforeUrl} alt={item.beforeAlt || item.label || 'Before'} loading="lazy" decoding="async" draggable={false} />
        </div>
        <span className={`${styles.baTag} ${styles.baTagBefore}`} aria-hidden="true">Before</span>
        <span className={`${styles.baTag} ${styles.baTagAfter}`} aria-hidden="true">After</span>
        <div
          className={styles.baHandle}
          style={{ left: `${pos}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`${item.label || 'Before and after'} — drag to reveal`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={handleKeyDown}
        >
          <span className={styles.baHandleGrip} aria-hidden="true">‹ ›</span>
        </div>
      </div>
      {item.label && <figcaption className={styles.baCaption}>{item.label}</figcaption>}
    </figure>
  );
}

// Draggable before/after comparison slider (pointer + touch + keyboard). Rendered
// once from SiteContentSections, so it appears on every template.
export default function BeforeAfterSlider({ title, intro, items }: { title: string; intro: string; items: SiteBeforeAfterItem[] }) {
  return (
    <section className={styles.extraSection} data-reveal id="before-after">
      <div className={styles.extraSectionHeader}>
        <p className={styles.kicker}>Before &amp; after</p>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      <div className={styles.baGrid}>
        {items.map((item) => <Slider key={item.id} item={item} />)}
      </div>
    </section>
  );
}
