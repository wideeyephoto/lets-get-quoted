// One Google Maps <script> for the whole app.
//
// The SDK refuses to be loaded twice and warns loudly about it, so every consumer
// has to share a tag. The `libraries=` query param only decides what's preloaded —
// importLibrary() can pull any library on demand afterwards — which is why the
// places-flavoured tag the address autocomplete already injects is a perfectly
// good tag to hang the map off. Keeping the same element id is what makes that
// work; changing it would produce a second tag and the duplicate-load warning.

const SCRIPT_ID = 'google-maps-places-script';

let scriptPromise: Promise<void> | null = null;
const libraryPromises = new Map<string, Promise<unknown>>();

function ready(): boolean {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

// The tag can be in the DOM before the SDK has finished installing itself, so
// "the script exists" isn't the same as "importLibrary is callable".
function waitForReady(): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (ready()) return resolve();
      if (Date.now() - startedAt > 8000) return reject(new Error('Google Maps script did not initialize'));
      window.setTimeout(check, 50);
    };
    check();
  });
}

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    if (ready()) return resolve();

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
      void waitForReady().then(resolve, reject);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&auth_referrer_policy=origin`;
    script.async = true;
    script.onload = () => void waitForReady().then(resolve, reject);
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  // A failed load must not poison every later attempt — a contractor who loses
  // signal mid-load should get a working map when they come back.
  scriptPromise.catch(() => {
    scriptPromise = null;
  });

  return scriptPromise;
}

export function loadMapsLibrary<T>(apiKey: string, name: string): Promise<T> {
  const cached = libraryPromises.get(name);
  if (cached) return cached as Promise<T>;

  const promise = loadGoogleMapsScript(apiKey).then(async () => {
    const library = await window.google?.maps.importLibrary(name);
    if (!library) throw new Error(`Google Maps library "${name}" is unavailable`);
    return library;
  });
  promise.catch(() => {
    libraryPromises.delete(name);
  });

  libraryPromises.set(name, promise);
  return promise as Promise<T>;
}
