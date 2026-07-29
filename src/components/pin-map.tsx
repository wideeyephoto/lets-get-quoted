'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// A pin on the dashboard map. `kind` drives the marker colour + legend.
export type MapPinKind = 'lead' | 'unscheduled' | 'scheduled';
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  kind: MapPinKind;
  label: string;
  sublabel?: string;
  href: string;
};

const PIN_COLORS: Record<MapPinKind, string> = {
  lead: '#ff7a21', // needs response
  unscheduled: '#ffd166', // quote out / needs scheduling
  scheduled: '#4ade80', // has a date
};

const LEGEND: { kind: MapPinKind; label: string }[] = [
  { kind: 'lead', label: 'Lead — needs response' },
  { kind: 'unscheduled', label: 'Quote out — needs scheduling' },
  { kind: 'scheduled', label: 'Scheduled job' },
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

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}

export default function PinMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Re-init only when the actual pin set changes (parent passes a fresh array each render).
  const sig = useMemo(() => pins.map((p) => `${p.id}:${p.lat},${p.lng}:${p.kind}`).join('|'), [pins]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const container = containerRef.current;
    if (!apiKey || !container || pins.length === 0) {
      setStatus(pins.length === 0 ? 'ready' : 'error');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    loadGoogleMaps(apiKey)
      .then(async () => {
        if (cancelled || !window.google) return;
        const g = window.google.maps;
        const [mapsLibrary, markerLibrary] = await Promise.all([
          g.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          g.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);
        if (cancelled) return;

        const map = new mapsLibrary.Map(container, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'cooperative',
        });

        const bounds = new g.LatLngBounds();
        const info = new mapsLibrary.InfoWindow();
        for (const pin of pins) {
          const position = { lat: pin.lat, lng: pin.lng };
          bounds.extend(position);
          const marker = new markerLibrary.Marker({
            map,
            position,
            title: pin.label,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: PIN_COLORS[pin.kind],
              fillOpacity: 1,
              strokeColor: '#0b1220',
              strokeWeight: 1.5,
            },
          });
          marker.addListener('click', () => {
            info.setContent(
              `<div style="min-width:150px;color:#141413;font-family:system-ui,sans-serif">` +
                `<strong style="font-size:13px">${esc(pin.label)}</strong>` +
                (pin.sublabel ? `<div style="color:#555;font-size:12px;margin:2px 0 4px">${esc(pin.sublabel)}</div>` : '<div style="height:4px"></div>') +
                `<a href="${esc(pin.href)}" style="color:#c2410c;font-weight:700;font-size:12px;text-decoration:none">Open &rarr;</a>` +
                `</div>`,
            );
            info.open({ map, anchor: marker });
          });
        }

        // Fit to the pins, but never zoom in past a neighborhood — a single pin
        // or a tight cluster would otherwise slam to max zoom (street level).
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
        // A map created inside a just-opened container can mount at 0×0; refit
        // once it has real size.
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

  return (
    <div className="pin-map-shell">
      <div ref={containerRef} className="pin-map" aria-label="Map of leads and jobs" />
      {pins.length === 0 ? (
        <div className="pin-map-empty">No mapped locations yet — addresses are geocoded as leads and jobs come in.</div>
      ) : null}
      {status === 'error' ? <div className="pin-map-empty">Map unavailable.</div> : null}
      <div className="pin-map-legend">
        {LEGEND.map((item) => (
          <span key={item.kind} className="pin-map-legend-item">
            <span className="pin-map-dot" style={{ background: PIN_COLORS[item.kind] }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
