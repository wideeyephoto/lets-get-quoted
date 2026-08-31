// Trade-tailored property intelligence profile and scope resolver
import type { PropertyIntelligence, PropertyIntelligenceSummary } from './types';

export type PropertySection =
  | 'building_specs'   // Living sq ft, year built, stories, layout
  | 'mep_systems'      // Foundation type, heating fuel, cooling type
  | 'roof_geometry'    // Total roof sq ft, squares, pitch, steep warnings, facets
  | 'solar_energy'     // Max sunshine hours, solar panel capacity
  | 'site_lot';        // Lot size, ground footprint

export type TradeFamily =
  | 'roofing'
  | 'siding'
  | 'solar'
  | 'plumbing'
  | 'hvac'
  | 'electrical'
  | 'finishing'
  | 'flooring'
  | 'insulation'
  | 'window_installation'
  | 'outdoor_maintenance'
  | 'landscaping'
  | 'general'
  | 'unknown';

// Primary (auto-expanded) sections per trade family
const TRADE_DEFAULT_PRIMARY: Record<TradeFamily, PropertySection[]> = {
  roofing: ['roof_geometry', 'building_specs'],
  siding: ['site_lot', 'building_specs'],
  solar: ['solar_energy', 'roof_geometry'],
  plumbing: ['mep_systems', 'building_specs'],
  hvac: ['mep_systems', 'building_specs'],
  electrical: ['building_specs'],
  finishing: ['building_specs'],
  flooring: ['building_specs'],
  insulation: ['building_specs', 'mep_systems'],
  window_installation: ['building_specs', 'site_lot'],
  outdoor_maintenance: ['building_specs', 'site_lot'],
  landscaping: ['site_lot', 'building_specs'],
  general: ['building_specs', 'roof_geometry', 'mep_systems'],
  unknown: ['building_specs'],
};

// Explicit render ordering per trade family
const TRADE_FAMILY_ORDER: Record<TradeFamily, PropertySection[]> = {
  roofing: ['roof_geometry', 'building_specs', 'site_lot', 'solar_energy', 'mep_systems'],
  siding: ['site_lot', 'building_specs', 'roof_geometry', 'mep_systems', 'solar_energy'],
  solar: ['solar_energy', 'roof_geometry', 'building_specs', 'mep_systems', 'site_lot'],
  plumbing: ['mep_systems', 'building_specs', 'site_lot', 'roof_geometry', 'solar_energy'],
  hvac: ['mep_systems', 'building_specs', 'site_lot', 'roof_geometry', 'solar_energy'],
  electrical: ['building_specs', 'mep_systems', 'site_lot', 'solar_energy', 'roof_geometry'],
  finishing: ['building_specs', 'site_lot', 'mep_systems', 'roof_geometry', 'solar_energy'],
  flooring: ['building_specs', 'mep_systems', 'site_lot', 'roof_geometry', 'solar_energy'],
  insulation: ['building_specs', 'mep_systems', 'site_lot', 'roof_geometry', 'solar_energy'],
  window_installation: ['building_specs', 'site_lot', 'roof_geometry', 'mep_systems', 'solar_energy'],
  outdoor_maintenance: ['building_specs', 'site_lot', 'roof_geometry', 'mep_systems', 'solar_energy'],
  landscaping: ['site_lot', 'building_specs', 'roof_geometry', 'solar_energy', 'mep_systems'],
  general: ['building_specs', 'roof_geometry', 'mep_systems', 'site_lot', 'solar_energy'],
  unknown: ['building_specs', 'mep_systems', 'roof_geometry', 'site_lot', 'solar_energy'],
};

