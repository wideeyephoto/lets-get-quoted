/**
 * 8 Curated Commercial Business Card Templates for Contractors
 *
 * Vector-accurate, print-spec compliant templates engineered for 3.5" x 2" 16pt cardstock.
 * Each template dynamically adapts to the contractor's business name, tagline,
 * phone, website, license, brand colors, and dynamic booking QR code.
 */

import type { BusinessCardTemplateId } from './types';

export interface CardTemplateDefinition {
  id: BusinessCardTemplateId;
  name: string;
  subtitle: string;
  tag: string;
  tradeFit: string;
  description: string;
  frontFeature: string;
  backFeature: string;
}

export const BUSINESS_CARD_TEMPLATES: CardTemplateDefinition[] = [
  {
    id: 'executive',
    name: 'The Executive Tradesman',
    subtitle: 'Matte Onyx & Metallic Rule',
    tag: 'Luxury / Premium',
    tradeFit: 'Custom Home Builders, Luxury Remodelers, Millwork',
    description: 'Sleek, minimalist dark charcoal aesthetic with a thin metallic accent pinstripe, spot-UV sheen, and sophisticated typography.',
    frontFeature: 'Spot-UV raised logo with metallic accent pinstripe',
    backFeature: 'High-contrast executive layout with subtle QR frame',
  },
  {
    id: 'modern_split',
    name: 'The Modern Split',
    subtitle: 'Dual-Tone Contrast Block',
    tag: 'Modern / Clean',
    tradeFit: 'Electrical, Plumbing, Modern HVAC, Smart Home',
    description: 'High-impact 35/65 vertical split featuring a bold brand color block on the left and ultra-clean contact typography on the right.',
    frontFeature: 'Vertical brand accent band with inverted emblem',
    backFeature: 'Clean dual-column contact card with matching accent tab',
  },
  {
    id: 'industrial',
    name: 'The Industrial Heavy-Duty',
    subtitle: 'Carbon Fiber & Hazard Accent',
    tag: 'Rugged / Bold',
    tradeFit: 'Roofing, Excavation, Demolition, Concrete, Paving',
    description: 'Heavy-duty dark graphite texture with diagonal hazard stripe accent rules and bold, condensed block typography that projects strength.',
    frontFeature: 'High-density block typography with safety chevron accent',
    backFeature: 'Heavy-duty contact grid with high-visibility dispatch badge',
  },
  {
    id: 'blueprint',
    name: 'The Blueprint Technical',
    subtitle: 'Architectural CAD Grid',
    tag: 'Technical / Architectural',
    tradeFit: 'General Contractors, Design-Build, Framing, Engineering',
    description: 'Architectural precision drafting grid with technical corner crop markers, blueprint cyan accent lines, and CAD-style coordinate framing.',
    frontFeature: 'Precision drafting grid with architectural title block',
    backFeature: 'Specification layout with stamped QR verification block',
  },
  {
    id: 'qr_first',
    name: 'The High-Impact QR First',
    subtitle: 'Instant Estimate Scanner',
    tag: 'Lead-Gen Focused',
    tradeFit: 'Emergency Services, Restoration, Locksmith, Tree Care, Garage Doors',
    description: 'Front-and-center oversized scan-to-book QR code with clear callouts designed to turn every handshake into an immediate digital quote.',
    frontFeature: 'Hero QR code direct to phone estimate intake',
    backFeature: 'Full services checklist with 24/7 hotline callouts',
  },
  {
    id: 'verified_pro',
    name: 'The Verified Pro',
    subtitle: 'Trust Crest & 5-Star Badge',
    tag: 'Homeowner Trust',
    tradeFit: 'Residential Services, Painting, Handyman, Security',
    description: 'Emphasizes homeowner safety with prominent Licensed & Insured verification badges, 5.0 Google review star rating crest, and license ID.',
    frontFeature: 'Embossed-style Licensed & Insured verification seal',
    backFeature: '5-star customer guarantee with direct dispatch booking',
  },
  {
    id: 'double_sided',
    name: 'The Double-Sided Showcase',
    subtitle: 'Identity Front, Utility Back',
    tag: 'Balanced Dual-Sided',
    tradeFit: 'Landscaping, Flooring, Tile, Custom Carpentry',
    description: 'Front is a pristine presentation of brand identity and logo mark; back features a dual-column services checklist, direct phone, and booking QR.',
    frontFeature: 'Ultra-clean full-bleed logo presentation without clutter',
    backFeature: 'Structured multi-point service grid with booking link',
  },
  {
    id: 'traditional',
    name: 'The Timeless Traditional',
    subtitle: 'Heritage Double Pinstripe',
    tag: 'Classic Craftsman',
    tradeFit: 'Masonry, Fine Woodworking, Historic Renovation, Ironwork',
    description: 'Classic heritage aesthetic with delicate concentric pinstripe borders, refined craftsman serif typography, and an established contractor seal.',
    frontFeature: 'Concentric hairline border frame with heritage serif type',
    backFeature: 'Established craftsmanship seal with formal contact layout',
  },
];

export function getCardTemplateById(id?: string | null): CardTemplateDefinition {
  if (!id) return BUSINESS_CARD_TEMPLATES[0];
  return (
    BUSINESS_CARD_TEMPLATES.find((t) => t.id === id) ||
    BUSINESS_CARD_TEMPLATES[0]
  );
}
