import { matchTradeFamilies, type TradeFamily } from './property-intel/profile';

/**
 * One-click Smart Intake qualification and scoping presets by trade.
 *
 * Pre-fills sensible minimum job amounts, high-signal trade exclusions,
 * mandatory questions, photo prompts, and complexity triggers across
 * all 13 canonical trade families.
 */

export type TradeIntakePreset = {
  id: TradeFamily;
  name: string;
  minJobAmount: number;
  highValueLeadAmount: number;
  exclusions: string[];
  mandatoryQuestions: string[];
  photoPrompt: string;
  photoGuidance: string;
  siteVisitTriggers: string[];
  equipmentSpecs: string[];
  description: string;
};

export const TRADE_INTAKE_PRESETS: Record<TradeFamily, TradeIntakePreset> = {
  roofing: {
    id: 'roofing',
    name: 'Roofing & Gutters',
    minJobAmount: 500,
    highValueLeadAmount: 12000,
    exclusions: ['slate roofs', 'flat commercial tar & gravel', 'mobile homes'],
    mandatoryQuestions: [
      'How many stories is the home and what is the current roof material?',
      'Is this an active leak or a full roof replacement inquiry?',
    ],
    photoPrompt: 'Photos of the roof area and any interior ceiling stains',
    photoGuidance: 'Request a wide shot of the roof slope from the ground or driveway, and any interior ceiling water stain patterns.',
    siteVisitTriggers: [
      'Multi-layer tear-offs with suspected rotten decking/plywood',
      'Complex steep slopes (>9/12) with valleys and custom copper flashing',
      'Historical slate/tile/shake conversions',
      'Commercial flat roofs with ponding water',
    ],
    equipmentSpecs: ['Shingle Type (3-tab, architectural, metal, tile)', 'Slope/Pitch', 'Layer Count', 'Flashing Condition'],
    description: 'Designed for residential shingle replacement, storm damage, and repairs.',
  },

  siding: {
    id: 'siding',
    name: 'Siding & Cladding',
    minJobAmount: 600,
    highValueLeadAmount: 14000,
    exclusions: ['asbestos siding removal without certified abatement', 'commercial high-rise cladding'],
    mandatoryQuestions: [
      'What type of siding is currently on the home (vinyl, fiber cement/hardie, wood, aluminum)?',
      'Are you looking for spot repair or whole-house replacement?',
    ],
    photoPrompt: 'Photos of the exterior walls and any damaged or warped siding panels',
    photoGuidance: 'Request full-wall perspective shots showing corner trim, soffits, and window wraps.',
    siteVisitTriggers: [
      'Whole-home siding replacement with suspected moisture barrier/sheathing rot',
      'Custom stone/brick veneer transitions',
      'Two+ story houses with complex exterior scaffolding requirements',
    ],
    equipmentSpecs: ['Siding Material (Vinyl, Fiber Cement, Wood, Aluminum)', 'Wall Area', 'Trim/Soffit Condition'],
    description: 'Calibrated for vinyl, Hardie board, cedar shake, and trim replacement.',
  },

  solar: {
    id: 'solar',
    name: 'Solar & Clean Energy',
    minJobAmount: 2500,
    highValueLeadAmount: 25000,
    exclusions: ['off-grid DIY battery builds without UL listing', 'solar water thermal heating repair'],
    mandatoryQuestions: [
      'What is your approximate average monthly electric bill?',
      'What is the age and condition of your existing roof?',
    ],
    photoPrompt: 'A photo of the main electrical panel with the door open and the meter',
    photoGuidance: 'Request photos of the main electrical service panel label, electric meter, and roof faces receiving sunlight.',
    siteVisitTriggers: [
      'Main electrical service panel upgrade required (100A to 200A busbar)',
      'Complex ground mount arrays with long trenching runs',
      'Whole-home battery backup integration (e.g. Powerwall/Enphase storage)',
    ],
    equipmentSpecs: ['Inverter Type (Microinverter, String)', 'Main Panel Amperage', 'Roof Sun Exposure', 'Battery Storage Capacity'],
    description: 'Engineered for rooftop solar PV, microinverter systems, and battery storage.',
  },

  plumbing: {
    id: 'plumbing',
    name: 'Plumbing & Drains',
    minJobAmount: 150,
    highValueLeadAmount: 4000,
    exclusions: ['mobile home underground mains', 'commercial grease traps', 'city storm drains'],
    mandatoryQuestions: [
      'Is there active leaking or water damage right now?',
      'Is the water supply currently shut off?',
    ],
    photoPrompt: 'A photo of the pipe, fixture, or water heater rating label',
    photoGuidance: 'Request a close-up photo of the water heater serial/model data plate, pipe joint, or fixture leak point.',
    siteVisitTriggers: [
      'Whole-home repiping across multiple stories (e.g. 50+ ft galvanized pipe replacement)',
      'Main sewer line excavation, collapse, or trenchless CIPP lining',
      'Under-slab leak detection and jackhammer foundation penetration',
    ],
    equipmentSpecs: ['Water Heater Gallon Capacity & Fuel', 'Pipe Material (Copper, PEX, Galvanized, Cast Iron)', 'Main Shutoff Accessibility'],
    description: 'Optimized for residential leak repair, water heaters, and repiping.',
  },

  hvac: {
    id: 'hvac',
    name: 'HVAC & Climate Control',
    minJobAmount: 200,
    highValueLeadAmount: 7500,
    exclusions: ['window AC units', 'commercial chillers', 'walk-in refrigeration'],
    mandatoryQuestions: [
      'What type of system do you have (central AC, heat pump, furnace, ductless)?',
      'Is the system currently heating/cooling or completely unresponsive?',
    ],
    photoPrompt: 'A photo of the outdoor condenser nameplate and indoor unit label',
    photoGuidance: 'Request clear photos of the outdoor condenser manufacturer data plate (showing tonnage/model) and the indoor furnace/air handler label.',
    siteVisitTriggers: [
      'Full system changeout with complete ductwork reconfiguration/zoning',
      'Conversion from gas furnace to dual-fuel heat pump requiring electrical panel upgrades',
      'Commercial rooftop package unit replacements',
    ],
    equipmentSpecs: ['Condenser Tonnage & SEER Rating', 'Refrigerant Type (R-410A, R-22, R-454B)', 'Furnace AFUE & Heating Fuel'],
    description: 'Tailored for AC/furnace tune-ups, replacements, and heat pumps.',
  },

  electrical: {
    id: 'electrical',
    name: 'Electrical & Lighting',
    minJobAmount: 175,
    highValueLeadAmount: 5000,
    exclusions: ['high-voltage industrial 480V+', 'utility pole drop connections', 'solar farm installations'],
    mandatoryQuestions: [
      'What is your main electrical panel amperage if known (e.g. 100A, 200A)?',
      'Is this an addition, panel upgrade, EV charger, or troubleshooting an outage?',
    ],
    photoPrompt: 'A photo of the main electrical panel with the door open',
    photoGuidance: 'Request a photo of the breaker directory/schedule and the main breaker amperage number at the top of the panel.',
    siteVisitTriggers: [
      '100A to 200A/400A service heavy-up requiring utility trenching/meter base swap',
      'Knob-and-tube or ungrounded cloth wiring whole-home replacement',
      'Subpanel feeder installation through finished ceilings/drywall',
    ],
    equipmentSpecs: ['Main Panel Brand & Bus Amperage', 'Available Breaker Slots', 'Wiring Type (Romex, Knob-and-Tube, BX Conduit)'],
    description: 'Calibrated for panel swaps, EV chargers, wiring, and fixtures.',
  },

  finishing: {
    id: 'finishing',
    name: 'Painting & Drywall',
    minJobAmount: 400,
    highValueLeadAmount: 6000,
    exclusions: ['lead paint abatement on commercial facilities', 'industrial epoxy linings', 'commercial high-rise'],
    mandatoryQuestions: [
      'Is this project interior, exterior, or both?',
      'Approximately how many rooms, or what is the square footage?',
    ],
    photoPrompt: 'Photos of the walls, trim, or exterior sides to be painted',
    photoGuidance: 'Request wide-angle shots of the rooms or exterior facades, plus close-ups of peeling paint, drywall cracks, or water stains.',
    siteVisitTriggers: [
      'Whole-home exterior pre-1978 lead paint remediation and full scrape',
      'High cathedral ceiling drywall repair requiring scaffolding',
      'Complete whole-home cabinet factory-finish spraying',
    ],
    equipmentSpecs: ['Wall/Trim Surface Condition', 'Ceiling Height', 'Drywall Damage Extent', 'Pre-1978 Lead Screening'],
    description: 'Ideal for residential interiors, cabinet refinishing, and full exteriors.',
  },

  flooring: {
    id: 'flooring',
    name: 'Flooring & Tile',
    minJobAmount: 500,
    highValueLeadAmount: 8000,
    exclusions: ['commercial terrazzo poured flooring', 'asbestos vinyl tile removal without abatement'],
    mandatoryQuestions: [
      'What type of flooring are you installing (hardwood, LVP, tile, carpet)?',
      'Is there existing flooring that needs demolition and removal first?',
    ],
    photoPrompt: 'Photos of the current floor area and room transitions/doorways',
    photoGuidance: 'Request photos showing the room perimeter, doorways/transitions, and subfloor condition if visible.',
    siteVisitTriggers: [
      'Severe subfloor rot, joist sag, or leveling required over 1/2 inch',
      'Custom herringbone/chevron hardwood sanding and onsite staining',
      'Full custom waterproof walk-in shower tile pan buildouts',
    ],
    equipmentSpecs: ['Floor Material', 'Subfloor Type (Plywood, Concrete Slab)', 'Room Transitions Count'],
    description: 'Configured for hardwood, luxury vinyl plank, tile, and carpet.',
  },

  insulation: {
    id: 'insulation',
    name: 'Insulation & Weatherization',
    minJobAmount: 600,
    highValueLeadAmount: 6500,
    exclusions: ['asbestos vermiculite removal without certified abatement', 'industrial cryo insulation'],
    mandatoryQuestions: [
      'Which area needs insulation (attic, crawlspace, exterior walls, basement)?',
      'Are you experiencing high energy bills, drafts, or pest contamination?',
    ],
    photoPrompt: 'Photos of the attic floor, crawlspace, or access hatch area',
    photoGuidance: 'Request photos looking into the attic hatch or crawlspace showing existing batts/blown-in depth and roof rafters.',
    siteVisitTriggers: [
      'Full attic rodent decontamination, feces sanitization, and blown-in removal',
      'Full crawlspace encapsulation with sump pump and vapor barrier sealing',
      'Closed-cell spray foam retrofit on existing roof rafters',
    ],
    equipmentSpecs: ['Existing R-Value / Depth', 'Attic Access Hatch Size', 'Moisture/Ventilation Condition'],
    description: 'Designed for blown-in attic insulation, air sealing, and crawlspace vapor barriers.',
  },

  window_installation: {
    id: 'window_installation',
    name: 'Window & Door Replacement',
    minJobAmount: 800,
    highValueLeadAmount: 12000,
    exclusions: ['commercial storefront curtain walls', 'auto glass repair'],
    mandatoryQuestions: [
      'How many windows or doors are you looking to replace?',
      'Are you looking for pocket insert replacements or full-frame tear-outs?',
    ],
    photoPrompt: 'Photos of the windows/doors from inside and outside showing the trim',
    photoGuidance: 'Request photos of the interior casing and exterior sill/brick mould for the primary windows to be replaced.',
    siteVisitTriggers: [
      'Structural header enlargement for wider sliding glass patio doors',
      'Historic district custom wood window preservation with exterior stucco cutouts',
      'Second-story bay/bow window structural support bracket replacements',
    ],
    equipmentSpecs: ['Window Count & Operating Style (Double Hung, Casement, Slider)', 'Frame Material (Vinyl, Wood, Composite)', 'Rough Opening Integrity'],
    description: 'Tailored for residential replacement windows, entry doors, and patio sliders.',
  },

  outdoor_maintenance: {
    id: 'outdoor_maintenance',
    name: 'Pressure Washing & Exterior Care',
    minJobAmount: 200,
    highValueLeadAmount: 2500,
    exclusions: ['commercial high-rise window washing with bosun chairs', 'toxic chemical wash'],
    mandatoryQuestions: [
      'What surfaces need cleaning (driveway, siding, deck, roof, windows)?',
      'Is there an accessible exterior water spigot available on the property?',
    ],
    photoPrompt: 'Photos of the dirty surfaces, driveway, or deck areas',
    photoGuidance: 'Request wide photos of the driveway, patio, siding, or deck showing the extent of algae, moss, or stain buildup.',
    siteVisitTriggers: [
      'Multi-story delicate wood deck restoration requiring full chemical strip and sanding',
      'Severe oil/efflorescence stain remediation on porous paver installations over 2,000 sq ft',
    ],
    equipmentSpecs: ['Surface Material (Concrete, Pavers, Wood Deck, Vinyl)', 'Approximate Square Footage', 'Water Source Access'],
    description: 'Calibrated for power washing, soft washing, deck cleaning, and window care.',
  },

  landscaping: {
    id: 'landscaping',
    name: 'Landscaping & Hardscaping',
    minJobAmount: 300,
    highValueLeadAmount: 8000,
    exclusions: ['one-off small lawn mows', 'trees over 40ft without crane access', 'parking lot plowing'],
    mandatoryQuestions: [
      'What is the approximate size of the project area (e.g. sq ft or lot portion)?',
      'Are you interested in ongoing maintenance, planting, or hardscaping (patio/retaining wall)?',
    ],
    photoPrompt: 'Photos of the yard area from a couple of angles',
    photoGuidance: 'Request wide-angle photos showing the yard slope, access gates (for equipment), and existing landscaping.',
    siteVisitTriggers: [
      'Retaining walls over 4 feet in height requiring engineering plans/drainage',
      'Major grading, slope correction, and French drain stormwater management',
      'Paver patios or outdoor living kitchens over 800 sq ft',
    ],
    equipmentSpecs: ['Lot Slope & Grading', 'Equipment Gate Access Width', 'Soil & Drainage Condition'],
    description: 'Configured for pavers, sod, planting design, retaining walls, and tree trimming.',
  },

  general: {
    id: 'general',
    name: 'General Contracting & Remodeling',
    minJobAmount: 1000,
    highValueLeadAmount: 25000,
    exclusions: ['commercial tenant buildouts', 'asbestos removal', 'structural foundation rebuilds'],
    mandatoryQuestions: [
      'What is the project scope (kitchen, bathroom, basement, addition)?',
      'Do you already have architectural drawings or HOA approvals?',
    ],
    photoPrompt: 'Photos of the current room or space layout',
    photoGuidance: 'Request photos of all 4 corners of the room, plus visible plumbing/electrical access and ceiling condition.',
    siteVisitTriggers: [
      'Removal or alteration of load-bearing structural walls / beam installations',
      'Full whole-home gut renovations, kitchen layout relocations, or additions',
      'Basement finishing requiring egress window excavation and foundation cutting',
    ],
    equipmentSpecs: ['Room Dimensions & Layout', 'Load-Bearing Wall Identifiers', 'Mechanical Rough-In Locations'],
    description: 'Structured for multi-trade renovations, additions, and home remodels.',
  },

  unknown: {
    id: 'unknown',
    name: 'Home Services',
    minJobAmount: 250,
    highValueLeadAmount: 5000,
    exclusions: ['hazardous materials', 'commercial high-rise'],
    mandatoryQuestions: [
      'What is the specific issue or project you need help with?',
      'How soon are you looking to have this work completed?',
    ],
    photoPrompt: 'Photos of the project area or item needing service',
    photoGuidance: 'Request clear, well-lit photos showing the full work area and any specific points of failure.',
    siteVisitTriggers: [
      'Complex structural or high-liability installations requiring in-person measurement',
    ],
    equipmentSpecs: ['General Work Area Condition'],
    description: 'General home services scoping and estimation.',
  },
};

/**
 * Finds the best preset match for a given contractor trade string using
 * canonical trade family resolution.
 */
export function matchTradePreset(trade: string | null | undefined): TradeIntakePreset {
  const families = matchTradeFamilies(trade);
  const primaryFamily = families[0] ?? 'unknown';
  if (primaryFamily === 'unknown') return TRADE_INTAKE_PRESETS.general;
  return TRADE_INTAKE_PRESETS[primaryFamily] ?? TRADE_INTAKE_PRESETS.general;
}

/**
 * Returns all active trade presets for UI pickers.
 */
export function getTradeIntakePresetsList(): TradeIntakePreset[] {
  return Object.values(TRADE_INTAKE_PRESETS).filter((p) => p.id !== 'unknown');
}

/**
 * Returns calibrated default lead filters for a given trade.
 */
export function getDefaultLeadFiltersForTrade(trade?: string | null): {
  minJobAmount: number;
  exclusions: string[];
} {
  const preset = matchTradePreset(trade);
  return {
    minJobAmount: preset.minJobAmount,
    exclusions: preset.exclusions,
  };
}
