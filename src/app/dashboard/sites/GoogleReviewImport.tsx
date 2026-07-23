'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './SiteEditor.module.css';

// Reuses the same browser Google Maps key + Places (New) library that powers the
// address autocomplete. Searching finds the owner's Business Profile; selecting
// it fetches up to 5 reviews (Google's cap, chosen by Google) client-side, which
// the builder then stores in content. No server key needed.
declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

function hasImportLibrary() {
  return Boolean(window.google?.maps && 'importLibrary' in window.google.maps);
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    if (hasImportLibrary()) return resolve();
    const waitReady = () => {
      const startedAt = Date.now();
      const check = () => {
        if (hasImportLibrary()) return resolve();
        if (Date.now() - startedAt > 6000) return reject(new Error('Google Maps did not initialize'));
        window.setTimeout(check, 60);
      };
      check();
    };
    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
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

function loadPlaces(apiKey: string): Promise<google.maps.PlacesLibrary> {
  if (placesLibraryPromise) return placesLibraryPromise;
  placesLibraryPromise = loadGoogleMapsScript(apiKey).then(async () => {
    const places = (await window.google?.maps.importLibrary('places')) as google.maps.PlacesLibrary | undefined;
    if (!places?.AutocompleteSuggestion) throw new Error('Google Places is unavailable');
    return places;
  });
  return placesLibraryPromise;
}

export type GoogleImportData = {
  placeId: string;
  name: string;
  url: string;
  rating: number;
  reviewCount: number;
  reviews: {
    id: string;
    author: string;
    authorPhoto: string;
    rating: number;
    text: string;
    relativeTime: string;
    url: string;
  }[];
};

type Suggestion = { id: string; mainText: string; secondaryText: string; prediction: google.maps.places.PlacePrediction };

type GoogleReviewImportProps = {
  placeId: string;
  name: string;
  reviewCount: number;
  importedCount: number;
  importedAt: string;
  onImport: (data: GoogleImportData) => void;
  onClear: () => void;
};

const REVIEW_FIELDS = ['id', 'displayName', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'];

async function extractReviews(place: google.maps.places.Place): Promise<GoogleImportData> {
  const reviews = (place.reviews ?? []).slice(0, 5).map((review, index) => ({
    id: `google-review-${index + 1}`,
    author: review.authorAttribution?.displayName ?? 'Google reviewer',
    authorPhoto: review.authorAttribution?.photoURI ?? '',
    rating: typeof review.rating === 'number' ? review.rating : 5,
    text: review.text ?? '',
    relativeTime: review.relativePublishTimeDescription ?? '',
    url: review.authorAttribution?.uri ?? place.googleMapsURI ?? '',
  }));
  return {
    placeId: place.id,
    name: place.displayName ?? '',
    url: place.googleMapsURI ?? '',
    rating: typeof place.rating === 'number' ? place.rating : 0,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
    reviews,
  };
}

export default function GoogleReviewImport({ placeId, name, reviewCount, importedCount, importedAt, onImport, onClear }: GoogleReviewImportProps) {
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setError('Google Maps key is not configured.');
      return;
    }
    let cancelled = false;
    loadPlaces(apiKey)
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places;
        setReady(true);
      })
      .catch(() => setError('Could not load Google Places.'));
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [apiKey]);

  function queueSuggestions(value: string) {
    setQuery(value);
    setError(null);
    const places = placesRef.current;
    const search = value.trim();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!ready || !places || search.length < 3) {
      setSuggestions([]);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    timerRef.current = window.setTimeout(async () => {
      try {
        const sessionToken = sessionTokenRef.current ?? new places.AutocompleteSessionToken();
        sessionTokenRef.current = sessionToken;
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: search, sessionToken, region: 'us' });
        if (requestRef.current !== requestId) return;
        setSuggestions(
          response.suggestions
            .map((suggestion, index) => {
              const prediction = suggestion.placePrediction;
              if (!prediction) return null;
              const label = prediction.text.toString();
              return {
                id: `${prediction.placeId}-${index}`,
                mainText: prediction.mainText?.toString() ?? label,
                secondaryText: prediction.secondaryText?.toString() ?? '',
                prediction,
              };
            })
            .filter((item): item is Suggestion => Boolean(item))
            .slice(0, 5),
        );
      } catch {
        if (requestRef.current === requestId) setSuggestions([]);
      }
    }, 220);
  }

  async function importFromPlace(run: () => Promise<google.maps.places.Place>) {
    setBusy(true);
    setError(null);
    setSuggestions([]);
    try {
      const place = run();
      const resolved = await place;
      await resolved.fetchFields({ fields: REVIEW_FIELDS });
      const data = await extractReviews(resolved);
      if (data.reviews.length === 0) {
        setError('That business has no public Google reviews to import yet.');
        return;
      }
      onImport(data);
      setQuery('');
    } catch {
      setError('Could not fetch reviews. Make sure the Places API (with reviews) is enabled for your Google key.');
    } finally {
      sessionTokenRef.current = null;
      setBusy(false);
    }
  }

  function selectSuggestion(suggestion: Suggestion) {
    void importFromPlace(async () => suggestion.prediction.toPlace());
  }

  function refresh() {
    const places = placesRef.current;
    if (!places || !placeId) return;
    void importFromPlace(async () => new places.Place({ id: placeId }));
  }

  return (
    <div className={styles.googleImport}>
      {placeId ? (
        <div className={styles.googleImportLinked}>
          <div>
            <strong>{name || 'Linked Google Business'}</strong>
            <small>{importedCount} of {reviewCount || importedCount} reviews imported{importedAt ? ` · updated ${importedAt}` : ''}</small>
          </div>
          <div className={styles.googleImportActions}>
            <button type="button" onClick={refresh} disabled={busy || !ready}>{busy ? 'Refreshing…' : 'Refresh'}</button>
            <button type="button" className={styles.googleImportUnlink} onClick={onClear} disabled={busy}>Unlink</button>
          </div>
        </div>
      ) : (
        <div className={styles.googleImportSearch}>
          <input
            type="text"
            value={query}
            placeholder={ready ? 'Search your business name + city…' : 'Loading Google…'}
            disabled={!ready || busy}
            onChange={(event) => queueSuggestions(event.target.value)}
            aria-label="Find your Google Business"
          />
          {suggestions.length > 0 && (
            <div className={styles.googleImportSuggestions} role="listbox">
              {suggestions.map((suggestion) => (
                <button key={suggestion.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)}>
                  <span>{suggestion.mainText}</span>
                  {suggestion.secondaryText && <small>{suggestion.secondaryText}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {busy && !placeId && <p className={styles.googleImportBusy}>Fetching reviews…</p>}
      {error && <p className={styles.googleImportError}>{error}</p>}
      <p className={styles.fieldHint}>Google returns up to 5 reviews and picks which ones. They show with author name, photo, and a link to Google, as Google requires.</p>
    </div>
  );
}
