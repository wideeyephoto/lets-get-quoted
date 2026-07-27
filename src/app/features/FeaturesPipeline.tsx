'use client';

import { useEffect, useRef, useState } from 'react';

// Serializable shape the server page hands us (a plain slice of FEATURE_CATEGORIES).
type PipelineFeature = { id: string; name: string; desc: string; favorite?: boolean };
type PipelineStation = {
  num: string;
  slug: string;
  title: string;
  intro: string;
  features: PipelineFeature[];
};

// Small stroke-icon set, keyed by category slug. Rendered here (not passed from
// the server) because JSX can't cross the server/client props boundary.
function stationIcon(slug: string) {
  const paths: Record<string, JSX.Element> = {
    website: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
      </>
    ),
    'getting-found': (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    leads: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 12h.01" />
      </>
    ),
    quotes: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),
    scheduling: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
        <path d="m9 15 2 2 4-4" />
      </>
    ),
    jobs: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.2-.6-.6-2.2z" />
      </>
    ),
    recurring: (
      <>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    clients: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5.6a3 3 0 0 1 0 5.8" />
        <path d="M15 14.4a6 6 0 0 1 4 5.6" />
      </>
    ),
    reviews: (
      <>
        <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </>
    ),
    marketing: (
      <>
        <path d="m3 11 15-6v14L3 13z" />
        <path d="M3 11v2a2 2 0 0 0 2 2h1" />
        <path d="M8 15v3a2 2 0 0 0 4 0v-1.2" />
      </>
    ),
    insights: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 16v-5" />
        <path d="M12 16V8" />
        <path d="M17 16v-8" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[slug] ?? paths.website}
    </svg>
  );
}

export default function FeaturesPipeline({ stations }: { stations: PipelineStation[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [anim, setAnim] = useState(false);
  const [progress, setProgress] = useState(1); // spine fill, 0..1 (starts full for no-JS/reduced-motion)
  const [visible, setVisible] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      // Show the finished state, no motion.
      setProgress(1);
      setVisible(new Set(stations.map((_, i) => i)));
      return;
    }

    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-station]'));

    // Seed the reveal set with any station already on screen so above-the-fold
    // panels never flash from hidden -> shown when the animation turns on.
    const vh = window.innerHeight || 800;
    const seed = new Set<number>();
    items.forEach((el) => {
      if (el.getBoundingClientRect().top < vh * 0.92) seed.add(Number(el.dataset.station));
    });
    setVisible(seed);
    setAnim(true);
    setProgress(0);

    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            if (entry.isIntersecting) next.add(Number((entry.target as HTMLElement).dataset.station));
          }
          return next;
        });
      },
      { rootMargin: '0px 0px -16% 0px', threshold: 0.15 },
    );
    items.forEach((el) => io.observe(el));

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        const anchor = (window.innerHeight || 800) * 0.5;
        const p = (anchor - rect.top) / Math.max(rect.height, 1);
        setProgress(Math.max(0, Math.min(1, p)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [stations]);

  return (
    <div className={`fx-pipeline${anim ? ' fx-anim' : ''}`} ref={rootRef}>
      <div className="fx-spine" aria-hidden="true">
        <span className="fx-spine-track" />
        <span className="fx-spine-fill" style={{ transform: `scaleY(${progress})` }} />
      </div>

      <ol className="fx-stations">
        {stations.map((station, i) => (
          <li
            key={station.slug}
            id={station.slug}
            data-station={i}
            className={`fx-station ${i % 2 === 0 ? 'fx-station--left' : 'fx-station--right'}${
              visible.has(i) ? ' is-visible' : ''
            }`}
          >
            <div className="fx-node" aria-hidden="true">
              <span className="fx-node-ring" />
              <span className="fx-node-num">{station.num}</span>
            </div>

            <article className="fx-panel">
              <header className="fx-panel-head">
                <span className="fx-panel-ic" aria-hidden="true">
                  {stationIcon(station.slug)}
                </span>
                <div className="fx-panel-titles">
                  <p className="fx-panel-eyebrow">Stage {station.num} of 12</p>
                  <h3>{station.title}</h3>
                </div>
              </header>
              <p className="fx-panel-intro">{station.intro}</p>
              <ul className="fx-checklist">
                {station.features.map((feature) => (
                  <li key={feature.id} className={feature.favorite ? 'is-fav' : undefined}>
                    <span className="fx-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 4.5 4.5L19 7" />
                      </svg>
                    </span>
                    <span className="fx-feat">
                      <b className="fx-feat-name">
                        {feature.name}
                        {feature.favorite ? (
                          <span className="fx-fav-star" role="img" aria-label="Contractor favorite">
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                            </svg>
                          </span>
                        ) : null}
                      </b>
                      <span className="fx-feat-desc">{feature.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
