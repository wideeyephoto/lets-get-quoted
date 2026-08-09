'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { circleMarkerContent, createAdvancedMarker } from '@/lib/advanced-markers';
import { googleMapAppearance, loadGoogleMaps } from '@/lib/maps-loader';
import type { ClientRow } from './ClientsWorkspace';

// The customer book as a map.
//
// The other five views order customers by name, money or silence. This one
// orders them by GEOGRAPHY, which is the question none of the others can answer:
// where is the work, which streets do you already own, and where would one more
// customer cost you nothing to reach because you are on that road anyway.
//
// Pins come from jobs, not from client addresses — see client-map.ts. That means
// some customers cannot be drawn, and the count of them is stated rather than
// quietly dropped: a map showing 28 of 41 customers while the list says 41 is a
// map that lies about your book.

export type ClientMapPin = { clientId: string; lat: number; lng: number };

type MapTheme = 'dark' | 'light';
const THEME_KEY = 'clients-map-theme';

export default function ClientsMap({
  clients,
  pins,
  selectedId,
  onSelect,
  compact = false,
}: {
  clients: ClientRow[];
  pins: ClientMapPin[];
  selectedId: string | null;
  onSelect: (clientId: string) => void;
  /** Inside the Focus pane, where it shares the height with a header and tabs. */
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, {
    marker: google.maps.marker.AdvancedMarkerElement;
    position: google.maps.LatLngLiteral;
  }>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [theme, setTheme] = useState<MapTheme>('dark');

  // In a ref because the map is built inside an effect that must not re-run on
  // every parent render — a handler captured in that closure would go stale.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

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

  // Only pins whose customer survived the search box, so filtering the list
  // filters the map. A map that ignores the search is a second, contradictory
  // answer on the same screen.
  const visible = useMemo(() => {
    const byId = new Map(clients.map((client) => [client.id, client]));
    return pins
      .filter((pin) => byId.has(pin.clientId))
      .map((pin) => ({ ...pin, client: byId.get(pin.clientId) as ClientRow }));
  }, [clients, pins]);

  const missing = clients.length - visible.length;
  // Whether the customer currently open can actually be shown. "20 on the map"
  // is no use when the one you are looking at is one of the 21 that can't be.
  const selectedPinned = Boolean(selectedId && visible.some((pin) => pin.clientId === selectedId));
  const selectedName = clients.find((client) => client.id === selectedId)?.name ?? null;

  useEffect(() => {
    if (!containerRef.current || visible.length === 0) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    let effectMap: google.maps.Map | null = null;
    let idleListener: google.maps.MapsEventListener | null = null;
    const markerListenerCleanups: Array<() => void> = [];
    loadGoogleMaps(key)
      .then(async () => {
        if (cancelled || !containerRef.current) return;
        const markerLibrary = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          ...googleMapAppearance(theme),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          clickableIcons: false,
        });
        effectMap = map;
        mapRef.current = map;

        markersRef.current.forEach(({ marker }) => { marker.map = null; });
        markersRef.current = new Map();

        const bounds = new google.maps.LatLngBounds();
        for (const pin of visible) {
          const position = { lat: pin.lat, lng: pin.lng };
          const selected = pin.clientId === selectedIdRef.current;
          const marker = createAdvancedMarker(markerLibrary, {
            map,
            position,
            title: pin.client.name,
            zIndex: selected ? 999 : 1,
            gmpClickable: true,
            anchorLeft: '-50%',
            anchorTop: '-50%',
          }, dot(selected));
          const handleMarkerClick = () => onSelectRef.current(pin.clientId);
          marker.addEventListener('gmp-click', handleMarkerClick);
          markerListenerCleanups.push(() => marker.removeEventListener('gmp-click', handleMarkerClick));
          markersRef.current.set(pin.clientId, { marker, position });
          bounds.extend(position);
        }

        map.fitBounds(bounds, 48);
        idleListener = google.maps.event.addListenerOnce(map, 'idle', () => {
          // One customer fits to a point, and fitBounds on a zero-area box zooms
          // to the building. A street is the useful scale.
          if (visible.length === 1) {
            if ((map.getZoom() ?? 0) > 14) map.setZoom(14);
          }
          const currentSelection = selectedIdRef.current;
          const chosen = currentSelection ? markersRef.current.get(currentSelection) : null;
          if (chosen) map.panTo(chosen.position);
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      idleListener?.remove();
      for (const removeListener of markerListenerCleanups) removeListener();
      markersRef.current.forEach(({ marker }) => { marker.map = null; });
      markersRef.current = new Map();
      if (mapRef.current === effectMap) mapRef.current = null;
    };
  }, [visible, theme]);

  // Highlighting is a marker restyle, not a rebuild — re-running the effect
  // above would refit the bounds and yank the map back every time you clicked
  // a customer.
  useEffect(() => {
    markersRef.current.forEach(({ marker }, id) => {
      marker.replaceChildren(dot(id === selectedId));
      marker.zIndex = id === selectedId ? 999 : 1;
    });
    const chosen = selectedId ? markersRef.current.get(selectedId) : null;
    if (chosen && mapRef.current) mapRef.current.panTo(chosen.position);
  }, [selectedId, status]);

  function pickTheme(next: MapTheme) {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Nothing to do — the map still works, the choice just won't persist.
    }
  }

  if (clients.length === 0) return null;

  if (visible.length === 0) {
    const note = (
      <>
        None of these customers can be put on a map yet. Pins come from jobs that have been
        geocoded, so a customer shows up here once you&rsquo;ve scheduled work at their address.
      </>
    );
    // As a band inside the Focus pane there is already a panel around it — a
    // second one draws a box inside a box.
    if (compact) return <p className="client-map-none">{note}</p>;
    return (
      <section className="panel workspace-section-card client-map-empty">
        <p className="empty-state">{note}</p>
      </section>
    );
  }

  return (
    <section className={`client-map${compact ? ' is-compact' : ''}`}>
      <header className="client-map-head">
        <div>
          {/* Leads with the customer you have open, because the map sits
              directly above them. The total is context, not the headline. */}
          <strong>
            {selectedPinned && selectedName
              ? `${selectedName} in orange`
              : selectedName
                ? `${selectedName} can’t be placed yet`
                : `${visible.length} on the map`}
          </strong>
          <small>
            {visible.length} of {clients.length} pinned
            {missing > 0 ? ` · ${missing} with no geocoded job yet` : ''}
            {selectedPinned ? ' · tap a dot to switch' : ''}
          </small>
        </div>
        <div className="client-map-themes" role="group" aria-label="Map style">
          <button type="button" className={theme === 'dark' ? 'is-on' : ''} onClick={() => pickTheme('dark')}>
            Dark
          </button>
          <button type="button" className={theme === 'light' ? 'is-on' : ''} onClick={() => pickTheme('light')}>
            Light
          </button>
        </div>
      </header>

      <div className="client-map-frame">
        <div ref={containerRef} className="client-map-canvas" />
        {status !== 'ready' ? (
          <p className="client-map-status">
            {status === 'error' ? 'The map could not be loaded.' : 'Loading the map…'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// Drawn rather than a pin image: a customer is a place, not a destination, and
// the selected one has to be findable in a cluster of forty.
function dot(on: boolean): HTMLDivElement {
  return circleMarkerContent({
    diameter: on ? 20 : 13,
    fill: on ? '#ff7a21' : '#38bdf8',
    opacity: on ? 1 : 0.85,
    borderWidth: on ? 3 : 2,
  });
}
