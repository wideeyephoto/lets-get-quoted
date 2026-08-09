/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef } from 'react';
import {
  TRADE_ICONS,
  iconBox,
  orbitAngle,
  orbitGeometry,
  orbitPoint,
  type OrbitGeometry,
} from '@/lib/trade-orbit';

/**
 * Five trade objects, circling the hero copy once every 68 seconds.
 *
 * The homepage's first screen said "Run your contracting business" in words and
 * nothing else in it said whose business. These do: a tape measure, a pipe
 * elbow, a paint brush, a strip of shingles and a square of turf, travelling
 * clockwise on a wide ellipse that leaves the page on the left and comes back
 * down the gutter beside the copy.
 *
 * WHAT THIS COMPONENT IS RESPONSIBLE FOR: measuring, and writing transforms.
 * Every decision about where an object goes lives in src/lib/trade-orbit.ts,
 * where it is tested — including the three shapes this one is not, which is
 * worth reading before changing the geometry.
 *
 * THE RULES IT KEEPS
 *   - transform only, never left/top and never opacity, so nothing here can
 *     cause a layout or a paint outside its own composited layer
 *   - the angle comes from elapsed time, so the lap is exactly 68s at any frame
 *     rate, and pausing accumulates rather than restarting
 *   - paused while the hero is off screen, and while the tab is hidden
 *   - prefers-reduced-motion: placed once, and the loop never starts
 *   - decorative: aria-hidden, empty alt, no pointer events
 *   - absolutely positioned inside an existing box, so it cannot shift layout;
 *     and it starts at opacity 0 until the first measurement lands, so nothing
 *     is ever seen stacked at the origin
 */

/* The orbit runs at every width now, phones included, so the taper covers the
   whole range rather than the desktop end of it: full size at 1440, down to
   MIN_SCALE on a 390px phone. A 128px paint brush on a 390px screen would be a
   third of the width of the device. */
const MIN_WIDTH = 390;
const MIN_SCALE = 0.46;
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
 * The gap between the copy column and the product screenshot.
 *
 * The right arc of the orbit aims at the middle of it. Zero when the two are
 * stacked rather than side by side — below 1100px the product sits under the
 * copy, and a "gutter" measured between them would be the vertical gap, which
 * is not the number this wants.
 */
function gutterWidth(section: HTMLElement): number {
  const copy = section.querySelector('.hero-copy')?.getBoundingClientRect();
  const product = section.querySelector('.hero-product')?.getBoundingClientRect();
  if (!copy || !product) return 0;
  const gap = product.left - copy.right;
  return gap > 8 ? gap : 0;
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
    let scale = 1;

    // Elapsed time that has already been counted, plus the moment the current
    // run began. Pausing folds the second into the first, so a resume picks the
    // orbit up exactly where it stopped instead of jumping.
    let accumulated = 0;
    let runningSince: number | null = null;
    let frame = 0;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Transform, and nothing else. The objects used to fade as they approached
    // the headline; they do not any more — they pass behind it, which is what
    // the z-index:-1 layer was always for, and the loop is one property lighter.
    const draw = (elapsed: number) => {
      if (!geo) return;
      for (let i = 0; i < TRADE_ICONS.length; i += 1) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const box = iconBox(orbitPoint(orbitAngle(elapsed, i), geo), TRADE_ICONS[i], scale);
        el.style.transform = `translate3d(${box.x.toFixed(2)}px, ${box.y.toFixed(2)}px, 0)`;
      }
    };

    const measure = () => {
      const base = section.getBoundingClientRect();
      const copyBox = section.querySelector('.hero-copy')?.getBoundingClientRect();
      // The header is fixed, so it is not in the section's box — but it covers
      // the top of it, and an object drawn up there is an object nobody sees.
      const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0;
      scale = scaleFor(window.innerWidth);
      geo = orbitGeometry(
        {
          section: { width: base.width, height: base.height },
          copy: copyBox
            ? { x: copyBox.left - base.left, y: copyBox.top - base.top, width: copyBox.width, height: copyBox.height }
            : { x: 0, y: base.height * 0.25, width: base.width * 0.4, height: base.height * 0.5 },
          gutter: gutterWidth(section),
          headerHeight,
          maxIcon: MAX_ICON,
        },
        scale,
      );
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
      if (runningSince !== null || still.matches) return;
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

    // Reduced motion still gets the objects — placed, lit, and completely
    // still. Turning them off would take the signal away from the people who
    // asked for less movement, not less content.
    if (still.matches) draw(0);

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

    // A system setting can change under a running page.
    const onQuery = () => {
      if (still.matches) {
        stop();
        draw(accumulated);
      } else if (onScreen && !document.hidden) {
        start();
      }
    };
    still.addEventListener('change', onQuery);

    return () => {
      stop();
      resize.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
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
              knows the ratio before the bytes arrive. alt is empty and the layer
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
