import type { PermitWorkContext, JurisdictionMatch } from '../types';
import { MICHIGAN_MECHANICAL_CODE_2021_CITATIONS } from '../code-catalog';
import type { ScopeProfile, ScopeProfileSpecRow } from './types';

export function buildMechanicalScopeProfile(
  _work: PermitWorkContext,
  _jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const specRows: ScopeProfileSpecRow[] = [
    { label: 'Trade Discipline', value: 'Mechanical / Heating, Ventilation & Air Conditioning' },
    { label: 'Equipment Sizing', value: 'Heating and cooling sized per ACCA Manual J/S (2021 MMC § M1401.3)' },
    { label: 'Direct-Vent Clearances', value: 'Direct-vent termination clearances maintained per 2021 MMC § M1801.1' },
    { label: 'Duct Sealing', value: 'Joints and connections sealed with approved mastic/gaskets per 2021 MMC § M1601.4.1' },
  ];

  const detailedDescription =
    rawScopeText ||
    `Installation or replacement of residential heating, ventilation, and air conditioning equipment and duct distribution systems per Michigan Mechanical Code.`;

  return {
    tradeLabel: 'Residential Mechanical / HVAC',
    projectTitle: `${streetAddress} Mechanical & HVAC Installation`,
    specRows,
    citations: MICHIGAN_MECHANICAL_CODE_2021_CITATIONS,
    detailedDescription,
  };
}
