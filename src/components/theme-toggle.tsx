'use client';

import { useEffect, useState } from 'react';
import { otherTheme, themeToggleLabel, THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from '@/lib/theme';

// Light / dark for the dashboard, at the foot of the rail.
//
// It writes the cookie and flips data-theme on <html> in the same tick, so the
// change is instant and the NEXT page load already renders correct from the
// server — no flash, and no round trip to save a preference.
//
// The initial value is read off <html> rather than passed in as a prop. The
// server has already stamped it there, so the switch is in the right position
// on first paint without the layout having to thread a value down through every
// component between here and the root.

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
      className="theme-toggle"
      role="switch"
      aria-checked={isLight}
      aria-label={themeToggleLabel(theme)}
      title={themeToggleLabel(theme)}
      onClick={flip}
    >
      <span className="theme-toggle-face" aria-hidden="true">
        {/* Both glyphs are always drawn; the track slides between them, so the
            control shows what it will BECOME as well as what it is. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
        </svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5" />
        </svg>
      </span>
      <span className="theme-toggle-label">{isLight ? 'Light' : 'Dark'}</span>
      <span className="theme-toggle-track" aria-hidden="true"><i /></span>
    </button>
  );
}
