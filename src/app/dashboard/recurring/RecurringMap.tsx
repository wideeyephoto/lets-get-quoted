'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { circleMarkerContent, createAdvancedMarker } from '@/lib/advanced-markers';
import { googleMapAppearance, loadGoogleMaps } from '@/lib/maps-loader';

// Where the recurring book actually is.
//
// A list of plans tells you what repeats and what it is worth. It cannot tell
// you that six of them are on the same three streets and the seventh is forty
// minutes the other way — which is the fact that decides whether a plan is
// profitable, and the one you can only see on a map.
//
// Pins come from each plan's JOBS, not its address — see PlanContext.lat. So a
// plan appears here once a visit has been geocoded, and the count says how many
// couldn't be placed rather than quietly drawing a smaller book than you have.
//
// Color is plan STATE, not value: orange for the ones needing attention,
// because "which of these bills nobody" is the only thing on this page worth
// interrupting somebody about. Blue is running, grey is paused.

export type PlanPin = {
  planId: string;
  title: string;
  clientName: string;
  lat: number;
  lng: number;
  active: boolean;
  needsAttention: boolean;
};

type MapTheme = 'dark' | 'light';
const THEME_KEY = 'recurring-map-theme';
const SHOWN_KEY = 'recurring-map-shown';

const ATTENTION_COLOR = '#ff7a21';
const ACTIVE_COLOR = '#38bdf8';
const PAUSED_COLOR = '#7c8ba1';

