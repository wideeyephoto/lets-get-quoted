'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMapsLibrary } from '@/lib/google-maps-loader';
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

export default function RouteMap({
  stops,
  homeBase,
  apiKey,
}: {
  stops: MapStop[];
  homeBase: LatLng | null;
  apiKey: string | null;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  // Bumped on every order change so a slow Directions reply can tell whether it's
  // still the current route before it paints itself over a newer one.
  const drawIdRef = useRef(0);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [roadRoute, setRoadRoute] = useState(false);
  // The stop list recomputes synchronously; only the road route takes time, so
  // that's the one thing that gets to say it's working.
  const [routing, setRouting] = useState(false);

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

    if (lineRef.current) lineRef.current.setMap(null);
    lineRef.current =
      path.length >= 2
        ? new window.google.maps.Polyline({
            map,
            path,
            strokeColor: '#2f9bff',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          })
        : null;
    setRoadRoute(false);

    // Upgrade to the real road route when we can get one.
    if (path.length >= 2 && stops.length <= DIRECTIONS_MAX_WAYPOINTS && !directionsUnavailable) {
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
          const overview = result.routes[0]?.overview_path;
          if (!overview?.length) return;
          if (lineRef.current) lineRef.current.setMap(null);
          lineRef.current = new window.google.maps.Polyline({
            map: mapRef.current,
            path: overview,
            strokeColor: '#2f9bff',
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
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
  }, [stops, homeBase, status, apiKey]);

  useEffect(() => {
    const markers = markersRef.current;
    const line = lineRef.current;
    return () => {
      for (const marker of markers) marker.setMap(null);
      line?.setMap(null);
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
      <button type="button" className="plan-map-fit" onClick={fitRoute} disabled={status !== 'ready'}>
        Fit entire route
      </button>
      {status === 'ready' && !roadRoute && !routing && stops.length > 0 ? (
        <span className="plan-map-note">Straight-line preview</span>
      ) : null}
    </div>
  );
}
