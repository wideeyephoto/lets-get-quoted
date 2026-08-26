import { describe, it, expect } from 'vitest';
import { OpenDataPermitProvider } from '../src/lib/permit-intel/providers/open-data';
import { BsaPermitProvider } from '../src/lib/permit-intel/providers/bsa';
import type { ParsedAddress } from '../src/lib/location-context/types';

describe('Expanded Open Data & BS&A Municipal Providers', () => {
  const dummyLocation: ParsedAddress = {
    raw: '100 Main St, Detroit, MI 48226',
    streetNumber: '100',
    streetName: 'Main St',
    city: 'Detroit',
    state: 'MI',
    postalCode: '48226',
    county: 'Wayne',
    formattedAddress: '100 Main St, Detroit, MI 48226',
    isValid: true,
  };

  it('OpenDataPermitProvider supports Detroit, Grand Rapids, and Ann Arbor', async () => {
    const provider = new OpenDataPermitProvider();

    expect(provider.supports('mi-detroit', dummyLocation)).toBe(true);
    expect(provider.supports('mi-grand-rapids', dummyLocation)).toBe(true);
    expect(provider.supports('mi-ann-arbor', dummyLocation)).toBe(true);
    expect(provider.supports('gis-arcgis-mi', dummyLocation)).toBe(true);

    const detroitRes = await provider.searchHistory(dummyLocation, 'mi-detroit');
    expect(detroitRes.portalSearchUrl).toContain('data.detroitmi.gov');
    expect(detroitRes.meta.confidence).toBe('high');

    const grRes = await provider.searchHistory(dummyLocation, 'mi-grand-rapids');
    expect(grRes.portalSearchUrl).toContain('citizenaccess.grandrapidsmi.gov');
  });

  it('BsaPermitProvider supports expanded cities across Wayne, Macomb, Oakland, and Washtenaw', async () => {
    const bsa = new BsaPermitProvider();

    expect(bsa.supports('mi-troy', dummyLocation)).toBe(true);
    expect(bsa.supports('mi-warren', dummyLocation)).toBe(true);
    expect(bsa.supports('mi-livonia', dummyLocation)).toBe(true);
    expect(bsa.supports('mi-wyoming', dummyLocation)).toBe(true);
    expect(bsa.supports('mi-ypsilanti', dummyLocation)).toBe(true);

    const warrenRes = await bsa.searchHistory(dummyLocation, 'mi-warren');
    expect(warrenRes.portalSearchUrl).toContain('uid=392');

    const livoniaRes = await bsa.searchHistory(dummyLocation, 'mi-livonia');
    expect(livoniaRes.portalSearchUrl).toContain('uid=348');
  });
});
