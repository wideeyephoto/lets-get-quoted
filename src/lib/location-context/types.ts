/**
 * Types for location normalization, geographic positioning, and jurisdiction resolution.
 */

export type ParsedAddress = {
  raw: string;
  streetNumber?: string;
  streetName?: string;
  unitOrApt?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  county?: string;
  formattedAddress: string;
  isValid: boolean;
};

export type GeoCoordinates = {
  lat: number;
  lng: number;
  accuracy?: 'exact' | 'interpolated' | 'geometric_center' | 'approximate';
};

export type CensusLocationContext = {
  matchedAddress?: string;
  coordinates?: GeoCoordinates;
  stateFips?: string;
  countyFips?: string;
  countyName?: string;
  tract?: string;
  block?: string;
  incorporatedPlace?: string;
  minorCivilDivision?: string; // e.g. Charter Township of Royal Oak
};

export type JurisdictionDiscipline = 'building' | 'electrical' | 'mechanical' | 'plumbing';

export type JurisdictionEnforcementLevel = 'municipality' | 'township' | 'county' | 'state';

export type JurisdictionMatch = {
  authorityId: string;
  authorityName: string;
  agencyName: string;
  discipline: JurisdictionDiscipline;
  enforcementLevel: JurisdictionEnforcementLevel;
  state: string;
  county: string;
  cityOrTownship?: string;
  isAuthoritative: boolean;
  confidence: 'verified' | 'high' | 'medium' | 'low';
  sourceUrl?: string;
  verifiedAt?: string;
};
