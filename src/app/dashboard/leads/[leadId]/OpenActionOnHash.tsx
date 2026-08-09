'use client';

import { useEffect } from 'react';

/**
 * Makes the action deck's buttons still work now that they point at accordions.
 *
 * "Schedule estimate", "Skip to quote" and "Review scheduled estimate" are all
 * plain <a href="#..."> links to the two panels below them. Once those panels
 * became a <details> pair, half of those clicks landed on a closed one: the
 * page scrolled to a collapsed header and nothing opened, which reads as a dead
 * button.
 *
 * Browsers do expand a closed <details> when you navigate to a fragment INSIDE
 * it, but that is not this case — here the id is on the <details> itself, which
 * is never the hidden element, so nothing triggers.
 *
 * Two listeners, because one is not enough:
 *   - hashchange, for arriving from a different fragment or another page
 *   - click, because a link to the fragment you are ALREADY on fires no
 *     hashchange at all. Close the quote by hand, press "Skip to quote", and
 *     without this nothing happens.
 *
 * Setting `.open` is all that is needed to close the other half: the exclusive
 * group runs off the attribute changing, not off the click that changed it.
 */
export default function OpenActionOnHash() {
  useEffect(() => {
    const open = (id: string) => {
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
    };

    const onHash = () => open(decodeURIComponent(window.location.hash.slice(1)));

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a[href*="#"]');
      const href = link?.getAttribute('href');
      // Same-document fragments only — never touch a link that leaves the page.
      if (!href || !href.startsWith('#')) return;
      open(decodeURIComponent(href.slice(1)));
    };

    onHash();
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return null;
}
