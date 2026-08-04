'use client';

import { useEffect, useState } from 'react';
import { otherTheme, themeToggleLabel, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from '@/lib/theme';

// Light / dark for the dashboard, in the rail's footer beside the Stripe pill.
//
// It writes the cookie and flips data-theme on <html> in the same tick, so the
// change is instant and the NEXT page load already renders correct from the
// server — no flash, and no round trip to save a preference.
//
// The initial value is read off <html> rather than passed in as a prop. The
// server has already stamped it there, so the switch is in the right position
// on first paint without the layout having to thread a value down through every
// component between here and the root.
//
// It is a SWITCH, not a labelled row. Both glyphs are always drawn and the knob
// slides between them, so the control says what it is and what it will become
// without a word beside it — which is what buys the room to share a line with
// the Stripe status instead of taking a row of its own.

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stamped = document.documentElement.dataset.theme;
    if (stamped === 'light' || stamped === 'dark') setTheme(stamped);
  }, []);

  const flip = () => {
    const next = otherTheme(theme);
    setTheme(next);
    document.documentElement.dataset.theme = next;
    // SameSite=Lax so it rides along on ordinary navigation, which is exactly
    // when the server needs to read it.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  };

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={isLight}
      aria-label={themeToggleLabel(theme)}
      title={themeToggleLabel(theme)}
      onClick={flip}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-glyph is-sun">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
            <path d="M12 1.8v2.4M12 19.8v2.4M4.2 12H1.8M22.2 12h-2.4M6.1 6.1 4.4 4.4M19.6 19.6l-1.7-1.7M17.9 6.1l1.7-1.7M4.4 19.6l1.7-1.7" />
          </svg>
        </span>
        <span className="theme-switch-glyph is-moon">
          <svg viewBox="0 0 24 24">
            <path d="M20.7 14.4A8.7 8.7 0 0 1 9.6 3.3a8.7 8.7 0 1 0 11.1 11.1Z" fill="currentColor" />
          </svg>
        </span>
        <span className="theme-switch-knob" />
      </span>
    </button>
  );
}
