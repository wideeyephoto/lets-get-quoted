/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef } from 'react';
import {
  ORBIT_LAP_MS,
  TRADE_ICONS,
  iconBox,
  orbitAngle,
  orbitFitScale,
  orbitGeometry,
  orbitOpacity,
  orbitPoint,
  type OrbitGeometry,
  type Rect,
} from '@/lib/trade-orbit';

/**
 * Five trade objects, circling the hero copy once every 68 seconds.
 *
 * The homepage's first screen said "Run your contracting business" in words and
 * nothing else in it said whose business. These do: a tape measure, a pipe
 * elbow, a paint brush, a strip of shingles and a square of turf, drifting
 * clockwise around the copy on a slightly elliptical path.
 *
 * WHAT THIS COMPONENT IS RESPONSIBLE FOR: measuring, and writing transforms.
 * Every decision about where an object goes and whether it is visible lives in
 * src/lib/trade-orbit.ts, where it is tested — including the reason the objects
 * fade rather than dodge, which is worth reading before changing the geometry.
 *
 * THE RULES IT KEEPS
 *   - transform only, never left/top, so nothing here can cause a layout or a
 *     paint outside its own composited layer
 *   - the angle comes from elapsed time, so the lap is exactly 68s at any frame
 *     rate, and pausing accumulates rather than restarting
 *   - paused while the hero is off screen, and while the tab is hidden
 *   - prefers-reduced-motion: placed once, and the loop never starts
 *   - decorative: aria-hidden, empty alt, no pointer events
 *   - absolutely positioned inside an existing box, so it cannot shift layout;
 *     and it starts at opacity 0 until the first measurement lands, so nothing
 *     is ever seen stacked at the origin
 */

/* The hero is two columns above 1100px and one below it (the generator's
   `@media (max-width: 1100px)` on .hero-split). One column means the copy is
   691-720px wide inside a 768-1100px section, and there is no room left to
   orbit in — see §102 in the generator, which hides the layer there. Matching
   the number here as well means the loop never starts on those widths either. */
const MIN_WIDTH = 1101;

/* Scale at MIN_WIDTH, reaching 1 at 1440. The stage, the objects and the fade
   band all take it, so the whole thing shrinks as one. */
const MIN_SCALE = 0.74;
const FULL_WIDTH = 1440;

/* Any object can be at any point on the path, so the clearances are sized for
   the biggest one on each axis — which is not the same object. */
const MAX_ICON = {
  w: Math.max(...TRADE_ICONS.map((i) => i.w)),
  h: Math.max(...TRADE_ICONS.map((i) => i.h)),
};

function scaleFor(width: number): number {
  const t = Math.min(1, Math.max(0, (width - MIN_WIDTH) / (FULL_WIDTH - MIN_WIDTH)));
  return MIN_SCALE + (1 - MIN_SCALE) * t;
}

/**
 * The boxes an object must not be drawn on, in the hero's own coordinates.
 *
 * The four things the brief named, and the buttons individually rather than
 * their row: the row's box is the full width of the copy column while the two
 * buttons together are about three quarters of it, and the empty quarter is
 * open space an object can cross.
 */
function readObstacles(section: HTMLElement): Rect[] {
  const base = section.getBoundingClientRect();
  const nodes = section.querySelectorAll<HTMLElement>(
    '.hero-copy h1, .hero-copy .hero-sub, .hero-copy .hero-actions .button, .hero-copy .hero-note',
  );
  const out: Rect[] = [];
  nodes.forEach((node) => {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return;
    out.push({ x: box.left - base.left, y: box.top - base.top, width: box.width, height: box.height });
  });
  return out;
}

