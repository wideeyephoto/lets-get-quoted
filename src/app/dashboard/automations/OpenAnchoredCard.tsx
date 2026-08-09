'use client';

import { useEffect } from 'react';

/**
 * Open and scroll to the card a deep link points at.
 *
 * Every automation is a collapsed `<details>`, so arriving at `#reminders`
 * without this scrolls to a closed one-line header — the section is on screen
 * and its contents are not, which reads as a broken link rather than a shut
 * drawer. SettingsTabs used to do this while these cards lived in a tab; the
 * page has to do it for itself now.
 *
 * Runs on mount AND on hashchange. Mount covers arriving from elsewhere,
 * including the redirect SettingsTabs performs for the eleven old
 * /dashboard/settings#… anchors. hashchange covers moving between cards once
 * you are here.
 *
 * `name` makes the cards an exclusive accordion, so opening one closes the rest
 * — which means a second deep link cannot leave two open at once either.
 */
export default function OpenAnchoredCard() {
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (!id) return;
      // The element exists immediately, but a smooth scroll issued in the same
      // frame as opening a <details> lands at the collapsed height. One frame is
      // enough for layout to settle at the open height.
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el instanceof HTMLDetailsElement) el.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  return null;
}
