import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

const OPEN_DATA_PORTAL_MAP: Record<string, { portalUrl: string; searchUrl: string; name: string }> = {
  'mi-detroit': {
    portalUrl: 'https://data.detroitmi.gov',
    searchUrl: 'https://data.detroitmi.gov/datasets/detroitmi::building-permits/explore',
    name: 'City of Detroit Open Data (BSEED)',
  },
  'mi-grand-rapids': {
    portalUrl: 'https://data.grandrapidsmi.gov',
    searchUrl: 'https://www.citizenaccess.grandrapidsmi.gov/CitizenAccess/Cap/CapHome.aspx?module=Building',
    name: 'City of Grand Rapids Open Data & Citizen Access',
  },
  'mi-ann-arbor': {
    portalUrl: 'https://data.a2gov.org',
    searchUrl: 'https://stream.a2gov.org',
    name: 'City of Ann Arbor eTRAKiT & Open Data',
  },
};

export class OpenDataPermitProvider implements PermitHistoryProvider {
  readonly providerId = 'open_data_gis';
  readonly providerName = 'Municipal Open Data / GIS Portal';

  supports(authorityId: string, _location: ParsedAddress): boolean {
    return (
      authorityId in OPEN_DATA_PORTAL_MAP ||
      authorityId === 'mi-detroit' ||
      authorityId === 'mi-grand-rapids' ||
      authorityId.includes('socrata') ||
      authorityId.includes('arcgis') ||
      authorityId.includes('open-data')
    );
  }

  async searchHistory(
    _location: ParsedAddress,
    authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }> {
    const config = OPEN_DATA_PORTAL_MAP[authorityId] || {
      portalUrl: 'https://data.detroitmi.gov',
      searchUrl: 'https://data.detroitmi.gov/datasets/detroitmi::building-permits/explore',
      name: this.providerName,
    };

    const portalSearchUrl = config.searchUrl;

    return {
      records: [],
      meta: {
        providerName: config.name,
        sourceUrl: portalSearchUrl,
        retrievedAt: new Date().toISOString(),
        confidence: 'high',
        isAuthoritative: true,
      },
      portalSearchUrl,
    };
  }
}
