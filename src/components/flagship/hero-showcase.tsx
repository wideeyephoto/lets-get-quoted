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
 * THE PIPELINE. Sources live in assets/product-shots/ and are normalised onto
 * one 1600x1000 canvas by scripts/prepare-hero-shots.mjs — the slider
 * cross-fades between them inside a single fixed frame, so they have to agree
 * on a shape first. The current set is already 1600x1000, so nothing is being
 * scaled or cropped to make that true; capture at 16:10 and it stays that way.
 *
 * TO SWAP OR ADD ONE: drop an image into assets/product-shots/, run the script,
 * and add a line to SHOTS below. The tabs, the labels, the timer and the
 * announcements all read off this array; the frame's aspect ratio lives in
 * .showcase-frame and must match the script's canvas.
 */

/**
 * `focus` is the horizontal object-position used on a phone, where the frame
 * turns portrait and shows an 800px-wide window of the 1600px shot rather than
 * shrinking the whole screen to something unreadable. It is per shot because
 * one value provably cannot serve all three — the app sidebar is ~270px wide
 * and the website builder's control panel is ~600px, so an offset that clears
 * the first lands mid-panel on the second and cuts every label in half. Each
 * value below is the one that clears its own left edge and no more; 46% on
 * Insights, for instance, already reads "UMMARY" and "utstanding invoices".
 *
 * It does nothing above the mobile breakpoint, where the frame and the images
 * are both 16:10 and cover crops nothing.
 */
const SHOTS = [
  {
    src: '/product/website.webp',
    label: 'Website',
    // Past the control panel entirely, onto the live preview: on a phone the
    // panel's labels are too small to read, while the previewed site is legible
    // and still obviously an editor — "Click any section or photo to edit it"
    // and the Edit header button both stay in frame.
    focus: '72%',
    alt: 'The website builder: a live, editable preview of the published page, with its headline, photo and instant-estimate form.',
  },
  {
    src: '/product/jobs.webp',
    label: 'Jobs',
    focus: '46%',
    alt: 'The Jobs screen: the whole pipeline filtered by stage, a queue showing each job’s customer, value and date, and a map of where the work is.',
  },
  {
    src: '/product/insights.webp',
    label: 'Insights',
    focus: '40%',
    alt: 'The Insights screen: what you kept over the last 90 days, revenue against costs, cash position and how long invoices have been owed.',
  },
];

const DWELL = 5200;

export default function HeroShowcase() {
  const [index, setIndex] = useState(0);
  // Paused by default on first viewport: shows one clean, stable hero product shot
  // without distracting auto-rotation. Users can click any tab dot to switch.
  const [paused, setPaused] = useState(true);
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
            style={{ objectPosition: `${shot.focus} 0` }}
            data-on={i === index ? 'true' : 'false'}
            aria-hidden={i === index ? undefined : 'true'}
          />
        ))}
      </div>

      {/* DOTS OVER THE FRAME, NOT NAMED BUTTONS UNDER IT.
          The names were doing real work — they said what else is in the product
          — but as a second row of controls beneath the screenshot they competed
          with the screenshot, which is the thing meant to be looked at. Each
          name survives as the button's accessible name and as its tooltip, so a
          screen reader still hears "Insights, tab, 1 of 3" and a mouse still
          gets the label; what is painted is a position indicator.

          Still a tablist, still keyboard-navigable, and each dot still sits in
          a 44px target — the dot is drawn inside the button, it is not the
          button. */}
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
            aria-label={shot.label}
            title={shot.label}
            tabIndex={i === index ? 0 : -1}
            onClick={() => { go(i); setPaused(true); }}
            data-on={i === index ? 'true' : 'false'}
          >
            <i aria-hidden="true"><s style={{ animationDuration: `${DWELL}ms` }} /></i>
          </button>
        ))}
      </div>
    </div>
  );
}
