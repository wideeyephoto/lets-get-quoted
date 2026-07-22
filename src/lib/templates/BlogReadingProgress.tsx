'use client';

import { useEffect, useState } from 'react';
import styles from './themes.module.css';

// Thin fixed bar at the top of a blog article that fills as the reader scrolls.
// Purely decorative progress feedback; safe to no-op if scrolling isn't possible.
export default function BlogReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div className={styles.blogProgress} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