export default function RecurringMap({
  pins,
  totalPlans,
  onJump,
}: {
  pins: PlanPin[];
  /** Every plan, placed or not — so the map can own up to what it is missing. */
  totalPlans: number;
  /**
   * What a pin click should do, when the caller needs to do something before the
   * scroll can work.
   *
   * In the Cards view the map and the list are on screen together, so the
   * default — scroll straight to the card — is right. In Operations the map is a
   * TAB, and the list it would scroll to is not rendered while you are looking
   * at it. That caller switches tabs first and jumps afterwards.
   */
  onJump?: (planId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [theme, setTheme] = useState<MapTheme>('dark');
  const [shown, setShown] = useState(true);
  // Whether the saved preferences have been read yet. Google Maps is billed per
  // load, so nothing is requested until we know whether this owner has the map
  // switched off — otherwise every page view pays for tiles that get thrown
  // away one frame later.
  const [prefsRead, setPrefsRead] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const gearMenuId = useId();
  const gearRef = useRef<HTMLDivElement>(null);

  // Both preferences are read AFTER mount, never during render: reading
  // localStorage while rendering gives the server and the browser different
  // answers and React throws away the markup it just streamed.
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
      // Only an explicit "off" hides it. An unset key means somebody who has
      // never touched the gear, and they should see the map.
      if (window.localStorage.getItem(SHOWN_KEY) === 'off') setShown(false);
    } catch {
      // Private mode or storage disabled — the defaults are fine.
    }
    setPrefsRead(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!gearRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const placed = pins.length;
  const missing = Math.max(0, totalPlans - placed);
  const attention = useMemo(() => pins.filter((pin) => pin.needsAttention).length, [pins]);

  useEffect(() => {
    if (!prefsRead || !shown || placed === 0 || !containerRef.current) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    const mapMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    setStatus('loading');
    loadGoogleMaps(key)
      .then(async () => {
        if (cancelled || !containerRef.current || !window.google) return;
        const g = window.google.maps;
        const markerLibrary = await g.importLibrary('marker') as google.maps.MarkerLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new g.Map(containerRef.current, {
          ...googleMapAppearance(theme),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
          backgroundColor: theme === 'dark' ? '#16222f' : '#eef1f5',
        });

        const bounds = new g.LatLngBounds();
        for (const pin of pins) {
          const marker = createAdvancedMarker(markerLibrary, {
            map,
            position: { lat: pin.lat, lng: pin.lng },
            title: `${pin.title} · ${pin.clientName}`,
            zIndex: pin.needsAttention ? 999 : pin.active ? 10 : 1,
            gmpClickable: true,
            anchorLeft: '-50%',
            anchorTop: '-50%',
          }, circleMarkerContent({
            diameter: pin.needsAttention ? 18 : 14,
            fill: pin.needsAttention ? ATTENTION_COLOR : pin.active ? ACTIVE_COLOR : PAUSED_COLOR,
            opacity: pin.active ? 1 : 0.6,
          }));
          marker.addEventListener('gmp-click', () => (onJump ? onJump(pin.planId) : jumpToPlan(pin.planId)));
          mapMarkers.push(marker);
          bounds.extend({ lat: pin.lat, lng: pin.lng });
        }

        map.fitBounds(bounds, 40);
        // One plan fits to a point, and fitBounds on a zero-area box zooms to
        // the driveway. A street is the useful scale.
        if (pins.length === 1) {
          g.event.addListenerOnce(map, 'idle', () => {
            if ((map.getZoom() ?? 0) > 14) map.setZoom(14);
          });
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      for (const marker of mapMarkers) marker.map = null;
    };
    // Rebuilt on a theme change because Google only accepts `colorScheme` when
    // the map is constructed.
  }, [pins, theme, shown, placed, prefsRead, onJump]);

  function chooseTheme(next: MapTheme) {
    setTheme(next);
    setMenuOpen(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not worth surfacing — the map still switched.
    }
  }

  function chooseShown(next: boolean) {
    setShown(next);
    setMenuOpen(false);
    try {
      window.localStorage.setItem(SHOWN_KEY, next ? 'on' : 'off');
    } catch {
      // The map still toggled; the choice just won't outlive the tab.
    }
  }

  // Nothing to draw and nothing to explain — a plan book with no geocoded visit
  // yet gets no empty box in the hero.
  if (totalPlans === 0) return null;

  if (!shown) {
    return (
      <aside className="recurring-map is-off">
        <div>
          <strong>Map hidden</strong>
          <small>
            {placed} of {totalPlans} plan{totalPlans === 1 ? '' : 's'} can be placed.
          </small>
        </div>
        <button type="button" className="btn secondary" onClick={() => chooseShown(true)}>
          Show map
        </button>
      </aside>
    );
  }

  if (placed === 0) {
    return (
      <aside className="recurring-map is-off">
        <div>
          <strong>Nothing to map yet</strong>
          <small>
            Plans pin where their visits happen, so one shows up here once a visit has an address
            we&rsquo;ve looked up.
          </small>
        </div>
      </aside>
    );
  }

  return (
    <aside className="recurring-map">
      <header className="recurring-map-head">
        <strong>Where your plans are</strong>
        <small>
          {placed} of {totalPlans} placed
          {missing > 0 ? ` · ${missing} with no geocoded visit yet` : ''}
          {attention > 0 ? ` · ${attention} in orange need${attention === 1 ? 's' : ''} attention` : ''}
        </small>
      </header>

      <div className="recurring-map-frame">
        <div
          ref={containerRef}
          className="recurring-map-canvas"
          role="region"
          aria-label={`${placed} recurring plan${placed === 1 ? '' : 's'} on a map`}
        />
        {status !== 'ready' ? (
          <p className="recurring-map-status">
            {status === 'error' ? 'The map could not be loaded.' : 'Loading the map…'}
          </p>
        ) : null}

        {/* Bottom-right, over the map, clear of Google's zoom control — the same
            place and the same gear Quick Stops puts it. */}
        <div className="recurring-map-gear" ref={gearRef}>
          <button
            type="button"
            className="qs-coverage-gear-btn"
            aria-label="Map appearance"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? gearMenuId : undefined}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
          {menuOpen ? (
            <div id={gearMenuId} className="qs-coverage-gear-menu" role="group" aria-label="Map appearance">
              <button type="button" className={theme === 'dark' ? 'is-active' : undefined} onClick={() => chooseTheme('dark')}>
                Dark
              </button>
              <button type="button" className={theme === 'light' ? 'is-active' : undefined} onClick={() => chooseTheme('light')}>
                Light
              </button>
              <button type="button" onClick={() => chooseShown(false)}>Hide map</button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/**
 * Tapping a pin takes you to that plan's card.
 *
 * Straight at the DOM rather than through React state, because the card list is
 * a sibling component built on the SERVER — its cards carry bound Server
 * Actions, so there is no shared client state to lift this into. The class is
 * added to a node React only ever renders with a static id, so nothing here
 * fights a re-render.
 *
 * A plan filtered out of the list has no node, and that is a no-op on purpose:
 * silently doing nothing beats scrolling somebody to the wrong card.
 */
export function jumpToPlan(planId: string) {
  const node = document.getElementById(`plan-${planId}`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.add('is-pinpointed');
  window.setTimeout(() => node.classList.remove('is-pinpointed'), 2000);
}
