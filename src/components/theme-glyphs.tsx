import type { ThemeChoice } from '@/lib/theme';

export function SunGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
      <path d="M12 1.8v2.4M12 19.8v2.4M4.2 12H1.8M22.2 12h-2.4M6.1 6.1 4.4 4.4M19.6 19.6l-1.7-1.7M17.9 6.1l1.7-1.7M4.4 19.6l1.7-1.7" />
    </svg>
  );
}

/** High-contrast brilliant sun — full daylight. */
export function SunlightGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  );
}

export function MoonGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.7 14.4A8.7 8.7 0 0 1 9.6 3.3a8.7 8.7 0 1 0 11.1 11.1Z" fill="currentColor" />
    </svg>
  );
}

/** OLED pure black — solid high-contrast rounded tile with inner focal core. */
export function OnyxGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    </svg>
  );
}

/** A disc half in each theme — "whichever one the device is in". */
export function AutoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3.4a8.6 8.6 0 0 1 0 17.2Z" fill="currentColor" />
    </svg>
  );
}

/** A twilight disc — striped half-tone representing soft in-between contrast. */
export function DimGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 3.4v17.2M12 7h6.5M12 11h7.8M12 15h6.5M12 18.5h3.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Color vision safe (CVD) — clarity eye focus. */
export function ClarityGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Pure luminance & shape — split contrast square. */
export function MonochromeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 20.5 20.5 3.5M3.5 12h17" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Warm low-blue light — parchment document. */
export function ParchmentGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 3H7a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" strokeWidth="1.8" />
    </svg>
  );
}

export function ThemeGlyph({ name }: { name: ThemeChoice }) {
  if (name === 'sunlight') return <SunlightGlyph />;
  if (name === 'light') return <SunGlyph />;
  if (name === 'dim') return <DimGlyph />;
  if (name === 'dark') return <MoonGlyph />;
  if (name === 'onyx') return <OnyxGlyph />;
  if (name === 'clarity') return <ClarityGlyph />;
  if (name === 'monochrome') return <MonochromeGlyph />;
  if (name === 'parchment') return <ParchmentGlyph />;
  return <AutoGlyph />;
}