// Suffix-aware, word-bounded multi-trade matching
export function matchTradeFamilies(trade?: string | null): TradeFamily[] {
  const text = (trade ?? '').toLowerCase().trim();
  if (!text) return ['unknown'];

  const matched: TradeFamily[] = [];
  if (/\b(?:roof(?:ing|er|ers)?|gutter(?:s|ing)?|chimney(?:s)?|commercial[- ]roofing)\b/i.test(text)) matched.push('roofing');
  if (/\b(?:siding|cladding)\b/i.test(text)) matched.push('siding');
  if (/\b(?:solar|photovoltaic|clean energy|solar[- ]batter(?:y|ies))\b/i.test(text)) matched.push('solar');
  if (/\b(?:plumb(?:ing|er|ers)?|pipe(?:s|r|rs|fitting|fitter)?|drain(?:s|age| cleaning)?|septic|septic[- ]pumping|sewer(?:s)?|trenchless|water heater(?:s)?|backflow|water[- ]filtration)\b/i.test(text)) matched.push('plumbing');
  if (/\b(?:hvac|heat(?:ing|er|ers)?|furnace(?:s)?|air condition(?:ing|er|ers)?|a\/c|cooling|ventilation|duct(?:s|work| cleaning)?|mini[- ]split|geothermal)\b/i.test(text)) matched.push('hvac');
  if (/\b(?:electric(?:al|ian|ians)?|wiring|lighting|generator(?:s)?|ev[- ]charger|smart[- ]home|audio|gate[- ]automation)\b/i.test(text)) matched.push('electrical');
  if (/\b(?:paint(?:ing|er|ers)?|stain(?:ing|er)?|drywall|sheetrock|plaster(?:ing)?|stucco|venetian|cabinet[- ]refinishing|wallpaper)\b/i.test(text)) matched.push('finishing');
  if (/\b(?:floor(?:ing|s|er)?|hardwood|carpet(?:ing)?|tile|tiling|laminate|vinyl plank|epoxy|grout|floor[- ]care)\b/i.test(text)) matched.push('flooring');
  if (/\b(?:insulat(?:ion|or|ors)?|weatheriz(?:ation|e)?|attic|crawlspace|radon|asbestos|mold|biohazard)\b/i.test(text)) matched.push('insulation');
  if (/\b(?:window(?:s)?\s*(?:&|and|\/)?\s*door(?:s)?|window (?:installation|replacement|installer|install)|door (?:installation|replacement|installer|install)|glazi(?:er|ers|ng)?|glass|storefront|awning|screen)\b/i.test(text)) matched.push('window_installation');
  if (/\b(?:window cleaning|deck(?:s|ing)?|fence|fencing|pressure wash(?:ing)?|power wash(?:ing)?|sealcoat|paver[- ]seal|striping|bin[- ]clean|pet[- ]waste|graffiti|dry[- ]ice)\b/i.test(text)) matched.push('outdoor_maintenance');
  if (/\b(?:landscap(?:e|ing|er|ers)?|lawn(?: care| service)?|mow(?:ing)?|tree(?: service| care)?|stump|irrigation|hardscape|patio|paver|turf|pool|court|dock|seawall|greenhouse|farm[- ]fenc)\b/i.test(text)) matched.push('landscaping');
  if (/\b(?:general contractor(?:s)?|builder(?:s)?|remodel(?:ing|er|ers|s)?|handyman|renovat(?:ion|ions|or|ors|e|ing)?|restoration(?:s)?|pole[- ]barn|shed|kitchen|bath|theater|sauna|cellar|demolition)\b/i.test(text)) matched.push('general');

  return matched.length > 0 ? matched : ['unknown'];
}

// Disambiguated scope patterns
const SCOPE_PATTERNS = {
  roof_geometry: /\b(?:roof(?:ing|er|s)?|shingle(?:s)?|fascia|soffit|flashing|skylight(?:s)?|ridge cap|underlayment)\b/i,
  solar_energy: /\b(?:solar (?:panel|array|system|pv|install|power)|photovoltaic|inverter(?:s)?)\b/i,
  mep_systems: /\b(?:plumb(?:ing|er)?|water heater|repipe|drain(?: cleaning)?|sewer|faucet|toilet|boiler|furnace|heat pump|a\/c|air condition(?:ing)?|hvac|ductless|mini[- ]split|breaker|service panel|electrical panel|panel upgrade|amp service)\b/i,
  site_lot: /\b(?:landscap(?:ing|er)?|lawn|tree(?:s)?|irrigation|sprinkler|hardscape|patio|paver|retaining wall|fence|fencing|pool|driveway)\b/i,
  disturbs_paint: /\b(?:paint(?:ing)?|drywall|sheetrock|sand(?:ing)?|scrap(?:ing)?|window(?:s)?|siding|demo(?:lition)?|remodel(?:ing)?|renovat(?:ion|e)?)\b/i,
};

export const INTERIOR_SPATIAL_TRADES = new Set<TradeFamily>([
  'general',
  'finishing',
  'flooring',
  'plumbing',
  'window_installation',
]);

export const EXTERIOR_ONLY_TRADES = new Set<TradeFamily>([
  'roofing',
  'siding',
  'solar',
  'outdoor_maintenance',
  'landscaping',
]);

export const INTERIOR_SCOPE_PATTERNS =
  /\b(?:bath(?:room|rooms)?|tub|shower|alcove|kitchen(?:s)?|island(?:s)?|cabinet(?:s)?|bedroom(?:s)?|living(?: room)?|basement(?:s)?|dining(?: room)?|closet(?:s)?|floor(?:ing|s)?|tile|tiling|hardwood|lvp|vinyl plank|carpet(?:ing)?|paint(?:ing|er)?|drywall|sheetrock|plaster|trim|baseboard(?:s)?|casing|molding|crown|remodel(?:ing|er)?|renovat(?:ion|e|or)?|interior)\b/i;

