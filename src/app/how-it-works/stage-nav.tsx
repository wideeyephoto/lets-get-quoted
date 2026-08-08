'use client';

import { useEffect, useState } from 'react';

/**
 * The five-stage progress bar that follows you down the page.
 *
 * Replaces a static list of links in the hero. Five long sections with no
 * persistent sense of place is the part of a journey page that most often gets
 * read as documentation — you lose track of which stage you are in and how many
 * are left, and every section starts to look the same.
 *
 * It is a nav of anchors, so it works with JavaScript off; the only thing the
 * script adds is which one is current.
 */
export default function StageNav({ stages }: { stages: { number: string; title: string }[] }) {
  const [active, setActive] = useState(stages[0]?.number ?? '01');

  useEffect(() => {
    const sections = stages
      .map((s) => document.getElementById(`stage-${s.number}`))
      .filter((el): el is HTMLElement => !!el);
    if (!sections.length || !('IntersectionObserver' in window)) return;

    // A band across the middle of the viewport: whichever stage occupies it is
    // the one being read. Watching the top edge instead makes the label flip a
    // section early on a tall screen.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace('stage-', ''));
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [stages]);

  const index = stages.findIndex((s) => s.number === active);

  return (
    <nav className="hiw-stagenav" aria-label="Stages">
      <span className="hiw-stagenav-fill" aria-hidden="true"
        style={{ transform: `scaleX(${(index + 1) / stages.length})` }} />
      <ol>
        {stages.map((stage) => (
          <li key={stage.number}>
            <a
              href={`#stage-${stage.number}`}
              aria-current={stage.number === active ? 'true' : undefined}
            >
              <small>{stage.number}</small>
              <span>{stage.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
