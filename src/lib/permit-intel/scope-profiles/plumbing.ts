import type { PermitWorkContext, JurisdictionMatch } from '../types';
import { MICHIGAN_PLUMBING_CODE_2021_CITATIONS } from '../code-catalog';
import type { ScopeProfile, ScopeProfileSpecRow } from './types';

export function buildPlumbingScopeProfile(
  _work: PermitWorkContext,
  _jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const specRows: ScopeProfileSpecRow[] = [
    { label: 'Trade Discipline', value: 'Plumbing / Water Service / Sanitary Drainage' },
    { label: 'Drainage Cleanouts', value: 'Cleanouts installed per 2021 MPC § P3005.2 at building drain junction' },
    { label: 'Water Heater / T&P Valve', value: 'Discharge piping terminating per 2021 MPC § P2804.6.1 with approved rigid materials' },
    { label: 'Backflow Prevention', value: 'Atmospheric or pressure vacuum breaker per 2021 MPC § P2902.5.3' },
  ];

  const detailedDescription =
    rawScopeText ||
    `Installation and service of residential plumbing systems including water supply, drainage cleanouts, water heating equipment, and backflow prevention per Michigan Plumbing Code.`;

  return {
    tradeLabel: 'Residential Plumbing',
    projectTitle: `${streetAddress} Plumbing Installation & Service`,
    specRows,
    citations: MICHIGAN_PLUMBING_CODE_2021_CITATIONS,
    detailedDescription,
  };
}
