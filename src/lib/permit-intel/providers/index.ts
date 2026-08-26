export * from './provider';
export * from './bsa';
export * from './accela';
export * from './opengov';
export * from './open-data';
export * from './manual-link';

import type { ParsedAddress } from '../../location-context/types';
import type { PermitHistoryProvider } from './provider';
import { BsaPermitProvider } from './bsa';
import { AccelaPermitProvider } from './accela';
import { OpenGovPermitProvider } from './opengov';
import { OpenDataPermitProvider } from './open-data';
import { ManualLinkPermitProvider } from './manual-link';

const REGISTERED_PROVIDERS: PermitHistoryProvider[] = [
  new BsaPermitProvider(),
  new AccelaPermitProvider(),
  new OpenGovPermitProvider(),
  new OpenDataPermitProvider(),
  new ManualLinkPermitProvider(),
];

/**
 * Resolves the most specific provider adapter that supports the given authority and address.
 */
export function resolvePermitHistoryProvider(
  authorityId: string,
  location: ParsedAddress,
): PermitHistoryProvider {
  for (const provider of REGISTERED_PROVIDERS) {
    if (provider.supports(authorityId, location)) {
      return provider;
    }
  }
  return new ManualLinkPermitProvider();
}
