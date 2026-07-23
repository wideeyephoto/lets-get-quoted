'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Wraps the filmstrip showcase row and advances it one tile every 1.5s so the
// strip keeps moving on its own. Stepping (rather than a per-frame drift) means
// scroll-snap still works, so every stop lands cleanly on a tile. It reverses
// at the end, pauses while the visitor hovers/focuses or scrolls by hand, and
// stays completely still for reduced-motion users.
const STEP_MS = 1500;

export default function FilmstripScroller({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let dir = 1;
    let paused = false;
    let resumeTimer = 0;

    // One tile's worth of scroll, measured from the first two tiles so the gap
    // is included; falls back to most of the viewport width.
    const stepSize = () => {
      const tiles = el.children;
      if (tiles.length >= 2) {
        const delta = (tiles[1] as HTMLElement).offsetLeft - (tiles[0] as HTMLElement).offsetLeft;
        if (delta > 0) return delta;
      }
      const first = tiles[0] as HTMLElement | undefined;
      return first?.offsetWidth || el.clientWidth * 0.8;
    };

    const timer = window.setInterval(() => {
      if (paused) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return; // nothing to scroll
      let next = el.scrollLeft + dir * stepSize();
      if (next >= max - 2) { next = max; dir = -1; }
      else if (next <= 2) { next = 0; dir = 1; }
      el.scrollTo({ left: next, behavior: 'smooth' });
    }, STEP_MS);

    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    // A manual scroll/swipe pauses the loop, which resumes after a short idle.
    const nudge = () => {
      paused = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => { paused = false; }, 3000);
    };

    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    el.addEventListener('wheel', nudge, { passive: true });
    el.addEventListener('touchstart', nudge, { passive: true });

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', resume);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resume);
      el.removeEventListener('wheel', nudge);
      el.removeEventListener('touchstart', nudge);
    };
  }, []);

  return <div ref={ref} className={className} data-stagger>{children}</div>;
}
