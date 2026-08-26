import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

export class AccelaPermitProvider implements PermitHistoryProvider {
  readonly providerId = 'accela';
  readonly providerName = 'Accela Citizen Access';

  supports(authorityId: string, _location: ParsedAddress): boolean {
    return authorityId === 'mi-grand-rapids' || authorityId.includes('accela');
  }

  async searchHistory(
    location: ParsedAddress,
    authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }> {
    let portalSearchUrl = 'https://www.citizenaccess.grandrapidsmi.gov';
    if (authorityId === 'mi-grand-rapids') {
      portalSearchUrl = 'https://www.citizenaccess.grandrapidsmi.gov/CitizenAccess/Cap/CapHome.aspx?module=Building';
    }

    return {
      records: [],
      meta: {
        providerName: this.providerName,
        sourceUrl: portalSearchUrl,
        retrievedAt: new Date().toISOString(),
        confidence: 'high',
        isAuthoritative: true,
      },
      portalSearchUrl,
    };
  }
}
