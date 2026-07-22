'use client';

import { useEffect } from 'react';

// Progressive scroll-reveal. Renders nothing; on mount it finds every
// [data-reveal] element and fades/slides it in as it enters the viewport.
//
// Deliberately SSR-safe and flash-free:
// - Content ships visible in the SSR HTML. If JS never runs (or errors), or the
//   user prefers reduced motion, nothing here touches it — it just stays shown.
// - We only apply the hidden initial state to elements that are BELOW the fold
//   when this runs, so an above-the-fold section is never hidden-then-shown
//   (no flash). Below-fold elements are off-screen when hidden, so the reader
//   never sees the hide either.
// - Only opacity/transform animate (compositor-only) — no layout shift / CLS.
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal], [data-stagger]'));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-reveal-state', 'in');
            observer.unobserve(entry.target);
          }
        }
      },
      // threshold 0 (not a ratio) so a section TALLER than the viewport still
      // fires — a ratio like 0.12 is unreachable for very tall single-column
      // sections and would leave them stuck hidden.
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );

    // Reveal immediately (no entrance) anything whose top is already on-screen,
    // so a section peeking at the bottom edge never flashes hidden-then-in;
    // only genuinely below-fold elements get the hidden state and wait.
    const revealNowAbove = window.innerHeight;
    for (const element of elements) {
      if (element.getBoundingClientRect().top < revealNowAbove) {
        element.setAttribute('data-reveal-state', 'in');
      } else {
        element.setAttribute('data-reveal-state', 'init');
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
