'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMapsLibrary } from '@/lib/google-maps-loader';
import { legColor } from '@/lib/day-plan-view';
import { supplyBrand, type SupplyBrand } from '@/lib/supply-brands';
import type { LatLng } from '@/lib/distance';

export type MapStop = { id: string; label: string; lat: number; lng: number; locked: boolean };

// The day drawn on a map: the shop, the stops in the order they'll be driven, and
// the actual road route between them.
//
// The route comes from the Directions service, which follows real roads — but it
// needs Directions enabled on the API key and caps out at 25 waypoints. Neither
// is guaranteed, so a straight-line polyline is drawn first and upgraded in place
// when (if) directions come back. The contractor always sees a route.

const DIRECTIONS_MAX_WAYPOINTS = 23; // 25 minus origin and destination.

// Directions is a separate API that has to be enabled on the key, and a key
// without it answers REQUEST_DENIED to every call. Remember that for the session
// so a contractor dragging stops around doesn't fire — and log — one doomed
// request per drag. Straight lines are the answer for this key, permanently.
let directionsUnavailable = false;

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1b2a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8fa3b8' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e3a52' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#122b26' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1b2b3d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7f94' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3f57' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08131f' }] },
];

function markerSvg(text: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 43C17 43 33 26.5 33 16.5A16 16 0 1 0 1 16.5C1 26.5 17 43 17 43Z" fill="${color}" stroke="#0b1725" stroke-width="2"/>
    <text x="17" y="22" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#10202f" text-anchor="middle">${text}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const HOME_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 43C17 43 33 26.5 33 16.5A16 16 0 1 0 1 16.5C1 26.5 17 43 17 43Z" fill="#34d399" stroke="#0b1725" stroke-width="2"/>
    <path d="M10 17.5 17 11l7 6.5V24a1 1 0 0 1-1 1h-4v-5h-4v5h-4a1 1 0 0 1-1-1z" fill="#0b2b20"/>
  </svg>`,
)}`;

// Deliberately smaller and flatter than a stop pin: these are suggestions on the
// side of the road, not part of the day. But which store it is matters — "the
// orange one" is how anybody actually navigates to a Home Depot — so each chain
// gets its own colour and initials rather than one anonymous marker. See
// supply-brands.ts for why those aren't the real logos.
const supplyIconCache = new Map<string, string>();

function supplyMarkerSvg(brand: SupplyBrand): string {
  const cached = supplyIconCache.get(brand.key);
  if (cached) return cached;

  const mark = brand.short
    ? `<text x="14" y="18.4" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="${
        brand.short.length >= 3 ? 8.5 : brand.short.length === 2 ? 11 : 13.5
      }" font-weight="800" letter-spacing="-0.4" fill="${brand.fg}" text-anchor="middle">${brand.short}</text>`
    : // No chain matched: a storefront, not a guess at whose it is.
      `<path d="M7.5 9.5h13l-1.3 3.2H8.8z" fill="${brand.fg}"/>
       <path d="M9 13.2h10v6.3H9z" fill="none" stroke="${brand.fg}" stroke-width="1.6"/>`;

  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <rect x="2" y="2" width="24" height="24" rx="7.5" fill="${brand.bg}" stroke="#0b1725" stroke-width="2"/>
      ${mark}
    </svg>`,
  )}`;
  supplyIconCache.set(brand.key, url);
  return url;
}

function clearLines(lines: google.maps.Polyline[]): void {
  for (const line of lines) line.setMap(null);
}

/**
 * Draw the day one leg at a time.
 *
 * Colour says WHICH leg — cool at the start of the day, warm at the end, the
 * same ramp the stop list uses. Arrows say WHICH WAY. Keeping those two jobs on
 * separate channels means a route that doubles back on itself is still readable
 * by anyone who can't tell the hues apart.
 */
function drawLegs(
  map: google.maps.Map,
  legs: Array<Array<google.maps.LatLng | google.maps.LatLngLiteral>>,
  opacity: number,
): google.maps.Polyline[] {
  return legs.map((path, index) => {
    const color = legColor(index, legs.length);
    return new window.google.maps.Polyline({
      map,
      path,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWeight: 4,
      zIndex: 2 + index,
      icons: [
        {
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.6,
            strokeColor: '#0b1725',
            strokeWeight: 1,
            fillColor: color,
            fillOpacity: 1,
          },
          // Spaced rather than one per leg: a short hop still gets an arrow,
          // and a long one gets several without becoming a dotted line.
          offset: '8%',
          repeat: '90px',
        },
      ],
    });
  });
}

export type NearbyPlace = { label: string; address: string; lat: number; lng: number };

// Sample points along the route to search around. One search covers a radius,
// and a day can be twenty miles end to end, so the ends and the middle catch far
// more than the centroid alone — while keeping this to three billed lookups
// however many stops the day has.
function samplePoints(path: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  if (path.length <= 3) return path;
  return [path[0], path[Math.floor(path.length / 2)], path[path.length - 1]];
}

