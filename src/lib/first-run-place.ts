import type { AreaGeocodeResult } from '@/lib/geocode';

/**
 * Pure helpers for the first-run welcome ZIP place echo.
 *
 * Maps an AreaGeocodeResult (or server place resolution) plus the optional
 * ?city= marketing param to what the intake hint should say.
 *
 * Four outcomes:
 * 1. 'resolved': 5-digit ZIP geocoded to a valid place (e.g. "Detroit, MI").
 *    Conflict rule: if ?city= was provided (e.g. "Austin, TX"), the ZIP wins
 *    and the marketing city is completely dropped.
 * 2. 'unconfigured': Maps API key is unset.
 * 3. 'not-found': Geocoding query returned no results or invalid format.
 * 4. 'too-large': Place bounding box exceeded maximum allowed service radius.
 */

export type FirstRunPlaceOutcome =
  | 'resolved'
  | 'unconfigured'
  | 'not-found'
  | 'too-large';

export type FirstRunPlaceHint = {
  outcome: FirstRunPlaceOutcome;
  place: string | null;
  cityName: string | null;
  headline: string | null;
  lead: string;
  isResolved: boolean;
};

export type ZipEchoResult = {
  place: string;
  cityName: string;
  headline: string;
  lead: string;
};

export type GeocodeOutcome =
  | AreaGeocodeResult
  | { ok: true; place: string }
  | { ok: false; reason: 'unconfigured' | 'not-found' | 'too-large' | 'rate-limited' | string };

export function isFiveDigitZip(input: string | null | undefined): boolean {
  if (!input) return false;
  return /^\d{5}$/.test(input.trim());
}

export function formatZipEcho(place: string | null | undefined): ZipEchoResult | null {
  if (!place) return null;
  const trimmed = place.trim();
  if (!trimmed) return null;
  const cityName = trimmed.split(',')[0].trim();
  if (!cityName) return null;

  return {
    place: trimmed,
    cityName,
    headline: `${trimmed}.`,
    lead: `We'll write your site about ${cityName} and the towns around it.`,
  };
}

export function mapGeocodeToEcho(outcome: GeocodeOutcome | null | undefined): ZipEchoResult | null {
  if (!outcome || !outcome.ok || !outcome.place) {
    return null;
  }
  return formatZipEcho(outcome.place);
}

/**
 * Pure function mapping geocode outcome + optional marketing city to the rendered hint.
 *
 * Enforces the conflict rule from actions.ts:364:
 * "If a service area is also given but names a different place than the ZIP,
 * IGNORE the service area and trust the ZIP."
 */
export function placeHintFor(
  outcome: GeocodeOutcome | null | undefined,
  cityParam?: string | null,
): FirstRunPlaceHint {
  if (outcome && outcome.ok && outcome.place) {
    const trimmed = outcome.place.trim();
    const cityName = trimmed.split(',')[0].trim();
    return {
      outcome: 'resolved',
      place: trimmed,
      cityName,
      headline: `${trimmed}.`,
      lead: `We'll write your site about ${cityName} and the towns around it.`,
      isResolved: true,
    };
  }

  const rawReason = outcome && !outcome.ok ? outcome.reason : 'not-found';
  const resolvedOutcome: FirstRunPlaceOutcome =
    rawReason === 'unconfigured'
      ? 'unconfigured'
      : rawReason === 'too-large'
        ? 'too-large'
        : 'not-found';

  const trimmedCity = cityParam?.trim();
  const lead = trimmedCity
    ? `We have your city (${trimmedCity}), but need your 5-digit ZIP for accurate permit requirements, tax rules, and local Google SEO.`
    : 'This is what lets us write your whole site about the actual towns you serve, not "your local area".';

  return {
    outcome: resolvedOutcome,
    place: null,
    cityName: null,
    headline: null,
    lead,
    isResolved: false,
  };
}

export class ZipEchoSequenceGuard {
  private currentId = 0;

  next(): number {
    this.currentId += 1;
    return this.currentId;
  }

  isLatest(id: number): boolean {
    return id === this.currentId;
  }

  reset(): void {
    this.currentId = 0;
  }
}
