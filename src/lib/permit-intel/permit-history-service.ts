import { normalizeAddress } from '../location-context/normalize-address';
import { resolveJurisdiction } from '../location-context/jurisdiction-resolver';
import { resolvePermitHistoryProvider } from './providers';
import type {
  ExternalPermitRecord,
  ProviderResultMeta,
} from './providers/provider';

export type PermitHistoryLookupResult = {
  address: string;
  authorityId: string;
  authorityName: string;
  records: ExternalPermitRecord[];
  meta: ProviderResultMeta;
  portalSearchUrl?: string;
};

/**
 * Searches and retrieves historical public building permits associated with a property address.
 */
export async function getPropertyPermitHistory(
  rawAddress: string | null | undefined,
): Promise<PermitHistoryLookupResult> {
  const parsedAddress = normalizeAddress(rawAddress);
  const jurisdiction = resolveJurisdiction(parsedAddress, 'building');

  const provider = resolvePermitHistoryProvider(
    jurisdiction.authorityId,
    parsedAddress,
  );

  const historyResult = await provider.searchHistory(
    parsedAddress,
    jurisdiction.authorityId,
  );

  return {
    address: parsedAddress.formattedAddress || (rawAddress ?? ''),
    authorityId: jurisdiction.authorityId,
    authorityName: jurisdiction.authorityName,
    records: historyResult.records,
    meta: historyResult.meta,
    portalSearchUrl: historyResult.portalSearchUrl,
  };
}
