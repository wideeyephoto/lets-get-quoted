'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from '@/lib/maps-loader';
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
  /** Click-to-place, so the owner picks a centre without typing coordinates. */
  onPickCenter?: (point: { lat: number; lng: number }) => void;
  /** The zone being drawn right now, previewed before it is saved. */
  draft?: { lat: number; lng: number; radiusMiles: number } | null;
  /**
   * Somewhere to open the map when there is nothing to fit to — the last place
   * this account worked. Without it a quiet day means no map, and no map means
   * no way to draw a priority area, which is a setting that has nothing to do
   * with today's schedule.
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
  onPickCenter,
  draft,
  fallbackCenter = null,
}: CoverageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [theme, setTheme] = useState<MapTheme>('dark');
  const [menuOpen, setMenuOpen] = useState(false);
  // In a ref because the map is built inside an effect that must not re-run on
  // every parent render — a handler captured in that closure would go stale.
  const onPickCenterRef = useRef(onPickCenter);
  onPickCenterRef.current = onPickCenter;

  // The live map, so the effects below can steer it without rebuilding it.
  const mapRef = useRef<google.maps.Map | null>(null);
  // The draft circle and its centre pin, kept out of the build effect so moving
  // the pin does not tear down and re-fit the whole map (see below).
  const draftCircleRef = useRef<google.maps.Circle | null>(null);
  const draftMarkerRef = useRef<google.maps.Marker | null>(null);

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
  // NOT gated on emptyReason any more. A priority area is a SETTING — where you
  // would drive further for work — with nothing to do with whether anything
  // happens to be booked today. Gating on it meant the canvas was never
  // mounted on a quiet day, so "Add a priority area" asked you to tap a map
  // that did not exist and there was no way to draw one at all.
  //
  // Worth building if there is anything to show (today's stops, saved areas) or
  // simply somewhere sensible to open it. Deliberately not conditional on being
  // mid-placement: a map that only appears AFTER you press "Add a priority
  // area" gives you nothing to aim at while deciding whether to press it.
  const canDrawMap = stops.length > 0 || zones.length > 0 || Boolean(fallbackCenter);

  useEffect(() => {
    if (!canDrawMap) return;
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
        mapRef.current = map;

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
          const zoneBounds = circle.getBounds();
          if (zoneBounds) bounds.union(zoneBounds);
        }

        // ALWAYS attached, with the guard INSIDE the handler.
        //
        // This is what made the whole feature dead. The listener used to be
        // wrapped in `if (onPickCenterRef.current)`, which is evaluated once,
        // while the map is being built — and at that moment nobody is placing
        // an area, so onPickCenter is undefined and no listener was ever added.
        // Pressing "Add a priority area" then set the handler, but nothing
        // re-ran the build (onPickCenter is deliberately not a dependency), so
        // the map stayed unclickable for the life of the page. Every owner who
        // tried to draw an area tapped a map that was not listening.
        //
        // The ref exists precisely so the CURRENT handler can be read at click
        // time; reading it inside is the whole point of having it.
        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          const pick = onPickCenterRef.current;
          if (!pick) return; // not placing — a stray click must not drop a pin
          const point = event.latLng;
          if (point) pick({ lat: point.lat(), lng: point.lng() });
        });

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
      mapRef.current = null;
    };
    // Rebuilt on a theme change: Google applies `styles` at construction, and
    // swapping them on a live map leaves the previous palette on tiles that are
    // already painted.
    //
    // `draft` is NOT a dependency. It used to be, which meant every tap on the
    // map threw the map away and built a new one — re-fitting the bounds, so
    // the ground moved under the pin you had just placed, and re-running
    // fitBounds with the draft included so the view jumped on each nudge of the
    // size field. The draft is an overlay, not a reason to rebuild a map; the
    // effect below moves it in place.
  }, [stops, radiusMiles, theme, zones, fallbackCenter, canDrawMap]);

  // The draft area, drawn and moved without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const g = window.google.maps;

    if (!draft) {
      draftCircleRef.current?.setMap(null);
      draftMarkerRef.current?.setMap(null);
      draftCircleRef.current = null;
      draftMarkerRef.current = null;
      return;
    }

    const center = { lat: draft.lat, lng: draft.lng };
    const radius = draft.radiusMiles * METERS_PER_MILE;

    if (draftCircleRef.current) {
      draftCircleRef.current.setCenter(center);
      draftCircleRef.current.setRadius(radius);
    } else {
      draftCircleRef.current = new g.Circle({
        map,
        center,
        radius,
        strokeColor: PRIORITY_COLOR,
        strokeOpacity: 1,
        strokeWeight: 2,
        // Dashed would be better; the Circle API has no dash, so the draft is
        // distinguished by being brighter and having a centre marker.
        fillColor: PRIORITY_COLOR,
        fillOpacity: 0.2,
        clickable: false,
      });
    }

    if (draftMarkerRef.current) {
      draftMarkerRef.current.setPosition(center);
    } else {
      draftMarkerRef.current = new g.Marker({
        map,
        position: center,
        // Draggable, because "not quite there" is the normal case after a tap
        // and re-tapping to nudge a pin fifty yards is a poor way to spend a
        // minute. Dragging reports the same way a tap does.
        draggable: true,
        title: 'Drag to move the middle of this area',
        icon: { path: g.SymbolPath.CIRCLE, fillColor: PRIORITY_COLOR, fillOpacity: 1, strokeColor: '#0b1220', strokeWeight: 1.5, scale: 7 },
      });
      draftMarkerRef.current.addListener('dragend', (event: google.maps.MapMouseEvent) => {
        const point = event.latLng;
        if (point) onPickCenterRef.current?.({ lat: point.lat(), lng: point.lng() });
      });
    }

    // Bring the area into view when it lands off-screen — which is what happens
    // when it was chosen by searching for a place rather than by tapping.
    const bounds = draftCircleRef.current.getBounds();
    const viewport = map.getBounds();
    if (bounds && (!viewport || !viewport.contains(bounds.getNorthEast()) || !viewport.contains(bounds.getSouthWest()))) {
      map.fitBounds(bounds, 48);
    }
    // `status` is a dependency because the map may not exist yet when the draft
    // arrives — searching for a place can resolve before the tiles do, and
    // without this the circle for it would never be drawn. Re-running once the
    // map is ready costs nothing; the branches above are all idempotent.
  }, [draft, status]);

  // Crosshairs while placing. Without this the map looks exactly the same
  // whether it is waiting for a tap or not, which is most of why "tap the map"
  // read as decoration.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setOptions({
      draggableCursor: onPickCenter ? 'crosshair' : undefined,
    });
  }, [onPickCenter, status]);

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
            <div ref={containerRef} className="qs-coverage-canvas" role="img" aria-label={`Today's route with your ${radiusMiles}-mile detour limit drawn around each stop`} />
            {status === 'loading' ? <p className="qs-coverage-empty">Loading the map…</p> : null}

            {/* The instruction, ON the map. It used to live only in the form
                below, where somebody looking at the map to decide where to tap
                could not see it — and a map that gives no sign it is waiting
                for you is indistinguishable from one that is broken. */}
            {onPickCenter && status === 'ready' ? (
              <p className="qs-coverage-placing" role="status">
                {draft ? 'Drag the pin to adjust, or tap somewhere else' : 'Tap the middle of the area you want'}
              </p>
            ) : null}
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
