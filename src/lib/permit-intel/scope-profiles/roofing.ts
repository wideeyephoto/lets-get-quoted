import type { PermitWorkContext, JurisdictionMatch } from '../types';
import { MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS } from '../code-catalog';
import type { ScopeProfile, ScopeProfileSpecRow } from './types';

export function buildRoofingScopeProfile(
  work: PermitWorkContext,
  _jurisdiction?: JurisdictionMatch | null,
  streetAddress = 'Property Address',
  rawScopeText?: string,
): ScopeProfile {
  const specRows: ScopeProfileSpecRow[] = [];

  if (work.roofSquares) {
    specRows.push({ label: 'Roof Area / Squares', value: `${work.roofSquares} Squares` });
  }

  const layersToTearOff = 1;
  specRows.push({
    label: 'Tear-Off / Deck Condition',
    value: `Tear off ${layersToTearOff} layer down to approved wood deck`,
  });

  const newRoofCovering = 'Class A Fiberglass Asphalt Shingles (GAF Timberline HDZ or equiv.)';
  specRows.push({
    label: 'New Covering Material',
    value: newRoofCovering,
  });

  const underlayment = 'ASTM D226 Type II Synthetic Underlayment';
  specRows.push({
    label: 'Underlayment',
    value: underlayment,
  });

  const iceBarrierDescription =
    'Self-adhering polymer modified bitumen extending 24" inside exterior wall line (2015 MRC § R905.1.2)';
  specRows.push({
    label: 'Ice Barrier Protection',
    value: iceBarrierDescription,
  });

  specRows.push({
    label: 'Drip Edge & Flashing',
    value: 'Corrosion-resistant drip edge on eaves/rakes; step/counter flashing (2015 MRC § R905.2.8.5)',
  });

  const atticVentilationType =
    'Balanced Net Free Area with Continuous Ridge Vent & Soffit Inlets (2015 MRC § R806)';
  specRows.push({
    label: 'Attic Ventilation',
    value: atticVentilationType,
  });

  const detailedDescription =
    rawScopeText ||
    `Tear off 1 layer existing asphalt shingles down to wood deck. Inspect sheathing, install synthetic underlayment, ice and water shield on all eaves and valleys, starter strip, architectural shingles, and continuous ridge vent.`;

  return {
    tradeLabel: 'Residential Building / Roofing',
    projectTitle: `${streetAddress} Roof Replacement`,
    specRows,
    citations: MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS,
    detailedDescription,
    roofSquares: work.roofSquares,
    layersToTearOff,
    newRoofCovering,
    underlayment,
    iceBarrierCompliance: true,
    iceBarrierDescription,
    dripEdgeCompliance: true,
    atticVentilationType,
    flashingDetails: 'New step flashing against sidewalls and chimneys, 26ga corrosion-resistant valley liners',
  };
}
