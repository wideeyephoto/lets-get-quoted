import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Every /features#... link on the homepage has to land on something.
 *
 * Nine links point from the homepage into the features page: four badges under
 * the hero copy (Plan & Schedule, Automate & Follow Up, Get Paid Faster, Grow
 * Your Business) and five cells in the strip below it (Website / Smart Intake /
 * Back Office / Quick Stops — four cells against five flagship cards, the fifth
 * card being the client portal, which the strip does not name).
 *
 * WHY A SOURCE-SHAPE TEST. The failure this guards is a rename on one side
 * only, and it is completely silent: a wrong fragment type-checks, builds,
 * renders, and returns 200. The browser simply scrolls nowhere, which reads as
 * "the link is broken" to a visitor and as nothing at all to CI. The two files
 * have no import between them — the contract is the string — so the string is
 * what gets checked.
 *
 * These are plain-object arrays with quoted literals, which is why regex is
 * enough here and would not be in general.
 */

const HOME = readFileSync('src/components/flagship/flagship-home.tsx', 'utf8');
const FEATURES = readFileSync('src/app/features/page.tsx', 'utf8');

/** Every `href: '/features#thing'` in the homepage's link tables. */
const homeAnchors = [...HOME.matchAll(/href:\s*'\/features#([a-z0-9-]+)'/g)].map((m) => m[1]);

/** Every `id: 'thing'` in the features page's FLAGSHIPS and CAPABILITIES. */
const featureIds = [...FEATURES.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

describe('homepage links into /features', () => {
  it('finds the link tables at all', () => {
    // If either regex stops matching — someone moves to a helper, or switches
    // to double quotes — the test below would pass vacuously against an empty
    // list. This is the guard against a green run that checked nothing.
    expect(homeAnchors.length).toBe(8);
    expect(featureIds.length).toBe(9);
  });

  it('points every homepage badge and promise at an id that exists', () => {
    const missing = homeAnchors.filter((anchor) => !featureIds.includes(anchor));
    expect(missing).toEqual([]);
  });

  it('keeps the four hero badges aimed at the four capability groups', () => {
    for (const id of ['planning-and-scheduling', 'automations', 'payments', 'website-and-growth']) {
      expect(homeAnchors).toContain(id);
      expect(featureIds).toContain(id);
    }
  });

  it('keeps the four strip cells aimed at their flagship cards', () => {
    for (const id of ['website-builder', 'smart-intake', 'back-office', 'quick-stops']) {
      expect(homeAnchors).toContain(id);
      expect(featureIds).toContain(id);
    }
  });

  it('never repeats an id on the features page', () => {
    // Two elements sharing a fragment is a coin toss over which one the browser
    // scrolls to, and it would satisfy every assertion above.
    expect(new Set(featureIds).size).toBe(featureIds.length);
  });

  it('renders each capability group as an anchored, labelled section', () => {
    // The id has to be on an element that exists. Checking the markup rather
    // than the data catches a group being dropped from the map.
    expect(FEATURES).toContain('className="capability-band" id={id}');
    expect(FEATURES).toContain('aria-labelledby={`${id}-title`}');
  });
});
