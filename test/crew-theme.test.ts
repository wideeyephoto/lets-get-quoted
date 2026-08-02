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

  it('falls back to the standard page for anything it does not recognise', () => {
    // Standard, not Focus and not Overview: an unreadable cookie should give you
    // the page as it has always been, never a layout you did not choose.
    for (const value of ['', 'OVERVIEW', 'grid', 'focus ', null, undefined, 0, {}, []]) {
      expect(normalizeCrewTheme(value), JSON.stringify(value)).toBe('standard');
    }
  });

  it('is exhaustive — every CrewTheme is in CREW_THEMES', () => {
    // The array is what the normalizer checks against. A mode added to the type
    // and not to the array would type-check everywhere and then normalize to
    // 'standard' at runtime, which is the worst kind of silent.
    const every: Record<CrewTheme, true> = { standard: true, focus: true, overview: true };
    expect(new Set(CREW_THEMES)).toEqual(new Set(Object.keys(every)));
  });
});
