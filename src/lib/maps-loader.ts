'use client';

// Loading the Google Maps JS API, once, for the whole app.
//
// Shared rather than per-component and that is the entire point: the promise
// below is module-scoped, so every caller awaits the SAME script tag. Two
// components each holding their own copy of this would append two <script>
// elements for the same library, and the second one re-defining `google.maps`
// under the first is a class of bug that shows up as a map that works until you
// put a second map on the page.
//
// Lived inside components/pin-map until the Quick Stops coverage map needed it.

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;

function mapsReady(): boolean {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
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

// Dark map styling that matches the dashboard's palette; POI/transit hidden to
// keep whatever is drawn on top the focus.
export const MAP_DARK_STYLE: google.maps.MapTypeStyle[] = [
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

// The light counterpart. NOT Google's default: the same POI and transit clutter
// is hidden, and the roads are muted, so a translucent coverage overlay drawn on
// top still reads as the brightest thing on the map.
export const MAP_LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f3f5f8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b6b7d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d7dee7' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b7b8d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbe6f0' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8aa0b4' }] },
];
