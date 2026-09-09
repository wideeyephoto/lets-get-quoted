/**
 * Pure helpers for the first-run welcome ZIP place echo.
 *
 * Maps a resolved place (e.g. from geocodeArea(zip).place) to the verified city
 * sentence, and guards against out-of-order responses.
 */

export type ZipEchoResult = {
  place: string;
  cityName: string;
  headline: string;
  lead: string;
};

export type GeocodeOutcome =
  | { ok: true; place: string }
  | { ok: false; reason: 'unconfigured' | 'not-found' | 'too-large' | 'rate-limited' | string };

export function isFiveDigitZip(input: string): boolean {
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
