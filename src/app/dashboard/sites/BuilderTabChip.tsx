'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './SiteEditor.module.css';

// The four builder tabs, as one chip that floats on the live preview.
//
// As a row they cost 63px of permanent chrome on a 664px phone — for navigation
// somebody uses once and then works inside for twenty minutes. With the app's
// own bar and the preview toolbar that was 183px, 28% of the screen, leaving
// 162px of actual form: about two fields.
//
// So the four become one chip naming where you are, and the other three are a
// tap away. The row is still exactly right on a desktop, where the space is
// free — this replaces it only where it isn't.

export type TabChipItem = { id: string; label: string };

export default function BuilderTabChip({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: readonly TabChipItem[];
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = tabs.find((tab) => tab.id === activeTab);

  // A menu floating over a preview has no obvious edge, so any tap outside it
  // and Escape both close — otherwise it sits there covering the site.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.tabChipRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.tabChip}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {current?.label ?? 'Menu'} <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.tabChipMenu} role="menu">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              role="menuitem"
              className={tab.id === activeTab ? styles.tabChipActive : undefined}
              onClick={() => { onSelect(tab.id); setOpen(false); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
