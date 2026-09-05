'use client';

import { useState } from 'react';
import type { MerchandiseProduct } from '@/lib/merchandise/types';

interface Props {
  product: MerchandiseProduct;
  businessName: string;
  activeColorName: string;
  onDownloadProof: () => void;
}

interface ProductDeepSpecs {
  materialAnatomy: {
    label: string;
    value: string;
    subtext: string;
  }[];
  imprintPhysics: {
    label: string;
    value: string;
    subtext: string;
  }[];
  fieldPerformance: {
    label: string;
    value: string;
    subtext: string;
  }[];
  manufacturingLogistics: {
    label: string;
    value: string;
    subtext: string;
  }[];
  commercialFeatures: string[];
  certifications: string[];
}

export const PRODUCT_DEEP_SPECS: Record<string, ProductDeepSpecs> = {
  biz_cards: {
    materialAnatomy: [
      { label: 'Paper Stock Grade', value: '16pt / 350 GSM Cover', subtext: 'Ultra-dense multi-ply solid bleached sulfate (SBS) cardstock' },
      { label: 'Surface Lamination', value: 'Soft-Touch Velvet Matte', subtext: 'Scuff-resistant polymer barrier with tactile peach-skin handfeel' },
      { label: 'Spot Highlight', value: 'Raised Clear Spot-UV', subtext: '50-micron high-gloss relief (95+ GU specular reflection)' },
      { label: 'Edge Construction', value: 'Precision Hydraulic Die-Cut', subtext: 'Standard 3.5" × 2.0" with zero edge fraying or corner burrs' },
    ],
    imprintPhysics: [
      { label: 'Print Engine', value: 'Heidelberg 4-Color Offset Litho', subtext: 'Sub-micron dot placement at 2400 × 2400 DPI true resolution' },
      { label: 'Screening Method', value: 'FM Stochastic 10-Micron', subtext: 'Crisp micro-text legible down to 4pt font without moiré patterns' },
      { label: 'Ink Formulation', value: 'Soy-Based Lightfast CMYK', subtext: '99% UV resistance against sun fading on client dashboards' },
      { label: 'Dynamic Feature', value: 'High-Contrast Vector QR', subtext: 'Instant camera scan directs customers to your instant quote page' },
    ],
    fieldPerformance: [
      { label: 'Pocket Rigidity', value: 'Deflection Index: 9.2/10', subtext: 'Will not soften, crease, or curl in wallets or jeans pockets' },
      { label: 'Moisture Barrier', value: 'Water-Resistant Lamination', subtext: 'Shields against wet thumbs, rain droplets, and coffee spills' },
      { label: 'Handshake Close Rate', value: '+38% Client Retention', subtext: 'Contractors report significantly higher callback rates vs cheap 12pt cards' },
      { label: 'Card Lifespan', value: '5+ Years in Glovebox', subtext: 'Maintains crisp edges and brilliant contrast indefinitely' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Charlotte, NC & Dallas, TX', subtext: 'Direct domestic USA fulfillment centers' },
      { label: 'QC Tolerance', value: '±0.015" Registration', subtext: 'Strict laser optical alignment inspection on every print run' },
      { label: 'Turnaround Window', value: '2–3 Business Days', subtext: 'Expedited rush production available at checkout' },
      { label: 'Guarantee Standard', value: '100% Exact Match Reprint', subtext: 'Free reprint if cut or color deviates from approved digital proof' },
    ],
    commercialFeatures: [
      'Heavyweight 16pt cardstock prevents bent corners when pulled from truck consoles',
      'Dual-sided full color with custom booking QR code and 5-star review proof badge',
      'Velvet soft-touch matte lamination creates an immediate luxury tactile impression',
      'Spot-UV high gloss adds depth and catches ambient showroom and sunlight reflections',
    ],
    certifications: ['FSC® Certified Sustainable Forestry', 'SFI Forest Management Standard', 'ISO 9001:2015 Quality Manufacturing'],
  },

  polos: {
    materialAnatomy: [
      { label: 'Fabric Composition', value: '100% Micro-Pique Polyester', subtext: '5.2 oz/yd² (176 GSM) commercial-grade technical fabric' },
      { label: 'Weave Structure', value: 'Breathable Honeycomb Pique', subtext: 'Pulls moisture away from skin via capillary action' },
      { label: 'Collar & Placket', value: 'Flat-Knit Anti-Curl Rib', subtext: '3 dyed-to-match pearlized buttons with reinforced placket' },
      { label: 'Seam Construction', value: 'Double-Needle Topstitched', subtext: 'Reinforced shoulder-to-shoulder taped seams for zero fraying' },
    ],
    imprintPhysics: [
      { label: 'Decoration Method', value: 'Precision Machine Embroidery', subtext: 'Tajima industrial multi-head automated embroidery systems' },
      { label: 'Thread Spec', value: 'Madeira Polyneon 40-Weight', subtext: '100% polyester filament with high luster and extreme tensile strength' },
      { label: 'Stitch Density', value: '10,000 to 14,500 Stitches', subtext: 'Dense multi-layer 3D fill with underlay stitching for crisp crest depth' },
      { label: 'Backing Material', value: '2.5 oz Soft Tearaway + Film', subtext: 'Gentle against skin, eliminates itchiness during long work shifts' },
    ],
    fieldPerformance: [
      { label: 'Sun Protection', value: 'UPF 50+ Certified', subtext: 'Blocks 98% of harmful UVA and UVB solar rays on open roofs' },
      { label: 'Stain Resistance', value: 'PosiCharge™ Soil Shield', subtext: 'Repels grease, motor oil, hydraulic fluids, and HVAC dust' },
      { label: 'Industrial Wash Life', value: '100+ Commercial Cycles', subtext: 'Colorfast dye will not bleed or fade under heavy water temperatures' },
      { label: 'Snag & Tear Test', value: 'Level 4.5 ASTM D3939', subtext: 'Resists snagging on metal conduit, joists, and rough crawlspace surfaces' },
    ],
    manufacturingLogistics: [
      { label: 'Digitizing Engineering', value: 'Free on 6+ Units ($6.50 waived)', subtext: 'Manual stitch-path optimization by master digitizers' },
      { label: 'Production Hub', value: 'Charlotte, NC & Tijuana MX', subtext: 'Commercial apparel finishing & steaming facilities' },
      { label: 'Turnaround Window', value: '4–6 Business Days', subtext: 'Precision hooping, trimming, and steam-press packaging' },
      { label: 'Guarantee Standard', value: '100% Zero-Pucker Guarantee', subtext: 'Flawless flat embroidery with zero puckering or loose thread loops' },
    ],
    commercialFeatures: [
      'Engineered specifically for plumbing, HVAC, electrical, and roofing technicians',
      'Antimicrobial silver-ion treatment stops body odor even after 12-hour shifts',
      'Permanent collar stay inserts prevent unsightly "bacon collar" curling',
      'Optional right-sleeve American Flag or state contractor license # embroidery',
    ],
    certifications: ['OEKO-TEX® Standard 100 Non-Toxic', 'UPF 50+ Sun Safety Certified', 'WRAP Certified Responsible Apparel'],
  },

  t_shirts: {
    materialAnatomy: [
      { label: 'Cotton Quality', value: '100% Combed Ring-Spun', subtext: '6.5 oz/yd² (220 GSM) ultra-heavyweight tradesman jersey' },
      { label: 'Yarn Count', value: '24 Singles Heavy Thread', subtext: 'Denser, smoother printing surface than budget promotional tees' },
      { label: 'Collar Specification', value: '1" Heavy Rib-Knit Collar', subtext: 'Lycra-reinforced collar band that will not sag or stretch out' },
      { label: 'Hemming & Fit', value: 'Double-Needle Stitched Hem', subtext: 'Boxy tradesman cut provides full torso coverage while bending' },
    ],
    imprintPhysics: [
      { label: 'Print Chemistry', value: 'Plastisol + Discharge Hybrid', subtext: 'Ultra-bright opacity on dark shirts with soft breathable handfeel' },
      { label: 'Curing Standard', value: 'Gas Conveyor Cured @ 320°F', subtext: 'Full cross-polymerization prevents cracking and wash-out' },
      { label: 'Imprint Layout', value: 'Dual Zone (Front + Full Back)', subtext: 'Left chest insignia + giant 12" × 15" tradesman billboard layout' },
      { label: 'Print Resolution', value: 'Direct-to-Film / Screen 300 DPI', subtext: 'Sharp outlines on complex logos, wrench tools, and license badges' },
    ],
    fieldPerformance: [
      { label: 'Shrinkage Index', value: '< 3.0% Preshrunk Cotton', subtext: 'Pre-treated fabric retains exact size across cold and warm washes' },
      { label: 'Breathability', value: 'High Air Permeability', subtext: 'Natural combed cotton fibers allow skin perspiration to evaporate' },
      { label: 'Jobsite Tear Rating', value: '95 lbs Tensile Burst', subtext: 'Survives abrasive drywall, insulation snagging, and rough tool belts' },
      { label: 'Distance Visibility', value: 'Legible from 45+ Feet', subtext: 'Back phone number and business name readable from street traffic' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Charlotte, NC & Dallas, TX', subtext: 'High-speed automated direct-to-garment & screen printing' },
      { label: 'Color Matching', value: 'Pantone® PMS Color Matched', subtext: 'Inks precisely calibrated to your contractor brand identity' },
      { label: 'Turnaround Window', value: '3–5 Business Days', subtext: 'Folded, poly-bagged, and ready for immediate crew distribution' },
      { label: 'Guarantee Standard', value: 'No-Crack Print Guarantee', subtext: 'Full reprint guarantee if print cracks or peels within 60 days' },
    ],
    commercialFeatures: [
      'Authentic heavyweight 6.5oz fabric gives technicians an authoritative, rugged presence',
      'Commanding full-back layout acts as a mobile neighborhood billboard wherever your crew walks',
      'Shoulder-to-shoulder neck taping covers raw seams for comfort under safety harnesses',
      'Available in full size range from Small through 5XL to fit every crew member',
    ],
    certifications: ['Fair Labor Association Compliant', 'Better Cotton Initiative Member', 'Standard 100 by OEKO-TEX®'],
  },

  hats: {
    materialAnatomy: [
      { label: 'Crown Chassis', value: 'Authentic Richardson 112', subtext: '60% Cotton / 40% Polyester structured 6-panel trucker chassis' },
      { label: 'Mesh Backing', value: '100% Breathable Nylon Mesh', subtext: 'Open hexagonal weave for maximum ventilation in direct heat' },
      { label: 'Visor Engineering', value: 'Pre-Curved Stiffened Bill', subtext: '8 rows of contrast lock-stitching with dark underbill to stop glare' },
      { label: 'Leather Patch Stock', value: '5oz Vegetable-Tanned Saddle', subtext: '100% full-grain cowhide with rich natural grain variations' },
    ],
    imprintPhysics: [
      { label: 'Engraving Technology', value: 'CO2 / Fiber Laser Ablation', subtext: 'Precision beam vaporizes top grain to produce deep dark patina burn' },
      { label: 'Patch Attachment', value: 'Perimeter Saddle Stitching', subtext: 'Bonded nylon thread stitched directly through crown buckram + adhesive' },
      { label: 'Embossing Depth', value: '0.8mm Deep 3D Relief', subtext: 'Permanent tactile deboss that will never peel or rub away' },
      { label: 'Alternate Option', value: '3D Puff Foam Embroidery', subtext: '2.5mm high-density EVA foam core for bold raised lettering' },
    ],
    fieldPerformance: [
      { label: 'Shape Retention', value: 'Fused Pro-Mesh Buckram', subtext: 'Crown maintains crisp forward profile even after soaking with sweat' },
      { label: 'Headwear Fit', value: 'Adjustable 7-Hole Snapback', subtext: 'Fits hat sizes 7 to 7-3/4 comfortably on almost all crew members' },
      { label: 'Sweatband Comfort', value: 'Cotton-Poly Moisture Band', subtext: 'Absorbs brow perspiration before it drips into safety glasses' },
      { label: 'Sun & Salt Resistance', value: 'UV Stabilized Mesh', subtext: 'Nylon mesh resists UV brittleness and will not crack in the sun' },
    ],
    manufacturingLogistics: [
      { label: 'Patch Crafting', value: 'Hand-Finished & Burnished', subtext: 'Leather edges beveled and coated with edge burnish for durability' },
      { label: 'Production Hub', value: 'Charlotte, NC & Dallas, TX', subtext: 'Curved hat hooping and pneumatic press attachment' },
      { label: 'Turnaround Window', value: '4–6 Business Days', subtext: 'Shipped in rigid crush-proof crown protector boxes' },
      { label: 'Guarantee Standard', value: 'Lifetime Patch Bond', subtext: 'If patch stitching ever separates, we replace the hat free of charge' },
    ],
    commercialFeatures: [
      'The undisputed #1 favorite hat among HVAC, electrical, and general contractors',
      'Full-grain saddle leather develops an authentic vintage patina with daily jobsite wear',
      'Dark underbill prevents sun glare bouncing into eyes while reading blueprints or tablets',
      'Heavy-duty snapback clasp stands up to constant adjustment and hardhat wear',
    ],
    certifications: ['Authentic Richardson Sports Licensed Blanks', 'Genuine Full-Grain Leather Cert', 'ISO 9001 Facility Audited'],
  },

  notepads: {
    materialAnatomy: [
      { label: 'Paper Stock', value: '20 lb Superior NCR Carbonless', subtext: 'Appleton micro-capsule chemistry for clean instant carbon transfer' },
      { label: 'Color Sequencing', value: 'Part 1: White / Part 2: Yellow', subtext: 'White customer original + bright canary yellow office archive copy' },
      { label: 'Backing Board', value: '50pt Extra-Stiff Chipboard', subtext: 'Rigid platform allows writing while standing, kneeling, or in truck cabs' },
      { label: 'Binding Method', value: 'Padded Blue Leatherette Top', subtext: 'Industrial bookbinding glue with wrap-around manifold stop sheet' },
    ],
    imprintPhysics: [
      { label: 'Form Press', value: 'High-Speed Web Litho Offset', subtext: 'Crisp ruled lines, service checklists, and contractor contract terms' },
      { label: 'Serial Numbering', value: 'Impact Stamped Red Ink', subtext: 'Consecutively numbered estimates (#EST-89421) for audit compliance' },
      { label: 'Perforation Cut', value: 'Micro-Perf 30 TPI Line', subtext: 'Clean, effortless sheet separation with zero ragged paper tears' },
      { label: 'Pressure Sensitivity', value: 'Micro-Encapsulated Dye', subtext: 'Produces crisp black duplicate writing even with light ballpoint pressure' },
    ],
    fieldPerformance: [
      { label: 'Legal Binding', value: 'Uniform Commercial Code', subtext: 'Customer signature box forms legally enforceable on-site authorization' },
      { label: 'Manifold Shield', value: 'Wrap-Around Writing Card', subtext: 'Integrated heavy card stops pen pressure from marking subsequent forms' },
      { label: 'Sheet Count', value: '50 Two-Part Sets Per Pad', subtext: '100 total leaves per pad (50 white invoices + 50 yellow copies)' },
      { label: 'Dispute Prevention', value: 'Instant Signed Customer Copy', subtext: 'Eliminates billing disputes by handing client a duplicate immediately' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Dallas, TX Printing Center', subtext: 'Specialized business form and NCR collating facility' },
      { label: 'Customization', value: 'Custom Logo + License #', subtext: 'Full trade contractor header imprint with license details' },
      { label: 'Turnaround Window', value: '3–4 Business Days', subtext: 'Shrink-wrapped in protective 5-pad bundles' },
      { label: 'Guarantee Standard', value: '100% Transfer Crispness', subtext: 'Clear legibility guaranteed down to the bottom yellow copy' },
    ],
    commercialFeatures: [
      'Pre-numbered invoice sequence protects against missing job tickets and unbilled work',
      'Heavy 50pt chipboard backing eliminates the need for carrying bulky metal clipboards',
      'Detailed itemized grid for labor hours, materials used, permit fees, and tax',
      'Prominent customer deposit acceptance and signature authorization clause',
    ],
    certifications: ['Appleton NCR Paper Technology', 'FSC Certified Recycled Content', 'UCC Legal Compliance Standard'],
  },

  pens: {
    materialAnatomy: [
      { label: 'Barrel Chassis', value: 'Aircraft Anodized Aluminum', subtext: 'Solid CNC-turned metal body weighing 19 grams for balanced handfeel' },
      { label: 'Tactile Coating', value: 'Velvet Soft-Touch Rubberized', subtext: 'Non-slip matte silicone lacquer finish that repels finger grease' },
      { label: 'Clip & Trim', value: 'Electroplated Mirror Chrome', subtext: 'High-tensile spring steel pocket clip that will not bend out of shape' },
      { label: 'Dual Functionality', value: 'Capacitive Silicone Stylus', subtext: 'High-sensitivity tip for signature capture on iPads and phones' },
    ],
    imprintPhysics: [
      { label: 'Engraving Technology', value: '1064nm Fiber Laser Etch', subtext: 'Direct metal ablation reveals permanent brilliant silver aluminum' },
      { label: 'Imprint Permanence', value: '100% Scratch & Wear Proof', subtext: 'Cannot be scratched, rubbed, or washed away by hand friction' },
      { label: 'Ink Formula', value: 'German Quick-Drying Gel', subtext: '0.7mm tungsten carbide precision ball with archival dark black pigment' },
      { label: 'Writing Distance', value: '1,200 Meters Continuous', subtext: 'Writes 3x longer than ordinary plastic promotional ballpoints' },
    ],
    fieldPerformance: [
      { label: 'Client Keep Rate', value: '94% Retention vs 18% Plastic', subtext: 'Homeowners keep heavy metal pens on their desk for months' },
      { label: 'Temperature Range', value: '-10°F to 130°F Reliable', subtext: 'Flows smoothly inside cold winter trucks or hot summer dashboards' },
      { label: 'Touchscreen Utility', value: 'Responsive Signature Grip', subtext: 'Allows clients to sign digital change orders without removing gloves' },
      { label: 'Drop Resistance', value: 'Shatterproof Metal Body', subtext: 'Survives being stepped on or dropped onto concrete garage floors' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Dallas, TX & Charlotte, NC', subtext: 'High-speed automated fiber laser engraving lines' },
      { label: 'Laser Calibration', value: 'Rotary Chuck Alignment', subtext: 'Precision laser centering along cylindrical barrel axis' },
      { label: 'Turnaround Window', value: '3–4 Business Days', subtext: 'Packaged in protective foam trays to prevent scratching in transit' },
      { label: 'Guarantee Standard', value: 'Smooth Ink Writing Guarantee', subtext: 'Every pen tested for smooth, skip-free ink flow upon unboxing' },
    ],
    commercialFeatures: [
      'High-perceived-value gift that homeowners cherish rather than discarding',
      'Dual stylus tip lets customers sign digital invoices and estimates on your tablet',
      'Laser-etched silver mirror lettering shines brightly against rich dark barrel finishes',
      'Spring-loaded steel clip secures tightly to polo plackets and clipboard margins',
    ],
    certifications: ['RoHS Compliant Metal Formulation', 'EN 71-3 Safe Writing Ink', 'ISO 12757-2 Document Archival Inks'],
  },

  phone_cases: {
    materialAnatomy: [
      { label: 'Outer Shell', value: 'Polycarbonate Hard Armor (PC)', subtext: 'High-density impact-resistant thermoplastic polymer shell' },
      { label: 'Inner Liner', value: 'Shock-Absorbing TPU Bumper', subtext: 'Thermoplastic polyurethane with interior air-cushion corner pockets' },
      { label: 'Camera Ring Bezel', value: '2.0mm Raised Protective Lip', subtext: 'Elevated perimeter keeps camera lenses off abrasive surfaces' },
      { label: 'Screen Bezel', value: '1.8mm Raised Front Rim', subtext: 'Protects glass screen from face-down drops on gravel or concrete' },
    ],
    imprintPhysics: [
      { label: 'Print Method', value: '3D Vacuum Sublimation', subtext: 'Sub-surface polymer infusion permanently embeds dyes into outer shell' },
      { label: 'Print Coverage', value: 'Full Wrap (Back & Sides)', subtext: 'Edge-to-edge uninterrupted color graphics with anti-scratch clearcoat' },
      { label: 'Resolution', value: 'True 1200 DPI Photorealistic', subtext: 'Vibrant rendering of your company logo, trade marks, and badges' },
      { label: 'UV Resistance', value: 'Automotive Clearcoat Glaze', subtext: 'Will not yellow, crack, or peel after exposure to direct summer sun' },
    ],
    fieldPerformance: [
      { label: 'Drop Rating', value: 'MIL-STD-810G 516.6 Certified', subtext: 'Tested for 26 consecutive 12-foot drops onto solid concrete' },
      { label: 'Grip Texture', value: 'Tire-Tread Grooved Edges', subtext: 'Provides secure one-handed grip even with wet or grease-covered gloves' },
      { label: 'Charging Compatibility', value: 'Wireless Qi & MagSafe Ready', subtext: 'Charges through case without removing device' },
      { label: 'Port Precision', value: 'Oversized Cable Cutouts', subtext: 'Accommodates bulky heavy-duty jobsite charging cables' },
    ],
    manufacturingLogistics: [
      { label: 'Model Customization', value: 'All Modern iPhone & Galaxy', subtext: 'Custom tooling for iPhone 16/15/14 and Galaxy S25/S24 series' },
      { label: 'Production Hub', value: 'Charlotte, NC & Dallas, TX', subtext: 'Precision thermal vacuum-forming manufacturing line' },
      { label: 'Turnaround Window', value: '2–3 Business Days', subtext: 'Individually boxed in protective retail blister packaging' },
      { label: 'Guarantee Standard', value: 'Lifetime Shell Anti-Crack', subtext: 'Free replacement if polycarbonate outer armor ever fractures' },
    ],
    commercialFeatures: [
      'Turns your everyday smartphone into an authoritative brand asset on client estimates',
      'Military-grade drop protection prevents catastrophic $1,200 phone replacement bills',
      'Sub-surface infused print will never scratch off even when shoved into toolboxes',
      'Tactile button covers maintain crisp clicking feel for volume and power controls',
    ],
    certifications: ['MIL-STD-810G Drop Certified', 'BPA-Free Recyclable Polycarbonate', 'RoHS Environmental Safe'],
  },

  yard_signs: {
    materialAnatomy: [
      { label: 'Panel Substrate', value: '4mm Fluted Coroplast', subtext: 'High-density extruded polypropylene with vertical structural flutes' },
      { label: 'Material Density', value: '1,000 GSM Heavyweight Plastic', subtext: 'Double the density of cheap consumer promotional signs' },
      { label: 'Included Hardware', value: '9-Gauge Galvanized H-Stakes', subtext: '10" × 30" welded zinc-coated steel wire step stakes included' },
      { label: 'Edge Treatment', value: 'Clean Guillotine Cut', subtext: 'Smooth burr-free edges that fit into vehicle trunks' },
    ],
    imprintPhysics: [
      { label: 'Print Technology', value: 'Flatbed UV-Curable Inkjet', subtext: 'High-output LED photopolymerization cures ink during print' },
      { label: 'Print Resolution', value: '1200 × 1200 True DPI', subtext: 'Razor-sharp phone numbers and logos visible from vehicles at 35 MPH' },
      { label: 'Sides Printed', value: 'Double-Sided 360° Visibility', subtext: 'Identical high-contrast layout on both sides for two-way street traffic' },
      { label: 'Color Saturation', value: 'High-Opacity Outdoor UV Inks', subtext: 'Maximum color vibrancy that cuts through cloudy or rainy weather' },
    ],
    fieldPerformance: [
      { label: 'Wind Resistance', value: 'Rated to 45+ MPH Gusts', subtext: 'Vertical fluting channels provide structural rigidity in high winds' },
      { label: 'Weather & Water', value: '100% Waterproof & Frost-Proof', subtext: 'Functions from -20°F up to 140°F without warping or delamination' },
      { label: 'Sun Fade Barrier', value: '2-Year Outdoor UV Inhibitors', subtext: 'Resists ultraviolet degradation, yellowing, and fading in full sun' },
      { label: 'Lawn Insertion', value: 'Step-Stake Easy Installation', subtext: 'Welded crossbar allows foot-pressure insertion into firm turf' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Dallas, TX & Charlotte, NC', subtext: 'Direct wide-format flatbed production facilities' },
      { label: 'Packaging Protection', value: 'Rigid Heavy-Wall Cartons', subtext: 'Prevents crushed flutes or bent corners during UPS delivery' },
      { label: 'Turnaround Window', value: '2–4 Business Days', subtext: 'Bulk fleet orders packaged with pre-counted stake bundles' },
      { label: 'Guarantee Standard', value: '100% Weatherproof Guarantee', subtext: 'Full replacement if signs delaminate or inks run in rain or snow' },
    ],
    commercialFeatures: [
      'The highest proven ROI lead generator for roofing, painting, HVAC, and landscaping',
      'Neighbors on the client street immediately see who is performing quality work in their area',
      'Oversized contrasting phone badge engineered for instant legibility by passing drivers',
      'Heavy-gauge galvanized steel stakes resist bending in hard clay or dry summer soil',
    ],
    certifications: ['100% Recyclable Polypropylene (#5 Plastic)', 'UV Outdoor Resistance ASTM G154', 'ISO 9001 Quality Assured'],
  },

  tumblers: {
    materialAnatomy: [
      { label: 'Steel Grade', value: '18/8 (304) Kitchen Stainless', subtext: 'Food-grade stainless steel interior and exterior that will never rust' },
      { label: 'Insulation Core', value: 'Double-Wall Vacuum + Copper', subtext: 'Thermal vacuum cavity with inner copper lining for zero heat loss' },
      { label: 'Lid Engineering', value: 'Eastman Tritan™ Clear Lid', subtext: 'Shatterproof crystal-clear lid with silicone sealing ring and slide lock' },
      { label: 'Exterior Coating', value: 'Tough Textured Powder Coat', subtext: 'Non-slip baked powder finish that prevents sweat and condensation' },
    ],
    imprintPhysics: [
      { label: 'Laser Technology', value: 'Rotary Fiber Laser Ablation', subtext: 'Precision 360° laser burns off powder coat to expose mirror stainless steel' },
      { label: 'Etch Permanence', value: '100% Permanent Raw Metal', subtext: 'No printed ink or stickers — will never fade, peel, or wash off' },
      { label: 'Dishwasher Safe', value: 'Top-Rack Dishwasher Tested', subtext: 'Powder coat and laser-etched stainless withstand high heat cycles' },
      { label: 'Placement Live Area', value: '3.0" × 3.5" Centered Crest', subtext: 'Prominent front positioning visible while drinking and holding' },
    ],
    fieldPerformance: [
      { label: 'Heat Retention', value: 'Hot Coffee for 8+ Hours', subtext: 'Maintains coffee above 140°F even in freezing morning winter trucks' },
      { label: 'Cold Retention', value: 'Ice Cold for 24+ Hours', subtext: 'Ice cubes remain solid after a full day in 95°F summer heat' },
      { label: 'Vehicle Fit', value: 'Standard Cup Holder Base', subtext: 'Engineered base diameter fits snugly into F-150, Silverado, and Ram cup holders' },
      { label: 'Sweat-Free Exterior', value: 'Zero Condensation Barrier', subtext: 'Exterior remains completely dry, protecting blueprints and truck consoles' },
    ],
    manufacturingLogistics: [
      { label: 'Production Hub', value: 'Dallas, TX & Charlotte, NC', subtext: 'Equipped with industrial 4-axis rotary laser engraving systems' },
      { label: 'Laser Calibration', value: 'Optically Centered Imprint', subtext: 'Laser focal distance tuned to 0.05mm for pristine edge clarity' },
      { label: 'Turnaround Window', value: '3–5 Business Days', subtext: 'Individually wrapped in soft foam sleeves inside protective boxes' },
      { label: 'Guarantee Standard', value: 'Lifetime Vacuum Seal Pledge', subtext: 'Replacement guaranteed if vacuum insulation ever loses thermal seal' },
    ],
    commercialFeatures: [
      'The ultimate high-impact client gift for high-ticket remodels and roofing jobs',
      'Keeps crew hydrated and focused through extreme heat and freezing winter conditions',
      'Permanent rotary laser-etched metal logo creates an unmistakable high-end executive feel',
      'Splash-proof sliding lid prevents spills while driving over rough jobsite terrain',
    ],
    certifications: ['FDA Food-Contact Safe Compliant', '100% BPA & Lead Free', 'Prop 65 California Certified'],
  },

  decals: {
    materialAnatomy: [
      { label: 'Magnetic Substrate', value: '30-mil Heavy Strontium Ferrite', subtext: 'Commercial-grade flexible magnetic sheeting with maximum pull force' },
      { label: 'Magnetic Holding Power', value: '70 lbs / sq. ft. Grip Force', subtext: 'Bonds securely to steel truck doors, tailgates, and utility beds' },
      { label: 'Protective Film', value: 'High-Gloss UV Cast Overlaminate', subtext: '2-mil crystal-clear protective shield against road salt and gravel' },
      { label: 'Corner Engineering', value: '1/2" Radiused Rounded Corners', subtext: 'Eliminates sharp 90° corners that can catch highway wind and lift' },
    ],
    imprintPhysics: [
      { label: 'Print Engine', value: 'Wide-Format UV Piezo Inkjet', subtext: 'Direct-to-vinyl printing with automotive-grade outdoor pigments' },
      { label: 'Color Gamut', value: 'Full Photorealistic CMYK', subtext: 'Renders full-color logos, badges, and phone numbers in high definition' },
      { label: 'Adhesive Lamination', value: 'Solvent Acrylic Cast Bond', subtext: 'Vinyl print permanently cold-welded to magnetic substrate' },
      { label: 'Resolution', value: '1440 × 1440 DPI Ultra-Fine', subtext: 'Clean typography legible from passing highway vehicles' },
    ],
    fieldPerformance: [
      { label: 'Speed Certification', value: 'Tested to 85+ MPH Speeds', subtext: 'Wind-tunnel and highway tested with zero flutter or edge displacement' },
      { label: 'Paint Safety', value: '100% Automotive Clearcoat Safe', subtext: 'Will not damage, scratch, or discolor factory automotive paint' },
      { label: 'Transfer Speed', value: '5-Second Transferability', subtext: 'Move from your personal truck to a subcontractor vehicle in seconds' },
      { label: 'Weather Endurance', value: 'Survives Rain, Snow, and Salt', subtext: 'Withstands road de-icers, mud, pressure washing, and intense heat' },
    ],
    manufacturingLogistics: [
      { label: 'Packaging Standard', value: 'Shipped Flat (Never Rolled)', subtext: 'Eliminates curling and ensures instant flat magnetic contact on vehicle' },
      { label: 'Production Hub', value: 'Charlotte, NC & Dallas, TX', subtext: 'Automated CNC drag-knife cutting table with optical registration' },
      { label: 'Turnaround Window', value: '2–4 Business Days', subtext: 'Sold in complete matched driver & passenger door pairs' },
      { label: 'Guarantee Standard', value: 'Highway Hold Guarantee', subtext: 'Full replacement if magnets ever lose grip force when properly installed' },
    ],
    commercialFeatures: [
      'Instant commercial credibility for personal trucks without expensive permanent wraps',
      'Easy removal for weekend personal use or HOA neighborhood parking restrictions',
      'Thick 30-mil construction will not flutter or fly off at high interstate speeds',
      'UV protective overlaminate prevents scratches from tree branches and gravel road debris',
    ],
    certifications: ['Highway Wind-Tunnel Certified 85+ MPH', 'ASTM Magnetic Pull Tested', 'RoHS Environmental Compliant'],
  },
};

export default function ProductTechnicalSpecsSheet({
  product,
  businessName,
  activeColorName,
  onDownloadProof,
}: Props) {
  const [activeTab, setActiveTab] = useState<'material' | 'imprint' | 'field' | 'logistics'>('material');

  const deepSpecs = PRODUCT_DEEP_SPECS[product.id] || PRODUCT_DEEP_SPECS.biz_cards;

  return (
    <div
      style={{
        marginTop: '1.5rem',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(11, 15, 23, 0.92)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Header bar with title and action buttons */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.68rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--gold-ink)',
                background: 'rgba(217, 119, 6, 0.15)',
                padding: '3px 8px',
                borderRadius: '999px',
                border: '1px solid rgba(217, 119, 6, 0.3)',
              }}
            >
              ★ Contractor Grade Specifications
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>•</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              Configured in: <strong style={{ color: '#ffffff' }}>{activeColorName}</strong>
            </span>
          </div>
          <h3
            style={{
              margin: '0.35rem 0 0 0',
              fontSize: '1.25rem',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            {product.name} — Technical Anatomy &amp; Craftsmanship Report
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onDownloadProof}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.95rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <span>📄</span>
            <span>Download Proof Spec</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '0 1rem',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('material')}
          style={{
            padding: '0.85rem 1.1rem',
            border: 'none',
            borderBottom: activeTab === 'material' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'material' ? '#ffffff' : 'var(--muted)',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s ease',
          }}
        >
          <span>🔬</span>
          <span>1. Material Anatomy &amp; Lab Specs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('imprint')}
          style={{
            padding: '0.85rem 1.1rem',
            border: 'none',
            borderBottom: activeTab === 'imprint' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'imprint' ? '#ffffff' : 'var(--muted)',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s ease',
          }}
        >
          <span>⚡</span>
          <span>2. Imprint Physics &amp; Precision</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('field')}
          style={{
            padding: '0.85rem 1.1rem',
            border: 'none',
            borderBottom: activeTab === 'field' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'field' ? '#ffffff' : 'var(--muted)',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s ease',
          }}
        >
          <span>🛡️</span>
          <span>3. Contractor Field Performance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logistics')}
          style={{
            padding: '0.85rem 1.1rem',
            border: 'none',
            borderBottom: activeTab === 'logistics' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'logistics' ? '#ffffff' : 'var(--muted)',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'color 0.2s ease',
          }}
        >
          <span>🏭</span>
          <span>4. Manufacturing Hub &amp; Guarantee</span>
        </button>
      </div>

      {/* Tab Body */}
      <div style={{ padding: '1.5rem' }}>
        {/* Tab 1: Material Anatomy */}
        {activeTab === 'material' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {deepSpecs.materialAnatomy.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    {item.label}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', margin: '0.35rem 0 0.25rem 0' }}>
                    {item.value}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                    {item.subtext}
                  </span>
                </div>
              ))}
            </div>

            {/* Commercial Features Callout */}
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '12px',
                padding: '1rem 1.25rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#60a5fa', fontWeight: 800 }}>
                Commercial Grade Benchmark Features:
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.6 }}>
                {deepSpecs.commercialFeatures.map((feat, i) => (
                  <li key={i}>{feat}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Imprint Physics */}
        {activeTab === 'imprint' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {deepSpecs.imprintPhysics.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    {item.label}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', margin: '0.35rem 0 0.25rem 0' }}>
                    {item.value}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                    {item.subtext}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '10px',
                padding: '0.85rem 1.25rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.3rem' }}>✓</span>
                <div>
                  <strong style={{ fontSize: '0.82rem', color: '#34d399', display: 'block' }}>
                    Master Vector Artwork Pre-Flight Verification
                  </strong>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    Automated Pantone color-matching and stitch path calculation ensures 0% distortion.
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 800 }}>
                CALIBRATED FOR {businessName.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: Field Performance */}
        {activeTab === 'field' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {deepSpecs.fieldPerformance.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    {item.label}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--gold-ink)', margin: '0.35rem 0 0.25rem 0' }}>
                    {item.value}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                    {item.subtext}
                  </span>
                </div>
              ))}
            </div>

            {/* Certifications Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, marginRight: '0.5rem' }}>
                Compliance &amp; Certifications:
              </span>
              {deepSpecs.certifications.map((cert, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#e2e8f0',
                  }}
                >
                  🛡️ {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Manufacturing & Logistics */}
        {activeTab === 'logistics' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {deepSpecs.manufacturingLogistics.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>
                    {item.label}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', margin: '0.35rem 0 0.25rem 0' }}>
                    {item.value}
                  </div>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4, display: 'block' }}>
                    {item.subtext}
                  </span>
                </div>
              ))}
            </div>

            {/* Zero-Risk Trade Contractor Guarantee */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.1) 0%, rgba(217, 119, 6, 0.02) 100%)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                borderRadius: '12px',
                padding: '1rem 1.25rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '1.8rem' }}>🏅</span>
              <div>
                <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '0.92rem', color: 'var(--gold-ink)', fontWeight: 900 }}>
                  The 100% Trade Contractor Satisfaction &amp; Reprint Pledge
                </h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Every run is manufactured under strict optical inspection. If the print, embroidery, or physical blank deviates from your approved digital proof, we issue an immediate priority reprint or 100% refund without hassle.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
