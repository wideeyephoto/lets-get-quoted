/**
 * Multi-Product Template Engine for Contractor Merchandise
 *
 * Defines specialized trade layouts for Yard Signs, Carbonless Notepads, and Equipment Decals.
 */

import type { BusinessCardTemplateId, CardFinishId } from './types';

export interface ProductTemplateDef {
  id: string;
  name: string;
  subtitle: string;
  tag: string;
  tradeFit: string;
}

export const YARD_SIGN_TEMPLATES: ProductTemplateDef[] = [
  {
    id: 'jobsite_progress',
    name: 'Jobsite In Progress',
    subtitle: 'High-Visibility Caution Accent',
    tag: 'Neighbor Notice',
    tradeFit: 'Roofing, Remodeling, Painting, Siding',
  },
  {
    id: 'direct_phone',
    name: 'Bold Direct Phone',
    subtitle: 'Giant 35 MPH Roadside Readability',
    tag: 'Drive-By Lead Gen',
    tradeFit: 'Plumbing, HVAC, Electrical, Tree Service',
  },
  {
    id: 'modern_showcase',
    name: 'Modern Architect Statement',
    subtitle: 'Sleek Dual-Tone Brand Showcase',
    tag: 'Luxury / Custom',
    tradeFit: 'Custom Builders, Hardscaping, Pools',
  },
  {
    id: 'qr_estimate',
    name: 'Instant QR Estimate',
    subtitle: 'Camera Scan-to-Quote Live Area',
    tag: 'Dynamic QR',
    tradeFit: 'Solar, Windows, Garage Doors, Pest Control',
  },
];

export const NOTEPAD_TEMPLATES: ProductTemplateDef[] = [
  {
    id: 'work_order',
    name: 'Standard Work Order Grid',
    subtitle: '2-Part Carbonless NCR Scope Form',
    tag: 'Field Operations',
    tradeFit: 'Plumbing, Electrical, HVAC, Service Techs',
  },
  {
    id: 'change_order',
    name: 'Change Order Authorization',
    subtitle: 'Binding Legal Scope Adjustment Form',
    tag: 'Legal Protection',
    tradeFit: 'General Contractors, Commercial Builders',
  },
  {
    id: 'field_estimate',
    name: 'Diagnostic & Estimate Ticket',
    subtitle: '3-Tier Good / Better / Best Estimate',
    tag: 'Sales & Quotes',
    tradeFit: 'Residential Service, Roofing, Handyman',
  },
];

export const DECAL_TEMPLATES: ProductTemplateDef[] = [
  {
    id: 'fleet_door',
    name: 'Commercial Fleet Door Magnet',
    subtitle: '12" × 24" 30-Mil Magnetic Sheeting',
    tag: 'Vehicle Fleet',
    tradeFit: 'All Contractor Trucks & Vans',
  },
  {
    id: 'equipment_warranty',
    name: 'Service Warranty Sticker',
    subtitle: 'Equipment Inspection & Hotline Label',
    tag: 'Repeat Business',
    tradeFit: 'HVAC Condensers, Water Heaters, Panels',
  },
  {
    id: 'hard_hat_tool',
    name: 'Hard Hat & Tool ID Badge',
    subtitle: 'Heavy-Duty Die-Cut Weatherproof Vinyl',
    tag: 'Crew & Assets',
    tradeFit: 'Jobsite Crews, Subcontractors, Toolboxes',
  },
];

export function getYardSignTemplateById(id?: string | null): ProductTemplateDef {
  return YARD_SIGN_TEMPLATES.find((t) => t.id === id) || YARD_SIGN_TEMPLATES[0];
}

export function getNotepadTemplateById(id?: string | null): ProductTemplateDef {
  return NOTEPAD_TEMPLATES.find((t) => t.id === id) || NOTEPAD_TEMPLATES[0];
}

export function getDecalTemplateById(id?: string | null): ProductTemplateDef {
  return DECAL_TEMPLATES.find((t) => t.id === id) || DECAL_TEMPLATES[0];
}

export interface TradePreset {
  id: string;
  name: string;
  badge: string;
  trade: string;
  accentColor: string;
  secondaryColor: string;
  tagline: string;
  cardTemplate: BusinessCardTemplateId;
  cardFinish: CardFinishId;
  yardSignTemplate: string;
  notepadTemplate: string;
  decalTemplate: string;
}

export const TRADE_PRESETS: TradePreset[] = [
  {
    id: 'electrical',
    name: 'Electrical',
    badge: '⚡',
    trade: 'Licensed Electrician',
    accentColor: '#f59e0b',
    secondaryColor: '#0f172a',
    tagline: 'Master Electrician • Commercial & Residential Wiring',
    cardTemplate: 'industrial',
    cardFinish: 'foil_gold',
    yardSignTemplate: 'direct_phone',
    notepadTemplate: 'work_order',
    decalTemplate: 'fleet_door',
  },
  {
    id: 'plumbing',
    name: 'Plumbing & HVAC',
    badge: '🔧',
    trade: 'Mechanical Contractor',
    accentColor: '#0284c7',
    secondaryColor: '#0c4a6e',
    tagline: '24/7 Emergency Repairs • Clean Water & Drainage Experts',
    cardTemplate: 'modern_split',
    cardFinish: 'spot_uv',
    yardSignTemplate: 'direct_phone',
    notepadTemplate: 'work_order',
    decalTemplate: 'equipment_warranty',
  },
  {
    id: 'contractor',
    name: 'General Builder',
    badge: '🔨',
    trade: 'General Contractor',
    accentColor: '#ea580c',
    secondaryColor: '#1e293b',
    tagline: 'Custom Residential Remodeling & Commercial Framing',
    cardTemplate: 'blueprint',
    cardFinish: 'velvet_matte',
    yardSignTemplate: 'jobsite_progress',
    notepadTemplate: 'change_order',
    decalTemplate: 'fleet_door',
  },
  {
    id: 'roofing',
    name: 'Roofing & Siding',
    badge: '🏠',
    trade: 'Roofing Contractor',
    accentColor: '#dc2626',
    secondaryColor: '#090d16',
    tagline: 'Storm Restoration • Lifetime Architectural Shingles',
    cardTemplate: 'qr_first',
    cardFinish: 'foil_silver',
    yardSignTemplate: 'qr_estimate',
    notepadTemplate: 'field_estimate',
    decalTemplate: 'fleet_door',
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    badge: '🌿',
    trade: 'Landscape Craftsman',
    accentColor: '#16a34a',
    secondaryColor: '#14532d',
    tagline: 'Custom Hardscapes • Pavers, Turf & Irrigation Systems',
    cardTemplate: 'verified_pro',
    cardFinish: 'velvet_matte',
    yardSignTemplate: 'modern_showcase',
    notepadTemplate: 'field_estimate',
    decalTemplate: 'hard_hat_tool',
  },
  {
    id: 'custom_homes',
    name: 'Luxury Estates',
    badge: '🏛️',
    trade: 'Architectural Builder',
    accentColor: '#d4af37',
    secondaryColor: '#18181b',
    tagline: 'Bespoke Architectural Residences & High-End Renovation',
    cardTemplate: 'executive',
    cardFinish: 'foil_gold',
    yardSignTemplate: 'modern_showcase',
    notepadTemplate: 'change_order',
    decalTemplate: 'fleet_door',
  },
];

