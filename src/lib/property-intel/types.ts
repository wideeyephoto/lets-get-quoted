// Data types for Property & Roof Intelligence via Google Maps Platform and RentCast

export type RoofSegment = {
  pitchDegrees: number;
  pitchRatio: string; // e.g. "8/12"
  azimuthDegrees: number;
  compassDirection: string; // e.g. "S", "SW"
  areaSqFt: number;
  groundAreaSqFt: number;
  sunshineHours: number;
};

export type RoofComplexity = 'simple' | 'moderate' | 'complex';

export type RoofStats = {
  totalAreaSqFt: number;
  roofingSquares: number; // 1 square = 100 sq ft
  groundAreaSqFt: number;
  dominantPitchRatio: string;
  dominantPitchDegrees: number;
  maxPitchDegrees: number;
  isSteep: boolean; // pitch >= 30° / ~7/12
  complexity: RoofComplexity;
  complexityLabel: string; // e.g. "Complex Hip & Valley (11 facets)"
  segmentCount: number;
  segments: RoofSegment[];
  maxSunshineHoursPerYear: number;
  solarPotentialPanels: number;
  imageryDate?: string | null;
};

export type StreetViewInfo = {
  available: boolean;
  imageUrl: string | null;
  date?: string | null;
  panoId?: string | null;
};

export type SatelliteInfo = {
  imageUrl: string;
  zoom: number;
};

export type CorePropertySpecs = {
  propertyType?: string | null;
  yearBuilt?: number | null;
  squareFootage?: number | null;
  lotSizeSqFt?: number | null;
  lotSizeAcres?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  stories?: number | null;
  ownerOccupied?: boolean | null;
  lastSaleDate?: string | null;
  lastSalePrice?: number | null;
  assessedValue?: number | null;
  coolingType?: string | null;
  heatingType?: string | null;
  heatingFuel?: string | null;
  garageSpaces?: number | null;
  hasPool?: boolean | null;
  hasFireplace?: boolean | null;
  foundationType?: string | null;
  roofType?: string | null;
  exteriorWallType?: string | null;
};

export type PropertyIntelligence = {
  address: string;
  lat: number;
  lng: number;
  streetView: StreetViewInfo;
  satellite: SatelliteInfo;
  roof: RoofStats | null;
  specs: CorePropertySpecs | null;
  hasSolarCoverage: boolean;
  hasSpecs: boolean;
};

export type PropertyIntelligenceSummary = {
  // Roof & Geometry
  roofingSquares?: number;
  totalRoofAreaSqFt?: number;
  groundFootprintSqFt?: number;
  dominantPitch?: string;
  isSteep?: boolean;
  complexityLabel?: string;
  solarPanelCapacity?: number;

  // Structure & Tax Specs
  yearBuilt?: number;
  livingAreaSqFt?: number;
  lotSizeAcres?: number;
  lotSizeSqFt?: number;
  stories?: number;
  bedrooms?: number;
  bathrooms?: number;
  ownerOccupied?: boolean;
  heatingFuel?: string;
  foundationType?: string;
  hasPool?: boolean;
  propertyType?: string;
  isPre1978LeadRisk?: boolean;
};
