'use client';

import { useEffect } from 'react';

/**
 * Opens the <details> a URL fragment points at.
 *
 * Every answer on this page has an id and a copyable link, which is what makes
 * "here's the answer to that" a thing support can send. But a <details> is
 * closed by default and nothing in HTML or CSS opens one because it is the
 * :target — so following /faq#how-do-i-get-paid scrolled to a collapsed
 * summary, and the answer the link was sent for was the one thing not on
 * screen.
 *
 * Runs on mount for a cold load and on hashchange for a link followed from
 * this same page. scrollIntoView after opening, because expanding the element
 * moves everything below it and the browser's own jump has already happened by
 * then.
 *
 * No-JS is still fine: the fragment scrolls to the right summary and it takes
 * one click to open. This improves the case, it is not load-bearing for it.
 */
export default function FaqDeepLink() {
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!(el instanceof HTMLDetailsElement)) return;
      el.open = true;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };

    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  return null;
}
