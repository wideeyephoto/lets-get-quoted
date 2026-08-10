'use client';

import { useEffect, useState } from 'react';

/**
 * THE PAGE'S OWN THREE STOPS.
 *
 * The site header is the site's navigation and it stays exactly as it is on
 * every other marketing page. This is the page's, and it carries the three
 * anchors the brief names — Opportunities, Text alerts, What happens next —
 * so the header never has to grow a second, page-specific set of links.
 *
 * Anchors, so it works with the script off; the only thing the script adds is
 * which one you are currently reading.
 */

export type NavSection = { id: string; label: string };

export default function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!nodes.length || !('IntersectionObserver' in window)) return;

    // A band across the middle of the viewport: whichever section occupies it
    // is the one being read. Watching the top edge flips the label a section
    // early on a tall screen.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav className="hiq-nav" aria-label="On this page">
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} aria-current={section.id === active ? 'true' : undefined}>
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
