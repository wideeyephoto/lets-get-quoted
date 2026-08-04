'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from '@/lib/maps-loader';
import type { RouteStop } from '@/lib/quick-stop-route';

// Where a Quick Stop can actually land today.
//
// The circles are not decoration: their radius is the account's own
// maxDetourMiles, drawn around the stops already on today's calendar, which is
// the same route and the same number the screener measures a request against.
// Anything inside the shaded area can be offered; anything outside is refused,
// and until now the only way to learn that was to watch requests get turned
// away and guess whether the setting was wrong.
//
// Live in the sense that matters: it is today's real calendar, re-read on every
// page load. Not a socket — the route changes when somebody books a job, not
// second to second, and a map that redraws itself while you are looking at it
// is worse than one that is right when you open it.

export type CoverageMapProps = {
  stops: RouteStop[];
  radiusMiles: number;
  /** Null when nothing is scheduled — the map says so rather than centring on the ocean. */
  emptyReason: string | null;
};

const METERS_PER_MILE = 1609.344;

const ROUTE_COLOR = '#ff7a21';
const ZONE_COLOR = '#4ade80';

type MapTheme = 'dark' | 'light';
const THEME_KEY = 'qs-coverage-map-theme';

export default function QuickStopCoverageMap({ stops, radiusMiles, emptyReason }: CoverageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [theme, setTheme] = useState<MapTheme>('dark');
  const [menuOpen, setMenuOpen] = useState(false);

  // Read the saved choice after mount, never during render: reading
  // localStorage while rendering gives the server and the client different
  // answers and React throws away the markup it just streamed.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') setTheme(saved);
    } catch {
      // Private mode or storage disabled — the default is fine.
    }
  }, []);

  useEffect(() => {
    if (emptyReason) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        const g = window.google.maps;

        const map = new g.Map(containerRef.current, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
          styles: theme === 'dark' ? MAP_DARK_STYLE : MAP_LIGHT_STYLE,
          backgroundColor: theme === 'dark' ? '#16222f' : '#eef1f5',
        });

        const bounds = new g.LatLngBounds();

        // One circle per stop rather than a corridor around the whole route.
        // That is what the screener actually does — it measures to the NEAREST
        // scheduled stop — so a corridor would draw coverage between two distant
        // jobs that nothing would ever be offered from.
        for (const stop of stops) {
          const center = { lat: stop.lat, lng: stop.lng };
          const circle = new g.Circle({
            map,
            center,
            radius: radiusMiles * METERS_PER_MILE,
            strokeColor: ZONE_COLOR,
            strokeOpacity: 0.65,
            strokeWeight: 1.5,
            fillColor: ZONE_COLOR,
            // Faint, because these overlap. Two circles stacking read as a
            // deeper green, which is honest: that ground is reachable from two
            // different stops.
            fillOpacity: 0.1,
            clickable: false,
          });
          const circleBounds = circle.getBounds();
          if (circleBounds) bounds.union(circleBounds);
        }

        if (stops.length > 1) {
          new g.Polyline({
            map,
            path: stops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
            strokeColor: ROUTE_COLOR,
            strokeOpacity: 0.9,
            strokeWeight: 3,
          });
        }

        stops.forEach((stop, index) => {
          const position = { lat: stop.lat, lng: stop.lng };
          bounds.extend(position);
          new g.Marker({
            map,
            position,
            title: stop.timeLabel ? `Stop ${index + 1} · ${stop.timeLabel}` : `Stop ${index + 1}`,
            label: { text: String(index + 1), color: '#0b1220', fontSize: '12px', fontWeight: '700' },
            icon: {
              path: g.SymbolPath.CIRCLE,
              fillColor: ROUTE_COLOR,
              fillOpacity: 1,
              strokeColor: '#0b1220',
              strokeWeight: 1.5,
              scale: 11,
            },
          });
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 32);
          // One stop plus its circle can zoom in absurdly far; cap it so the
          // circle still reads as a neighbourhood rather than a driveway.
          const listener = g.event.addListenerOnce(map, 'idle', () => {
            const zoom = map.getZoom();
            if (typeof zoom === 'number' && zoom > 14) map.setZoom(14);
          });
          void listener;
        }

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // Rebuilt on a theme change: Google applies `styles` at construction, and
    // swapping them on a live map leaves the previous palette on tiles that are
    // already painted.
  }, [stops, radiusMiles, emptyReason, theme]);

  function chooseTheme(next: MapTheme) {
    setTheme(next);
    setMenuOpen(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not worth surfacing — the map still switched.
    }
  }

  return (
    <div className="qs-coverage" data-theme={theme}>
      <div className="qs-coverage-head">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Where a Quick Stop can land</h2>
        </div>
        <p className="qs-coverage-sub">
          {emptyReason
            ? emptyReason
            : `${stops.length} stop${stops.length === 1 ? '' : 's'} on today's route · anything within ${radiusMiles} mile${radiusMiles === 1 ? '' : 's'} of one of them can be offered.`}
        </p>
      </div>

      <div className="qs-coverage-frame">
        {emptyReason ? (
          <p className="qs-coverage-empty">{emptyReason}</p>
        ) : (
          <>
            <div ref={containerRef} className="qs-coverage-canvas" role="img" aria-label={`Today's route with ${radiusMiles}-mile Quick Stop coverage around each stop`} />
            {status === 'loading' ? <p className="qs-coverage-empty">Loading the map…</p> : null}
            {status === 'error' ? (
              <p className="qs-coverage-empty">
                The map couldn&rsquo;t load. Your coverage is still {radiusMiles} miles around each of today&rsquo;s{' '}
                {stops.length} stop{stops.length === 1 ? '' : 's'} — this is only the picture of it.
              </p>
            ) : null}

            {/* Bottom-right, over the map, out of the way of the zoom control. */}
            <div className="qs-coverage-gear">
              <button
                type="button"
                className="qs-coverage-gear-btn"
                aria-label="Map appearance"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="qs-coverage-gear-menu" role="group" aria-label="Map appearance">
                  <button type="button" className={theme === 'dark' ? 'is-active' : undefined} onClick={() => chooseTheme('dark')}>
                    Dark
                  </button>
                  <button type="button" className={theme === 'light' ? 'is-active' : undefined} onClick={() => chooseTheme('light')}>
                    Light
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ul className="qs-coverage-legend">
        <li><span className="qs-key-stop" aria-hidden="true" />Today&rsquo;s scheduled work</li>
        <li><span className="qs-key-zone" aria-hidden="true" />Within {radiusMiles} miles — can be offered a Quick Stop</li>
      </ul>
    </div>
  );
}
