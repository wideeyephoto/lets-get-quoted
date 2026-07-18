'use client';

import { useEffect, useId, useRef, useState } from 'react';

type AddressAutocompleteProps = {
  id?: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  maxLength?: number;
  autoComplete?: string;
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

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    const existing = document.getElementById('google-maps-places-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&auth_referrer_policy=origin`;
    script.async = true;
    script.onload = () => resolve();
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
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestRef = useRef(0);
  const blurTimerRef = useRef<number | null>(null);
  const listboxId = useId();
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState(defaultValue ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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
    };
  }, []);

  useEffect(() => {
    const places = placesRef.current;
    const search = query.trim();
    if (!isReady || !places || search.length < 4) {
      setSuggestions([]);
      setHighlightedIndex(-1);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const timer = window.setTimeout(async () => {
      try {
        const sessionToken = sessionTokenRef.current ?? new places.AutocompleteSessionToken();
        sessionTokenRef.current = sessionToken;
        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: search,
          sessionToken,
          region: 'us',
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

    return () => window.clearTimeout(timer);
  }, [isReady, query]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    const selectedAddress = suggestion.label;
    setSuggestions([]);
    setHighlightedIndex(-1);
    if (inputRef.current) inputRef.current.value = selectedAddress;
    setQuery(selectedAddress);

    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress'] });
      if (place.formattedAddress && inputRef.current) {
        inputRef.current.value = place.formattedAddress;
        setQuery(place.formattedAddress);
      }
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
    <div className="address-autocomplete">
      <input
        ref={inputRef}
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
        onChange={(event) => setQuery(event.currentTarget.value)}
        onFocus={(event) => setQuery(event.currentTarget.value)}
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
