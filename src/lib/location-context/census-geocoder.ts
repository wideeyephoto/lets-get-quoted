import type { CensusLocationContext, ParsedAddress } from './types';

const CENSUS_GEOCODER_ENDPOINT =
  'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

/**
 * Calls the US Census Bureau Geocoding API to resolve geographies (county, tract, incorporated place).
 *
 * Designed to fail gracefully and return null if the Census API is unavailable or times out,
 * ensuring the application continues using local address parsing and jurisdiction tables.
 */
export async function queryCensusGeocoder(
  address: ParsedAddress | string,
  options: { timeoutMs?: number } = {},
): Promise<CensusLocationContext | null> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const addressString = typeof address === 'string' ? address : address.formattedAddress || address.raw;

  if (!addressString || !addressString.trim()) {
    return null;
  }

  const url = new URL(CENSUS_GEOCODER_ENDPOINT);
  url.searchParams.set('address', addressString);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('vintage', 'Current_Current');
  url.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LetsGetQuoted-PermitService/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const matches = data?.result?.addressMatches;
    if (!Array.isArray(matches) || matches.length === 0) {
      return null;
    }

    const primary = matches[0];
    const coords = primary.coordinates;
    const geos = primary.geographies;

    const counties = geos?.Counties;
    const countyObj = Array.isArray(counties) && counties.length > 0 ? counties[0] : null;

    const places = geos?.['Incorporated Places'];
    const placeObj = Array.isArray(places) && places.length > 0 ? places[0] : null;

    const mcds = geos?.['County Subdivisions'];
    const mcdObj = Array.isArray(mcds) && mcds.length > 0 ? mcds[0] : null;

    const tracts = geos?.['Census Tracts'];
    const tractObj = Array.isArray(tracts) && tracts.length > 0 ? tracts[0] : null;

    const blocks = geos?.['2020 Census Blocks'] || geos?.['Census Blocks'];
    const blockObj = Array.isArray(blocks) && blocks.length > 0 ? blocks[0] : null;

    return {
      matchedAddress: primary.matchedAddress,
      coordinates:
        coords && typeof coords.x === 'number' && typeof coords.y === 'number'
          ? { lat: coords.y, lng: coords.x, accuracy: 'exact' }
          : undefined,
      stateFips: countyObj?.STATE ?? placeObj?.STATE,
      countyFips: countyObj?.COUNTY,
      countyName: countyObj?.BASENAME || countyObj?.NAME,
      tract: tractObj?.TRACT,
      block: blockObj?.BLOCK,
      incorporatedPlace: placeObj?.BASENAME || placeObj?.NAME,
      minorCivilDivision: mcdObj?.BASENAME || mcdObj?.NAME,
    };
  } catch (_err) {
    clearTimeout(timeoutId);
    return null;
  }
}