export type RoomSpatialDisplayConfig = {
  /** Whether the LiDAR / 3D room spatial tool should be displayed */
  shouldDisplay: boolean;
  /** Whether it should be expanded as a primary takeoff tool (true) or collapsed as optional (false) */
  isPromoted: boolean;
  /** The recommended room preset based on scope analysis */
  recommendedRoomType: 'bathroom' | 'kitchen' | 'bedroom' | 'general';
  /** Reason for the display decision */
  reason: string;
};

export function inferRoomTypeFromScope(
  scope?: string | null
): 'bathroom' | 'kitchen' | 'bedroom' | 'general' {
  const text = (scope ?? '').toLowerCase();
  if (/\b(?:kitchen|island|cook|countertop|range|cabinet|pantry|fridge|sink|hood)\b/i.test(text)) {
    return 'kitchen';
  }
  if (/\b(?:bed|bedroom|master bed|guest room|hardwood|carpet|closet)\b/i.test(text)) {
    return 'bedroom';
  }
  if (/\b(?:bath|bathroom|tub|shower|alcove|vanity|toilet|wet wall|tile|tiling)\b/i.test(text)) {
    return 'bathroom';
  }
  return 'bathroom';
}

/**
 * Determines whether a job or lead should display the 3D Room LiDAR Spatial Scan
 * prominently (promoted) vs collapsed as an optional tool (exterior trades),
 * and automatically infers the most relevant room scan preset.
 */
export function shouldDisplayRoomSpatialScan(input: {
  trade?: string | null;
  scope?: string | null;
  hasCustomScan?: boolean;
}): RoomSpatialDisplayConfig {
  const families = matchTradeFamilies(input.trade);
  const scopeText = (input.scope ?? '').trim();

  // If a custom scan is explicitly attached, always promote it
  if (input.hasCustomScan) {
    return {
      shouldDisplay: true,
      isPromoted: true,
      recommendedRoomType: inferRoomTypeFromScope(scopeText),
      reason: 'Custom 3D scan attached to job',
    };
  }

  const hasInteriorScope = INTERIOR_SCOPE_PATTERNS.test(scopeText);
  const hasInteriorTrade = families.some((f) => INTERIOR_SPATIAL_TRADES.has(f));
  const isPurelyExteriorTrade =
    families.length > 0 &&
    !families.includes('unknown') &&
    families.every((f) => EXTERIOR_ONLY_TRADES.has(f));

  // If the scope explicitly describes an interior room or renovation, promote it
  if (hasInteriorScope) {
    return {
      shouldDisplay: true,
      isPromoted: true,
      recommendedRoomType: inferRoomTypeFromScope(scopeText),
      reason: 'Interior scope keywords detected in job description',
    };
  }

  // If the contractor is an interior trade (e.g. painter, flooring, remodeler), promote it
  if (hasInteriorTrade) {
    return {
      shouldDisplay: true,
      isPromoted: true,
      recommendedRoomType: inferRoomTypeFromScope(scopeText),
      reason: 'Contractor trade benefits directly from interior spatial takeoffs',
    };
  }

  // If purely exterior trade with no interior scope, collapse as optional
  if (isPurelyExteriorTrade) {
    return {
      shouldDisplay: true,
      isPromoted: false,
      recommendedRoomType: 'general',
      reason: 'Exterior trade — interior spatial tool available optionally',
    };
  }

  // General or unknown trade
  return {
    shouldDisplay: true,
    isPromoted: true,
    recommendedRoomType: inferRoomTypeFromScope(scopeText),
    reason: 'Standard spatial takeoff tool',
  };
}

export type ResolvedPropertyProfile = {
  matchedFamilies: TradeFamily[];
  primarySections: PropertySection[];
  secondarySections: PropertySection[];
  isPre1978: boolean;
  needsLeadScreening: boolean;
};

