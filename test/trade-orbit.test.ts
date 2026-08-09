import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ORBIT_LAP_MS,
  ORBIT_RUN_OFF,
  TRADE_ICONS,
  iconBox,
  orbitAngle,
  orbitGeometry,
  orbitPoint,
  type OrbitLayout,
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
        const gap = (orbitAngle(t, i) - orbitAngle(t, i - 1) + TAU) % TAU;
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
    expect(orbitPoint(TAU / 4, geo).x).toBeCloseTo(740, 6);
    expect(orbitPoint(TAU / 4, geo).y).toBeCloseTo(300, 6);
    expect(orbitPoint(TAU / 2, geo).y).toBeCloseTo(530, 6);
    expect(orbitPoint((TAU * 3) / 4, geo).x).toBeCloseTo(60, 6);
  });

  it('never leaves the ellipse', () => {
    for (let i = 0; i < 720; i += 1) {
      const p = orbitPoint((i / 720) * TAU, geo);
      expect(((p.x - geo.cx) / geo.rx) ** 2 + ((p.y - geo.cy) / geo.ry) ** 2).toBeCloseTo(1, 8);
    }
  });
});

/**
 * The boxes measured on the running page. Two columns above 1100px, one below.
 */
const DESKTOP: OrbitLayout = {
  section: { width: 1440, height: 760 },
  copy: { x: 72, y: 181, width: 514, height: 475 },
  gutter: 72, // .hero-product starts at 658, the copy ends at 586
  headerHeight: 82,
  maxIcon: { w: 142, h: 128 },
};

const PHONE: OrbitLayout = {
  section: { width: 390, height: 1125 },
  copy: { x: 20, y: 196, width: 350, height: 448 },
  gutter: 0, // stacked: the product is below the copy, not beside it
  headerHeight: 68,
  maxIcon: { w: 142, h: 128 },
};

describe('orbitGeometry', () => {
  /**
   * The two things the shape is supposed to say, asserted rather than eyeballed.
   * Both used to be different: the path was pinned into the hero's empty
   * horizontal bands and never left the viewport.
   */
  it('runs off the left edge of the page', () => {
    for (const layout of [DESKTOP, PHONE]) {
      const geo = orbitGeometry(layout);
      const left = geo.cx - geo.rx;
      expect(left, `${layout.section.width}px`).toBeCloseTo(-layout.section.width * ORBIT_RUN_OFF, 6);
      expect(left).toBeLessThan(0);
    }
  });

  it('brings the right arc into the gutter, between the copy and the product', () => {
    const geo = orbitGeometry(DESKTOP);
    const right = geo.cx + geo.rx;
    const copyRight = DESKTOP.copy.x + DESKTOP.copy.width;
    expect(right).toBeGreaterThan(copyRight);
    expect(right).toBeLessThan(copyRight + DESKTOP.gutter);
    expect(right).toBeCloseTo(622, 6); // 586 + half of a 72px gutter
  });

  it('puts the right arc just past the copy when the hero is stacked', () => {
    const geo = orbitGeometry(PHONE);
    const right = geo.cx + geo.rx;
    const copyRight = PHONE.copy.x + PHONE.copy.width;
    expect(right).toBeGreaterThan(copyRight);
    expect(right - copyRight).toBeLessThan(20);
  });

  it('is centred on the copy and clears the fixed header', () => {
    for (const layout of [DESKTOP, PHONE]) {
      const geo = orbitGeometry(layout);
      expect(geo.cy).toBe(layout.copy.y + layout.copy.height / 2);
      const top = geo.cy - geo.ry - layout.maxIcon.h / 2;
      expect(top, `${layout.section.width}px top`).toBeGreaterThanOrEqual(layout.headerHeight);
    }
  });

  it('keeps the bottom of the path inside the section', () => {
    for (const layout of [DESKTOP, PHONE]) {
      const geo = orbitGeometry(layout);
      expect(geo.cy + geo.ry + layout.maxIcon.h / 2).toBeLessThanOrEqual(layout.section.height);
    }
  });

  // Smaller objects need less clearance, so the path can be taller.
  it('gives a scaled-down set more vertical room', () => {
    expect(orbitGeometry(DESKTOP, 0.5).ry).toBeGreaterThan(orbitGeometry(DESKTOP, 1).ry);
  });

  it('never returns a degenerate ellipse, however cramped the hero', () => {
    const geo = orbitGeometry({ ...DESKTOP, section: { width: 1440, height: 200 } });
    expect(geo.rx).toBeGreaterThan(0);
    expect(geo.ry).toBeGreaterThan(0);
    expect(Number.isFinite(geo.cy)).toBe(true);
  });
});

