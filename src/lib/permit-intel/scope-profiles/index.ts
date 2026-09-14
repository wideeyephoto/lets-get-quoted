import type { PermitWorkContext, JurisdictionMatch } from '../types';
import type { ScopeProfile } from './types';
import { buildRoofingScopeProfile } from './roofing';
import { buildPlumbingScopeProfile } from './plumbing';
import { buildElectricalScopeProfile } from './electrical';
import { buildMechanicalScopeProfile } from './mechanical';
import { buildBuildingScopeProfile } from './building';

export * from './types';
export * from './roofing';
export * from './plumbing';
export * from './electrical';
export * from './mechanical';
export * from './building';

export function buildScopeProfile(
  work: PermitWorkContext,
  jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const discipline = work.discipline || '';
  const trade = work.trade || '';

  if (trade === 'plumbing' || discipline === 'plumbing') {
    return buildPlumbingScopeProfile(work, jurisdiction, streetAddress, rawScopeText);
  }
  if (trade === 'electrical' || trade === 'solar' || discipline === 'electrical') {
    return buildElectricalScopeProfile(work, jurisdiction, streetAddress, rawScopeText);
  }
  if (trade === 'mechanical' || discipline === 'mechanical') {
    return buildMechanicalScopeProfile(work, jurisdiction, streetAddress, rawScopeText);
  }
  if (trade === 'roofing') {
    return buildRoofingScopeProfile(work, jurisdiction, streetAddress, rawScopeText);
  }
  return buildBuildingScopeProfile(work, jurisdiction, streetAddress, rawScopeText);
}
