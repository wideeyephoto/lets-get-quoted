'use client';

import { otherTheme, themeToggleLabel } from '@/lib/theme';
import { ThemeGlyph } from './theme-glyphs';
import { useTheme } from './use-theme';

// The theme switch that is always on screen, bottom-left, on a phone.
//
// WHY IT IS FIXED AND NOT ONLY IN SETTINGS. The full picker lives on the Account
// page, and below 1080px the rail that reaches it is a drawer — so on the one
// device this app is actually used on, changing the theme otherwise means
// navigating away from the task. That is a settings interaction, and this is
// not a settings problem. A contractor steps out of a van into direct
// sun and cannot read the screen; the fix has to be one tap from wherever they
// are, including mid-form, without opening anything that covers the page.
//
// WHY BOTTOM-LEFT. It is inside the thumb's arc on a phone held in either hand,
// and it is the one corner nothing else claims: the help ? is bottom-right
// below 900px, the mobile bar owns the top, and page primaries sit inline.
//
// WHY ONE TAP. This control answers "I can't see the screen", not "I want to
// configure my preferences". Auto stays available in Settings, and
// the badge below says when it's on so the state is never a mystery.

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
