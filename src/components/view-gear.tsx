'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapTheme, MapView } from '@/lib/dashboard-views';
import styles from './view-gear.module.css';

export type ViewOption<T extends string> = { id: T; label: string; hint: string };

// Shown first because it's the default (see normalizeMapView). Not "under the
// header" — on the schedule page the map sits under the calendar.
const MAP_OPTIONS: { id: MapView; label: string; hint: string }[] = [
  { id: 'large', label: 'Map', hint: 'Show your jobs on a map' },
  { id: 'off', label: 'None', hint: 'Hide the map' },
];

const MAP_THEME_OPTIONS: { id: MapTheme; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Matches the dashboard' },
  { id: 'light', label: 'Light', hint: 'Standard Google map' },
];

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
//
// `views` is optional: a surface with only one layout (the schedule calendar)
// still wants the map on/off and theme controls, and should get them from the
// same menu in the same place rather than a second bespoke control.
export default function ViewGear<T extends string, S extends string = string>({
  views,
  activeView,
  onPickView,
  skins,
  activeSkin,
  onPickSkin,
  mapView,
  onSetMapView,
  mapTheme,
  onSetMapTheme,
  label,
  defaults,
}: {
  views?: ViewOption<T>[];
  activeView?: T;
  onPickView?: (next: T) => void;
  /**
   * How the page LOOKS, as opposed to how it's laid out. Its own section
   * because the two are independent — picking a colour must not rearrange the
   * page, and rearranging the page must not change its colour.
   */
  skins?: ViewOption<S>[];
  activeSkin?: S;
  onPickSkin?: (next: S) => void;
  mapView?: MapView; // omit to hide the map options
  onSetMapView?: (next: MapView) => void;
  mapTheme?: MapTheme;
  onSetMapTheme?: (next: MapTheme) => void;
  label?: string; // fixed button label; defaults to the active view's name
  /**
   * What this surface opens as for someone who has never chosen. Supplying it
   * adds a "Reset to default" row, shown ONLY while something differs — there
   * is otherwise no way back: every one of these controls writes a cookie, and
   * once written the page can never show you the default again.
   *
   * Reset re-applies these through the same setters rather than deleting the
   * cookies, so it needs no server action of its own. The cookie ends up
   * holding today's default explicitly, which only matters if the default is
   * ever changed under someone who reset — a trade worth one component instead
   * of a bespoke action on every surface that uses this menu.
   */
  defaults?: { view?: T; skin?: S; mapView?: MapView; mapTheme?: MapTheme };
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const showViews = Boolean(views && views.length > 0);
  const current = views?.find((v) => v.id === activeView) ?? views?.[0];
  const showSkins = Boolean(skins && skins.length > 0 && onPickSkin);
  const showMapOptions = typeof mapView === 'string' && Boolean(onSetMapView);
  // Theme without placement is a real combination now: Smoothie's map is a pane
  // you switch to, not a band that is on or off, so it has a colour to choose
  // and no position to choose. Every existing caller passes mapView, which
  // makes `!showMapOptions` false and leaves this exactly as it was.
  const showMapTheme =
    typeof mapTheme === 'string' &&
    Boolean(onSetMapTheme) &&
    (showMapOptions ? mapView !== 'off' : true);

  // Only compare a setting this surface actually shows — the schedule page has
  // no view list, and counting its absent view as "changed" would leave Reset
  // permanently offered with nothing to reset.
  const changed: (() => void)[] = [];
  if (defaults) {
    if (showViews && defaults.view !== undefined && activeView !== defaults.view) changed.push(() => onPickView?.(defaults.view as T));
    if (showSkins && defaults.skin !== undefined && activeSkin !== defaults.skin) changed.push(() => onPickSkin?.(defaults.skin as S));
    if (showMapOptions && defaults.mapView !== undefined && mapView !== defaults.mapView) changed.push(() => onSetMapView?.(defaults.mapView as MapView));
    // Map theme is only reachable while the map is on, so resetting it when the
    // map is off would write a cookie for a control the owner cannot even see.
    if (showMapTheme && defaults.mapTheme !== undefined && mapTheme !== defaults.mapTheme) changed.push(() => onSetMapTheme?.(defaults.mapTheme as MapTheme));
  }

  // Open the menu upward when there isn't room below, so it's never cut off.
  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && ref.current) {
        const r = ref.current.getBoundingClientRect();
        setOpenUp(window.innerHeight - r.bottom < 380);
      }
      return next;
    });
  }

  return (
    <div className={styles.gear} ref={ref}>
      <button type="button" className={styles.gearBtn} aria-haspopup="menu" aria-expanded={open} onClick={toggle} title="View settings">
        <GearIcon />
        <span>{label ?? current?.label ?? 'View'}</span>
      </button>
      {open && (
        <div className={`${styles.pop}${openUp ? ` ${styles.popUp}` : ''}`} role="menu">
          {showViews && (
            <>
              <p>View</p>
              {views!.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeView === v.id}
                  className={styles.opt}
                  onClick={() => { onPickView?.(v.id); setOpen(false); }}
                >
                  <strong>{v.label}</strong>
                  {activeView === v.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  <small>{v.hint}</small>
                </button>
              ))}
            </>
          )}
          {showSkins && (
            <>
              {showViews && <div className={styles.sep} />}
              <p>Theme</p>
              {skins!.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeSkin === s.id}
                  className={styles.opt}
                  onClick={() => { onPickSkin?.(s.id); setOpen(false); }}
                >
                  <strong>{s.label}</strong>
                  {activeSkin === s.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  <small>{s.hint}</small>
                </button>
              ))}
            </>
          )}
          {showMapOptions && (
            <>
              {(showViews || showSkins) && <div className={styles.sep} />}
              <p>Map</p>
              {MAP_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapView === m.id}
                  className={styles.opt}
                  onClick={() => { onSetMapView?.(m.id); setOpen(false); }}
                >
                  <strong>{m.label}</strong>
                  {mapView === m.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  <small>{m.hint}</small>
                </button>
              ))}
            </>
          )}
          {showMapTheme && (
            <>
              <div className={styles.sep} />
              <p>Map theme</p>
              {MAP_THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapTheme === t.id}
                  className={styles.opt}
                  onClick={() => { onSetMapTheme?.(t.id); setOpen(false); }}
                >
                  <strong>{t.label}</strong>
                  {mapTheme === t.id && <span className={styles.check} aria-hidden="true">✓</span>}
                  <small>{t.hint}</small>
                </button>
              ))}
            </>
          )}
          {changed.length > 0 && (
            <>
              <div className={styles.sep} />
              <button
                type="button"
                role="menuitem"
                className={styles.opt}
                onClick={() => { for (const apply of changed) apply(); setOpen(false); }}
              >
                <strong>Reset to default</strong>
                <small>
                  {changed.length === 1 ? 'Put this back the way it opens' : 'Put all of these back the way they open'}
                </small>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
