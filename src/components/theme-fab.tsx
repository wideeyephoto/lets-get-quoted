'use client';

import { otherTheme, themeToggleLabel } from '@/lib/theme';
import { ThemeGlyph } from './theme-glyphs';
import { useTheme } from './use-theme';

// The theme switch that is always on screen, bottom-left, on a phone.
//
// WHY IT IS FIXED AND NOT IN A MENU. The other one lives in the account menu at
// the foot of the rail, and below 1080px that rail is a drawer — so on the one
// device this app is actually used on, changing the theme was: tap Menu, scroll
// the drawer, open the account menu, tap. That is a settings interaction, and
// this is not a settings problem. A contractor steps out of a van into direct
// sun and cannot read the screen; the fix has to be one tap from wherever they
// are, including mid-form, without opening anything that covers the page.
//
// WHY BOTTOM-LEFT. It is inside the thumb's arc on a phone held in either hand,
// and it is the one corner nothing else claims: the help ? is bottom-right
// below 900px, the mobile bar owns the top, and page primaries sit inline.
//
// WHY ONE TAP AND NOT THREE OPTIONS. This control answers "I can't see the
// screen", and the answer to that is never "open a picker". It flips to the
// other theme, always, and taking an explicit choice out of Auto is correct:
// someone reaching for this in daylight is telling us the device is wrong. Auto
// stays available in the account menu, and the badge below says when it's on so
// the state is never a mystery — just not the thing the tap adjusts.

export default function ThemeFab() {
  const { theme, choice, setChoice } = useTheme();
  const next = otherTheme(theme);
  const label = choice === 'system'
    ? `${themeToggleLabel(theme)} (currently matching your device)`
    : themeToggleLabel(theme);

  return (
    <button
      type="button"
      className={`theme-fab${choice === 'system' ? ' is-auto' : ''}`}
      // A switch, and aria-checked tracks light exactly as the old rail control
      // did, so a screen reader hears the same thing in both places.
      role="switch"
      aria-checked={theme === 'light'}
      aria-label={label}
      title={label}
      onClick={() => setChoice(next)}
    >
      {/* The glyph is what you will GET, not what you have. On a 52px disc
          there is room for one mark, and the sun in the dark is a promise of
          light — the moon there would just be a picture of the status quo. */}
      <span className="theme-fab-glyph" data-theme-glyph={next} aria-hidden="true">
        <ThemeGlyph name={next} />
      </span>
      {choice === 'system' ? <span className="theme-fab-auto" aria-hidden="true">A</span> : null}
    </button>
  );
}
