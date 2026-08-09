/**
 * The geometry behind the five trade objects that circle the homepage hero.
 *
 * Pure, no DOM: the component measures boxes and writes transforms, and every
 * decision about WHERE something goes is made here, where it can be tested.
 *
 * ------------------------------------------------------------------------
 * WHY THERE IS AN OPACITY FUNCTION IN A GEOMETRY MODULE
 *
 * The brief asked for two things that cannot both be true on this hero: an
 * ellipse around the hero copy, and no object ever crossing the headline,
 * paragraph, CTAs or proof line.
 *
 * Measured at 1440x900 — hero section 1440x760, copy text box x 72->586,
 * y 181->656. For the path to miss the copy entirely, the ellipse has to
 * CONTAIN that rectangle grown by half an object (328 x 285). An ellipse
 * contains a rectangle only if it clears the corners, so with the ellipse
 * centred on the copy the semi-axes come to 374 x 326 — and an ellipse that
 * wide has to shift right to stay on screen, which pushes the far corner
 * further out, which needs a wider ellipse again. Iterating: 374 -> 413 ->
 * 443 -> ... it diverges. There is no ellipse at 1440 that both contains the
 * copy and fits in the viewport, and the same holds at every narrower width
 * because the copy grows as the section shrinks.
 *
 * So the objects hold their orbit and DUCK instead: each one fades to nothing
 * as it approaches the text and comes back on the other side. Nothing is ever
 * drawn behind a word, which is what the criterion was protecting, and the
 * orbit keeps the size and shape it was specified with.
 * ------------------------------------------------------------------------
 */

/** One lap. Exact, and the reason the angle comes from elapsed time. */
export const ORBIT_LAP_MS = 68_000;

/** How far out from the text an object starts fading. */
export const ORBIT_FADE_PX = 70;

/** Opacity in open space. Below 1 so the objects read as depth, not as UI. */
export const ORBIT_MAX_OPACITY = 0.92;

const TAU = Math.PI * 2;

/**
 * The five objects, in orbit order.
 *
 * `w`/`h` are the real CSS sizes, and they are NOT the approved display boxes:
 * scripts/build-trade-icons.mjs trims each master's transparent padding, which
 * changes its aspect ratio, then fits the trimmed art inside its box. A pipe
 * approved at 82x82 is 62x82 once the art is what it is. Re-run that script and
 * paste its output here if the art ever changes.
 *
 * The order is the orbit order, not the file order — alternating tall and wide
 * so no two neighbours read as the same silhouette 72 degrees apart.
 */
export const TRADE_ICONS = [
  { slug: 'tape-measure-contractor', w: 120, h: 96 },
  { slug: 'plumber-pipe', w: 62, h: 82 },
  { slug: 'shingles', w: 142, h: 77 },
  { slug: 'paint-brush', w: 108, h: 128 },
  { slug: 'grass-lawncare', w: 126, h: 65 },
] as const;

export type TradeIcon = (typeof TRADE_ICONS)[number];

export type Rect = { x: number; y: number; width: number; height: number };
export type OrbitGeometry = { cx: number; cy: number; rx: number; ry: number };

/** How far the path stays back from the section's left and right edges. */
export const ORBIT_INSET = 24;

/** Breathing room between an object and the header, the copy or the section edge. */
const CLEAR = 6;

export type OrbitLayout = {
  /** The hero section's own box. */
  section: { width: number; height: number };
  /** The copy column, in the section's coordinates. */
  copy: Rect;
  /** The fixed site header covers the top of the section; the path starts below it. */
  headerHeight: number;
  /** The largest object, because any object can be at any point on the path. */
  maxIcon: { w: number; h: number };
  inset?: number;
};

/**
 * The largest the objects can be and still fit the hero's empty bands.
 *
 * Measured at 1440: the band between the fixed header and the headline is 99px
 * and the band below the proof line is 104px. The tallest object is a 128px
 * paint brush, so at full size it cannot be drawn in either — it would spend
 * the whole lap faded out or hidden under the header. The objects give way to
 * the space rather than the other way round.
 *
 * Returns a multiplier, never above 1: on a taller hero the objects are simply
 * their own size.
 */
export function orbitFitScale(layout: Pick<OrbitLayout, 'section' | 'copy' | 'headerHeight' | 'maxIcon'>): number {
  const above = layout.copy.y - layout.headerHeight;
  const below = layout.section.height - (layout.copy.y + layout.copy.height);
  const usable = Math.min(above, below) - CLEAR * 2;
  if (usable <= 0) return 0;
  return Math.min(1, usable / layout.maxIcon.h);
}

