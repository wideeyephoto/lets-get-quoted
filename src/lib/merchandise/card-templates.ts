/**
 * 8 Curated Commercial Business Card Templates for Contractors
 *
 * Vector-accurate, print-spec compliant templates engineered for 3.5" x 2" 16pt cardstock.
 * Each template dynamically adapts to the contractor's business name, tagline,
 * phone, website, license, brand colors, and dynamic booking QR code.
 */

import type { BusinessCardTemplateId, CardFinishId } from './types';

export interface CardFinishDefinition {
  id: CardFinishId;
  name: string;
  badge: string;
  description: string;
  gradient: string;
  sheenColor: string;
}

export const CARD_FINISHES: CardFinishDefinition[] = [
  {
    id: 'velvet_matte',
    name: 'Soft-Touch Velvet Matte',
    badge: 'Standard Included',
    description: 'Silky smooth peach-skin polymer barrier with deep rich color saturation and zero glare.',
    gradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
    sheenColor: 'rgba(255, 255, 255, 0.12)',
  },
  {
    id: 'foil_gold',
    name: 'Raised Liquid Gold Foil',
    badge: '✦ Luxury Spec',
    description: 'Dynamic mirror metallic gold relief that catches and reflects ambient showroom lighting.',
    gradient: 'linear-gradient(135deg, #bf953f 0%, #fcf6ba 25%, #b38728 50%, #fbf5b7 75%, #aa771c 100%)',
    sheenColor: '#ffd700',
  },
  {
    id: 'foil_silver',
    name: 'Raised Mirror Chrome Silver',
    badge: '✦ High Tech',
    description: 'Brilliant mirror chrome liquid metal highlights ideal for modern and architectural trades.',
    gradient: 'linear-gradient(135deg, #94a3b8 0%, #ffffff 30%, #64748b 60%, #cbd5e1 85%, #475569 100%)',
    sheenColor: '#e2e8f0',
  },
  {
    id: 'spot_uv',
    name: 'Raised Clear Spot-UV Gloss',
    badge: '✦ 50-Micron Tactile',
    description: 'Dimensional clear high-gloss relief overlay on top of deep velvety matte cardstock.',
    gradient: 'linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.05))',
    sheenColor: 'rgba(255, 255, 255, 0.45)',
  },
  {
    id: 'foil_holo',
    name: 'Prismatic Holographic Foil',
    badge: '✦ Iridescent',
    description: 'Prismatic rainbow shimmer that shifts colors across the full visible spectrum as the card tilts.',
    gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 20%, #a1c4fd 45%, #c2e9fb 70%, #d4fc79 100%)',
    sheenColor: '#38bdf8',
  },
];

export function getCardFinishById(id?: string | null): CardFinishDefinition {
  if (!id) return CARD_FINISHES[0];
  return CARD_FINISHES.find((f) => f.id === id) || CARD_FINISHES[0];
}

export interface CardTemplateDefinition {
  id: BusinessCardTemplateId;
  name: string;
  subtitle: string;
  tag: string;
  tradeFit: string;
  description: string;
  frontFeature: string;
  backFeature: string;
  recommendedFinish: CardFinishId;
  badgeLabel: string;
  ratingBadgeText: string;
  patternType: 'pinstripe' | 'split' | 'carbon' | 'grid' | 'qr_focus' | 'trust_seal' | 'showcase' | 'traditional';
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
    recommendedFinish: 'foil_gold',
    badgeLabel: 'MASTER BUILDER',
    ratingBadgeText: '5.0 ★★★★★ Premier Quality',
    patternType: 'pinstripe',
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
    recommendedFinish: 'spot_uv',
    badgeLabel: 'SMART CONTRACTOR',
    ratingBadgeText: '4.9 ★★★★★ Verified Pro',
    patternType: 'split',
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
    recommendedFinish: 'foil_silver',
    badgeLabel: 'HEAVY CIVIL & COMMERCIAL',
    ratingBadgeText: 'SAFETY FIRST • OSHA 30 COMPLIANT',
    patternType: 'carbon',
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
    recommendedFinish: 'foil_silver',
    badgeLabel: 'CAD PRECISION • DWG SPEC',
    ratingBadgeText: 'TOLERANCE ±0.015" • LICENSED GC',
    patternType: 'grid',
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
    recommendedFinish: 'spot_uv',
    badgeLabel: 'FAST DISPATCH ESTIMATE',
    ratingBadgeText: 'SCAN TO BOOK IN 60 SECONDS',
    patternType: 'qr_focus',
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
    recommendedFinish: 'foil_gold',
    badgeLabel: '100% BONDED & INSURED',
    ratingBadgeText: '4.9 ★★★★★ (180+ Local Reviews)',
    patternType: 'trust_seal',
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
    recommendedFinish: 'velvet_matte',
    badgeLabel: 'CUSTOM RESIDENTIAL CRAFT',
    ratingBadgeText: 'FREE ON-SITE CONSULTATION',
    patternType: 'showcase',
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
    recommendedFinish: 'foil_gold',
    badgeLabel: 'EST. 2026 TRADESMAN',
    ratingBadgeText: 'HERITAGE RESTORATION & FINISH',
    patternType: 'traditional',
  },
];

export function getCardTemplateById(id?: string | null): CardTemplateDefinition {
  if (!id) return BUSINESS_CARD_TEMPLATES[0];
  return (
    BUSINESS_CARD_TEMPLATES.find((t) => t.id === id) ||
    BUSINESS_CARD_TEMPLATES[0]
  );
}
