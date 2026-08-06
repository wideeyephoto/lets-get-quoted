import { describe, it, expect } from 'vitest';
import { CREW_THEMES, normalizeCrewTheme, type CrewTheme } from '@/lib/dashboard-views';

// The page mode for Crew & Labor, read from a cookie on every render of all
// three tabs. A cookie is user-editable, so this is the only thing standing
// between a typed value and a page that renders nothing recognisable.

describe('normalizeCrewTheme', () => {
  it('keeps every mode the page can actually be in', () => {
    for (const theme of CREW_THEMES) {
      expect(normalizeCrewTheme(theme), theme).toBe(theme);
    }
  });

  it('reads Overview back as Overview', () => {
    // Said explicitly rather than only through the loop above: this is the value
    // that puts all three tabs into master-detail, and a normalizer that quietly
    // dropped it would leave the gear ticking a mode the page is not in.
    expect(normalizeCrewTheme('overview')).toBe('overview');
  });

  it('falls back to Overview for anything it does not recognise', () => {
    // Overview is the page's default, so no cookie — a first visit — opens on
    // it. Everything else here is a cookie that cannot be trusted (a typo, a
    // case change, a hand-edited value), and those resolve the same way rather
    // than to a layout of their own.
    for (const value of ['', 'OVERVIEW', 'grid', 'focus ', null, undefined, 0, {}, []]) {
      expect(normalizeCrewTheme(value), JSON.stringify(value)).toBe('overview');
    }
  });

  it('keeps an explicit standard, so turning Overview off sticks', () => {
    // The one that would break quietly. Now that ABSENT means Overview, the
    // only thing separating "I turned this off" from "I have never been here"
    // is the literal cookie the off-switch writes — so if this ever normalized
    // away, an owner who chose the plain page would be put back into Overview
    // on every visit and the toggle would look broken.
    expect(normalizeCrewTheme('standard')).toBe('standard');
  });

  it('is exhaustive — every CrewTheme is in CREW_THEMES', () => {
    // The array is what the normalizer checks against. A mode added to the type
    // and not to the array would type-check everywhere and then normalize to
    // 'standard' at runtime, which is the worst kind of silent.
    const every: Record<CrewTheme, true> = { standard: true, focus: true, overview: true };
    expect(new Set(CREW_THEMES)).toEqual(new Set(Object.keys(every)));
  });
});
