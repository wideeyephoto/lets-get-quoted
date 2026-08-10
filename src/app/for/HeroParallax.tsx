'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * THE HERO SHOT, MOVING AT A DIFFERENT RATE FROM THE PAGE UNDER IT.
 *
 * The drift on .heroShot is ambient — it runs whether or not anybody touches
 * anything, and it is deliberately small. This is the other half: while you
 * scroll, the shot lags the column beside it, which is the thing that actually
 * reads as depth. Two layers moving together are one flat layer.
 *
 * WHAT IT WRITES, AND WHY IT IS SAFE TO COMPOSE. This element only ever gets a
 * translate on Y. The keyframe drift lives on the <img> INSIDE it, so the two
 * transforms multiply through the tree instead of overwriting each other —
 * which is what would happen if both were set on one element, and is the usual
 * reason a hand-rolled parallax kills whatever animation was there first.
 *
 * THE RULES IT KEEPS, all of them the same ones trade-orbit.tsx keeps:
 *   - transform only, so nothing here can cause a layout or a paint
 *   - one rAF in flight at a time; scroll fires far faster than frames do
 *   - nothing runs while the hero is off screen
 *   - prefers-reduced-motion: never starts, and the element is left at zero
 *   - the shot is still fully visible with JS off — this only ever offsets it
 */

/**
 * How far the shot lags the page across its WHOLE travel, in pixels.
 *
 * You never see all of it here. This hero sits at the top of the page, so it
 * starts life already halfway through the curve and leaves the viewport around
 * 0.8 — about a third of the range, or ~32px of actual movement. Sized against
 * that measured third rather than against the number, because a range tuned to
 * look right on an element that crosses the full viewport is a third as strong
 * on one that starts at the top and is the reason the first pass read as
 * nothing happening.
 */
const RANGE = 96;

export default function HeroParallax({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let onScreen = true;

    const draw = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      /**
       * Progress of the element across the viewport, 0 when its top is at the
       * bottom of the screen and 1 when its bottom is at the top. Measured
       * from the box rather than from scrollY so it does not need to know
       * where on the page it sits, or care if something above it resizes.
       */
      const span = window.innerHeight + box.height;
      const progress = span > 0 ? (window.innerHeight - box.top) / span : 0;
      // Centred on 0, so the resting position at mid-screen is the authored
      // one and the shot is never offset from where the layout put it.
      const offset = (Math.min(1, Math.max(0, progress)) - 0.5) * RANGE;
      el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };

    // Scroll events outrun frames by a wide margin; coalescing to one rAF is
    // the difference between drawing once per frame and drawing five times.
    const request = () => {
      if (frame || !onScreen || still.matches) return;
      frame = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) request();
      },
      { threshold: 0 },
    );
    io.observe(el);

    const onQuery = () => {
      if (still.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        el.style.transform = '';
      } else {
        request();
      }
    };
    still.addEventListener('change', onQuery);

    if (!still.matches) draw();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      still.removeEventListener('change', onQuery);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, []);

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