/** Pure Fact Resolver (availableSections is REQUIRED) */
export function resolvePropertyIntelProfile(input: {
  trade?: string | null;
  scope?: string | null;
  availableSections: Set<PropertySection> | PropertySection[];
  yearBuilt?: number | null;
}): ResolvedPropertyProfile {
  const families = matchTradeFamilies(input.trade);
  const scopeText = input.scope ?? '';
  const available = new Set(input.availableSections);

  const primarySet = new Set<PropertySection>();
  for (const family of families) {
    for (const section of TRADE_DEFAULT_PRIMARY[family]) {
      primarySet.add(section);
    }
  }

  const scopePromoted: PropertySection[] = [];
  if (SCOPE_PATTERNS.roof_geometry.test(scopeText)) scopePromoted.push('roof_geometry');
  if (SCOPE_PATTERNS.solar_energy.test(scopeText)) scopePromoted.push('solar_energy');
  if (SCOPE_PATTERNS.mep_systems.test(scopeText)) scopePromoted.push('mep_systems');
  if (SCOPE_PATTERNS.site_lot.test(scopeText)) scopePromoted.push('site_lot');

  for (const s of scopePromoted) primarySet.add(s);

  const orderedPrimary: PropertySection[] = [];
  for (const s of scopePromoted) {
    if (!orderedPrimary.includes(s) && available.has(s)) orderedPrimary.push(s);
  }
  for (const family of families) {
    for (const s of TRADE_FAMILY_ORDER[family]) {
      if (primarySet.has(s) && !orderedPrimary.includes(s) && available.has(s)) {
        orderedPrimary.push(s);
      }
    }
  }

  const secondarySet = new Set<PropertySection>();
  const orderedSecondary: PropertySection[] = [];
  for (const family of families) {
    for (const s of TRADE_FAMILY_ORDER[family]) {
      if (!primarySet.has(s) && !secondarySet.has(s) && available.has(s)) {
        secondarySet.add(s);
        orderedSecondary.push(s);
      }
    }
  }

  const numYear = Number(input.yearBuilt);
  const isPre1978 = Boolean(Number.isFinite(numYear) && numYear > 0 && numYear < 1978);
  const needsLeadScreening = isPre1978 && SCOPE_PATTERNS.disturbs_paint.test(scopeText);

  return {
    matchedFamilies: families,
    primarySections: orderedPrimary,
    secondarySections: orderedSecondary,
    isPre1978,
    needsLeadScreening,
  };
}

export function getAvailableSectionsFromIntel(intel: PropertyIntelligence | null): Set<PropertySection> {
  const sections = new Set<PropertySection>();
  if (!intel) return sections;
  if (intel.specs && (intel.specs.squareFootage || intel.specs.yearBuilt || intel.specs.bedrooms || intel.specs.bathrooms || intel.specs.stories)) {
    sections.add('building_specs');
  }
  if (intel.specs && (intel.specs.foundationType || intel.specs.heatingFuel || intel.specs.coolingType)) {
    sections.add('mep_systems');
  }
  if (intel.roof && intel.roof.roofingSquares > 0) {
    sections.add('roof_geometry');
  }
  if (intel.roof && (intel.roof.maxSunshineHoursPerYear > 0 || intel.roof.solarPotentialPanels > 0)) {
    sections.add('solar_energy');
  }
  if ((intel.specs && (intel.specs.lotSizeSqFt || intel.specs.lotSizeAcres)) || (intel.roof && intel.roof.groundAreaSqFt > 0)) {
    sections.add('site_lot');
  }
  return sections;
}

export function resolveProfileFromIntel(intel: PropertyIntelligence | null, trade?: string | null, scope?: string | null): ResolvedPropertyProfile {
  return resolvePropertyIntelProfile({
    trade,
    scope,
    availableSections: getAvailableSectionsFromIntel(intel),
    yearBuilt: intel?.specs?.yearBuilt,
  });
}

export function getAvailableSectionsFromSummary(summary: PropertyIntelligenceSummary | null): Set<PropertySection> {
  const sections = new Set<PropertySection>();
  if (!summary) return sections;
  if (summary.livingAreaSqFt || summary.yearBuilt || summary.bedrooms || summary.bathrooms || summary.stories) {
    sections.add('building_specs');
  }
  if (summary.foundationType || summary.heatingFuel) {
    sections.add('mep_systems');
  }
  if (summary.roofingSquares || summary.totalRoofAreaSqFt) {
    sections.add('roof_geometry');
  }
  if (summary.solarPanelCapacity) {
    sections.add('solar_energy');
  }
  if (summary.lotSizeAcres || summary.lotSizeSqFt || summary.groundFootprintSqFt) {
    sections.add('site_lot');
  }
  return sections;
}

export function resolveProfileFromSummary(summary: PropertyIntelligenceSummary | null, trade?: string | null, scope?: string | null): ResolvedPropertyProfile {
  return resolvePropertyIntelProfile({
    trade,
    scope,
    availableSections: getAvailableSectionsFromSummary(summary),
    yearBuilt: summary?.yearBuilt,
  });
}
