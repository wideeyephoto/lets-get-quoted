/**
 * Deciding what a generated website says it serves.
 *
 * WHY THIS IS NOT LEFT TO THE MODEL. The site generator asked gpt-4o-mini to
 * resolve the owner's ZIP and name the towns around it. For 48067 it answered
 * Maplewood, Springfield and Sunnyvale — real US place names, correctly spelled
 * and confidently produced, none of them within two thousand miles of Royal Oak
 * — and they were published on a live site under "Areas we serve". A homeowner
 * reading that has been told the business is somewhere it is not.
 *
 * The prompt now states the resolved town as a fact, which helps. This is the
 * part that does not depend on the model agreeing: whatever comes back, the
 * town Google resolved the ZIP to leads the list and the service area names it.
 *
 * Pure, so the rule is tested directly rather than through an OpenAI call.
 */

export type AreaAnchorInput = {
  /** "Royal Oak, MI" from geocoding the ZIP, or '' when it could not be resolved. */
  primaryCity: string;
  /** What the model offered, already trimmed and length-capped by the caller. */
  modelCities: string[];
  modelServiceArea: string;
  /** False when there is no ZIP and no service area — nothing to localize to. */
  locationKnown: boolean;
};

export type AreaAnchorResult = { cities: string[]; serviceArea: string };

/** "Royal Oak, MI" → "Royal Oak". Comparisons are bare-town so the model's
 *  "Royal Oak" is not duplicated by geocoding's "Royal Oak, MI". */
export function bareTown(value: string): string {
  return value.split(',')[0]?.trim() ?? '';
}

const MAX_CITIES = 12;

export function anchorServiceArea({
  primaryCity,
  modelCities,
  modelServiceArea,
  locationKnown,
}: AreaAnchorInput): AreaAnchorResult {
  /* No location in, no location out. A site that never names a town reads as a
     business that works everywhere; one that says "serving your local area"
     reads as one that has not finished being built. */
  if (!locationKnown) return { cities: [], serviceArea: '' };

  const primaryTown = bareTown(primaryCity);
  if (!primaryTown) {
    // Geocoding is unconfigured or the ZIP did not resolve. Same behavior as
    // before — the model's answer stands, because there is nothing better.
    return { cities: modelCities, serviceArea: modelServiceArea };
  }

  const alreadyListed = modelCities.some(
    (city) => bareTown(city).toLowerCase() === primaryTown.toLowerCase(),
  );
  const cities = alreadyListed ? modelCities : [primaryTown, ...modelCities].slice(0, MAX_CITIES);

  /* An area description that never mentions the town the ZIP resolves to is
     the Royal Oak → "Maplewood" failure exactly. The town wins. */
  const describesPrimary = modelServiceArea.toLowerCase().includes(primaryTown.toLowerCase());
  const serviceArea = modelServiceArea && describesPrimary ? modelServiceArea : primaryCity;

  return { cities, serviceArea };
}
