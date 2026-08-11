/**
 * The geometry behind the five trade objects that circle the homepage hero.
 *
 * Pure, no DOM: the component measures boxes and writes transforms, and every
 * decision about WHERE something goes is made here, where it can be tested.
 *
 * ------------------------------------------------------------------------
 * THE SHAPE, AND WHY IT IS THIS ONE
 *
 * Three earlier attempts and what each one taught:
 *
 *   1. An ellipse drawn AROUND the copy, missing it entirely. Impossible.
 *      Containing a rectangle means clearing its corners, so centerd on the
 *      copy at 1440 the semi-axes come to 374 x 326 — which then has to shift
 *      right to stay on screen, which pushes the far corner out, which needs a
 *      wider ellipse: 374 -> 413 -> 443 -> ... it diverges.
 *   2. An ellipse that stayed clear of the copy by FADING as it approached.
 *      It worked, and it was the wrong answer: the objects blinked out every
 *      time they went behind the headline.
 *   3. An ellipse pinned into the hero's two empty horizontal bands. Visible,
 *      but it forced the objects down to 68% of their size to fit a 99px band.
 *
 * What it is now: a wide ellipse that runs OFF the left edge of the page and
 * comes back down the gutter between the copy and the product screenshot. The
 * objects never fade — they pass behind the headline and the buttons, because
 * the layer is below them in the stacking order, and that is the whole
 * mechanism. Nothing is hidden, so nothing has to be shrunk to fit a gap.
 * ------------------------------------------------------------------------
 */

/** One lap. Exact, and the reason the angle comes from elapsed time. */
export const ORBIT_LAP_MS = 68_000;

/**
 * How far past the left edge the path reaches, as a fraction of the section.
 *
 * The objects genuinely leave the page here rather than stopping at the edge —
 * an orbit whose left arc hugs the viewport reads as a container, and one that
 * runs off it reads as something passing through.
 */
export const ORBIT_RUN_OFF = 0.18;

/** Where the right arc sits when the copy and the product are not side by side. */
const STACKED_RIGHT_GAP = 8;

/** Constant. The objects are drawn at this from the first frame to the last. */
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

/** Breathing room between an object and the header or the section floor. */
const CLEAR = 6;

export type OrbitLayout = {
  /** The hero section's own box. */
  section: { width: number; height: number };
  /** The copy column, in the section's coordinates. */
  copy: Rect;
  /**
   * The gap between the copy and the product screenshot, when they sit side by
   * side. Zero on a stacked hero, where there is no gutter to aim at.
   */
  gutter: number;
  /** The fixed site header covers the top of the section; the path starts below it. */
  headerHeight: number;
  /** The largest object, because any object can be at any point on the path. */
  maxIcon: { w: number; h: number };
};

/**
 * The path.
 *
 * Two things fix it horizontally, and they are the two things the shape is
 * meant to say:
 *
 *   - the LEFT arc is off the page, ORBIT_RUN_OFF of the section's width past
 *     the edge, so objects leave and come back rather than turning around
 *   - the RIGHT arc lands in the gutter between the copy and the product
 *     screenshot. Down a stacked hero there is no gutter, so it sits just past
 *     the copy's right edge instead — the same relationship, minus the column.
 *
 * Vertically it is as tall as the visible section allows: centerd on the copy,
 * with the top arc clearing the fixed header and the bottom arc inside the
 * section. Nothing here is clamped to a band, because nothing fades any more —
 * an object over the headline is simply behind it.
 */
export function orbitGeometry(layout: OrbitLayout, scale = 1): OrbitGeometry {
  const { section, copy, gutter, headerHeight, maxIcon } = layout;
  const halfH = (maxIcon.h * scale) / 2;

  const right = copy.x + copy.width + (gutter > 0 ? gutter / 2 : STACKED_RIGHT_GAP);
  const left = -section.width * ORBIT_RUN_OFF;

  const cy = copy.y + copy.height / 2;
  return {
    cx: (right + left) / 2,
    cy,
    rx: Math.max((right - left) / 2, 1),
    ry: Math.max(Math.min(cy - headerHeight - halfH - CLEAR, section.height - cy - halfH - CLEAR), 1),
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

/** The object's box, centerd on a point. */
export function iconBox(center: { x: number; y: number }, icon: { w: number; h: number }, scale = 1): Rect {
  const width = icon.w * scale;
  const height = icon.h * scale;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}