export default function TradeOrbit() {
  const layerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const layer = layerRef.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;

    let geo: OrbitGeometry | null = null;
    let obstacles: Rect[] = [];
    let scale = 1;

    // Elapsed time that has already been counted, plus the moment the current
    // run began. Pausing folds the second into the first, so a resume picks the
    // orbit up exactly where it stopped instead of jumping.
    let accumulated = 0;
    let runningSince: number | null = null;
    let frame = 0;

    const wide = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    const draw = (elapsed: number) => {
      if (!geo) return;
      for (let i = 0; i < TRADE_ICONS.length; i += 1) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const icon = TRADE_ICONS[i];
        const centre = orbitPoint(orbitAngle(elapsed, i), geo);
        const box = iconBox(centre, icon, scale);
        el.style.transform = `translate3d(${box.x.toFixed(2)}px, ${box.y.toFixed(2)}px, 0)`;
        el.style.opacity = String(orbitOpacity(box, obstacles));
      }
    };

    /**
     * The phase of the lap where the most of the five are in open space.
     *
     * At t=0 three of them start behind the copy and fade to nothing, so the
     * first painted frame had two tools in it — and under prefers-reduced-motion
     * that frame is the ONLY frame. Sixty samples of a 68-second lap, once per
     * measure, and the orbit opens on its fullest moment instead of its emptiest.
     */
    const fullestPhase = (): number => {
      if (!geo) return 0;
      let best = 0;
      let bestScore = -1;
      for (let s = 0; s < 60; s += 1) {
        const t = (s / 60) * ORBIT_LAP_MS;
        let score = 0;
        for (let i = 0; i < TRADE_ICONS.length; i += 1) {
          const box = iconBox(orbitPoint(orbitAngle(t, i), geo), TRADE_ICONS[i], scale);
          score += orbitOpacity(box, obstacles);
        }
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    };

    const measure = () => {
      const base = section.getBoundingClientRect();
      obstacles = readObstacles(section);
      const copyEl = section.querySelector<HTMLElement>('.hero-copy');
      const copyBox = copyEl?.getBoundingClientRect();
      // The header is fixed, so it is not in the section's box — but it covers
      // the top of it, and an object drawn up there is an object nobody sees.
      const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0;
      const layout = {
        section: { width: base.width, height: base.height },
        copy: copyBox
          ? { x: copyBox.left - base.left, y: copyBox.top - base.top, width: copyBox.width, height: copyBox.height }
          : { x: 0, y: base.height * 0.25, width: base.width * 0.4, height: base.height * 0.5 },
        headerHeight,
        maxIcon: MAX_ICON,
      };
      // Two limits, and the smaller wins: the taper across the desktop range,
      // and whatever actually fits between the header, the headline and the
      // bottom of the section.
      scale = Math.min(scaleFor(window.innerWidth), orbitFitScale(layout));
      geo = orbitGeometry(layout, scale);
      layer.style.setProperty('--orbit-scale', String(scale));
      const ring = ringRef.current;
      if (ring) {
        ring.style.width = `${geo.rx * 2}px`;
        ring.style.height = `${geo.ry * 2}px`;
        ring.style.transform = `translate3d(${geo.cx - geo.rx}px, ${geo.cy - geo.ry}px, 0)`;
      }
      draw(accumulated + (runningSince === null ? 0 : performance.now() - runningSince));
      layer.dataset.ready = 'true';
    };

    const tick = () => {
      if (runningSince === null) return;
      draw(accumulated + (performance.now() - runningSince));
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (runningSince !== null || still.matches || !wide.matches) return;
      runningSince = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (runningSince === null) return;
      accumulated += performance.now() - runningSince;
      runningSince = null;
      cancelAnimationFrame(frame);
    };

    measure();
    // Open on the fullest frame rather than on whatever t=0 happens to be. Done
    // after the first measure, because it needs the obstacle boxes.
    accumulated = fullestPhase();
    draw(accumulated);

    // Reduced motion still gets the objects — placed, lit, and completely
    // still. Turning them off would take the signal away from the people who
    // asked for less movement, not less content.

    const resize = new ResizeObserver(() => measure());
    resize.observe(section);

    // Off screen is most of the time on a page this long.
    let onScreen = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen && !document.hidden) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(section);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (onScreen) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // A width change can cross the breakpoint, and a system setting can change
    // under a running page.
    const onQuery = () => {
      if (still.matches || !wide.matches) {
        stop();
        draw(accumulated);
      } else if (onScreen && !document.hidden) {
        start();
      }
    };
    wide.addEventListener('change', onQuery);
    still.addEventListener('change', onQuery);

    return () => {
      stop();
      resize.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      wide.removeEventListener('change', onQuery);
      still.removeEventListener('change', onQuery);
    };
  }, []);

  return (
    <div className="trade-orbit" ref={layerRef} aria-hidden="true">
      {/* The path, drawn. A 1px ellipse at 15% orange — enough to say the
          objects are on a track rather than wandering. */}
      <i className="trade-orbit-ring" ref={ringRef} />
      {TRADE_ICONS.map((icon, index) => (
        <picture
          key={icon.slug}
          className="trade-orbit-item"
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          style={{ ['--w' as string]: icon.w, ['--h' as string]: icon.h }}
        >
          <source srcSet={`/trades/${icon.slug}.webp`} type="image/webp" />
          {/* Width and height are the intrinsic 2x dimensions, so the browser
              knows the ratio before the bytes land. alt is empty and the layer
              is aria-hidden: this is scenery, and naming five tools to a screen
              reader in the middle of the hero would be noise. */}
          <img
            src={`/trades/${icon.slug}.png`}
            alt=""
            width={icon.w * 2}
            height={icon.h * 2}
            decoding="async"
            fetchPriority="low"
          />
        </picture>
      ))}
    </div>
  );
}
