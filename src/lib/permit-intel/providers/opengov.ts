import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

export class OpenGovPermitProvider implements PermitHistoryProvider {
  readonly providerId = 'opengov';
  readonly providerName = 'OpenGov Permitting & Licensing';

  supports(authorityId: string, _location: ParsedAddress): boolean {
    return authorityId === 'mi-ann-arbor' || authorityId.includes('opengov');
  }

  async searchHistory(
    _location: ParsedAddress,
    authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }> {
    let portalSearchUrl = 'https://stream.a2gov.org';
    if (authorityId === 'mi-ann-arbor') {
      portalSearchUrl = 'https://stream.a2gov.org/search';
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
