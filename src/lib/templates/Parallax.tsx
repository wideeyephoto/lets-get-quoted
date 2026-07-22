'use client';

import { useEffect } from 'react';

// Lightweight scroll parallax. Renders nothing; on scroll it nudges every
// [data-parallax] element vertically by a fraction of its distance from the
// viewport centre. data-parallax="0.2" sets the strength (default 0.15).
//
// Safe by construction:
// - No-ops in an embedded iframe (the builder preview doesn't scroll the frame)
//   and under prefers-reduced-motion, so nothing ever ends up offset-and-stuck.
// - rAF-throttled, passive scroll listener, translate3d only (compositor).
export default function Parallax() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.self !== window.top) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    if (elements.length === 0) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      for (const element of elements) {
        const speed = parseFloat(element.dataset.parallax || '0.15') || 0.15;
        const rect = element.getBoundingClientRect();
        const fromCentre = (rect.top + rect.height / 2 - vh / 2) / vh; // ~ -1..1
        element.style.transform = `translate3d(0, ${(-fromCentre * speed * 100).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
