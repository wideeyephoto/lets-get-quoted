import type { PermitWorkContext, JurisdictionMatch } from '../types';
import { MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS } from '../code-catalog';
import type { ScopeProfile, ScopeProfileSpecRow } from './types';

export function buildElectricalScopeProfile(
  _work: PermitWorkContext,
  _jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const specRows: ScopeProfileSpecRow[] = [
    { label: 'Trade Discipline', value: 'Electrical Service & Branch Circuits' },
    { label: 'Service Disconnect', value: 'Exterior emergency disconnecting means per 2023 NEC / MEC Pt 8 Art. 230.70' },
    { label: 'EV Branch Circuit', value: 'Dedicated continuous load branch circuit per 2023 NEC Art. 625.40 (where applicable)' },
    { label: 'Generator Transfer Switch', value: 'Approved manual or automatic transfer interlock per 2023 NEC Art. 702.5' },
  ];

  const detailedDescription =
    rawScopeText ||
    `Installation, modification, or upgrade of residential electrical service equipment, dedicated branch circuits, and grounding systems per National Electrical Code.`;

  return {
    tradeLabel: 'Residential Electrical',
    projectTitle: `${streetAddress} Electrical Service & Wiring`,
    specRows,
    citations: MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS,
    detailedDescription,
  };
}
