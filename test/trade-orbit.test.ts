import { describe, it, expect } from 'vitest';
import {
  ORBIT_LAP_MS,
  ORBIT_MAX_OPACITY,
  ORBIT_FADE_PX,
  TRADE_ICONS,
  boxGap,
  clearance,
  iconBox,
  orbitAngle,
  orbitFitScale,
  orbitGeometry,
  orbitOpacity,
  orbitPoint,
  type Rect,
} from '@/lib/trade-orbit';

const TAU = Math.PI * 2;
const deg = (radians: number) => (radians * 180) / Math.PI;

describe('orbitAngle', () => {
  it('completes a lap in exactly 68 seconds', () => {
    expect(ORBIT_LAP_MS).toBe(68_000);
    for (let i = 0; i < TRADE_ICONS.length; i += 1) {
      expect(orbitAngle(ORBIT_LAP_MS, i)).toBeCloseTo(orbitAngle(0, i), 10);
    }
  });

  it('is not back at the start half way round', () => {
    expect(orbitAngle(ORBIT_LAP_MS / 2, 0)).not.toBeCloseTo(orbitAngle(0, 0), 4);
  });

  // Five objects, evenly spaced, and they stay that way — the spacing is baked
  // into the angle rather than into five separate start times, so there is
  // nothing to drift.
  it('holds the five objects 72 degrees apart at any moment', () => {
    for (const t of [0, 1, 137, 9_999, ORBIT_LAP_MS * 3.7]) {
      for (let i = 1; i < TRADE_ICONS.length; i += 1) {
        const gap = ((orbitAngle(t, i) - orbitAngle(t, i - 1) + TAU) % TAU);
        expect(deg(gap), `t=${t} between ${i - 1} and ${i}`).toBeCloseTo(72, 6);
      }
    }
  });

  it('normalises, so a lap later compares equal rather than merely equivalent', () => {
    const a = orbitAngle(12_345, 2);
    const b = orbitAngle(12_345 + ORBIT_LAP_MS * 4, 2);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(TAU);
    expect(b).toBeCloseTo(a, 8);
  });
});

describe('orbitPoint', () => {
  const geo = { cx: 400, cy: 300, rx: 340, ry: 230 };

  it('starts at the top of the ellipse', () => {
    const p = orbitPoint(0, geo);
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.y).toBeCloseTo(70, 6);
  });

  // Clockwise on a screen, whose y grows downward: right, then down, then left.
  it('runs clockwise', () => {
    const quarter = orbitPoint(TAU / 4, geo);
    const half = orbitPoint(TAU / 2, geo);
    const threeQuarter = orbitPoint((TAU * 3) / 4, geo);
    expect(quarter.x).toBeCloseTo(740, 6);
    expect(quarter.y).toBeCloseTo(300, 6);
    expect(half.y).toBeCloseTo(530, 6);
    expect(threeQuarter.x).toBeCloseTo(60, 6);
  });

  it('never leaves the ellipse', () => {
    for (let i = 0; i < 720; i += 1) {
      const theta = (i / 720) * TAU;
      const p = orbitPoint(theta, geo);
      const on = ((p.x - geo.cx) / geo.rx) ** 2 + ((p.y - geo.cy) / geo.ry) ** 2;
      expect(on).toBeCloseTo(1, 8);
    }
  });
});

/**
 * The path is derived from where the hero is empty, not from a box somebody
 * typed — see the note on orbitGeometry for why the original stage did not
 * survive being built. These are the boxes measured on the running page.
 */
const LAYOUT_1440 = {
  section: { width: 1440, height: 760 },
  copy: { x: 72, y: 181, width: 514, height: 475 },
  headerHeight: 82,
  maxIcon: { w: 142, h: 128 },
};

