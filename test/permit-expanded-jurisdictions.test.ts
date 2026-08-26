import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';

describe('Expanded Michigan Municipal Jurisdiction Resolver', () => {
  it('resolves Wayne County municipalities correctly (Detroit, Dearborn, Livonia, Canton, Westland)', () => {
    const detroit = resolveJurisdiction({
      raw: '100 Woodward Ave, Detroit, MI 48226',
      city: 'Detroit',
      state: 'MI',
      postalCode: '48226',
      county: 'Wayne',
      formattedAddress: '100 Woodward Ave, Detroit, MI 48226',
      isValid: true,
    }, 'building');
    expect(detroit.authorityId).toBe('mi-detroit');
    expect(detroit.authorityName).toBe('City of Detroit');
    expect(detroit.agencyName).toBe('Detroit BSEED Building Division');
    expect(detroit.isAuthoritative).toBe(true);

    const dearborn = resolveJurisdiction({
      raw: '13615 Michigan Ave, Dearborn, MI 48126',
      city: 'Dearborn',
      state: 'MI',
      postalCode: '48126',
      county: 'Wayne',
      formattedAddress: '13615 Michigan Ave, Dearborn, MI 48126',
      isValid: true,
    }, 'electrical');
    expect(dearborn.authorityId).toBe('mi-dearborn');
    expect(dearborn.agencyName).toBe('Dearborn Electrical Inspection');

    const livonia = resolveJurisdiction({
      raw: '33000 Civic Center Dr, Livonia, MI 48154',
      city: 'Livonia',
      state: 'MI',
      postalCode: '48154',
      county: 'Wayne',
      formattedAddress: '33000 Civic Center Dr, Livonia, MI 48154',
      isValid: true,
    }, 'mechanical');
    expect(livonia.authorityId).toBe('mi-livonia');
    expect(livonia.agencyName).toBe('Livonia Mechanical Division');

    const canton = resolveJurisdiction({
      raw: '1150 S Canton Center Rd, Canton, MI 48188',
      city: 'Canton',
      state: 'MI',
      postalCode: '48188',
      county: 'Wayne',
      formattedAddress: '1150 S Canton Center Rd, Canton, MI 48188',
      isValid: true,
    }, 'plumbing');
    expect(canton.authorityId).toBe('mi-canton-twp');
    expect(canton.agencyName).toBe('Canton Township Plumbing Division');
  });

  it('resolves Macomb County municipalities correctly (Warren, Sterling Heights, Clinton Twp, Shelby Twp)', () => {
    const warren = resolveJurisdiction({
      raw: '1 City Square, Warren, MI 48093',
      city: 'Warren',
      state: 'MI',
      postalCode: '48093',
      county: 'Macomb',
      formattedAddress: '1 City Square, Warren, MI 48093',
      isValid: true,
    }, 'building');
    expect(warren.authorityId).toBe('mi-warren');
    expect(warren.authorityName).toBe('City of Warren');

    const sterlingHeights = resolveJurisdiction({
      raw: '40555 Utica Rd, Sterling Heights, MI 48313',
      city: 'Sterling Heights',
      state: 'MI',
      postalCode: '48313',
      county: 'Macomb',
      formattedAddress: '40555 Utica Rd, Sterling Heights, MI 48313',
      isValid: true,
    }, 'building');
    expect(sterlingHeights.authorityId).toBe('mi-sterling-heights');
  });

  it('resolves Oakland County municipalities correctly (Troy, Rochester Hills, Southfield, Novi, Pontiac)', () => {
    const troy = resolveJurisdiction({
      raw: '500 W Big Beaver Rd, Troy, MI 48084',
      city: 'Troy',
      state: 'MI',
      postalCode: '48084',
      county: 'Oakland',
      formattedAddress: '500 W Big Beaver Rd, Troy, MI 48084',
      isValid: true,
    }, 'building');
    expect(troy.authorityId).toBe('mi-troy');

    const rochesterHills = resolveJurisdiction({
      raw: '1000 Rochester Hills Dr, Rochester Hills, MI 48309',
      city: 'Rochester Hills',
      state: 'MI',
      postalCode: '48309',
      county: 'Oakland',
      formattedAddress: '1000 Rochester Hills Dr, Rochester Hills, MI 48309',
      isValid: true,
    }, 'building');
    expect(rochesterHills.authorityId).toBe('mi-rochester-hills');

    const southfield = resolveJurisdiction({
      raw: '26000 Evergreen Rd, Southfield, MI 48076',
      city: 'Southfield',
      state: 'MI',
      postalCode: '48076',
      county: 'Oakland',
      formattedAddress: '26000 Evergreen Rd, Southfield, MI 48076',
      isValid: true,
    }, 'building');
    expect(southfield.authorityId).toBe('mi-southfield');
  });

  it('resolves Kent County municipalities correctly (Grand Rapids, Wyoming, Kentwood)', () => {
    const gr = resolveJurisdiction({
      raw: '1120 Monroe Ave NW, Grand Rapids, MI 49503',
      city: 'Grand Rapids',
      state: 'MI',
      postalCode: '49503',
      county: 'Kent',
      formattedAddress: '1120 Monroe Ave NW, Grand Rapids, MI 49503',
      isValid: true,
    }, 'building');
    expect(gr.authorityId).toBe('mi-grand-rapids');

    const wyoming = resolveJurisdiction({
      raw: '1155 28th St SW, Wyoming, MI 49509',
      city: 'Wyoming',
      state: 'MI',
      postalCode: '49509',
      county: 'Kent',
      formattedAddress: '1155 28th St SW, Wyoming, MI 49509',
      isValid: true,
    }, 'building');
    expect(wyoming.authorityId).toBe('mi-wyoming');
  });

  it('resolves Washtenaw County municipalities correctly (Ann Arbor, Ypsilanti, Pittsfield Twp)', () => {
    const a2 = resolveJurisdiction({
      raw: '301 E Huron St, Ann Arbor, MI 48104',
      city: 'Ann Arbor',
      state: 'MI',
      postalCode: '48104',
      county: 'Washtenaw',
      formattedAddress: '301 E Huron St, Ann Arbor, MI 48104',
      isValid: true,
    }, 'building');
    expect(a2.authorityId).toBe('mi-ann-arbor');

    const ypsi = resolveJurisdiction({
      raw: '1 S Huron St, Ypsilanti, MI 48197',
      city: 'Ypsilanti',
      state: 'MI',
      postalCode: '48197',
      county: 'Washtenaw',
      formattedAddress: '1 S Huron St, Ypsilanti, MI 48197',
      isValid: true,
    }, 'building');
    expect(ypsi.authorityId).toBe('mi-ypsilanti');
  });
});
