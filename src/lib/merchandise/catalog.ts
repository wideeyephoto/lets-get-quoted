/**
 * Curated Merchandise Catalog
 *
 * Professional-grade merchandise, uniforms, business cards, jobsite gear,
 * and promotional items for contractors with instant volume purchasing.
 */

import type { MerchandiseProduct, MerchandiseCategoryId } from './types';

export const MERCHANDISE_CATEGORIES: { id: MerchandiseCategoryId; label: string; icon: string }[] = [
  { id: 'print', label: 'Cards & Field Forms', icon: '📇' },
];

export const ALL_MERCHANDISE_PRODUCTS: MerchandiseProduct[] = [
  // 1. Business Cards
  {
    id: 'biz_cards',
    name: 'Heavyweight Matte & Velvet Business Cards',
    tagline: 'High-impact 16pt cardstock that commands respect on every quote',
    category: 'print',
    description:
      'Turn every estimate and handshake into a lifelong client. Printed on ultra-stiff 16pt cardstock with scuff-resistant matte or velvet soft-touch laminate, crisp spot-UV gloss highlights, and rounded corner options.',
    bulletPoints: [
      'Ultra-thick 16pt premium cardstock (does not bend or soften in pockets)',
      'Double-sided full color with dynamic QR code direct to your booking page',
      'Silky smooth soft-touch matte finish with optional spot-UV highlights',
      'Standard 3.5" × 2" US trade format with bleed margins',
    ],
    basePrice: 0.05,
    minQuantity: 100,
    turnaroundEstimate: '2–3 business days',
    decorationMethod: 'offset_cmyk',
    decorationLabel: 'High-Definition Offset Litho + Spot UV',
    availableColors: [
      { id: 'classic_white', name: 'Bright Arctic White', hex: '#ffffff', darkText: true },
      { id: 'onyx_black', name: 'Matte Charcoal Onyx', hex: '#18181b', darkText: false },
      { id: 'kraft_earth', name: 'Recycled Kraft Stock', hex: '#d2b48c', darkText: true },
      { id: 'slate_navy', name: 'Deep Midnight Navy', hex: '#0f172a', darkText: false },
    ],
    supportedViews: ['front', 'back', 'angle', 'detail', 'duo'],
    pricingTiers: [
      { quantity: 100, unitPrice: 0.35, totalPrice: 35.0, turnaroundDays: 3 },
      { quantity: 250, unitPrice: 0.24, totalPrice: 60.0, savingsPercent: 31, turnaroundDays: 3 },
      { quantity: 500, unitPrice: 0.17, totalPrice: 85.0, savingsPercent: 51, isPopular: true, turnaroundDays: 2 },
      { quantity: 1000, unitPrice: 0.12, totalPrice: 120.0, savingsPercent: 65, turnaroundDays: 2 },
      { quantity: 2500, unitPrice: 0.08, totalPrice: 200.0, savingsPercent: 77, turnaroundDays: 2 },
    ],
    specs: {
      dimensions: '3.5" × 2.0" (standard cut) / 1050 × 600 px @ 300 DPI',
      material: '16pt / 350 GSM Cover Cardstock with silk lamination',
      finish: 'Matte Velveteen + Raised High-Gloss Clear UV',
      printArea: 'Edge-to-edge full bleed (front & back)',
    },
    options: {
      finishes: [
        'Soft-Touch Velvet Matte',
        'Raised Gold Foil Accent',
        'Raised Silver Chrome Foil',
        'Raised Clear Spot-UV Gloss',
        'Holographic Iridescent Foil',
      ],
    },
  },

  // 2. Embroidered Work Polos
  {
    id: 'polos',
    name: 'Pro Moisture-Wicking Embroidered Work Polo',
    tagline: 'Professional technician polo with permanent stain-release & UV-50 block',
    category: 'apparel',
    description:
      'Keep your technicians looking clean and authoritative on every service call. Engineered from snag-resistant micro-pique polyester that pulls sweat away from the body while holding its shape through industrial laundering.',
    bulletPoints: [
      'High-density 10,000+ stitch embroidery on left chest',
      'UPF 50+ sun protection with antimicrobial anti-odor treatment',
      'Wrinkle, snag, and shrink-resistant performance fabric',
      'Rib-knit collar that stays flat and does not curl',
      'Optional right-sleeve American flag or license # embroidery',
    ],
    basePrice: 14.0,
    minQuantity: 3,
    turnaroundEstimate: '4–6 business days',
    decorationMethod: 'embroidery',
    decorationLabel: 'Precision Machine Embroidery (up to 12 thread colors)',
    availableColors: [
      { id: 'onyx_black', name: 'Onyx Black', hex: '#111827', darkText: false },
      { id: 'deep_navy', name: 'Deep Royal Navy', hex: '#1e3a8a', darkText: false },
      { id: 'steel_gray', name: 'Steel Heather Gray', hex: '#4b5563', darkText: false },
      { id: 'hi_vis_yellow', name: 'Hi-Vis Safety Yellow', hex: '#eab308', darkText: true },
      { id: 'forest_green', name: 'Forest Green', hex: '#14532d', darkText: false },
      { id: 'crisp_white', name: 'Crisp White', hex: '#f8fafc', darkText: true },
    ],
    supportedViews: ['front', 'back', 'detail'],
    pricingTiers: [
      { quantity: 3, unitPrice: 38.0, totalPrice: 114.0, turnaroundDays: 5 },
      { quantity: 6, unitPrice: 32.0, totalPrice: 192.0, savingsPercent: 15, turnaroundDays: 5 },
      { quantity: 12, unitPrice: 26.5, totalPrice: 318.0, savingsPercent: 30, isPopular: true, turnaroundDays: 4 },
      { quantity: 24, unitPrice: 22.0, totalPrice: 528.0, savingsPercent: 42, turnaroundDays: 4 },
      { quantity: 50, unitPrice: 18.5, totalPrice: 925.0, savingsPercent: 51, turnaroundDays: 3 },
    ],
    specs: {
      dimensions: 'Sizes S through 4XL available',
      material: '100% Micro-Pique Moisture-Wicking Polyester (5.2 oz/yd²)',
      finish: 'Stain-release & odor-resistant soil shield',
      printArea: '3.75" × 3.75" Left Chest Embroidery Crest',
      washCare: 'Machine wash cold with like colors, tumble dry low',
    },
    options: {
      sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
    },
  },

  // 3. Crew Work T-Shirts
  {
    id: 't_shirts',
    name: 'Heavyweight Contractor Crew T-Shirt',
    tagline: 'Durable 6.5oz ring-spun cotton with front chest badge & full back print',
    category: 'apparel',
    description:
      'The quintessential tradesman uniform. Built for tough crawlspaces, hot attics, and client driveways. Double-needle stitched hems with taped neck and shoulders to withstand daily wash and wear.',
    bulletPoints: [
      'Front left chest brand mark + full back contractor layout',
      'Back imprint features company name, trade services, and phone number in bold print',
      'Ultra-durable 6.5 oz heavyweight ring-spun combed cotton',
      'High-definition plastisol or soft-feel discharge screen printing',
      'Seamless non-topstitched collar that does not fray',
    ],
    basePrice: 7.5,
    minQuantity: 6,
    turnaroundEstimate: '3–5 business days',
    decorationMethod: 'screen_print',
    decorationLabel: 'Screen Print & Direct-to-Film (Front & Full Back)',
    availableColors: [
      { id: 'black', name: 'Jet Black', hex: '#0f172a', darkText: false },
      { id: 'dark_navy', name: 'Navy Blue', hex: '#1e293b', darkText: false },
      { id: 'heather_charcoal', name: 'Heather Charcoal', hex: '#334155', darkText: false },
      { id: 'safety_orange', name: 'Safety Hi-Vis Orange', hex: '#ea580c', darkText: false },
      { id: 'safety_yellow', name: 'Safety ANSI Yellow', hex: '#ca8a04', darkText: false },
      { id: 'army_olive', name: 'Military Olive Green', hex: '#3f4f34', darkText: false },
    ],
    supportedViews: ['front', 'back', 'detail'],
    pricingTiers: [
      { quantity: 6, unitPrice: 22.0, totalPrice: 132.0, turnaroundDays: 5 },
      { quantity: 12, unitPrice: 17.5, totalPrice: 210.0, savingsPercent: 20, turnaroundDays: 4 },
      { quantity: 25, unitPrice: 14.0, totalPrice: 350.0, savingsPercent: 36, isPopular: true, turnaroundDays: 4 },
      { quantity: 50, unitPrice: 11.5, totalPrice: 575.0, savingsPercent: 47, turnaroundDays: 3 },
      { quantity: 100, unitPrice: 9.25, totalPrice: 925.0, savingsPercent: 57, turnaroundDays: 3 },
    ],
    specs: {
      dimensions: 'Unisex Fit (Sizes S through 5XL)',
      material: '100% Heavyweight Ring-Spun Cotton (6.5 oz / 220 GSM)',
      finish: 'Pre-shrunk jersey fabric with reinforced ribbed collar',
      printArea: '4" × 4" Left Chest + 12" × 14" Full Back Print',
      washCare: 'Machine wash warm inside-out, tumble dry medium',
    },
    options: {
      sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
    },
  },

  // 4. Structured Trucker Hats
  {
    id: 'hats',
    name: 'Richardson 112 Trucker Snapback Hat',
    tagline: 'The gold standard contractor cap with laser-engraved leather or 3D patch',
    category: 'apparel',
    description:
      'The #1 requested hat across the skilled trades. Structured six-panel profile with pre-curved contrast visor and breathable mesh back. Outfitted with an authentic vegetable-tanned leather patch or 3D puff embroidery.',
    bulletPoints: [
      'Authentic Richardson 112 or Flexfit premium trucker chassis',
      'Genuine full-grain laser-etched saddle leather patch with perimeter stitching',
      'Cooling nylon mesh back with adjustable snapback closure (one size fits all)',
      'Cotton-poly front panels built for years of dust, sun, and sweat',
      'Pre-curved contrast stitched visor with dark underbill to reduce glare',
    ],
    basePrice: 9.5,
    minQuantity: 6,
    turnaroundEstimate: '4–6 business days',
    decorationMethod: 'leather_patch',
    decorationLabel: 'Laser-Etched Full-Grain Leather Patch / 3D Embroidery',
    availableColors: [
      { id: 'heather_black', name: 'Heather Gray / Black Mesh', hex: '#374151', darkText: false },
      { id: 'solid_black', name: 'Solid Midnight Black', hex: '#111827', darkText: false },
      { id: 'navy_white', name: 'Navy / White Mesh', hex: '#1e3a8a', darkText: false },
      { id: 'camo_black', name: 'Camo / Black Mesh', hex: '#44403c', darkText: false },
      { id: 'caramel_khaki', name: 'Tobacco Brown / Khaki Mesh', hex: '#78350f', darkText: false },
    ],
    supportedViews: ['front', 'angle', 'detail'],
    pricingTiers: [
      { quantity: 6, unitPrice: 28.0, totalPrice: 168.0, turnaroundDays: 6 },
      { quantity: 12, unitPrice: 23.5, totalPrice: 282.0, savingsPercent: 16, turnaroundDays: 5 },
      { quantity: 24, unitPrice: 18.75, totalPrice: 450.0, savingsPercent: 33, isPopular: true, turnaroundDays: 4 },
      { quantity: 48, unitPrice: 15.2, totalPrice: 729.6, savingsPercent: 45, turnaroundDays: 4 },
      { quantity: 100, unitPrice: 12.8, totalPrice: 1280.0, savingsPercent: 54, turnaroundDays: 3 },
    ],
    specs: {
      dimensions: 'Adjustable Snapback (Fits hat sizes 7 to 7-3/4)',
      material: '60% Cotton / 40% Polyester Front with 100% Polyester Mesh',
      finish: 'Top-grain vegetable-tanned 5oz tooling leather',
      printArea: '3.0" × 2.0" Centered Front Crown Patch',
    },
    options: {
      finishes: ['Laser-Engraved Saddle Tan Leather', 'Laser-Engraved Black Oxide Leather', '3D Raised Puff Embroidery'],
    },
  },

  // 5. Notepads & Order Forms
  {
    id: 'notepads',
    name: 'Carbonless NCR Job Order Pads & Pocket Field Books',
    tagline: 'Professional 2-part NCR work order forms and spiral estimator pads',
    category: 'print',
    description:
      'Never lose an on-site change order or scope note. 2-part carbonless NCR forms produce an immediate copy for the customer and an archive copy for billing. Pocket-sized wire-o spiral notebooks keep job specs waterproof and organized.',
    bulletPoints: [
      'Pre-numbered 2-part NCR paper (White customer copy + Yellow technician copy)',
      'Heavy chipboard backing for effortless writing on ladders or hoods',
      'Personalized with your brand logo, legal contract terms, and customer signature line',
      'Pocket spiral notebooks with grid paper for field sketches & measurements',
      'Padded in sets of 50 serialized leaves with wrap-around manifold shield',
    ],
    basePrice: 2.2,
    minQuantity: 5,
    turnaroundEstimate: '3–4 business days',
    decorationMethod: 'offset_cmyk',
    decorationLabel: 'Precision Multi-Part NCR Lithograph Printing',
    availableColors: [
      { id: 'standard_blue_ink', name: 'Contractor Blueprint Blue', hex: '#1e40af', darkText: false },
      { id: 'carbon_black_ink', name: 'Classic Carbon Black', hex: '#0f172a', darkText: false },
      { id: 'brand_accent_ink', name: 'Full Color Brand Header', hex: '#2563eb', darkText: false },
    ],
    supportedViews: ['front', 'angle', 'detail', 'duo'],
    pricingTiers: [
      { quantity: 5, unitPrice: 12.0, totalPrice: 60.0, turnaroundDays: 4 },
      { quantity: 10, unitPrice: 9.5, totalPrice: 95.0, savingsPercent: 20, turnaroundDays: 4 },
      { quantity: 25, unitPrice: 6.8, totalPrice: 170.0, savingsPercent: 43, isPopular: true, turnaroundDays: 3 },
      { quantity: 50, unitPrice: 4.9, totalPrice: 245.0, savingsPercent: 59, turnaroundDays: 3 },
      { quantity: 100, unitPrice: 3.75, totalPrice: 375.0, savingsPercent: 68, turnaroundDays: 3 },
    ],
    specs: {
      dimensions: '8.5" × 11" Letter or 5.5" × 8.5" Pocket Wire-O',
      material: '20 lb Superior Carbonless NCR Paper + 50pt Stiff Chipboard Backing',
      finish: 'Edge-glued padded top with wrap-around cover insert',
      printArea: 'Header branding + customized line-item estimate grid',
    },
    options: {
      finishes: ['2-Part NCR Carbonless Forms (8.5"x11")', 'Wire-O Spiral Pocket Field Book (5.5"x8.5")', 'Padded Estimating Grid Scratchpad'],
    },
  },

  // 6. Pens & Markers
  {
    id: 'pens',
    name: 'Executive Soft-Touch Metal Gel Pens & Jobsite Markers',
    tagline: 'Heavyweight laser-engraved aluminum pens that customers never throw away',
    category: 'gear',
    description:
      'Give every homeowner a pen they will keep on their refrigerator counter for years. Machined from solid aluminum with a velvety soft-touch matte barrel, chrome accents, responsive stylus tip, and ultra-smooth quick-drying black gel ink.',
    bulletPoints: [
      'Laser-engraved silver reflection logo, business name, and phone number',
      'Substantial metal weight with rubberized soft-touch comfort barrel',
      'Smooth Japanese archival black gel ink with tungsten carbide ball',
      'Integrated soft silicone touch capacitive stylus for phone & tablet signatures',
      'Includes options for dual-tip permanent markers and flat carpenter pencils',
    ],
    basePrice: 0.5,
    minQuantity: 25,
    turnaroundEstimate: '3–4 business days',
    decorationMethod: 'laser_engraved',
    decorationLabel: 'Precision Optical Fiber Laser Engraving',
    availableColors: [
      { id: 'matte_black', name: 'Matte Stealth Black', hex: '#18181b', darkText: false },
      { id: 'royal_blue', name: 'Deep Royal Cobalt', hex: '#1d4ed8', darkText: false },
      { id: 'gunmetal_silver', name: 'Gunmetal Titanium', hex: '#475569', darkText: false },
      { id: 'burgundy_red', name: 'Crimson Red', hex: '#991b1b', darkText: false },
      { id: 'forest_green', name: 'Forest Green', hex: '#166534', darkText: false },
    ],
    supportedViews: ['front', 'angle', 'detail'],
    pricingTiers: [
      { quantity: 25, unitPrice: 2.2, totalPrice: 55.0, turnaroundDays: 4 },
      { quantity: 50, unitPrice: 1.65, totalPrice: 82.5, savingsPercent: 25, turnaroundDays: 3 },
      { quantity: 100, unitPrice: 1.25, totalPrice: 125.0, savingsPercent: 43, isPopular: true, turnaroundDays: 3 },
      { quantity: 250, unitPrice: 0.95, totalPrice: 237.5, savingsPercent: 56, turnaroundDays: 3 },
      { quantity: 500, unitPrice: 0.78, totalPrice: 390.0, savingsPercent: 64, turnaroundDays: 2 },
    ],
    specs: {
      dimensions: '5.6" Long × 0.4" Diameter (Weight: 19 grams)',
      material: 'Anodized Aircraft-Grade Aluminum with Soft-Touch Tactile Coating',
      finish: 'Mirror Laser-Etched Silver Imprint',
      printArea: '2.0" × 0.28" Barrel Engraving Zone',
    },
    options: {
      finishes: ['Soft-Touch Metal Stylus Gel Pen', 'Jobsite Dual-Tip Permanent Marker', 'Hex Carpenter Pencils (Raw Cedar)'],
    },
  },

  // 7. Phone Cases
  {
    id: 'phone_cases',
    name: 'Rugged Impact-Resistant Contractor Phone Case',
    tagline: '12-foot military drop-tested armored case emblazoned with your brand crest',
    category: 'gear',
    description:
      'Your phone is your cash register and dispatcher on the jobsite. Protect it from concrete drops, toolbox impacts, and rain. Dual-layer polycarbonate shell with shock-absorbing TPU liner, raised camera bezel, and non-slip tire-tread grip.',
    bulletPoints: [
      'Dual-layer armor: Impact-resistant polycarbonate outer + shock-absorbing inner TPU',
      'Edge-to-edge sublimation print that will never peel, fade, or scratch off',
      'Raised 1.8mm protective bezels for camera lens array and front glass',
      'Available for all modern iPhone 16/15/14/13 and Samsung Galaxy S25/S24/S23 models',
      'Wireless Qi charging and MagSafe compatible',
    ],
    basePrice: 12.0,
    minQuantity: 1,
    turnaroundEstimate: '2–3 business days',
    decorationMethod: 'uv_direct',
    decorationLabel: 'Sub-Surface UV 3D Polymer Sublimation',
    availableColors: [
      { id: 'matte_stealth', name: 'Tactical Matte Black', hex: '#0f172a', darkText: false },
      { id: 'carbon_fiber', name: 'Carbon Fiber Weave Texture', hex: '#1e293b', darkText: false },
      { id: 'hi_vis_accent', name: 'Hi-Vis Safety Grip Border', hex: '#eab308', darkText: true },
      { id: 'royal_blue', name: 'Cobalt Blue Armored Shell', hex: '#2563eb', darkText: false },
    ],
    supportedViews: ['front', 'angle', 'detail'],
    pricingTiers: [
      { quantity: 1, unitPrice: 32.0, totalPrice: 32.0, turnaroundDays: 3 },
      { quantity: 2, unitPrice: 27.5, totalPrice: 55.0, savingsPercent: 14, isPopular: true, turnaroundDays: 3 },
      { quantity: 5, unitPrice: 22.0, totalPrice: 110.0, savingsPercent: 31, turnaroundDays: 2 },
      { quantity: 10, unitPrice: 18.0, totalPrice: 180.0, savingsPercent: 43, turnaroundDays: 2 },
    ],
    specs: {
      dimensions: 'Custom molded to exact smartphone model specifications',
      material: 'Military-Grade Polycarbonate Shell + Shock-Resistant Thermoplastic Polyurethane',
      finish: 'Anti-scratch matte coating with tactile grooved sides',
      printArea: 'Full rear protective backplate',
    },
    options: {
      deviceModels: [
        'iPhone 16 Pro Max',
        'iPhone 16 Pro',
        'iPhone 16',
        'iPhone 15 Pro Max',
        'iPhone 15 Pro',
        'iPhone 15',
        'Samsung Galaxy S25 Ultra',
        'Samsung Galaxy S24 Ultra',
        'Samsung Galaxy S24',
      ],
    },
  },

  // 8. Corrugated Yard Signs
  {
    id: 'yard_signs',
    name: 'Corrugated Weatherproof Jobsite Yard Signs',
    tagline: '18" × 24" neighborhood lead magnet with heavy-duty galvanized H-stakes',
    category: 'signage',
    description:
      'The highest ROI marketing channel for contractors. Every neighbor on the street will see your brand while your crew works. Printed on 4mm fluted waterproof coroplast with UV-cured fade-resistant inks that survive heavy rain and intense sun.',
    bulletPoints: [
      'Heavy-duty 4mm fluted corrugated plastic (100% waterproof & wind-resistant)',
      'Double-sided full color with giant visible phone number and website',
      'Includes 9-gauge galvanized steel 10" × 30" step stakes for easy lawn insertion',
      'Bold contrasting layout calibrated for readability from passing cars at 35 MPH',
      'Reusable from jobsite to jobsite across an entire season',
    ],
    basePrice: 4.2,
    minQuantity: 5,
    turnaroundEstimate: '2–4 business days',
    decorationMethod: 'uv_direct',
    decorationLabel: 'High-Speed Flatbed UV Outdoor Inkjet',
    availableColors: [
      { id: 'bright_white', name: 'Optic White Coroplast', hex: '#ffffff', darkText: true },
      { id: 'sun_yellow', name: 'Safety Caution Yellow', hex: '#fde047', darkText: true },
      { id: 'midnight_navy', name: 'Midnight Blue Base', hex: '#0f172a', darkText: false },
      { id: 'charcoal', name: 'Charcoal Blackout', hex: '#18181b', darkText: false },
    ],
    supportedViews: ['front', 'back', 'angle', 'detail', 'duo'],
    pricingTiers: [
      { quantity: 5, unitPrice: 19.0, totalPrice: 95.0, turnaroundDays: 4 },
      { quantity: 10, unitPrice: 14.5, totalPrice: 145.0, savingsPercent: 23, turnaroundDays: 3 },
      { quantity: 25, unitPrice: 9.8, totalPrice: 245.0, savingsPercent: 48, isPopular: true, turnaroundDays: 3 },
      { quantity: 50, unitPrice: 7.5, totalPrice: 375.0, savingsPercent: 60, turnaroundDays: 2 },
      { quantity: 100, unitPrice: 5.95, totalPrice: 595.0, savingsPercent: 68, turnaroundDays: 2 },
    ],
    specs: {
      dimensions: '24.0" Wide × 18.0" High (Flutes run vertical)',
      material: '4mm Fluted Corrugated Polypropylene Plastic',
      finish: 'UV-Inhibited Matte Finish (Weather & scratch proof)',
      printArea: 'Double-Sided 23.5" × 17.5" Live Area',
    },
    options: {
      finishes: ['Double-Sided 18"x24" with Heavy H-Stakes', 'Single-Sided with Stakes', 'Signs Only (Replacement Paneling)'],
    },
  },

  // 9. Insulated Travel Tumblers
  {
    id: 'tumblers',
    name: '20oz Stainless Steel Vacuum-Insulated Tumbler',
    tagline: 'Double-wall stainless steel travel mug that keeps coffee piping hot for 8 hours',
    category: 'gear',
    description:
      'The ultimate premium client gift or crew essential. Crafted from food-grade 18/8 kitchen stainless steel with copper lining and vacuum insulation. Laser-engraved with your brand emblem for a clean, permanent metallic finish that never fades in the dishwasher.',
    bulletPoints: [
      'Permanent 360-degree laser engraving down to shiny stainless steel core',
      'Keeps coffee piping hot for 8 hours or ice water freezing cold for 24 hours',
      'No-sweat condensation-free exterior powder coat finish',
      'Shatterproof spill-resistant splash lid with straw port',
      'Fits perfectly into standard vehicle and work truck cup holders',
    ],
    basePrice: 8.5,
    minQuantity: 4,
    turnaroundEstimate: '3–5 business days',
    decorationMethod: 'laser_engraved',
    decorationLabel: 'Rotary Fiber Laser Etching',
    availableColors: [
      { id: 'matte_black', name: 'Matte Textured Black', hex: '#18181b', darkText: false },
      { id: 'navy_blue', name: 'Cobalt Powder Blue', hex: '#1e3a8a', darkText: false },
      { id: 'army_olive', name: 'Military Olive Green', hex: '#365314', darkText: false },
      { id: 'clean_white', name: 'Gloss Pearl White', hex: '#f8fafc', darkText: true },
      { id: 'gunmetal', name: 'Brushed Raw Steel', hex: '#94a3b8', darkText: true },
    ],
    supportedViews: ['front', 'angle', 'detail'],
    pricingTiers: [
      { quantity: 4, unitPrice: 24.0, totalPrice: 96.0, turnaroundDays: 5 },
      { quantity: 8, unitPrice: 19.5, totalPrice: 156.0, savingsPercent: 18, turnaroundDays: 4 },
      { quantity: 16, unitPrice: 16.0, totalPrice: 256.0, savingsPercent: 33, isPopular: true, turnaroundDays: 4 },
      { quantity: 32, unitPrice: 13.25, totalPrice: 424.0, savingsPercent: 44, turnaroundDays: 3 },
      { quantity: 64, unitPrice: 11.5, totalPrice: 736.0, savingsPercent: 52, turnaroundDays: 3 },
    ],
    specs: {
      dimensions: '6.8" Height × 3.5" Rim Diameter (Fits standard vehicle cup holders)',
      material: '18/8 Food-Grade Stainless Steel with Vacuum Insulation',
      finish: 'Durable Matte Powder Coat with Etched Stainless Exposure',
      printArea: '3.0" × 3.5" Rotary Center Logo Placement',
    },
    options: {
      finishes: ['20oz Vacuum Insulated Tumbler', '30oz Extra-Capacity Travel Mug'],
    },
  },

  // 10. Vehicle Magnets & Contour Stickers
  {
    id: 'decals',
    name: 'Heavy-Duty 12" × 24" Vehicle Door Magnets & Tool Stickers',
    tagline: 'Transform any personal truck or trailer into a commercial service fleet',
    category: 'signage',
    description:
      'Instant commercial credibility without expensive paint wraps. Heavyweight 30-mil vehicle-grade magnetic sheeting engineered for 80+ MPH highway speeds. Plus thick 6-mil vinyl die-cut stickers for toolboxes, hardhats, and customer water heaters.',
    bulletPoints: [
      'Thick 30-mil magnetic sheeting rated for 85+ MPH highway wind and rain',
      'Rounded corners to eliminate edge-lift and highway blow-off',
      'High-gloss UV protective laminate that shields against salt, dirt, and sun fade',
      'Pairs perfectly with die-cut weatherproof vinyl stickers for client equipment',
      'Removable and transferable between crew vehicles in seconds',
    ],
    basePrice: 12.0,
    minQuantity: 2,
    turnaroundEstimate: '2–4 business days',
    decorationMethod: 'uv_direct',
    decorationLabel: 'Laminated Outdoor UV Direct Print',
    availableColors: [
      { id: 'bright_white', name: 'Optic Gloss White', hex: '#ffffff', darkText: true },
      { id: 'charcoal_black', name: 'Deep Gloss Black', hex: '#0f172a', darkText: false },
      { id: 'fleet_navy', name: 'Fleet Royal Navy', hex: '#1e3a8a', darkText: false },
      { id: 'safety_yellow', name: 'Safety Reflective Yellow', hex: '#facc15', darkText: true },
    ],
    supportedViews: ['front', 'angle', 'detail', 'duo'],
    pricingTiers: [
      { quantity: 2, unitPrice: 34.0, totalPrice: 68.0, turnaroundDays: 4 },
      { quantity: 4, unitPrice: 28.0, totalPrice: 112.0, savingsPercent: 17, isPopular: true, turnaroundDays: 3 },
      { quantity: 8, unitPrice: 22.5, totalPrice: 180.0, savingsPercent: 33, turnaroundDays: 3 },
      { quantity: 16, unitPrice: 18.0, totalPrice: 288.0, savingsPercent: 47, turnaroundDays: 2 },
    ],
    specs: {
      dimensions: '24.0" Wide × 12.0" High (Pairs of 2 for driver & passenger doors)',
      material: '30-mil Heavy Duty Commercial Magnetic Sheeting',
      finish: 'High-Gloss Weatherproof UV Cast Vinyl Overlaminate',
      printArea: 'Edge-to-edge full color magnetic surface',
    },
    options: {
      finishes: ['Pair of 12"x24" Truck Door Magnets', 'Pack of 50 Die-Cut Tool Vinyl Stickers', 'Combo: 2 Magnets + 50 Equipment Stickers'],
    },
  },
];

/**
 * Active Storefront Catalog Products
 *
 * Currently focused exclusively on high-conversion stationery essentials
 * for contractor quotes and field paperwork: Business Cards & Notepads.
 */
export const MERCHANDISE_PRODUCTS: MerchandiseProduct[] = ALL_MERCHANDISE_PRODUCTS.filter(
  (p) => p.id === 'biz_cards' || p.id === 'notepads'
);

export function getProductById(id: string, allowInactive = false): MerchandiseProduct | undefined {
  const active = MERCHANDISE_PRODUCTS.find((p) => p.id === id);
  if (active || !allowInactive) return active;
  return ALL_MERCHANDISE_PRODUCTS.find((p) => p.id === id);
}

export function getProductsByCategory(category: MerchandiseCategoryId): MerchandiseProduct[] {
  return MERCHANDISE_PRODUCTS.filter((p) => p.category === category);
}