describe('orbitFitScale', () => {
  // 99px above the headline, 104px below the proof line, less 6px of clearance
  // each side — against a 128px paint brush.
  it('shrinks the objects to the smaller of the two bands', () => {
    expect(orbitFitScale(LAYOUT_1440)).toBeCloseTo((99 - 12) / 128, 6);
  });

  it('never enlarges them past their own size', () => {
    expect(orbitFitScale({ ...LAYOUT_1440, section: { width: 1440, height: 1600 }, headerHeight: 0 })).toBe(1);
  });

  it('returns zero rather than a negative when there is no band at all', () => {
    expect(orbitFitScale({ ...LAYOUT_1440, copy: { x: 0, y: 84, width: 500, height: 674 } })).toBe(0);
  });
});

describe('orbitGeometry', () => {
  const FIT = orbitFitScale(LAYOUT_1440);

  it('puts the top of the path between the header and the headline', () => {
    const geo = orbitGeometry(LAYOUT_1440, FIT);
    const halfH = (LAYOUT_1440.maxIcon.h * FIT) / 2;
    const top = geo.cy - geo.ry;
    expect(top - halfH).toBeGreaterThanOrEqual(LAYOUT_1440.headerHeight);
    expect(top + halfH).toBeLessThanOrEqual(LAYOUT_1440.copy.y);
  });

  it('puts the bottom of the path below the copy and inside the section', () => {
    const geo = orbitGeometry(LAYOUT_1440, FIT);
    const halfH = (LAYOUT_1440.maxIcon.h * FIT) / 2;
    const bottom = geo.cy + geo.ry;
    const copyBottom = LAYOUT_1440.copy.y + LAYOUT_1440.copy.height;
    expect(bottom - halfH).toBeGreaterThanOrEqual(copyBottom);
    expect(bottom + halfH).toBeLessThanOrEqual(LAYOUT_1440.section.height);
  });

  it('spans the hero horizontally, inset from both edges', () => {
    const geo = orbitGeometry(LAYOUT_1440);
    expect(geo.cx).toBe(720);
    expect(geo.rx).toBe(720 - 24);
  });

  // A short hero has no band below the copy. Better a squashed path than a
  // divide by zero or a ry that reaches off the section.
  it('degrades rather than breaking when there is no room below the copy', () => {
    const geo = orbitGeometry({
      ...LAYOUT_1440,
      section: { width: 1440, height: 700 },
      copy: { x: 72, y: 120, width: 514, height: 560 },
    });
    expect(geo.ry).toBeGreaterThan(0);
    expect(Number.isFinite(geo.cy)).toBe(true);
  });

  it('scales the object clearances with the objects', () => {
    const full = orbitGeometry(LAYOUT_1440, 1);
    const small = orbitGeometry(LAYOUT_1440, 0.5);
    // Smaller objects need less room, so the bands they can sit in are wider
    // and the path grows to use them.
    expect(small.ry).toBeGreaterThan(full.ry);
    expect(small.rx).toBe(full.rx);
  });
});

describe('boxGap', () => {
  const a: Rect = { x: 100, y: 100, width: 50, height: 50 };

  it('is positive when the boxes are apart, on either axis', () => {
    expect(boxGap(a, { x: 200, y: 100, width: 10, height: 10 })).toBe(50);
    expect(boxGap(a, { x: 100, y: 190, width: 10, height: 10 })).toBe(40);
  });

  it('is zero when they touch', () => {
    expect(boxGap(a, { x: 150, y: 100, width: 10, height: 10 })).toBe(0);
  });

  it('is negative when they overlap', () => {
    expect(boxGap(a, { x: 140, y: 140, width: 50, height: 50 })).toBeLessThan(0);
  });
});

