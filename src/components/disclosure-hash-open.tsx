'use client';

import { useEffect } from 'react';

// Links that point at a folded <details> — "Set booking availability ↓" in the
// schedule hero, or a bookmarked #booking-availability — otherwise scroll to a
// closed panel and look broken. Browsers only auto-expand when the fragment
// matches something INSIDE the details, not the details element itself, so open
// it here and re-scroll once it has its full height.
export default function DisclosureHashOpen() {
  useEffect(() => {
    function openFromHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      const details = target?.closest('details');
      if (!details || details.open) return;
      details.open = true;
      // Opening changes the layout above it, so the browser's own scroll has
      // already landed in the wrong place by now.
      requestAnimationFrame(() => details.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  return null;
}
