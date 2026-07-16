'use client';

import { useEffect, useRef } from 'react';

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
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

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !inputRef.current) return;

    let autocomplete: google.maps.places.Autocomplete | null = null;
    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return;
        autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          fields: ['formatted_address'],
        });
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete?.getPlace();
          if (place?.formatted_address && inputRef.current) {
            inputRef.current.value = place.formatted_address;
          }
        });
      })
      .catch(() => {
        // Silently fall back to a plain text input if Maps fails to load.
      });

    return () => {
      cancelled = true;
      if (autocomplete && window.google) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, []);

  return (
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
    />
  );
}