describe('orbitOpacity', () => {
  const text: Rect = { x: 72, y: 181, width: 514, height: 475 };

  it('is invisible before it touches, not as it touches', () => {
    // Box ends 1px short of the text: overlapping in a frame's time, and
    // already gone.
    const nearly = { x: 72 - 121, y: 300, width: 120, height: 96 };
    expect(boxGap(nearly, text)).toBe(1);
    expect(orbitOpacity(nearly, [text])).toBeLessThan(0.02);
  });

  it('is zero the moment the boxes meet, and stays zero inside', () => {
    expect(orbitOpacity({ x: 72 - 120, y: 300, width: 120, height: 96 }, [text])).toBe(0);
    expect(orbitOpacity({ x: 200, y: 300, width: 120, height: 96 }, [text])).toBe(0);
  });

  it('is full strength in open space', () => {
    expect(orbitOpacity({ x: 900, y: 40, width: 120, height: 96 }, [text])).toBe(ORBIT_MAX_OPACITY);
  });

  it('ramps linearly across the fade band', () => {
    const half = { x: 72 - 120 - ORBIT_FADE_PX / 2, y: 300, width: 120, height: 96 };
    expect(orbitOpacity(half, [text])).toBeCloseTo(ORBIT_MAX_OPACITY / 2, 6);
  });

  it('answers to the nearest obstacle, not the first', () => {
    const far: Rect = { x: 1200, y: 0, width: 100, height: 100 };
    const box = { x: 72 - 120 - 10, y: 300, width: 120, height: 96 };
    expect(clearance(box, [far, text])).toBe(10);
    expect(orbitOpacity(box, [far, text])).toBeCloseTo((10 / ORBIT_FADE_PX) * ORBIT_MAX_OPACITY, 6);
  });
});

/**
 * THE ACCEPTANCE CRITERION, AS AN ASSERTION.
 *
 * "No object crosses over or reduces the readability of the headline,
 * paragraph, CTAs or proof line." It is not held by moving the orbit — see the
 * note at the top of the module for why no ellipse on this hero can both
 * contain the copy and fit the viewport — it is held by the object being at
 * zero opacity for every angle where its box touches the text.
 *
 * Boxes measured on the running page at 1440x900 and 1280x720.
 */
describe('a full lap never draws an object on the copy', () => {
  const LAYOUTS = [
    {
      width: 1440,
      layout: LAYOUT_1440,
      obstacles: [
        { x: 72, y: 181, width: 514, height: 270 }, // h1
        { x: 72, y: 473, width: 420, height: 62 }, // .hero-sub
        { x: 72, y: 566, width: 232, height: 52 }, // primary button
        { x: 320, y: 566, width: 168, height: 52 }, // secondary button
        { x: 72, y: 636, width: 430, height: 19 }, // .hero-note
      ],
    },
    {
      width: 1280,
      layout: {
        section: { width: 1280, height: 676 },
        copy: { x: 64, y: 160, width: 457, height: 439 },
        headerHeight: 82,
        maxIcon: { w: 142, h: 128 },
      },
      obstacles: [
        { x: 64, y: 160, width: 457, height: 240 },
        { x: 64, y: 422, width: 400, height: 60 },
        { x: 64, y: 510, width: 226, height: 52 },
        { x: 306, y: 510, width: 160, height: 52 },
        { x: 64, y: 580, width: 410, height: 19 },
      ],
    },
  ];

  for (const layout of LAYOUTS) {
    it(`holds at ${layout.width}`, () => {
      const fit = orbitFitScale(layout.layout);
      const geo = orbitGeometry(layout.layout, fit);
      let visibleSamples = 0;
      const samples = 720;
      for (let s = 0; s < samples; s += 1) {
        const t = (s / samples) * ORBIT_LAP_MS;
        for (let i = 0; i < TRADE_ICONS.length; i += 1) {
          const box = iconBox(orbitPoint(orbitAngle(t, i), geo), TRADE_ICONS[i], fit);
          const opacity = orbitOpacity(box, layout.obstacles);
          if (opacity > 0) {
            // Visible means clear: the gap to every obstacle is positive.
            expect(
              clearance(box, layout.obstacles),
              `${TRADE_ICONS[i].slug} at t=${Math.round(t)}ms is drawn at ${opacity.toFixed(2)} while touching the copy`,
            ).toBeGreaterThan(0);
            visibleSamples += 1;
          }
        }
      }
      // And the orbit is not simply invisible for the whole lap — if this ever
      // fails the fade has swallowed the feature rather than protecting it.
      const visibleFraction = visibleSamples / (samples * TRADE_ICONS.length);
      expect(visibleFraction, `only ${(visibleFraction * 100).toFixed(1)}% of the lap is visible`).toBeGreaterThan(0.3);
    });
  }
});
