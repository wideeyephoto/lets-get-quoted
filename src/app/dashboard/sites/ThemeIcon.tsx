import type { CSSProperties } from 'react';
import styles from './SiteEditor.module.css';

type ThemeIconProps = {
  name: string;
  accent: string;
  fontVar: string;
  // Optional monogram override (defaults to the first two letters of the name).
  abbr?: string;
};

// Renders a small branded monogram tile for a website theme, using that
// theme's own accent color + display font — a stand-in for a preview photo
// that's actually representative of the theme's look instead of a reused
// stock photo.
export default function ThemeIcon({ name, accent, fontVar, abbr }: ThemeIconProps) {
  const monogram = abbr || name.slice(0, 2);

  return (
    <span className={styles.themeIcon} style={{ '--tile-accent': accent } as CSSProperties}>
      <span className={styles.themeIconLetter} style={{ fontFamily: fontVar }}>
        {monogram}
      </span>
    </span>
  );
}