/**
 * NOTHING FADES ANY MORE, so the invariant that replaces the old one is about
 * where the objects ARE rather than whether they are drawn: every object, at
 * every point of the lap, stays inside the section's vertical extent and never
 * crosses into the product screenshot's column.
 *
 * The first is what stops an object being clipped off the top or bottom; the
 * second is what "the right side of the orbit sits between the copy and the
 * screenshots" means when you check it instead of looking at it.
 */
describe('a full lap', () => {
  it('stays within the section vertically', () => {
    for (const layout of [DESKTOP, PHONE]) {
      const geo = orbitGeometry(layout);
      for (let s = 0; s < 720; s += 1) {
        const t = (s / 720) * ORBIT_LAP_MS;
        for (let i = 0; i < TRADE_ICONS.length; i += 1) {
          const box = iconBox(orbitPoint(orbitAngle(t, i), geo), TRADE_ICONS[i]);
          expect(box.y, `${TRADE_ICONS[i].slug} at ${layout.section.width}px`).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(layout.section.height);
        }
      }
    }
  });

  it('never reaches the product screenshot on the two-column hero', () => {
    const geo = orbitGeometry(DESKTOP);
    const productLeft = DESKTOP.copy.x + DESKTOP.copy.width + DESKTOP.gutter;
    for (let s = 0; s < 720; s += 1) {
      const t = (s / 720) * ORBIT_LAP_MS;
      for (let i = 0; i < TRADE_ICONS.length; i += 1) {
        const box = iconBox(orbitPoint(orbitAngle(t, i), geo), TRADE_ICONS[i]);
        expect(box.x + box.width / 2, `${TRADE_ICONS[i].slug} centre`).toBeLessThan(productLeft);
      }
    }
  });

  it('genuinely leaves the page rather than hugging the edge', () => {
    const geo = orbitGeometry(DESKTOP);
    let offPage = 0;
    for (let s = 0; s < 720; s += 1) {
      const box = iconBox(orbitPoint(orbitAngle((s / 720) * ORBIT_LAP_MS, 0), geo), TRADE_ICONS[0]);
      if (box.x + box.width < 0) offPage += 1;
    }
    expect(offPage, 'no sample of the lap is fully off the left edge').toBeGreaterThan(0);
  });
});

/**
 * THE SIZE MULTIPLIER, read from the component rather than copied here.
 *
 * The objects are drawn at TRADE_ICONS' approved sizes times a scale that
 * tapers from a phone to a 1440 desktop. Enlarging them means moving the WHOLE
 * ramp — moving only its top makes the taper steeper rather than the art
 * bigger, and the phone end has to come down for the same reason it always did.
 */
describe('the ramp scales as a whole', () => {
  const ORBIT = readFileSync(join(process.cwd(), 'src', 'components', 'flagship', 'trade-orbit.tsx'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('applies one multiplier to both ends of the taper', () => {
    const size = Number(/const ICON_SIZE = ([\d.]+);/.exec(ORBIT)?.[1]);
    expect(size, 'no ICON_SIZE declared').toBeGreaterThan(0);
    expect(ORBIT).toContain(`const MIN_SCALE = 0.46 * ICON_SIZE`);
    expect(ORBIT).toContain(`const FULL_SCALE = 1 * ICON_SIZE`);
    // And the ramp interpolates between the two, rather than to a bare 1.
    expect(ORBIT).toContain('return MIN_SCALE + (FULL_SCALE - MIN_SCALE) * t;');
  });

  /* Bigger art needs more clearance, and orbitGeometry sizes the path's
     vertical radius off the largest object times the scale — so a larger set
     gets a shorter ellipse rather than one that runs under the header. */
  it('shortens the path as the objects grow', () => {
    expect(orbitGeometry(DESKTOP, 1.3).ry).toBeLessThan(orbitGeometry(DESKTOP, 1).ry);
  });
});
