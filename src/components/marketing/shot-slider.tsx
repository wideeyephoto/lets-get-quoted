/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A small slider of REAL product screenshots, for a feature page's hero.
 *
 * WHY NOT HeroShowcase. The homepage's slider fits every shot to one
 * 1600x1000 canvas and crops with `cover`, which works because those three are
 * flat, full-window captures normalised by scripts/prepare-hero-shots.mjs. A
 * feature page's set is whatever exists for that feature, and it will not all
 * be one shape — /features/back-office pairs a flat capture of the quote
 * builder with a transparent monitor render. Cropping the second to 16:10
 * takes the corners off the monitor.
 *
 * So every shot is CONTAINED here, not covered, on a ground the colour of the
 * app's own chrome. Nothing is cut off, the two agree on a frame without
 * agreeing on a shape, and a transparent PNG sits on a surface rather than on
 * whatever the section behind it happens to be.
 *
 * Everything else follows the homepage slider on purpose, because it is the
 * behaviour people have already met once on this site: five-second dwell, dots
 * over the frame rather than a second row of controls under it, arrow keys,
 * pause on hover or on any manual choice, nothing rotating while the frame is
 * off screen or the tab is hidden, and no rotation at all under
 * prefers-reduced-motion.
 */

export type Shot = {
  src: string;
  /** The screen's name. The dot's accessible name and its tooltip. */
  label: string;
  /** What is actually on the screen, for somebody who cannot see it. */
  alt: string;
  width: number;
  height: number;
  /**
   * THE SAME SCREEN, CAPTURED ON A PHONE.
   *
   * A desktop capture shrunk into a 358px column is a picture of software
   * rather than a readable screen — the quote builder's line items come out
   * about four pixels tall. Where a phone capture of the same screen exists,
   * the frame turns portrait below 700px and serves it instead. Art direction,
   * so it is a <picture> and not a srcset: these are different photographs of
   * the same thing, not two sizes of one.
   */
  mobile?: { src: string; width: number; height: number };
};

const DWELL = 5200;

export default function ShotSlider({
  shots,
  label,
}: {
  shots: Shot[];
  /** Names the set, e.g. "Quote and insights screens". */
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => setIndex(((next % shots.length) + shots.length) % shots.length),
    [shots.length],
  );

  useEffect(() => {
    if (paused || shots.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

    let visible = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer ??= setInterval(() => setIndex((i) => (i + 1) % shots.length), DWELL);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    let io: IntersectionObserver | undefined;
    if (frameRef.current && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        },
        { threshold: 0.2 },
      );
      io.observe(frameRef.current);
    } else {
      start();
    }

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, shots.length]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      go(index + 1);
      setPaused(true);
    }
    if (event.key === 'ArrowLeft') {
      go(index - 1);
      setPaused(true);
    }
  };

  return (
    <div
      className="shot-slider"
      ref={frameRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="shot-frame">
        {shots.map((shot, i) => (
          <picture key={shot.src} className="shot-pic" data-on={i === index ? 'true' : 'false'}>
            {shot.mobile ? <source media="(max-width: 700px)" srcSet={shot.mobile.src} /> : null}
            <img
              className="shot-img"
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              /* The first is what the hero paints and is very likely the LCP
                 element; the rest are only ever seen after a five-second
                 dwell, and there is no point spending a connection on them
                 before the visitor has looked at the first. */
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'low'}
              decoding="async"
              aria-hidden={i === index ? undefined : 'true'}
            />
          </picture>
        ))}
      </div>

      {/* Dots over the frame. The names survive as each button's accessible
          name and tooltip, so a screen reader hears "Sending a quote, tab, 1 of
          2"; what is painted is a position indicator, because a second row of
          labelled controls competes with the screenshot it belongs to. The dot
          is drawn inside the button, so the target is still 44px. */}
      <div className="shot-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {shots.map((shot, i) => (
          <button
            key={shot.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={shot.label}
            title={shot.label}
            tabIndex={i === index ? 0 : -1}
            onClick={() => {
              go(i);
              setPaused(true);
            }}
            data-on={i === index ? 'true' : 'false'}
          >
            <i aria-hidden="true">
              <s style={{ animationDuration: `${DWELL}ms` }} />
            </i>
          </button>
        ))}
      </div>

      {/* The caption is the frame's, not each shot's — it names what the pair
          is showing rather than repeating the alt text of whichever is up. */}
      <p className="shot-caption">{shots[index]?.label}</p>
    </div>
  );
}
