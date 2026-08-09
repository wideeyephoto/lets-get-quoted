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

// Map IDs are public identifiers, not credentials. This production ID enables
// vector rendering and AdvancedMarkerElement across every dashboard map. Keep
// an environment override for previews or a future Cloud project migration.
export const GOOGLE_MAPS_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'dcb10bb04a8ee6d4b12bca2a';

export function googleMapAppearance(theme: 'dark' | 'light' = 'light'):
  Pick<google.maps.MapOptions, 'mapId' | 'colorScheme'> {
  return {
    mapId: GOOGLE_MAPS_MAP_ID,
    colorScheme: theme === 'dark' ? 'DARK' : 'LIGHT',
  };
}

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
