'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The hero's product slider.
 *
 * These are REAL SCREENSHOTS of the running app, not a drawing of a dashboard.
 * The previous hero was a stack of divs shaped like a product, which is exactly
 * what the site audit meant by "show the actual product, not only a stylized
 * representation".
 *
 * THE PIPELINE. Sources live in assets/product-shots/*.png and are normalised
 * onto one 1600x1000 canvas by scripts/prepare-hero-shots.mjs — they arrive at
 * anything from 1.51 to 2.08 aspect and the slider cross-fades between them
 * inside a single fixed frame, so they have to agree on a shape first.
 *
 * TO SWAP OR ADD ONE: drop a PNG into assets/product-shots/, run the script,
 * and add a line to SHOTS below. The tabs, the labels, the timer and the
 * announcements all read off this array; the frame's aspect ratio lives in
 * .showcase-frame and must match the script's canvas.
 */

const SHOTS = [
  {
    src: '/product/insights.webp',
    label: 'Insights',
    alt: 'The Insights screen: what you kept over the last 90 days, revenue against costs, cash position and how long invoices have been owed.',
  },
  {
    src: '/product/jobs.webp',
    label: 'Jobs',
    alt: 'The Jobs screen: the whole pipeline with each job’s stage, customer, value and schedule, and one job opened beside it.',
  },
  {
    src: '/product/website.webp',
    label: 'Website',
    alt: 'The website builder: the sections of your site on the left and a live preview of the published page on the right.',
  },
];

const DWELL = 5200;

export default function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % SHOTS.length) + SHOTS.length) % SHOTS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    // Nothing rotates while the hero is off screen — this sits at the top of a
    // very long page and a timer running for the whole scroll is work nobody
    // sees.
    let visible = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { timer ??= setInterval(() => setIndex((i) => (i + 1) % SHOTS.length), DWELL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };

    let io: IntersectionObserver | undefined;
    if (frameRef.current && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0.2 });
      io.observe(frameRef.current);
    } else {
      start();
    }

    const onVisibility = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => { stop(); io?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [paused]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') { go(index + 1); setPaused(true); }
    if (event.key === 'ArrowLeft') { go(index - 1); setPaused(true); }
  };

  return (
    <div
      className="hero-showcase"
      ref={frameRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="showcase-frame">
        {SHOTS.map((shot, i) => (
          <Image
            key={shot.src}
            className="showcase-shot"
            src={shot.src}
            alt={shot.alt}
            width={1600}
            height={1000}
            /* The first is the hero image and is very likely the LCP element,
               so it is eager and high priority; the others are only ever
               seen after a 5-second dwell. */
            priority={i === 0}
            loading={i === 0 ? undefined : 'lazy'}
            sizes="(max-width: 980px) 92vw, 52vw"
            data-on={i === index ? 'true' : 'false'}
            aria-hidden={i === index ? undefined : 'true'}
          />
        ))}
      </div>

      {/* A tablist rather than dots-with-no-name: each screen has a name, and
          the name is the useful part — it says what else is in here. */}
      <div
        className="showcase-tabs"
        role="tablist"
        aria-label="Product screens"
        onKeyDown={onKeyDown}
      >
        {SHOTS.map((shot, i) => (
          <button
            key={shot.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            tabIndex={i === index ? 0 : -1}
            onClick={() => { go(i); setPaused(true); }}
            data-on={i === index ? 'true' : 'false'}
          >
            <i aria-hidden="true"><s style={{ animationDuration: `${DWELL}ms` }} /></i>
            {shot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
