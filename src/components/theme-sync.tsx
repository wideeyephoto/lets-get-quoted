'use client';

import { useEffect } from 'react';
import { applyThemeChoice, readStampedTheme, rememberSystemPreference } from './use-theme';

// No UI. This is the half of "Auto" that only the browser can do.
//
// The server resolves 'system' from the mirror cookie (see THEME_SYSTEM_COOKIE),
// which is right on every request except the first one it has never been
// written on — a light-mode contractor's very first page load, where the server
// has to guess and guesses dark. This corrects that once, writes the mirror, and
// from then on the server gets it right at paint time.
//
// It runs on every page rather than only where a theme control is drawn,
// because the correction is needed most on the pages that don't have one.

export default function ThemeSync() {
  useEffect(() => {
    rememberSystemPreference();
    if (readStampedTheme().choice === 'system') applyThemeChoice('system');
  }, []);

  return null;
}
