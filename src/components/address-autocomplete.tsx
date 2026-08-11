'use client';

import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react';

type AddressAutocompleteProps = {
  id?: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  maxLength?: number;
  autoComplete?: string;
  // The input stays uncontrolled — Google's suggestion list writes to it
  // directly — so a caller that needs to read or set the text gets the element
  // itself, and is told when the text changes.
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onValueChange?: (value: string) => void;
  /**
   * What the field is for.
   *
   * 'address' (default) puts the formatted address in the input — the existing
   * behavior everywhere. 'place' puts the BUSINESS NAME in it instead, which
   * is what you want on a field labelled Name: typing "Home Dep" and picking
   * the Rochester Rd branch should leave "The Home Depot" in the box, not a
   * street address, while the address goes wherever the caller wants it.
   */
  mode?: 'address' | 'place';
  /**
   * Where to look first. Without it, "Home Depot Royal Oak" typed in Michigan
   * returns Royal Oaks Boulevard in Franklin, Tennessee — a national search for
   * a business somebody is about to drive to this afternoon. A bias doesn't
   * exclude anything further out, it just stops the local branch losing to a
   * better-known one 500 miles away.
   */
  bias?: { lat: number; lng: number } | null;
  /**
   * The whole place, once one is picked. Coordinates come back too, so a caller
   * can skip geocoding an address Google just handed it.
   */
  onPlaceSelected?: (place: { name: string; address: string; lat: number | null; lng: number | null }) => void;
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

let mapsScriptPromise: Promise<void> | null = null;
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | null = null;

type AddressSuggestion = {
  id: string;
  label: string;
  mainText: string;
  secondaryText: string;
  prediction: google.maps.places.PlacePrediction;
};

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

function loadGooglePlacesLibrary(apiKey: string): Promise<google.maps.PlacesLibrary> {
  if (placesLibraryPromise) return placesLibraryPromise;

  placesLibraryPromise = loadGoogleMapsScript(apiKey).then(async () => {
    const places = await window.google?.maps.importLibrary('places') as google.maps.PlacesLibrary | undefined;
    if (!places?.AutocompleteSuggestion) throw new Error('Google Places autocomplete is unavailable');
    return places;
  });

  return placesLibraryPromise;
}

export default function AddressAutocomplete({
  id,
  name,
  defaultValue,
  placeholder,
  required,
  className,
  maxLength,
  autoComplete = 'off',
  inputRef: externalInputRef,
  onValueChange,
  mode = 'address',
  onPlaceSelected,
  bias,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestRef = useRef(0);
  const blurTimerRef = useRef<number | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const listboxId = useId();
  const [isReady, setIsReady] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  function queueSuggestions(value: string) {
    const places = placesRef.current;
    const search = value.trim();
    if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);

    if (!isReady || !places || search.length < 4) {
      setSuggestions([]);
      setHighlightedIndex(-1);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    fetchTimerRef.current = window.setTimeout(async () => {
      try {
        const sessionToken = sessionTokenRef.current ?? new places.AutocompleteSessionToken();
        sessionTokenRef.current = sessionToken;
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: search,
          sessionToken,
          region: 'us',
          // ~40km, which covers a working day's driving without walling off
          // anything further.
          ...(bias ? { locationBias: { center: bias, radius: 40000 } } : {}),
        });
        if (requestRef.current !== requestId) return;

        const nextSuggestions = response.suggestions
          .map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;
            const label = prediction.text.toString();
            return {
              id: `${prediction.placeId}-${index}`,
              label,
              mainText: prediction.mainText?.toString() ?? label,
              secondaryText: prediction.secondaryText?.toString() ?? '',
              prediction,
            };
          })
          .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion))
          .slice(0, 5);

        setSuggestions(nextSuggestions);
        setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch {
        if (requestRef.current === requestId) {
          setSuggestions([]);
          setHighlightedIndex(-1);
        }
      }
    }, 220);
  }

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;

    loadGooglePlacesLibrary(apiKey)
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places;
        setIsReady(true);
      })
      .catch(() => {
        // Silently fall back to a plain text input if Maps fails to load.
      });

    return () => {
      cancelled = true;
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const syncSuggestions = () => queueSuggestions(input.value);
    input.addEventListener('input', syncSuggestions);
    input.addEventListener('focus', syncSuggestions);

    return () => {
      input.removeEventListener('input', syncSuggestions);
      input.removeEventListener('focus', syncSuggestions);
    };
  }, [isReady]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    const selectedAddress = suggestion.label;
    setSuggestions([]);
    setHighlightedIndex(-1);
    // Show the prediction immediately; the detail fetch below refines it.
    if (inputRef.current) inputRef.current.value = mode === 'place' ? suggestion.mainText : selectedAddress;

    try {
      const place = suggestion.prediction.toPlace();
      // Only ask for coordinates when somebody is listening for them — every
      // extra field on a Place is billable.
      const fields =
        mode === 'place' || onPlaceSelected
          ? ['displayName', 'formattedAddress', 'location']
          : ['formattedAddress'];
      await place.fetchFields({ fields });

      const address = place.formattedAddress ?? selectedAddress;
      const name = place.displayName ?? suggestion.mainText;
      if (inputRef.current) inputRef.current.value = mode === 'place' ? name : address;
      onValueChange?.(mode === 'place' ? name : address);
      onPlaceSelected?.({
        name,
        address,
        lat: place.location?.lat() ?? null,
        lng: place.location?.lng() ?? null,
      });
    } catch {
      // Keep the selected prediction text if full place details are unavailable.
    } finally {
      sessionTokenRef.current = null;
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(suggestions[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
  }

  return (
    // Only the field with a list open is lifted. Two autocompletes in one form
    // sit at the same z-index, so the one later in the DOM painted over the
    // other's suggestions — on the Add a stop form that made every Name
    // suggestion unclickable, hidden behind the Address input below it.
    <div className={`address-autocomplete${suggestions.length > 0 ? ' is-open' : ''}`}>
      <input
        ref={(node) => {
          (inputRef as MutableRefObject<HTMLInputElement | null>).current = node;
          if (externalInputRef) externalInputRef.current = node;
        }}
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={className}
        maxLength={maxLength}
        autoComplete={autoComplete}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={suggestions.length > 0 ? listboxId : undefined}
        aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => setSuggestions([]), 140);
        }}
        onChange={(event) => {
          onValueChange?.(event.currentTarget.value);
          queueSuggestions(event.currentTarget.value);
        }}
        onInput={(event) => queueSuggestions(event.currentTarget.value)}
        onFocus={(event) => queueSuggestions(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      {suggestions.length > 0 ? (
        <div id={listboxId} className="address-autocomplete-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={index === highlightedIndex ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => void selectSuggestion(suggestion)}
            >
              <span>{suggestion.mainText}</span>
              {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
