'use client';

import { useId, useRef, useState, useEffect, type CSSProperties } from 'react';
import { suggestCities } from '@/lib/city-suggest';
import { loadMapsLibrary } from '@/lib/google-maps-loader';

type CityAutocompleteProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
};

type FormattedSuggestion = {
  id: string;
  label: string; // e.g. "Royal Oak, MI"
  mainText: string; // e.g. "Royal Oak"
  secondaryText: string; // e.g. "MI, USA"
};

export default function CityAutocomplete({
  id,
  name,
  value,
  onChange,
  placeholder = 'e.g. Royal Oak, MI',
  className,
  style,
  disabled = false,
  autoFocus = false,
  required = false,
}: CityAutocompleteProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<FormattedSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const blurTimerRef = useRef<number | null>(null);
  const fetchTimerRef = useRef<number | null>(null);

  // Initialize Google Maps Places if API Key is configured
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;
    loadMapsLibrary<google.maps.PlacesLibrary>(apiKey, 'places')
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places;
      })
      .catch(() => {
        // Fall back to local city dictionary
      });

    return () => {
      cancelled = true;
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
    };
  }, []);

  function offerSuggestions(query: string) {
    const trimmed = query.trim();
    if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);

    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    // 1. Instant local dictionary matches (0ms latency, handles missing spaces like 'royaloak')
    const localMatches = suggestCities(trimmed, 6).map((c, i) => ({
      id: `local-${c.label}-${i}`,
      label: c.label,
      mainText: c.city,
      secondaryText: `${c.state}, USA`,
    }));

    setSuggestions(localMatches);
    setIsOpen(localMatches.length > 0);
    setHighlightedIndex(localMatches.length > 0 ? 0 : -1);

    // 2. Secondary async Google Places query for specialized / niche municipalities
    const places = placesRef.current;
    if (!places?.AutocompleteSuggestion) return;

    fetchTimerRef.current = window.setTimeout(async () => {
      try {
        const sessionToken = sessionTokenRef.current ?? new places.AutocompleteSessionToken();
        sessionTokenRef.current = sessionToken;

        const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          region: 'us',
          includedPrimaryTypes: ['locality', 'sublocality', 'administrative_area_level_3'],
        });

        const rawMatches = (response.suggestions || [])
          .map((s, idx) => {
            const pred = s.placePrediction;
            if (!pred) return null;
            const fullText = pred.text.toString();
            const main = pred.mainText?.toString() || fullText.split(',')[0] || fullText;
            const secondary = pred.secondaryText?.toString() || '';
            // Format into clean "City, ST" if secondary has state
            const stateMatch = secondary.match(/\b([A-Z]{2})\b/);
            const label = stateMatch ? `${main}, ${stateMatch[1]}` : fullText.replace(/, USA$/i, '');

            return {
              id: `gplaces-${pred.placeId || idx}`,
              label,
              mainText: main,
              secondaryText: secondary,
            };
          });

        const placesMatches = rawMatches.filter((s): s is FormattedSuggestion => s !== null);

        if (placesMatches.length > 0) {
          // Merge with priority on exact label match
          const seen = new Set<string>();
          const combined: FormattedSuggestion[] = [];

          for (const item of [...localMatches, ...placesMatches]) {
            const norm = item.label.toLowerCase();
            if (!seen.has(norm)) {
              seen.add(norm);
              combined.push(item);
              if (combined.length >= 7) break;
            }
          }

          setSuggestions(combined);
          setIsOpen(combined.length > 0);
        }
      } catch {
        // Retain local matches on place query error
      }
    }, 200);
  }

  function handleSelect(suggestion: FormattedSuggestion) {
    onChange(suggestion.label);
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        event.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setSuggestions([]);
      setHighlightedIndex(-1);
    } else if (event.key === 'Tab') {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        handleSelect(suggestions[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    }
  }

  return (
    <div
      className={`address-autocomplete${isOpen && suggestions.length > 0 ? ' is-open' : ''}`}
      style={{ position: 'relative', width: '100%' }}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          offerSuggestions(e.target.value);
        }}
        onFocus={() => {
          if (value.trim().length >= 2) {
            offerSuggestions(value);
          }
        }}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => {
            setIsOpen(false);
          }, 180);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        aria-controls={isOpen && suggestions.length > 0 ? listboxId : undefined}
        aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined}
        className={className}
        style={{
          width: '100%',
          ...style,
        }}
      />

      {isOpen && suggestions.length > 0 ? (
        <div
          id={listboxId}
          className="address-autocomplete-suggestions"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 99999,
            background: 'var(--surface-dropdown, #111827)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px',
          }}
        >
          {suggestions.map((suggestion, index) => {
            const isSelected = index === highlightedIndex;
            return (
              <button
                key={suggestion.id}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(suggestion)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '5px',
                  background: isSelected ? 'rgba(249, 115, 22, 0.18)' : 'transparent',
                  color: isSelected ? '#ffffff' : 'var(--foreground, #f3f4f6)',
                  border: isSelected ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.82rem',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.85rem', color: isSelected ? '#f97316' : 'var(--muted, #9ca3af)' }}>
                    📍
                  </span>
                  <span style={{ fontWeight: 600 }}>{suggestion.label}</span>
                </div>
                {suggestion.secondaryText && (
                  <small style={{ color: 'var(--muted, #9ca3af)', fontSize: '0.72rem' }}>
                    {suggestion.secondaryText}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
