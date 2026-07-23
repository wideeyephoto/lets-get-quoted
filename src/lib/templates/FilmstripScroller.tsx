'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Wraps the filmstrip showcase row and gives it a slow, continuous drift
// (ping-pongs at the ends) so the strip feels alive. Pauses while the visitor
// hovers, focuses, or scrolls it by hand, and stays completely still for
// reduced-motion users. Manual swipe/scroll keeps working throughout.
export default function FilmstripScroller({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const SPEED = 0.35; // px per frame — a gentle drift
    let raf = 0;
    let dir = 1;
    let paused = false;
    let resumeTimer = 0;

    const step = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max > 4 && !paused) {
        let next = el.scrollLeft + dir * SPEED;
        if (next >= max) { next = max; dir = -1; }
        else if (next <= 0) { next = 0; dir = 1; }
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(step);
    };

    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    // A manual scroll/swipe pauses the drift, then it resumes after a short idle.
    const nudge = () => {
      paused = true;
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => { paused = false; }, 2500);
    };

    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
    el.addEventListener('wheel', nudge, { passive: true });
    el.addEventListener('touchstart', nudge, { passive: true });
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
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