/**
 * The path, derived from where the hero is actually empty.
 *
 * THE STAGE IN THE BRIEF WAS A BOX AROUND THE COPY — 780x560 at left 10 / top 26,
 * radii at 44% and 42%. Built and measured, it does not work, and the screenshots
 * say why: a 1440x760 hero has its copy down the left and a product screenshot
 * down the right, and the only genuinely empty space is two horizontal bands —
 * y 82->181 between the fixed header and the top of the headline, and
 * y 656->760 below the proof line. An ellipse drawn around the copy puts its top
 * arc under the header and its bottom arc inside the CTA row, so the objects
 * spent the lap either clipped or faded to nothing. 48% of samples were visible
 * and almost none of them were somewhere you could see.
 *
 * So the path spans the hero rather than the copy, and its vertical radius is
 * whatever puts the top arc in the upper band and the bottom arc in the lower
 * one. Every other approved setting is untouched: 68 seconds, clockwise, linear,
 * five objects 72 degrees apart, upright, guide ring, fade rather than dodge.
 *
 * Everything here comes from measurement, so it re-derives at every width
 * instead of being tuned at 1440 and hoping.
 */
export function orbitGeometry(layout: OrbitLayout, scale = 1): OrbitGeometry {
  const { section, copy, headerHeight, maxIcon } = layout;
  const inset = layout.inset ?? ORBIT_INSET;
  const halfH = (maxIcon.h * scale) / 2;

  // The band above the copy: the object's top clears the header, its bottom
  // clears the headline. Centre of that band, clamped so it stays a band.
  const topLow = headerHeight + halfH + CLEAR;
  const topHigh = copy.y - halfH - CLEAR;
  const yTop = topHigh > topLow ? (topLow + topHigh) / 2 : Math.max(topLow, halfH + CLEAR);

  // The band below it: clear of the proof line, inside the section.
  const bottomLow = copy.y + copy.height + halfH + CLEAR;
  const bottomHigh = section.height - halfH - CLEAR;
  const yBottom = bottomHigh > bottomLow ? (bottomLow + bottomHigh) / 2 : Math.max(bottomLow, yTop + 2 * halfH);

  const rx = Math.max(section.width / 2 - inset, halfH);
  return {
    cx: section.width / 2,
    cy: (yTop + yBottom) / 2,
    rx,
    ry: Math.max((yBottom - yTop) / 2, 1),
  };
}

/**
 * Where object `index` is, `elapsedMs` into the animation.
 *
 * From elapsed time rather than accumulated per frame, so the lap is exactly
 * 68s whatever the frame rate does, and so pausing and resuming cannot drift.
 * Objects are `count` equal steps apart — five is 72 degrees.
 */
export function orbitAngle(elapsedMs: number, index: number, count = TRADE_ICONS.length): number {
  const theta = (elapsedMs / ORBIT_LAP_MS + index / count) * TAU;
  // Normalised so two angles a whole lap apart compare equal.
  return ((theta % TAU) + TAU) % TAU;
}

/**
 * Screen coordinates for an angle.
 *
 * theta = 0 is the top of the ellipse, and increasing theta moves right and
 * then down — clockwise, in a coordinate system whose y grows downward.
 */
export function orbitPoint(theta: number, geo: OrbitGeometry): { x: number; y: number } {
  return {
    x: geo.cx + geo.rx * Math.sin(theta),
    y: geo.cy - geo.ry * Math.cos(theta),
  };
}

/** The object's box, centred on a point. */
export function iconBox(centre: { x: number; y: number }, icon: { w: number; h: number }, scale = 1): Rect {
  const width = icon.w * scale;
  const height = icon.h * scale;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

/**
 * How far `box` is from the nearest edge of `other`.
 *
 * Positive is a gap, zero is touching, negative is overlapping (and the value
 * is how deep). Two boxes are separated if they are separated on EITHER axis,
 * which is why this is the larger of the two axis gaps.
 */
export function boxGap(box: Rect, other: Rect): number {
  const gapX = Math.max(other.x - (box.x + box.width), box.x - (other.x + other.width));
  const gapY = Math.max(other.y - (box.y + box.height), box.y - (other.y + other.height));
  return Math.max(gapX, gapY);
}

/** The tightest gap between `box` and anything it has to stay off. */
export function clearance(box: Rect, obstacles: Rect[]): number {
  if (!obstacles.length) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const other of obstacles) {
    const gap = boxGap(box, other);
    if (gap < min) min = gap;
  }
  return min;
}

/**
 * Nothing is drawn over a word, and nothing pops as it gets there.
 *
 * Full strength in open space, fading to zero across the last ORBIT_FADE_PX of
 * approach, so an object is already invisible by the time its box touches the
 * text rather than blinking out on contact.
 */
export function orbitOpacity(box: Rect, obstacles: Rect[], fade = ORBIT_FADE_PX): number {
  const gap = clearance(box, obstacles);
  if (!Number.isFinite(gap)) return ORBIT_MAX_OPACITY;
  if (gap <= 0) return 0;
  if (gap >= fade) return ORBIT_MAX_OPACITY;
  return (gap / fade) * ORBIT_MAX_OPACITY;
}
