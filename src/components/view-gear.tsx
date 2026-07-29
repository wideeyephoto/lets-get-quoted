'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './view-gear.module.css';

export type ViewOption<T extends string> = { id: T; label: string; hint: string };

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Shared gear/view-settings menu: a list of layout options (radio) plus an
// optional "Show map" toggle. Closes on outside-click / Escape.
export default function ViewGear<T extends string>({
  views,
  activeView,
  onPickView,
  mapOn,
  onToggleMap,
}: {
  views: ViewOption<T>[];
  activeView: T;
  onPickView: (next: T) => void;
  mapOn?: boolean; // omit to hide the map toggle
  onToggleMap?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = views.find((v) => v.id === activeView) ?? views[0];
  const showMapToggle = typeof mapOn === 'boolean' && Boolean(onToggleMap);

  return (
    <div className={styles.gear} ref={ref}>
      <button type="button" className={styles.gearBtn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="View settings">
        <GearIcon />
        <span>{current.label}</span>
      </button>
      {open && (
        <div className={styles.pop} role="menu">
          <p>View</p>
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              aria-checked={activeView === v.id}
              className={styles.opt}
              onClick={() => { onPickView(v.id); setOpen(false); }}
            >
              <strong>{v.label}</strong>
              {activeView === v.id && <span className={styles.check} aria-hidden="true">✓</span>}
              <small>{v.hint}</small>
            </button>
          ))}
          {showMapToggle && (
            <>
              <div className={styles.sep} />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={mapOn}
                className={styles.opt}
                onClick={() => { onToggleMap?.(!mapOn); setOpen(false); }}
              >
                <strong>Show map</strong>
                {mapOn && <span className={styles.check} aria-hidden="true">✓</span>}
                <small>Pins for leads &amp; jobs at the top</small>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
