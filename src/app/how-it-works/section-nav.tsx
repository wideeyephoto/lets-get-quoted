'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './how-it-works.module.css';

/**
 * Page-level anchors keep the full workflow easy to scan without adding more
 * links to the shared marketing header. The anchors work without JavaScript;
 * the observer only highlights and centers the section currently being read.
 */

export type NavSection = { id: string; label: string };

export default function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState<string | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

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

  useEffect(() => {
    if (!active) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    linkRefs.current[active]?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [active]);

  return (
    <nav className={styles.sectionNav} aria-label="On this page">
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              ref={(node) => {
                linkRefs.current[section.id] = node;
              }}
              href={`#${section.id}`}
              aria-current={section.id === active ? 'location' : undefined}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
