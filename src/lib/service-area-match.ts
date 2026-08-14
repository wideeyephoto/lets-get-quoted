/**
 * Deterministic service-area matching for Smart Intake.
 *
 * The estimator can mention geography, but the location the homeowner types is
 * collected separately and is the authoritative answer.  This helper compares
 * that answer with the contractor's published city list; a ZIP can be resolved
 * by the caller and fed back through the same comparison.
 */

export type ServiceAreaVerdict = boolean | null;

function normalizedWords(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

type ParsedPlace = { town: string; state: string };

function parsedPlace(value: string | null | undefined): ParsedPlace {
  const raw = (value ?? '').trim();
  if (!raw) return { town: '', state: '' };

  const withoutLeadingZip = raw.replace(/^\s*\d{5}(?:-\d{4})?\s*(?:[·,\-]\s*)?/, '');
  const parts = withoutLeadingZip.split(/[·,]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    // Homeowners commonly omit the comma in "Royal Oak MI". Treat a final
    // two-letter token as an explicit state without breaking towns such as
    // "New York" or "Cedar City".
    const spaceState = parts[0].match(/^(.*?)\s+([a-z]{2})$/i);
    if (spaceState) {
      return {
        town: normalizedWords(spaceState[1]),
        state: normalizedWords(spaceState[2]),
      };
    }
  }
  return {
    town: normalizedWords(parts[0] ?? ''),
    state: normalizedWords(parts[1] ?? ''),
  };
}

/** "Royal Oak, MI" and "48067 · Royal Oak, MI" both become "royal oak". */
export function canonicalPlace(value: string | null | undefined): string {
  return parsedPlace(value).town;
}

export function matchesServedCity(
  location: string | null | undefined,
  servedCities: Array<string | null | undefined>,
): boolean {
  const place = parsedPlace(location);
  if (!place.town) return false;
  return servedCities.some((city) => {
    const served = parsedPlace(city);
    if (served.town !== place.town) return false;
    // A state only narrows the match when both sides supplied one. This keeps a
    // simple configured city ("Maplewood") useful while preventing an explicit
    // "Royal Oak, MD" from matching "Royal Oak, MI".
    return !served.state || !place.state || served.state === place.state;
  });
}

/**
 * Returns null only when there is not enough information to make an honest
 * decision. Named towns are exact list membership; ZIPs need a resolver.
 */
export async function serviceAreaVerdict(
  location: string | null | undefined,
  servedCities: Array<string | null | undefined>,
  resolveLocation?: (location: string) => Promise<string | null>,
): Promise<ServiceAreaVerdict> {
  const rawLocation = (location ?? '').trim();
  const cities = servedCities.map((city) => (city ?? '').trim()).filter(Boolean);
  if (!rawLocation || cities.length === 0) return null;
  if (matchesServedCity(rawLocation, cities)) return true;

  const zip = rawLocation.match(/^\s*(\d{5})(?:-\d{4})?\s*$/)?.[1];
  if (resolveLocation) {
    try {
      const resolved = await resolveLocation(zip ?? rawLocation);
      return resolved ? matchesServedCity(resolved, cities) : null;
    } catch {
      return null;
    }
  }

  if (zip) return null;

  // The live field asks specifically for a town or city. An unmatched named
  // place is therefore outside the published list; ambiguous ZIPs stay
  // unknown unless a bounded resolver is supplied by a future caller.
  return canonicalPlace(rawLocation) ? false : null;
}
