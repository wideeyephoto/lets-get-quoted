import type { PermitWorkContext, JurisdictionMatch } from '../types';
import type { ScopeProfile } from './types';

export function buildBuildingScopeProfile(
  _work: PermitWorkContext,
  _jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const detailedDescription =
    rawScopeText ||
    `General residential building alterations and structural repairs in accordance with applicable residential building codes and local municipal ordinances.`;

  return {
    tradeLabel: 'Residential Building',
    projectTitle: `${streetAddress} Building Work`,
    specRows: [],
    citations: [],
    instructions: ['Verify scope with jurisdiction'],
    detailedDescription,
  };
}
