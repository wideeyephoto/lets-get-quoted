'use client';

import { useEffect, useRef, useState } from 'react';
import { circleMarkerContent, createAdvancedMarker } from '@/lib/advanced-markers';
import { googleMapAppearance, loadGoogleMaps } from '@/lib/maps-loader';
import type { RouteStop } from '@/lib/quick-stop-route';
import type { PriorityZone } from '@/lib/quick-stop-zones';

// Where a Quick Stop can actually land today.
//
// The circles are not decoration: their radius is the account's own
// maxDetourMiles, drawn around the stops already on today's calendar, which is
// the same route and the same number a request's detour is measured against.
//
// CAREFUL ABOUT WHAT THIS CLAIMS. maxDetourMiles is the OWNER's threshold for
// what is worth driving to — it is what the request card is judged against, not
// a gate that stops a customer asking. (The customer-facing proximity gate is
// instant booking's separate radiusMiles, in route-density.) So this says
// "inside your limit", never "can be offered": the first is true, the second
// would be a promise the system does not keep.
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
  zones: PriorityZone[];
  /**
   * Somewhere to open the map when there is nothing to fit to — the last place
   * this account worked. Without it a quiet day means no map at all, and the
   * priority areas below have nothing to be shown against.
   */
  fallbackCenter?: { lat: number; lng: number } | null;
};

const METERS_PER_MILE = 1609.344;

const ROUTE_COLOR = '#ff7a21';
const ZONE_COLOR = '#4ade80';
// Priority zones read as a different KIND of thing, not a bigger version of the
// same one — they are the owner's decision, where the green is the consequence
// of their settings.
const PRIORITY_COLOR = '#a78bfa';

type MapTheme = 'dark' | 'light';
const THEME_KEY = 'qs-coverage-map-theme';

export default function QuickStopCoverageMap({
  stops,
  radiusMiles,
  emptyReason,
  zones,
  fallbackCenter = null,
}: CoverageMapProps) {
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

  // Declared before the effect so the effect's deps and the markup below read
  // the SAME condition — they disagreed, and the canvas lost.
  //
  // NOT gated on emptyReason. A priority area is a SETTING — where you would
  // drive further for work — with nothing to do with whether anything happens to
  // be booked today. Gating on it meant a quiet day showed no map, and so no
  // picture of the areas the owner had saved.
  const canDrawMap = stops.length > 0 || zones.length > 0 || Boolean(fallbackCenter);

  useEffect(() => {
    if (!canDrawMap) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    const mapMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    const drawings: Array<google.maps.Circle | google.maps.Polyline> = [];
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
          drawings.push(circle);
          const circleBounds = circle.getBounds();
          if (circleBounds) bounds.union(circleBounds);
        }

        // The owner's priority areas, and the one being drawn right now.
        for (const zone of zones) {
          const circle = new g.Circle({
            map,
            center: { lat: zone.centerLat, lng: zone.centerLng },
            radius: zone.radiusMiles * METERS_PER_MILE,
            strokeColor: PRIORITY_COLOR,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: PRIORITY_COLOR,
            fillOpacity: 0.12,
            clickable: false,
          });
          drawings.push(circle);
          const zoneBounds = circle.getBounds();
          if (zoneBounds) bounds.union(zoneBounds);
        }

        if (stops.length > 1) {
          drawings.push(new g.Polyline({
            map,
            path: stops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
            strokeColor: ROUTE_COLOR,
            strokeOpacity: 0.9,
            strokeWeight: 3,
          }));
        }

        stops.forEach((stop, index) => {
          const position = { lat: stop.lat, lng: stop.lng };
          bounds.extend(position);
          const marker = createAdvancedMarker(markerLibrary, {
            map,
            position,
            title: stop.timeLabel ? `Stop ${index + 1} · ${stop.timeLabel}` : `Stop ${index + 1}`,
            anchorLeft: '-50%',
            anchorTop: '-50%',
          }, circleMarkerContent({
            diameter: 22,
            fill: ROUTE_COLOR,
            borderWidth: 1.5,
            label: String(index + 1),
          }));
          mapMarkers.push(marker);
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
        } else if (fallbackCenter) {
          // Nothing booked and no areas drawn yet, so there is nothing to fit
          // to — open over the last place this account actually worked. Zoom 11
          // is roughly a metro area: wide enough to find the suburb you have in
          // mind, tight enough that tapping it means something.
          map.setCenter(fallbackCenter);
          map.setZoom(11);
        }

        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      for (const marker of mapMarkers) marker.map = null;
      for (const drawing of drawings) drawing.setMap(null);
    };
    // Rebuilt on a theme change because Google only accepts `colorScheme` when
    // the map is constructed.
    //
    // `zones` is a dependency, which is what makes a newly added area appear:
    // the action revalidates the page, the new zone arrives as a prop, and the
    // map redraws with it inside the fitted bounds.
  }, [stops, radiusMiles, theme, zones, fallbackCenter, canDrawMap]);

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
            : `${stops.length} stop${stops.length === 1 ? '' : 's'} on today's route · your limit is ${radiusMiles} mile${radiusMiles === 1 ? '' : 's'} from one of them.`}
        </p>
      </div>

      <div className="qs-coverage-frame">
        {/* The canvas renders whenever the map CAN be built — same condition the
            effect uses. It used to be swapped out for the empty message, which
            is why a day with nothing booked left "Add a priority area" pointing
            at a map that was never mounted. */}
        {!canDrawMap ? (
          <p className="qs-coverage-empty">{emptyReason}</p>
        ) : (
          <>
            <div ref={containerRef} className="qs-coverage-canvas" role="region" aria-label={`Today's route with your ${radiusMiles}-mile detour limit drawn around each stop`} />
            {status === 'loading' ? <p className="qs-coverage-empty">Loading the map…</p> : null}
            {status === 'error' ? (
              <p className="qs-coverage-empty">
                The map couldn&rsquo;t load. Your detour limit is still {radiusMiles} miles from each of today&rsquo;s{' '}
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
        <li><span className="qs-key-zone" aria-hidden="true" />Within {radiusMiles} miles — inside your detour limit</li>
        {zones.length > 0 ? (
          <li><span className="qs-key-priority" aria-hidden="true" />Priority area — worth a longer drive</li>
        ) : null}
      </ul>
    </div>
  );
}
