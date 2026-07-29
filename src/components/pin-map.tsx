'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// A pin on the dashboard map. `kind` drives the marker colour + legend.
export type MapPinKind = 'lead' | 'unscheduled' | 'scheduled';
export type MapPinRow = { label: string; value: string };
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  kind: MapPinKind;
  label: string;
  sublabel?: string;
  href: string;
  rows?: MapPinRow[];
};

const PIN_COLORS: Record<MapPinKind, string> = {
  lead: '#ff7a21', // needs response
  unscheduled: '#ffd166', // quote out / needs scheduling
  scheduled: '#4ade80', // has a date
};

const KIND_LABEL: Record<MapPinKind, string> = {
  lead: 'Lead — needs response',
  unscheduled: 'Quote out — needs scheduling',
  scheduled: 'Scheduled job',
};

const LEGEND: MapPinKind[] = ['lead', 'unscheduled', 'scheduled'];

// Dark map styling that matches the dashboard's palette; POI/transit hidden to
// keep the pins the focus.
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#16222f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ba0b4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1420' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a3a4a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#26374a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1b2836' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9fb2c6' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33475d' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1a27' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6076' }] },
];

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;

function mapsReady() {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    if (mapsReady()) return resolve();
    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
    const waitReady = () => {
      const started = Date.now();
      const tick = () => {
        if (mapsReady()) return resolve();
        if (Date.now() - started > 6000) return reject(new Error('Google Maps did not initialize'));
        window.setTimeout(tick, 50);
      };
      tick();
    };
    if (existing) {
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      waitReady();
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&auth_referrer_policy=origin`;
    script.async = true;
    script.onload = waitReady;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

// A Material-style teardrop pin (24×27, tip at 12,27) — far more visible on a
// light map than a small circle, with a dark ring so even the gold pins pop.
const PIN_PATH = 'M12 0C7.03 0 3 4.03 3 9c0 6.75 9 18 9 18s9-11.25 9-18c0-4.97-4.03-9-9-9z';

function makeIcon(g: typeof google.maps, color: string, active: boolean, mini = false): google.maps.Symbol {
  return {
    path: PIN_PATH,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: active ? '#f7f5ef' : '#0b1220',
    strokeWeight: active ? 2.4 : 1.5,
    scale: (active ? 1.85 : 1.35) * (mini ? 0.72 : 1),
    anchor: new g.Point(12, 27),
  };
}

export default function PinMap({ pins, variant = 'large', theme = 'dark' }: { pins: MapPin[]; variant?: 'large' | 'mini'; theme?: 'dark' | 'light' }) {
  const mini = variant === 'mini';
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ id: string; marker: google.maps.Marker }[]>([]);
  const gRef = useRef<typeof google.maps | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<MapPin | null>(null);

  // Re-init only when the actual pin set changes (parent passes a fresh array each render).
  const sig = useMemo(() => `${theme}|` + pins.map((p) => `${p.id}:${p.lat},${p.lng}:${p.kind}`).join('|'), [pins, theme]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const container = containerRef.current;
    if (!apiKey || !container || pins.length === 0) {
      setStatus(pins.length === 0 ? 'ready' : 'error');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setSelected(null);

    loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !window.google) return;
        const g = window.google.maps;
        const [mapsLibrary, markerLibrary] = await Promise.all([
          g.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          g.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);
        if (cancelled) return;
        gRef.current = g;

        const styles = theme === 'dark' ? DARK_STYLE : undefined;
        const map = new mapsLibrary.Map(
          container,
          mini
            ? { styles, disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false, clickableIcons: false, zoomControl: false }
            : { styles, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false },
        );

        const bounds = new g.LatLngBounds();
        markersRef.current = [];
        for (const pin of pins) {
          const position = { lat: pin.lat, lng: pin.lng };
          bounds.extend(position);
          const marker = new markerLibrary.Marker({
            map,
            position,
            title: pin.label,
            icon: makeIcon(g, PIN_COLORS[pin.kind], false, mini),
          });
          // Mini map: a click jumps straight to the record (no room for a card).
          marker.addListener('click', () => {
            if (mini) window.location.href = pin.href;
            else setSelected(pin);
          });
          markersRef.current.push({ id: pin.id, marker });
        }
        // Large map only: clicking empty map closes the detail card.
        if (!mini) map.addListener('click', () => setSelected(null));

        // Fit to the pins, but never zoom past a neighborhood — a single pin or a
        // tight cluster would otherwise slam to street level.
        const MAX_ZOOM = 14;
        const fit = () => {
          if (pins.length === 1) {
            map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
            map.setZoom(11);
            return;
          }
          map.fitBounds(bounds, 56);
          g.event.addListenerOnce(map, 'idle', () => {
            const z = map.getZoom();
            if (typeof z === 'number' && z > MAX_ZOOM) map.setZoom(MAX_ZOOM);
          });
        };
        fit();
        const ro = new ResizeObserver(() => {
          if (container.clientWidth > 0) fit();
        });
        ro.observe(container);
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Emphasize the selected marker + wire Escape-to-close (large map only).
  useEffect(() => {
    if (mini) return;
    const g = gRef.current;
    if (g) {
      for (const { id, marker } of markersRef.current) {
        const pin = pins.find((p) => p.id === id);
        if (pin) marker.setIcon(makeIcon(g, PIN_COLORS[pin.kind], id === selected?.id));
      }
    }
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sig]);

  if (mini) {
    return (
      <div className="pin-map-mini" aria-label={`Map — ${pins.length} location${pins.length === 1 ? '' : 's'}`} title="Leads &amp; jobs map">
        <div ref={containerRef} className="pin-map-mini-canvas" />
      </div>
    );
  }

  return (
    <div className="pin-map-shell">
      <div className="pin-map-wrap">
        <div ref={containerRef} className="pin-map" aria-label="Map of leads and jobs" />
        {selected ? (
          <div className="pin-card" role="dialog" aria-label={`${selected.label} details`}>
            <button type="button" className="pin-card-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
            <span className="pin-card-kind" data-kind={selected.kind}>{KIND_LABEL[selected.kind]}</span>
            <strong className="pin-card-name">{selected.label}</strong>
            {selected.sublabel ? <span className="pin-card-sub">{selected.sublabel}</span> : null}
            {selected.rows && selected.rows.length > 0 ? (
              <dl className="pin-card-rows">
                {selected.rows.map((row) => (
                  <div className="pin-card-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <a className="pin-card-open" href={selected.href}>Open &rarr;</a>
          </div>
        ) : null}
      </div>
      {pins.length === 0 ? (
        <div className="pin-map-empty">No mapped locations yet — addresses are geocoded as leads and jobs come in.</div>
      ) : null}
      {status === 'error' ? <div className="pin-map-empty">Map unavailable.</div> : null}
      <div className="pin-map-legend">
        {LEGEND.map((kind) => (
          <span key={kind} className="pin-map-legend-item">
            <span className="pin-map-dot" style={{ background: PIN_COLORS[kind] }} aria-hidden="true" />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  );
}
