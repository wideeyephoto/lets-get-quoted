/**
 * One-click Smart Intake qualification and scoping presets by trade.
 *
 * Pre-fills sensible minimum job amounts, high-signal trade exclusions,
 * and photo prompts without overwriting custom contractor settings unless
 * confirmed.
 */

export type TradeIntakePreset = {
  id: string;
  name: string;
  minJobAmount: number;
  highValueLeadAmount: number;
  exclusions: string[];
  mandatoryQuestions: string[];
  photoPrompt: string;
  description: string;
};

export const TRADE_INTAKE_PRESETS: Record<string, TradeIntakePreset> = {
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
    photoPrompt: 'A photo of the pipe, fixture, or water heater label',
    description: 'Optimized for residential leak repair, water heaters, and repiping.',
  },
  hvac: {
    id: 'hvac',
    name: 'HVAC & Climate Control',
    minJobAmount: 200,
    highValueLeadAmount: 7500,
    exclusions: ['window AC units', 'commercial chillers', 'walk-in refrigeration'],
    mandatoryQuestions: [
      'What type of system do you have (central AC, heat pump, furnace)?',
      'Is the system currently cooling/heating or completely off?',
    ],
    photoPrompt: 'A photo of the outdoor condenser label and indoor unit',
    description: 'Tailored for AC/furnace tune-ups, replacements, and heat pumps.',
  },
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
    description: 'Designed for residential shingle replacement, storm damage, and repairs.',
  },
  electrical: {
    id: 'electrical',
    name: 'Electrical & Lighting',
    minJobAmount: 175,
    highValueLeadAmount: 5000,
    exclusions: ['high-voltage industrial', 'utility pole drop connections', 'solar farm installations'],
    mandatoryQuestions: [
      'What is your main electrical panel amperage if known (e.g. 100A, 200A)?',
      'Is this an addition, panel upgrade, or troubleshooting an outage?',
    ],
    photoPrompt: 'A photo of the main electrical panel with the door open',
    description: 'Calibrated for panel swaps, EV chargers, wiring, and fixtures.',
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
    description: 'Configured for pavers, sod, planting design, and tree trimming.',
  },
  painting: {
    id: 'painting',
    name: 'Painting & Drywall',
    minJobAmount: 400,
    highValueLeadAmount: 6000,
    exclusions: ['lead paint abatement', 'industrial epoxy coatings', 'commercial high-rise'],
    mandatoryQuestions: [
      'Is this project interior, exterior, or both?',
      'Approximately how many rooms, or what is the square footage?',
    ],
    photoPrompt: 'Photos of the walls, trim, or exterior sides to be painted',
    description: 'Ideal for residential interiors, cabinet refinishing, and full exteriors.',
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
    description: 'Structured for multi-trade renovations, additions, and home remodels.',
  },
};

/**
 * Finds the best preset match for a given contractor trade string.
 */
export function matchTradePreset(trade: string | null | undefined): TradeIntakePreset {
  const t = (trade || '').toLowerCase();
  if (/plumb|drain|pipe|water\s*heater|faucet/i.test(t)) return TRADE_INTAKE_PRESETS.plumbing;
  if (/hvac|heat|cool|air\s*condition|furnace|ventilat/i.test(t)) return TRADE_INTAKE_PRESETS.hvac;
  if (/roof|gutter|siding/i.test(t)) return TRADE_INTAKE_PRESETS.roofing;
  if (/electr|wire|panel|lighting|generator/i.test(t)) return TRADE_INTAKE_PRESETS.electrical;
  if (/landscap|lawn|tree|patio|paver|garden|irrigation/i.test(t)) return TRADE_INTAKE_PRESETS.landscaping;
  if (/paint|drywall|stain|cabinet\s*refinish/i.test(t)) return TRADE_INTAKE_PRESETS.painting;
  return TRADE_INTAKE_PRESETS.general;
}
