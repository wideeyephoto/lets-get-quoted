'use client';

import { useEffect, useRef, useState } from 'react';

type LeadRadiusMapProps = {
  address: string | null | undefined;
  radiusMiles?: number;
  size?: 'default' | 'mini';
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;

function hasGoogleMapsImportLibrary() {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

function waitForGoogleMapsImportLibrary(): Promise<void> {
  if (hasGoogleMapsImportLibrary()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const checkReady = () => {
      if (hasGoogleMapsImportLibrary()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 5000) {
        reject(new Error('Google Maps script did not initialize'));
        return;
      }
      window.setTimeout(checkReady, 50);
    };
    checkReady();
  });
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    if (hasGoogleMapsImportLibrary()) {
      resolve();
      return;
    }

    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
    if (existing) {
      void waitForGoogleMapsImportLibrary().then(resolve, reject);
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&auth_referrer_policy=origin`;
    script.async = true;
    script.onload = () => {
      void waitForGoogleMapsImportLibrary().then(resolve, reject);
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

const METERS_PER_MILE = 1609.34;

export default function LeadRadiusMap({ address, radiusMiles = 10, size = 'default' }: LeadRadiusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const container = containerRef.current;
    if (!apiKey || !address?.trim() || !container) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    loadGoogleMapsScript(apiKey)
      .then(async () => {
        if (cancelled || !window.google) return;

        const [mapsLibrary, placesLibrary, markerLibrary] = await Promise.all([
          window.google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>,
          window.google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>,
          window.google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ]);
        if (cancelled) return;

        const { places } = await placesLibrary.Place.searchByText({
          textQuery: address,
          fields: ['location'],
          maxResultCount: 1,
        });
        const location = places[0]?.location;
        if (!location || cancelled) {
          setStatus('error');
          return;
        }

        const map = new mapsLibrary.Map(container, {
          center: location,
          zoom: size === 'mini' ? 9 : 10,
          disableDefaultUI: true,
          zoomControl: size !== 'mini',
          gestureHandling: size === 'mini' ? 'none' : 'cooperative',
        });

        new mapsLibrary.Circle({
          map,
          center: location,
          radius: radiusMiles * METERS_PER_MILE,
          strokeColor: '#ffd166',
          strokeOpacity: 0.7,
          strokeWeight: 2,
          fillColor: '#ffd166',
          fillOpacity: 0.12,
        });

        new markerLibrary.Marker({ map, position: location });

        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [address, radiusMiles]);

  if (!address?.trim()) return null;

  return (
    <div className={size === 'mini' ? 'lead-radius-map-card lead-radius-map-card--mini' : 'lead-radius-map-card'}>
      {size === 'mini' ? null : <span className="lead-radius-map-badge">{radiusMiles} mi radius</span>}
      <div ref={containerRef} className="lead-radius-map" aria-label={`Map showing a ${radiusMiles} mile radius around the job address`} />
      {status === 'error' ? <div className="lead-radius-map-empty">Map unavailable</div> : null}
    </div>
  );
}