export default function RouteMap({
  stops,
  homeBase,
  apiKey,
  deferRoute = false,
  onAddPlace,
}: {
  stops: MapStop[];
  homeBase: LatLng | null;
  apiKey: string | null;
  // True while a drag is in progress. Markers and the straight-line path still
  // follow every reorder; the road route waits until the stop is let go, because
  // dragging past four rows would otherwise fire four Directions requests that
  // are all obsolete before they land.
  deferRoute?: boolean;
  // Called when a supply store on the map is chosen, so it can be dropped into
  // the day as a real stop rather than just noted.
  onAddPlace?: (place: NearbyPlace) => void;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  // Bumped on every order change so a slow Directions reply can tell whether it's
  // still the current route before it paints itself over a newer one.
  const drawIdRef = useRef(0);

  const supplyMarkersRef = useRef<google.maps.Marker[]>([]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [roadRoute, setRoadRoute] = useState(false);
  // The stop list recomputes synchronously; only the road route takes time, so
  // that's the one thing that gets to say it's working.
  const [routing, setRouting] = useState(false);
  // Off by default, and deliberately. Every toggle-on is three billed Places
  // lookups, and a map speckled with stores nobody asked about is worse than a
  // clean one — so this is something you turn on when you need a run.
  const [showSupply, setShowSupply] = useState(false);
  const [supplyState, setSupplyState] = useState<'idle' | 'loading' | 'none' | 'failed'>('idle');
  const [supplyCount, setSupplyCount] = useState(0);

  const fitRoute = useCallback(() => {
    if (mapRef.current && boundsRef.current && !boundsRef.current.isEmpty()) {
      mapRef.current.fitBounds(boundsRef.current, 48);
    }
  }, []);

  useEffect(() => {
    if (!apiKey || !holderRef.current) {
      if (!apiKey) setStatus('failed');
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const maps = await loadMapsLibrary<google.maps.MapsLibrary>(apiKey, 'maps');
        if (cancelled || !holderRef.current) return;
        mapRef.current = new maps.Map(holderRef.current, {
          center: homeBase ?? { lat: stops[0]?.lat ?? 0, lng: stops[0]?.lng ?? 0 },
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          styles: DARK_STYLE,
          backgroundColor: '#0d1b2a',
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Built once. Stops and home base are drawn by the effect below, which reruns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Redraw markers and the route whenever the order changes.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !window.google) return;

    const drawId = ++drawIdRef.current;
    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    if (homeBase) {
      bounds.extend(homeBase);
      markersRef.current.push(
        new window.google.maps.Marker({
          map,
          position: homeBase,
          icon: { url: HOME_SVG, scaledSize: new window.google.maps.Size(34, 44), anchor: new window.google.maps.Point(17, 43) },
          title: 'Your shop — the day starts and ends here',
          zIndex: 1,
        }),
      );
    }

    stops.forEach((stop, index) => {
      const position = { lat: stop.lat, lng: stop.lng };
      bounds.extend(position);
      markersRef.current.push(
        new window.google.maps.Marker({
          map,
          position,
          // The number IS the row number in the list beside it; that pairing is the
          // only thing making the map readable.
          icon: {
            url: markerSvg(String(index + 1), stop.locked ? '#ffd166' : '#ff8a3d'),
            scaledSize: new window.google.maps.Size(34, 44),
            anchor: new window.google.maps.Point(17, 43),
          },
          title: `${index + 1}. ${stop.label}`,
          zIndex: 10 + index,
        }),
      );
    });

    boundsRef.current = bounds;
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);

    const path = [...(homeBase ? [homeBase] : []), ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
    if (homeBase && stops.length > 0) path.push(homeBase);

    clearLines(linesRef.current);
    linesRef.current = drawLegs(
      map,
      // Straight-line legs until Directions answers: one segment per hop, so
      // the colours and arrows are right even before the roads arrive.
      path.slice(0, -1).map((from, index) => [from, path[index + 1]]),
      0.8,
    );
    setRoadRoute(false);

    // Upgrade to the real road route when we can get one.
    if (path.length >= 2 && stops.length <= DIRECTIONS_MAX_WAYPOINTS && !directionsUnavailable && !deferRoute) {
      setRouting(true);
      void (async () => {
        try {
          const routes = await loadMapsLibrary<google.maps.RoutesLibrary>(apiKey!, 'routes');
          const service = new routes.DirectionsService();
          const result = await service.route({
            origin: path[0],
            destination: path[path.length - 1],
            waypoints: path.slice(1, -1).map((location) => ({ location, stopover: true })),
            optimizeWaypoints: false, // The order is the contractor's; never reshuffle it.
            travelMode: window.google.maps.TravelMode.DRIVING,
          });
          // A newer order started drawing while this was in flight.
          if (drawId !== drawIdRef.current || !mapRef.current) return;
          // Per LEG, not the overview path: the overview is one line for the
          // whole day and can't be coloured leg by leg.
          const legs = result.routes[0]?.legs ?? [];
          const legPaths = legs
            .map((leg) => (leg.steps ?? []).flatMap((step) => step.path ?? []))
            .filter((points) => points.length >= 2);
          if (legPaths.length === 0) return;
          clearLines(linesRef.current);
          linesRef.current = drawLegs(mapRef.current, legPaths, 0.9);
          setRoadRoute(true);
        } catch (error) {
          // Directions not enabled on the key, over quota, or no route between two
          // points. The straight-line polyline is already drawn and stays.
          const message = error instanceof Error ? error.message : String(error);
          if (/REQUEST_DENIED|not enabled|legacy API/i.test(message)) directionsUnavailable = true;
        } finally {
          if (drawId === drawIdRef.current) setRouting(false);
        }
      })();
    } else {
      setRouting(false);
    }
  }, [stops, homeBase, status, apiKey, deferRoute]);

  // Supply stores near the route. Searched once when switched on and left alone
  // after that — dragging stops around doesn't move a Home Depot.
  useEffect(() => {
    for (const marker of supplyMarkersRef.current) marker.setMap(null);
    supplyMarkersRef.current = [];

    const map = mapRef.current;
    if (!showSupply || status !== 'ready' || !map || !apiKey || stops.length === 0) {
      setSupplyState('idle');
      setSupplyCount(0);
      return;
    }

    let cancelled = false;
    setSupplyState('loading');

    void (async () => {
      try {
        const places = await loadMapsLibrary<google.maps.PlacesLibrary>(apiKey, 'places');
        const path = [...(homeBase ? [homeBase] : []), ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))];
        const found = new Map<string, NearbyPlace>();

        for (const point of samplePoints(path)) {
          const { places: results } = await places.Place.searchNearby({
            fields: ['displayName', 'formattedAddress', 'location', 'id'],
            locationRestriction: { center: point, radius: 6000 },
            includedPrimaryTypes: ['hardware_store', 'home_improvement_store'],
            maxResultCount: 8,
          });
          for (const place of results ?? []) {
            const location = place.location;
            if (!place.id || !location) continue;
            found.set(place.id, {
              label: place.displayName ?? 'Supply store',
              address: place.formattedAddress ?? '',
              lat: location.lat(),
              lng: location.lng(),
            });
          }
        }
        if (cancelled || !mapRef.current || !window.google) return;

        for (const place of found.values()) {
          const brand = supplyBrand(place.label);
          const marker = new window.google.maps.Marker({
            map: mapRef.current,
            position: { lat: place.lat, lng: place.lng },
            icon: {
              url: supplyMarkerSvg(brand),
              scaledSize: new window.google.maps.Size(24, 24),
              anchor: new window.google.maps.Point(12, 12),
            },
            title: onAddPlace ? `${place.label} — click to add as a stop` : place.label,
            zIndex: 5,
          });
          // Finding the store is only half of it; the useful move is putting it
          // in the day, with its address and coordinates already filled in.
          if (onAddPlace) marker.addListener('click', () => onAddPlace(place));
          supplyMarkersRef.current.push(marker);
        }
        setSupplyCount(found.size);
        setSupplyState(found.size === 0 ? 'none' : 'idle');
      } catch {
        // Places not enabled on the key, or over quota. The route is unaffected.
        if (!cancelled) setSupplyState('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately not keyed on `stops`: re-searching on every drag would bill a
    // lookup per reorder to find the same stores in the same places.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSupply, status, apiKey]);

  useEffect(() => {
    const markers = markersRef.current;
    const supply = supplyMarkersRef.current;
    const lines = linesRef.current;
    return () => {
      for (const marker of [...markers, ...supply]) marker.setMap(null);
      clearLines(lines);
    };
  }, []);

  if (status === 'failed') {
    return (
      <div className="plan-map-holder plan-map-fallback">
        <p>
          {apiKey
            ? "The map couldn't load. Your stops and the route order below are unaffected."
            : 'Add a Google Maps API key to see the day on a map. The route order below works without it.'}
        </p>
      </div>
    );
  }

  return (
    <div className="plan-map-holder">
      <div ref={holderRef} className="plan-map-canvas" role="img" aria-label={`Route map with ${stops.length} stops`} />
      {status === 'loading' ? <div className="plan-map-veil">Loading map…</div> : null}
      {status === 'ready' && routing ? <span className="plan-map-busy">Recalculating route…</span> : null}
      <div className="plan-map-controls">
        <button
          type="button"
          className={`plan-map-toggle${showSupply ? ' is-on' : ''}`}
          onClick={() => setShowSupply((on) => !on)}
          disabled={status !== 'ready' || stops.length === 0}
          aria-pressed={showSupply}
          title="Hardware and home-improvement stores near today's route"
        >
          {supplyState === 'loading'
            ? 'Finding stores…'
            : supplyState === 'failed'
              ? 'Stores unavailable'
              : supplyState === 'none'
                ? 'No stores nearby'
                : showSupply && supplyCount > 0
                  ? `${supplyCount} supply stores`
                  : 'Supply stores'}
        </button>
        <button type="button" className="plan-map-fit" onClick={fitRoute} disabled={status !== 'ready'}>
          Fit entire route
        </button>
      </div>
      {status === 'ready' && !roadRoute && !routing && stops.length > 0 ? (
        <span className="plan-map-note">Straight-line preview</span>
      ) : null}
    </div>
  );
}
