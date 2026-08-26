import type { ParsedAddress } from '../../location-context/types';
import type {
  ExternalPermitRecord,
  PermitHistoryProvider,
  ProviderResultMeta,
} from './provider';

export class ManualLinkPermitProvider implements PermitHistoryProvider {
  readonly providerId = 'manual_link';
  readonly providerName = 'Official Municipality Portal Deep Link';

  supports(_authorityId: string, _location: ParsedAddress): boolean {
    return true; // Universal fallback
  }

  async searchHistory(
    _location: ParsedAddress,
    _authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }> {
    return {
      records: [],
      meta: {
        providerName: this.providerName,
        retrievedAt: new Date().toISOString(),
        confidence: 'low',
        isAuthoritative: false,
      },
    };
  }
}
