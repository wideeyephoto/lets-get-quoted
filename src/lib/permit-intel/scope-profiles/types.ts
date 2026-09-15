import type { CodeReference } from '../types';

export type ScopeProfileSpecRow = {
  label: string;
  value: string;
};

export type ScopeProfile = {
  tradeLabel: string;
  projectTitle: string;
  specRows: ScopeProfileSpecRow[];
  citations: CodeReference[];
  instructions?: string[];
  detailedDescription?: string;
  roofSquares?: number;
  layersToTearOff?: number;
  newRoofCovering?: string;
  underlayment?: string;
  iceBarrierCompliance?: boolean;
  iceBarrierDescription?: string;
  dripEdgeCompliance?: boolean;
  atticVentilationType?: string;
  flashingDetails?: string;
};
