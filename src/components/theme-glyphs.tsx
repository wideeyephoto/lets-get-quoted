// Sun / moon / auto, shared by the account-menu row and the floating switch so
// the two controls are visibly the same control in two sizes. They inherit
// currentColor and fill their box; every size decision belongs to the caller.

export function SunGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
      <path d="M12 1.8v2.4M12 19.8v2.4M4.2 12H1.8M22.2 12h-2.4M6.1 6.1 4.4 4.4M19.6 19.6l-1.7-1.7M17.9 6.1l1.7-1.7M4.4 19.6l1.7-1.7" />
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

/** A disc half in each theme — "whichever one the device is in". */
export function AutoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3.4a8.6 8.6 0 0 1 0 17.2Z" fill="currentColor" />
    </svg>
  );
}

export function ThemeGlyph({ name }: { name: 'system' | 'light' | 'dark' }) {
  if (name === 'light') return <SunGlyph />;
  if (name === 'dark') return <MoonGlyph />;
  return <AutoGlyph />;
}
