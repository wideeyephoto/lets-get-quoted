import type { ServiceUnit } from './services';
import type { MaterialDistributor, MaterialCategory } from './material-supply-ordering';

export type StarterCatalogItem = {
  name: string;
  description: string;
  unitPrice: number;
  unitCost: number;
  unit: ServiceUnit;
};

export type TradeStarterCatalog = {
  id: string;
  name: string;
  icon: string;
  description: string;
  items: StarterCatalogItem[];
};

// -----------------------------------------------------------------------------
// 1. Comprehensive 21 Trade Starter Catalogs
// -----------------------------------------------------------------------------

export const TRADE_STARTER_CATALOGS: Record<string, TradeStarterCatalog> = {
  plumbing: {
    id: 'plumbing',
    name: 'Plumbing & Gas',
    icon: '🚰',
    description: 'Water heaters, fixtures, drain clearing, and leak repairs.',
    items: [
      {
        name: '50-Gal Water Heater Installation',
        description: 'Standard gas/electric tank replacement, haul-away old unit, new supply lines + shutoff.',
        unitPrice: 1850,
        unitCost: 850,
        unit: 'each',
      },
      {
        name: 'Main Drain / Sewer Snaking',
        description: 'Camera inspection and mechanical snake clearing up to 100ft cleanout.',
        unitPrice: 350,
        unitCost: 80,
        unit: 'job',
      },
      {
        name: 'Garbage Disposal Replacement',
        description: 'Supply and install 1/2 HP continuous feed disposal with new drain connections.',
        unitPrice: 285,
        unitCost: 110,
        unit: 'each',
      },
      {
        name: 'Toilet Removal & Installation',
        description: 'Install new high-efficiency toilet, wax ring, braided supply line, and test seal.',
        unitPrice: 260,
        unitCost: 65,
        unit: 'each',
      },
      {
        name: 'Kitchen / Bath Faucet Installation',
        description: 'Remove old fixture, seat new faucet, connect hot/cold supplies, test aerator pressure.',
        unitPrice: 220,
        unitCost: 45,
        unit: 'each',
      },
      {
        name: 'Pressure Reducing Valve (PRV) Replacement',
        description: 'Replace faulty main water pressure regulator valve, calibrate to 55-65 PSI.',
        unitPrice: 420,
        unitCost: 140,
        unit: 'each',
      },
      {
        name: 'Whole-Home Pipe Leak Diagnostic & Repair',
        description: 'Acoustic/pressure diagnostic plus single-point copper or PEX pipe splice.',
        unitPrice: 380,
        unitCost: 90,
        unit: 'job',
      },
    ],
  },
  electrical: {
    id: 'electrical',
    name: 'Electrical & Power',
    icon: '⚡',
    description: 'Panel upgrades, EV chargers, lighting, and circuit additions.',
    items: [
      {
        name: '200A Main Service Panel Upgrade',
        description: 'Replace obsolete panel with 200-amp breaker box, whole-home grounding & utility hookup.',
        unitPrice: 2950,
        unitCost: 1100,
        unit: 'job',
      },
      {
        name: 'EV Level 2 Charger Installation (240V / 50A)',
        description: 'Dedicated 50A circuit from panel to garage wall, NEMA 14-50 or hardwired EV station.',
        unitPrice: 850,
        unitCost: 280,
        unit: 'each',
      },
      {
        name: 'Recessed LED Can Lighting (Pack of 6)',
        description: 'Supply and wire 6 ultra-thin wafer LED recessed lights with Lutron dimmer switch.',
        unitPrice: 720,
        unitCost: 210,
        unit: 'job',
      },
      {
        name: 'Dedicated 20A Circuit Installation',
        description: 'New 20-amp breaker and home-run Romex wiring for microwave, freezer, or workshop.',
        unitPrice: 375,
        unitCost: 95,
        unit: 'each',
      },
      {
        name: 'Ceiling Fan Installation (up to 12ft ceiling)',
        description: 'Assemble and hang customer-supplied fan with safe fan-rated junction box.',
        unitPrice: 240,
        unitCost: 40,
        unit: 'each',
      },
      {
        name: 'Whole-Home Surge Protector Installation',
        description: 'Install Type 2 surge protective device directly onto main electrical panel.',
        unitPrice: 395,
        unitCost: 130,
        unit: 'each',
      },
      {
        name: 'GFCI Outlet Safety Upgrades (Set of 3)',
        description: 'Replace standard outlets in kitchen/bath/garage with code-compliant GFCI protection.',
        unitPrice: 275,
        unitCost: 65,
        unit: 'job',
      },
    ],
  },
  hvac: {
    id: 'hvac',
    name: 'HVAC & Heating / Cooling',
    icon: '❄️',
    description: 'Seasonal tune-ups, diagnostic, repairs, and thermostats.',
    items: [
      {
        name: 'Comprehensive Seasonal AC / Heat Pump Tune-Up',
        description: '21-point safety inspection, coil wash, electrical draw test, and refrigerant check.',
        unitPrice: 149,
        unitCost: 35,
        unit: 'visit',
      },
      {
        name: 'HVAC Diagnostic & System Troubleshooting',
        description: 'On-site diagnostic inspection to identify electrical, airflow, or mechanical faults.',
        unitPrice: 99,
        unitCost: 25,
        unit: 'visit',
      },
      {
        name: 'Dual-Run Capacitor Replacement',
        description: 'Replace failing motor start/run capacitor with heavy-duty OEM part.',
        unitPrice: 235,
        unitCost: 40,
        unit: 'each',
      },
      {
        name: 'Smart Thermostat Supply & Installation',
        description: 'Supply & install Ecobee/Nest thermostat, configure C-wire adapter, sync mobile app.',
        unitPrice: 320,
        unitCost: 160,
        unit: 'each',
      },
      {
        name: 'Refrigerant Leak Test & R-410A Recharge (per lb)',
        description: 'Electronic leak sniff test plus top-up of virgin R-410A refrigerant.',
        unitPrice: 125,
        unitCost: 35,
        unit: 'each',
      },
      {
        name: 'Blower Motor / Draft Inducer Replacement',
        description: 'Replace failed direct-drive ECM blower motor and balance squirrel cage wheel.',
        unitPrice: 650,
        unitCost: 240,
        unit: 'each',
      },
    ],
  },
  landscaping: {
    id: 'landscaping',
    name: 'Landscaping & Grounds',
    icon: '🌲',
    description: 'Lawn care, property cleanups, mulch, and irrigation.',
    items: [
      {
        name: 'Weekly Lawn Mowing, Trimming & Edging',
        description: 'Cut turf at recommended height, line-trim perimeters, blow hard surfaces clean.',
        unitPrice: 55,
        unitCost: 18,
        unit: 'visit',
      },
      {
        name: 'Spring / Fall Property Cleanup',
        description: 'Rake bed debris, cut back perennials, dethatch lawn, and haul away yard waste.',
        unitPrice: 450,
        unitCost: 120,
        unit: 'job',
      },
      {
        name: 'Premium Dark Hardwood Mulch (Delivered & Spread)',
        description: 'Triple-shredded brown/black mulch, crisp trench edging around flower beds.',
        unitPrice: 95,
        unitCost: 40,
        unit: 'sqft',
      },
      {
        name: 'Core Aeration & Overseeding',
        description: 'Pull 2-3 inch soil cores across lawn, broadcast premium turf-type tall fescue seed.',
        unitPrice: 280,
        unitCost: 75,
        unit: 'job',
      },
      {
        name: 'Shrub & Ornamental Hedge Trimming',
        description: 'Hand prune and mechanical trim shrubs up to 10ft, rake and dispose clippings.',
        unitPrice: 195,
        unitCost: 45,
        unit: 'job',
      },
      {
        name: 'Sprinkler System Startup / Winterization Blowout',
        description: 'High-volume compressed air blowout of all zones and backflow preventer isolation.',
        unitPrice: 110,
        unitCost: 25,
        unit: 'visit',
      },
    ],
  },
  roofing: {
    id: 'roofing',
    name: 'Roofing & Gutters',
    icon: '🏠',
    description: 'Shingle repairs, gutter installs, flashing, and skylights.',
    items: [
      {
        name: 'Architectural Shingle Roof Replacement (per square)',
        description: 'Tear-off 1 layer, synthetic underlayment, ice & water shield, architectural shingles.',
        unitPrice: 475,
        unitCost: 220,
        unit: 'sqft',
      },
      {
        name: 'Emergency Roof Leak & Chimney Flashing Repair',
        description: 'Replace damaged shingles, step flashing, silicone seal, and inspect decking.',
        unitPrice: 425,
        unitCost: 95,
        unit: 'job',
      },
      {
        name: 'Seamless 6" Aluminum Gutters & Downspouts',
        description: 'Custom on-site extruded seamless gutters with hidden screw hangers every 24 inches.',
        unitPrice: 14,
        unitCost: 5,
        unit: 'sqft',
      },
      {
        name: 'Whole-Home Gutter Cleanout & Flush',
        description: 'Hand clear all debris, flush downspouts to ground level, verify pitch.',
        unitPrice: 175,
        unitCost: 35,
        unit: 'job',
      },
      {
        name: 'Pipe Boot Collar & Vent Flashing Replacement',
        description: 'Replace rotted neoprene roof boot with silicone lifetime collar seal.',
        unitPrice: 260,
        unitCost: 50,
        unit: 'each',
      },
    ],
  },
  painting: {
    id: 'painting',
    name: 'Painting & Drywall',
    icon: '🎨',
    description: 'Interior walls, trim, drywall repair, and exterior soft-wash painting.',
    items: [
      {
        name: 'Standard Interior Room Painting (Walls Only)',
        description: 'Prep nail holes, 2 coats premium washable latex paint on walls up to 12x14 room.',
        unitPrice: 420,
        unitCost: 110,
        unit: 'each',
      },
      {
        name: 'Door & Baseboard Trim Enamel Painting',
        description: 'Sand, caulk joints, and paint baseboards/casings with durable semi-gloss enamel.',
        unitPrice: 3.5,
        unitCost: 1,
        unit: 'sqft',
      },
      {
        name: 'Ceiling Painting (per room)',
        description: 'Stain-block water spots, apply 2 coats flat ceiling white paint.',
        unitPrice: 180,
        unitCost: 45,
        unit: 'each',
      },
      {
        name: 'Drywall Hole & Stress Crack Patching',
        description: 'Mesh tape, 3-coat joint compound, feather sand, and texture match ready for paint.',
        unitPrice: 225,
        unitCost: 35,
        unit: 'job',
      },
      {
        name: 'Cabinet Spray Painting (per door / drawer front)',
        description: 'Degrease, sand, bond primer, and 2 spray coats urethane cabinet enamel.',
        unitPrice: 85,
        unitCost: 22,
        unit: 'each',
      },
    ],
  },
  pressure_washing: {
    id: 'pressure_washing',
    name: 'Pressure Washing & Exterior Cleaning',
    icon: '💧',
    description: 'Driveways, house soft-washing, decks, and concrete sealing.',
    items: [
      {
        name: 'Concrete Driveway & Walkway Surface Cleaning',
        description: 'Pre-treat algae stains, high-pressure rotary surface clean, post-rinse brightener.',
        unitPrice: 240,
        unitCost: 40,
        unit: 'job',
      },
      {
        name: 'House Soft Wash (up to 2,500 sq ft)',
        description: 'Low-pressure chemical wash to eliminate green algae and mildew on vinyl or stucco.',
        unitPrice: 340,
        unitCost: 60,
        unit: 'job',
      },
      {
        name: 'Wood Deck / Fence Washing & Brightening',
        description: 'Oxygenated wood cleaner, gentle pressure wash, and pH neutralizer rinse.',
        unitPrice: 290,
        unitCost: 50,
        unit: 'job',
      },
      {
        name: 'Commercial Grade Concrete Siloxane Sealer (per sq ft)',
        description: 'Deep penetrating water-repellent sealer to protect against freeze-thaw spalling.',
        unitPrice: 0.85,
        unitCost: 0.25,
        unit: 'sqft',
      },
    ],
  },
  handyman: {
    id: 'handyman',
    name: 'Handyman & Home Repair',
    icon: '🔨',
    description: 'General repairs, fixture swaps, drywall, and doors.',
    items: [
      {
        name: 'Half-Day Handyman Punch List (4 Hours)',
        description: '4 hours of skilled labor for multiple small home maintenance tasks.',
        unitPrice: 380,
        unitCost: 140,
        unit: 'job',
      },
      {
        name: 'Interior Pre-Hung Door Replacement',
        description: 'Remove old door, shim & hang new pre-hung door, reinstall casings and latch hardware.',
        unitPrice: 245,
        unitCost: 50,
        unit: 'each',
      },
      {
        name: 'TV Wall Mounting & Cable Concealment',
        description: 'Mount bracket into studs up to 75" TV, level, and run in-wall power extension kit.',
        unitPrice: 185,
        unitCost: 35,
        unit: 'each',
      },
      {
        name: 'Bathroom Vanity & Faucet Replacement',
        description: 'Disconnect old vanity, anchor new 30-48" cabinet, connect P-trap and faucet lines.',
        unitPrice: 395,
        unitCost: 85,
        unit: 'each',
      },
    ],
  },
  flooring: {
    id: 'flooring',
    name: 'Flooring & Tile',
    icon: '🪵',
    description: 'Luxury vinyl plank (LVP), engineered hardwood, tile backsplashes, and subfloors.',
    items: [
      {
        name: 'Luxury Vinyl Plank (LVP) Flooring Installation (per sq ft)',
        description: 'Underlayment prep, precision interlocking click install, transition strips and quarter round.',
        unitPrice: 4.25,
        unitCost: 1.80,
        unit: 'sqft',
      },
      {
        name: 'Hardwood Floor Sanding & Refinishing (per sq ft)',
        description: '3-stage drum sand, edge buffing, dust containment, 3 coats commercial polyurethane.',
        unitPrice: 5.50,
        unitCost: 1.40,
        unit: 'sqft',
      },
      {
        name: 'Kitchen Subway Tile Backsplash (Up to 30 sq ft)',
        description: 'Schluter edge trim, modified thinset, ceramic tile layout, and mold-resistant grout.',
        unitPrice: 850,
        unitCost: 190,
        unit: 'job',
      },
      {
        name: 'Bathroom Porcelain Tile Floor Installation (per sq ft)',
        description: 'Cement backer board, waterproofing membrane, large-format tile setting, and stain-proof grout.',
        unitPrice: 12.50,
        unitCost: 4.20,
        unit: 'sqft',
      },
    ],
  },
  masonry_concrete: {
    id: 'masonry_concrete',
    name: 'Concrete & Masonry',
    icon: '🧱',
    description: 'Patios, driveways, stamped concrete, brick tuckpointing, and retaining walls.',
    items: [
      {
        name: '4" Reinforced Concrete Patio / Slab Pour (per sq ft)',
        description: 'Excavate 4", 2B gravel base compaction, #4 rebar grid, 4000 PSI concrete, broom finish.',
        unitPrice: 11.50,
        unitCost: 4.80,
        unit: 'sqft',
      },
      {
        name: 'Segmental Block Retaining Wall (per face sq ft)',
        description: 'Trench base, crushed stone leveling pad, drain tile pipe, geogrid fabric, and capstones.',
        unitPrice: 38.00,
        unitCost: 14.50,
        unit: 'sqft',
      },
      {
        name: 'Brick Chimney & Wall Mortar Tuckpointing (per 50 sq ft)',
        description: 'Rake out deteriorated mortar joints 3/4" deep, color-matched Type N mortar strike and wash.',
        unitPrice: 650,
        unitCost: 90,
        unit: 'job',
      },
      {
        name: 'Decorative Stamped & Colored Concrete Finish (per sq ft)',
        description: 'Integral color, release agent, slate/ashlar pattern stamp, control joints, and high-gloss cure.',
        unitPrice: 16.00,
        unitCost: 6.50,
        unit: 'sqft',
      },
    ],
  },
  fencing_decking: {
    id: 'fencing_decking',
    name: 'Decks & Fencing',
    icon: '🪜',
    description: 'Composite decks, wood privacy fences, aluminum railings, and gate repairs.',
    items: [
      {
        name: '6ft Cedar Privacy Fence Installation (per linear ft)',
        description: '4x4 cedar posts set 36" in concrete, 2x4 rails, 1x6 dog-ear cedar pickets with ring shank nails.',
        unitPrice: 42.00,
        unitCost: 18.00,
        unit: 'sqft',
      },
      {
        name: 'Trex / Composite Decking Board Replacement (per sq ft)',
        description: 'Hidden fastener clip system, Trex Transcend boards, picture frame border, and fascia wrap.',
        unitPrice: 32.00,
        unitCost: 13.50,
        unit: 'sqft',
      },
      {
        name: 'Black Aluminum Ornamental Pool Fence (per linear ft)',
        description: 'Code-compliant self-closing magnetic latch gate and powder-coated aluminum fence panels.',
        unitPrice: 48.00,
        unitCost: 21.00,
        unit: 'sqft',
      },
      {
        name: 'Walk-Through Wood Gate Rebuild & Anti-Sag Kit',
        description: 'New treated frame, heavy-duty hinges, diagonal cable turnbuckle, and gravity latch.',
        unitPrice: 320,
        unitCost: 75,
        unit: 'each',
      },
    ],
  },
  drywall_insulation: {
    id: 'drywall_insulation',
    name: 'Drywall & Insulation',
    icon: '🏗️',
    description: 'Sheetrock hanging, Level 5 finishing, blown-in attic fiberglass, and spray foam.',
    items: [
      {
        name: 'Drywall Hanging & Level 4 Finish (per sq ft)',
        description: '1/2" gypsum boards hung, paper taped, 3 compound coats, machine sanded paint-ready.',
        unitPrice: 2.85,
        unitCost: 0.95,
        unit: 'sqft',
      },
      {
        name: 'Blown-In Attic Fiberglass Insulation to R-49 (per sq ft)',
        description: 'Baffles installed at soffit vents, foam air-sealing top plates, virgin fiberglass blow.',
        unitPrice: 1.75,
        unitCost: 0.60,
        unit: 'sqft',
      },
      {
        name: 'Closed-Cell Spray Foam Insulation (2" R-14 per sq ft)',
        description: '2 lb density closed cell vapor barrier spray foam applied to exterior stud cavities.',
        unitPrice: 3.40,
        unitCost: 1.25,
        unit: 'sqft',
      },
      {
        name: 'Popcorn Ceiling Removal & Smooth Skim Coat (per room)',
        description: 'Plastic containment barrier, wet scrape texture, 2 skim coats, smooth orbital sanding.',
        unitPrice: 750,
        unitCost: 110,
        unit: 'each',
      },
    ],
  },
  siding_gutters: {
    id: 'siding_gutters',
    name: 'Siding & Exterior Trim',
    icon: '🏡',
    description: 'James Hardie fiber cement, premium vinyl siding, soffit, and aluminum trim capping.',
    items: [
      {
        name: 'James Hardie Fiber Cement Lap Siding (per sq ft)',
        description: 'Housewrap weather barrier, ColorPlus prefinished HardiePlank, aluminum corners and flashings.',
        unitPrice: 11.50,
        unitCost: 4.90,
        unit: 'sqft',
      },
      {
        name: 'Premium Insulated Vinyl Siding Installation (per sq ft)',
        description: 'Contoured foam backed vinyl siding, starter strip, J-channel, and window casing trim.',
        unitPrice: 7.25,
        unitCost: 2.80,
        unit: 'sqft',
      },
      {
        name: 'Aluminum Fascia & Soffit Wrap (per linear ft)',
        description: 'Custom bent aluminum coil over fascia boards with vented vinyl/aluminum soffit panels.',
        unitPrice: 18.00,
        unitCost: 6.00,
        unit: 'sqft',
      },
      {
        name: 'Micro-Mesh Stainless Steel Gutter Guard (per linear ft)',
        description: 'Surgical grade stainless mesh guard screwed onto gutter lip; prevents pine needles & leaves.',
        unitPrice: 9.50,
        unitCost: 3.20,
        unit: 'sqft',
      },
    ],
  },
  solar_clean_energy: {
    id: 'solar_clean_energy',
    name: 'Solar & Clean Energy',
    icon: '☀️',
    description: 'Rooftop solar PV, micro-inverters, Tesla Powerwall storage, and EV charge stations.',
    items: [
      {
        name: 'Residential Grid-Tied Solar PV System (per Watt DC)',
        description: 'Tier-1 400W monocrystalline panels, Enphase micro-inverters, IronRidge roof racking.',
        unitPrice: 2.90,
        unitCost: 1.45,
        unit: 'each',
      },
      {
        name: 'Whole-Home Battery Storage (13.5 kWh Tesla/Enphase)',
        description: 'Smart gateway transfer switch, critical load subpanel, battery bank, and utility interconnection.',
        unitPrice: 12500,
        unitCost: 7800,
        unit: 'job',
      },
      {
        name: 'Solar Panel System Inspection & Inverter Diagnostic',
        description: 'Thermal drone imaging for micro-cracks, string voltage checks, and inverter fault clearing.',
        unitPrice: 295,
        unitCost: 60,
        unit: 'visit',
      },
      {
        name: 'EV Level 2 Smart Solar Diverter Charger (48A)',
        description: 'Hardwired 48A smart EV wall charger with solar excess diversion and load management.',
        unitPrice: 1250,
        unitCost: 480,
        unit: 'each',
      },
    ],
  },
  windows_doors: {
    id: 'windows_doors',
    name: 'Windows & Replacement Doors',
    icon: '🪟',
    description: 'Double-hung vinyl windows, sliding patio doors, fiberglass entry doors, and capping.',
    items: [
      {
        name: 'Custom Double-Hung Vinyl Replacement Window',
        description: 'Low-E argon gas double pane, low-expansion foam seal, exterior PVC trim capping, interior stop.',
        unitPrice: 650,
        unitCost: 260,
        unit: 'each',
      },
      {
        name: '6ft Sliding Glass Patio Door Replacement',
        description: 'Tear out old door, inspect subfloor sill pan flashing, install tempered Low-E sliding door.',
        unitPrice: 1850,
        unitCost: 720,
        unit: 'each',
      },
      {
        name: 'Fiberglass Insulated Exterior Entry Door System',
        description: 'Composite rot-resistant jamb, weatherstripping, adjustable threshold, and keyed lockset.',
        unitPrice: 1450,
        unitCost: 550,
        unit: 'each',
      },
      {
        name: 'Impact-Resistant Casement Window Replacement',
        description: 'Multi-point locking vinyl casement window with laminated impact glass and argon fill.',
        unitPrice: 850,
        unitCost: 340,
        unit: 'each',
      },
    ],
  },
  tree_service: {
    id: 'tree_service',
    name: 'Tree Service & Removal',
    icon: '🪓',
    description: 'Hazard tree felling, canopy crown reduction, stump grinding, and brush chipping.',
    items: [
      {
        name: 'Large Hazardous Tree Removal (Over 40ft)',
        description: 'Sectional rigging and roping, crane or bucket truck takedown, wood haul-off and raking.',
        unitPrice: 1850,
        unitCost: 550,
        unit: 'each',
      },
      {
        name: 'Deep Stump Grinding & Mulch Backfill (per diameter inch)',
        description: 'Grind root flare and stump 8-12" below ground grade, backfill hole with wood mulch chips.',
        unitPrice: 4.50,
        unitCost: 0.90,
        unit: 'each',
      },
      {
        name: 'Class 2 Canopy Crown Thinning & Deadwood Pruning',
        description: 'Remove crossing branches, elevate lower canopy, thin canopy up to 20% for wind resistance.',
        unitPrice: 650,
        unitCost: 160,
        unit: 'job',
      },
      {
        name: 'Emergency Storm Damage Tree Clearance & Chipping',
        description: 'Rapid dispatch crew for fallen limbs, roof clearance, and on-site wood chipping.',
        unitPrice: 950,
        unitCost: 220,
        unit: 'job',
      },
    ],
  },
  lawn_care: {
    id: 'lawn_care',
    name: 'Lawn Care & Maintenance',
    icon: '🌱',
    description: 'Mowing, fertilization, weed control, aeration, and seasonal cleanups.',
    items: [
      {
        name: 'Standard Weekly Lawn Mowing & Edging (Up to 8,000 sq ft)',
        description: 'Precision cut, hard line weed-whacking, string edging along walkways/beds, and debris blow-off.',
        unitPrice: 55,
        unitCost: 18,
        unit: 'visit',
      },
      {
        name: '5-Step Seasonal Fertilization & Weed Control Program',
        description: 'Pre-emergent crabgrass barrier, broadleaf weed treatment, balanced nitrogen feeds, and winterizer.',
        unitPrice: 420,
        unitCost: 110,
        unit: 'job',
      },
      {
        name: 'Core Aeration & Premium Overseeding',
        description: 'Double-pass hollow tine core aeration followed by 5 lbs/1000 sqft premium seed blend.',
        unitPrice: 260,
        unitCost: 65,
        unit: 'job',
      },
      {
        name: 'Comprehensive Spring Yard Cleanup',
        description: 'Stick and thatch raking, perennial cutbacks, bed clearing, and first mowing pass.',
        unitPrice: 340,
        unitCost: 90,
        unit: 'job',
      },
      {
        name: 'Curbside Leaf Vacuuming & Haul-Off',
        description: 'High-capacity vacuum truck removal of raked street piles or full yard collection.',
        unitPrice: 180,
        unitCost: 40,
        unit: 'job',
      },
    ],
  },
  holiday_lighting: {
    id: 'holiday_lighting',
    name: 'Holiday Lighting & Displays',
    icon: '✨',
    description: 'Roofline lighting, commercial displays, wreaths, takedown, and storage.',
    items: [
      {
        name: 'Residential Front Roofline Package (Up to 150 LF)',
        description: 'Custom cut commercial grade C9 LED lights, gutter clips, power timer, installation, takedown, and storage.',
        unitPrice: 1250,
        unitCost: 420,
        unit: 'job',
      },
      {
        name: 'Hardwood Tree Spiral Lighting Wrap (Up to 25ft)',
        description: 'Mini 5mm LED warm white string wrap around trunk and primary canopy branches.',
        unitPrice: 680,
        unitCost: 190,
        unit: 'each',
      },
      {
        name: 'Commercial 36" Pre-Lit Wreath & Bow Installation',
        description: 'Commercial grade illuminated wreath hung over garage peak or entryway with heavy-duty anchor.',
        unitPrice: 220,
        unitCost: 65,
        unit: 'each',
      },
      {
        name: 'Permanent Trim Track Lighting (Per Linear Foot)',
        description: 'Color-changing RGBCW smart LED lights enclosed in color-matched aluminum roofline channel.',
        unitPrice: 28,
        unitCost: 9.5,
        unit: 'each',
      },
    ],
  },
  mosquito_tick_control: {
    id: 'mosquito_tick_control',
    name: 'Mosquito & Tick Control',
    icon: '🦟',
    description: 'Barrier treatments, tick suppression, event fogging, and larvicide.',
    items: [
      {
        name: 'Season-Long Mosquito Barrier Treatment (6 Visits)',
        description: 'Micro-encapsulated synthetic pyrethroid foliage spray targeting resting areas every 21 days.',
        unitPrice: 580,
        unitCost: 120,
        unit: 'job',
      },
      {
        name: 'Special Event One-Time Mosquito & Tick Fogging',
        description: 'Intensive perimeter and lawn fogging 24–48 hours prior to weddings, graduations, or parties.',
        unitPrice: 175,
        unitCost: 35,
        unit: 'job',
      },
      {
        name: 'Perimeter Tick Shield Woodline Treatment',
        description: 'High-pressure granular and liquid application along brush edges, stone walls, and leaf litter.',
        unitPrice: 160,
        unitCost: 30,
        unit: 'visit',
      },
      {
        name: 'Organic All-Natural Mosquito Spray',
        description: 'Botanical essential oil blend safe for pollinators, pets, and ponds.',
        unitPrice: 115,
        unitCost: 28,
        unit: 'visit',
      },
    ],
  },
  air_duct_cleaning: {
    id: 'air_duct_cleaning',
    name: 'Air Duct & Vent Cleaning',
    icon: '💨',
    description: 'Whole-home ducts, dryer vent clearing, sanitization, and blower cleaning.',
    items: [
      {
        name: 'Whole-Home Air Duct Cleaning (Up to 15 Vents)',
        description: 'Negative air vacuum truck connection, rotary brush scrubbing on supply and return trunk lines.',
        unitPrice: 495,
        unitCost: 110,
        unit: 'job',
      },
      {
        name: 'Residential Dryer Vent Line Cleaning & Lint Clearing',
        description: 'Rotary brush snake clearing from dryer back to exterior roof/wall termination hood with airflow test.',
        unitPrice: 165,
        unitCost: 30,
        unit: 'job',
      },
      {
        name: 'Botanical Duct Sanitization & Deodorizing',
        description: 'Ultrasonic fogger application of EPA-registered thyme-based disinfectant through entire duct network.',
        unitPrice: 140,
        unitCost: 25,
        unit: 'job',
      },
      {
        name: 'Furnace Blower Wheel & Evaporator Coil Deep Clean',
        description: 'Remove, degrease, and rinse squirrel-cage blower fan; foam clean indoor A-coil fins.',
        unitPrice: 220,
        unitCost: 45,
        unit: 'each',
      },
    ],
  },
  pond_services: {
    id: 'pond_services',
    name: 'Pond & Water Feature Care',
    icon: '🌊',
    description: 'Spring cleanouts, winterization netting, pump repair, and algae control.',
    items: [
      {
        name: 'Complete Spring Pond Cleanout & Power Wash',
        description: 'Fish temporary holding tank, drain pond, pressure wash rocks/gravel, divide water lilies, refill and detoxify.',
        unitPrice: 650,
        unitCost: 140,
        unit: 'job',
      },
      {
        name: 'Fall Pond Winterization & Heavy-Duty Netting',
        description: 'Trim hardy water plants, pull/store tender aquatics, clean skimmer basket, dome net over water surface.',
        unitPrice: 280,
        unitCost: 45,
        unit: 'job',
      },
      {
        name: 'Submersible Pond Pump Diagnostic & Replacement',
        description: 'Inspect check valve, test GFCI draw, replace magnetic drive solids-handling pump up to 4,000 GPH.',
        unitPrice: 420,
        unitCost: 180,
        unit: 'each',
      },
      {
        name: 'Monthly Water Quality & Algae Management Visit',
        description: 'Water parameter testing (pH, ammonia, KH), dose beneficial bacteria, treat string algae, clear filter pads.',
        unitPrice: 125,
        unitCost: 20,
        unit: 'visit',
      },
    ],
  },
};

export function listTradeStarterCatalogs(): TradeStarterCatalog[] {
  return Object.values(TRADE_STARTER_CATALOGS);
}

export function getStarterCatalogByTrade(tradeId: string): TradeStarterCatalog | null {
  return TRADE_STARTER_CATALOGS[tradeId] ?? null;
}

// -----------------------------------------------------------------------------
// 2. Master Trade SKU Database & Distributor Cross-Reference
// -----------------------------------------------------------------------------

export interface MasterTradeSku {
  sku: string;
  tradeId: string;
  category: MaterialCategory;
  name: string;
  mpn: string;
  unit: string;
  unitCost: number;
  typicalMarkupPct: number;
  laborHoursPerUnit: number;
  distributors: MaterialDistributor[];
  specifications: Record<string, string>;
}

export const MASTER_TRADE_SKUS: MasterTradeSku[] = [
  // Roofing
  {
    sku: 'ROOF-SHING-ARCH-01',
    tradeId: 'roofing',
    category: 'shingles',
    name: 'GAF Timberline HDZ Architectural Shingles (Bundle / 33.3 sq ft)',
    mpn: '0854200',
    unit: 'bundle',
    unitCost: 38.50,
    typicalMarkupPct: 35,
    laborHoursPerUnit: 0.45,
    distributors: ['abc_supply', 'beacon', 'home_depot_pro'],
    specifications: { warranty: 'Lifetime Limited', windRating: '130 MPH', fireRating: 'Class A' },
  },
  {
    sku: 'ROOF-UNDERLAY-SYN-01',
    tradeId: 'roofing',
    category: 'underlayment',
    name: 'GAF FeltBuster High-Traction Synthetic Roof Underlayment (10 Sq Roll)',
    mpn: '0834000',
    unit: 'roll',
    unitCost: 68.00,
    typicalMarkupPct: 40,
    laborHoursPerUnit: 0.30,
    distributors: ['abc_supply', 'beacon', 'home_depot_pro'],
    specifications: { coverage: '1,000 sq ft', thickness: '10 mil', tearResistance: 'High' },
  },
  {
    sku: 'ROOF-ICE-WATER-01',
    tradeId: 'roofing',
    category: 'underlayment',
    name: 'Grace Ice & Water Shield Self-Adhered Membrane (2 Sq Roll)',
    mpn: 'GIWS-200',
    unit: 'roll',
    unitCost: 125.00,
    typicalMarkupPct: 30,
    laborHoursPerUnit: 0.50,
    distributors: ['abc_supply', 'beacon'],
    specifications: { coverage: '200 sq ft', thickness: '40 mil', waterproofing: '100% rubberized asphalt' },
  },
  // Plumbing
  {
    sku: 'PLUMB-WH-50G-GAS',
    tradeId: 'plumbing',
    category: 'plumbing',
    name: 'Rheem Performance Plus 50-Gal 40k BTU Natural Gas Water Heater',
    mpn: 'XG50T06EC40U1',
    unit: 'each',
    unitCost: 680.00,
    typicalMarkupPct: 45,
    laborHoursPerUnit: 3.5,
    distributors: ['ferguson', 'home_depot_pro'],
    specifications: { capacity: '50 Gallons', energyFactor: '0.64 UEF', warranty: '9-Year Tank/Parts' },
  },
  {
    sku: 'PLUMB-PEXB-12-100',
    tradeId: 'plumbing',
    category: 'plumbing',
    name: 'Apollo 1/2-in x 100-ft Blue PEX-B Potable Water Pipe Coil',
    mpn: 'APPEXB12100B',
    unit: 'coil',
    unitCost: 34.00,
    typicalMarkupPct: 50,
    laborHoursPerUnit: 0.25,
    distributors: ['ferguson', 'home_depot_pro'],
    specifications: { diameter: '1/2 inch', psiRating: '160 PSI @ 73F', standard: 'ASTM F876/F877' },
  },
  // Electrical
  {
    sku: 'ELEC-PANEL-200A-40C',
    tradeId: 'electrical',
    category: 'accessories',
    name: 'Square D QO 200 Amp 42-Space Indoor Main Breaker Load Center',
    mpn: 'QO142M200PQ',
    unit: 'each',
    unitCost: 265.00,
    typicalMarkupPct: 45,
    laborHoursPerUnit: 6.0,
    distributors: ['home_depot_pro', 'ferguson'],
    specifications: { busRating: '200A', spaces: '42', busMaterial: 'Plated Copper' },
  },
  {
    sku: 'ELEC-ROMEX-12-2-250',
    tradeId: 'electrical',
    category: 'accessories',
    name: 'Southwire Romex SIMpull 12/2 Solid Copper NM-B Wire (250-ft)',
    mpn: '28828255',
    unit: 'roll',
    unitCost: 135.00,
    typicalMarkupPct: 35,
    laborHoursPerUnit: 0.40,
    distributors: ['home_depot_pro', 'ferguson'],
    specifications: { gauge: '12 AWG', conductors: '2 with ground', ampacity: '20 Amps' },
  },
  // HVAC
  {
    sku: 'HVAC-AC-COND-3TON-15S',
    tradeId: 'hvac',
    category: 'hvac',
    name: 'Goodman 3-Ton 15.2 SEER2 R-410A Air Conditioner Condenser',
    mpn: 'GSXB403610',
    unit: 'each',
    unitCost: 1420.00,
    typicalMarkupPct: 50,
    laborHoursPerUnit: 5.5,
    distributors: ['ferguson'],
    specifications: { capacity: '36,000 BTU', efficiency: '15.2 SEER2', compressor: 'High-Efficiency Scroll' },
  },
  // Painting
  {
    sku: 'PAINT-SW-SUPERPAINT-EXT-5G',
    tradeId: 'painting',
    category: 'paint',
    name: 'Sherwin-Williams SuperPaint Exterior Acrylic Latex Satin (5 Gallon)',
    mpn: 'A89W01151',
    unit: 'pail',
    unitCost: 185.00,
    typicalMarkupPct: 40,
    laborHoursPerUnit: 1.2,
    distributors: ['home_depot_pro'],
    specifications: { coverage: '1,750-2,000 sq ft', sheen: 'Satin', technology: 'Advanced Resin Technology' },
  },
  // Flooring
  {
    sku: 'FLOOR-LVP-CORETEC-20MIL',
    tradeId: 'flooring',
    category: 'flooring',
    name: 'COREtec Pro Plus 7" x 48" Enhanced Rigid Core LVP (28.84 sq ft/box)',
    mpn: 'VV017-00701',
    unit: 'box',
    unitCost: 68.00,
    typicalMarkupPct: 45,
    laborHoursPerUnit: 0.60,
    distributors: ['home_depot_pro'],
    specifications: { wearLayer: '20 mil', core: 'Solid Polymer Core (SPC)', waterproof: '100%' },
  },
];

// -----------------------------------------------------------------------------
// 3. Multi-Tier ("Good / Better / Best") Estimating Assemblies
// -----------------------------------------------------------------------------

export interface MultiTierAssemblyDefinition {
  tradeId: string;
  name: string;
  description: string;
  tiers: {
    good: {
      name: string;
      tierTitle: string;
      description: string;
      warrantyYears: number;
      markupMultiplier: number;
      materialCostPerUnit: number;
      laborHoursPerUnit: number;
      features: string[];
    };
    better: {
      name: string;
      tierTitle: string;
      description: string;
      warrantyYears: number;
      markupMultiplier: number;
      materialCostPerUnit: number;
      laborHoursPerUnit: number;
      features: string[];
    };
    best: {
      name: string;
      tierTitle: string;
      description: string;
      warrantyYears: number;
      markupMultiplier: number;
      materialCostPerUnit: number;
      laborHoursPerUnit: number;
      features: string[];
    };
  };
}

export const GOOD_BETTER_BEST_ASSEMBLIES: Record<string, MultiTierAssemblyDefinition> = {
  roofing: {
    tradeId: 'roofing',
    name: 'Full Roof Replacement Package',
    description: 'Calculates Good, Better, Best roofing system estimates from square footage and pitch.',
    tiers: {
      good: {
        name: 'Standard 3-Tab Asphalt Shingle System',
        tierTitle: 'Good · Value Protection',
        description: 'Traditional 3-tab 25-year shingles with standard 15# felt underlayment and aluminum drip edge.',
        warrantyYears: 25,
        markupMultiplier: 1.40,
        materialCostPerUnit: 145.00, // per roof square (100 sq ft)
        laborHoursPerUnit: 1.8,
        features: [
          '25-Year Manufacturer Limited Shingle Warranty',
          'Standard 15 lb Asphalt Saturated Underlayment',
          'Eaves-Only Ice & Water Shield Protection (3 ft)',
          'Standard Aluminum Drip Edge & Valley Metal',
          '3-Year Workmanship Labor Guarantee',
        ],
      },
      better: {
        name: 'Architectural HDZ Dimensional Shingle System',
        tierTitle: 'Better · Most Popular & High Wind Rating',
        description: 'GAF Timberline HDZ or Owens Corning Duration dimensional shingles with synthetic underlayment & full ridge vent.',
        warrantyYears: 50,
        markupMultiplier: 1.50,
        materialCostPerUnit: 195.00,
        laborHoursPerUnit: 2.1,
        features: [
          '50-Year Lifetime Limited Architectural Warranty',
          'High-Traction Synthetic Breathable Underlayment',
          'Double-Layer 6ft Ice & Water Shield (Eaves + Valleys)',
          'Continuous Cobra Ridge Vent Exhaust System',
          '130 MPH Unlimited Wind Speed Protection',
          '10-Year Transferable Workmanship Guarantee',
        ],
      },
      best: {
        name: 'Designer Standing Seam Metal / Ultra-HD Premium Shingle System',
        tierTitle: 'Best · Lifetime Maximum Durability',
        description: '24-gauge standing seam metal roof or Class 4 impact-resistant designer luxury shingles with high-temp self-adhered membrane.',
        warrantyYears: 50,
        markupMultiplier: 1.65,
        materialCostPerUnit: 340.00,
        laborHoursPerUnit: 3.2,
        features: [
          'Class 4 Impact Resistance (Hail Discount Eligible)',
          '100% Full-Deck Self-Adhered High-Temp Waterproof Underlayment',
          'Heavy-Duty Copper or Kynar 500 Finished Custom Flashings',
          'Lifetime Non-Prorated System & Labor Warranty',
          'Zero Maintenance Algae-Proof Copper Granule Tech',
          'Annual Free Post-Storm Roof Health Audits for 5 Years',
        ],
      },
    },
  },
  hvac: {
    tradeId: 'hvac',
    name: 'Complete HVAC System Replacement',
    description: 'Calculates Good, Better, Best heating & cooling equipment systems based on tonnage and SEER2.',
    tiers: {
      good: {
        name: '14.3 SEER2 Single-Stage Heat Pump / AC',
        tierTitle: 'Good · Standard Efficiency',
        description: 'Reliable single-stage scroll compressor paired with multi-speed ECM air handler or 80% gas furnace.',
        warrantyYears: 10,
        markupMultiplier: 1.45,
        materialCostPerUnit: 3200.00, // base equipment package
        laborHoursPerUnit: 12.0,
        features: [
          '14.3 SEER2 Efficiency Rating (Meets DOE Minimum)',
          'Quiet Single-Stage Scroll Compressor',
          'Basic Programmable Digital Thermostat',
          '10-Year Parts Limited Warranty',
          '1-Year Complete Labor Guarantee',
        ],
      },
      better: {
        name: '16.5 SEER2 Two-Stage High-Efficiency System',
        tierTitle: 'Better · High Comfort & Lower Utility Bills',
        description: 'Two-stage cooling/heating system for optimal humidity control, paired with smart Wi-Fi thermostat.',
        warrantyYears: 10,
        markupMultiplier: 1.55,
        materialCostPerUnit: 4800.00,
        laborHoursPerUnit: 14.0,
        features: [
          '16.5 SEER2 High Efficiency (Up to 30% Energy Savings)',
          'Two-Stage Compressor for Enhanced Dehumidification',
          'Ecobee Smart Wi-Fi Thermostat with Room Sensor',
          'Ultra-Quiet Acoustic Sound Blanket Enclosure',
          '10-Year Compressor & Parts Warranty + 5-Year Labor Guarantee',
        ],
      },
      best: {
        name: '20+ SEER2 Variable-Speed Inverter Heat Pump',
        tierTitle: 'Best · Whisper-Quiet Inverter & Maximum Rebates',
        description: 'Fully modulating inverter variable-speed heat pump with whole-home HEPA air filtration & zoning.',
        warrantyYears: 12,
        markupMultiplier: 1.65,
        materialCostPerUnit: 7400.00,
        laborHoursPerUnit: 18.0,
        features: [
          '20.5+ SEER2 Modulating Inverter (Federal 25C Tax Credit Eligible)',
          'Continuous Micro-Adjusting Temperature ±0.5°F',
          'Whole-Home MERV 16 Air Purifier & UV Disinfection',
          'Whisper Quiet Operation (as low as 48 dBA)',
          '12-Year Unit Replacement & Lifetime Heat Exchanger Warranty',
          '10-Year No-Cost Labor & Priority Dispatch Service Plan',
        ],
      },
    },
  },
  painting: {
    tradeId: 'painting',
    name: 'Interior & Exterior Painting Assembly',
    description: 'Calculates Good, Better, Best painting estimates based on wall sq ft and trim scope.',
    tiers: {
      good: {
        name: 'Contractor Grade Latex Paint (1-2 Coats)',
        tierTitle: 'Good · Rental / Quick Refresh',
        description: 'Standard wall prep, spot prime stains, 1-2 coats production acrylic latex.',
        warrantyYears: 2,
        markupMultiplier: 1.40,
        materialCostPerUnit: 0.35, // per sq ft
        laborHoursPerUnit: 0.025,
        features: [
          'Standard Spot Caulking & Spackle Repairs',
          '1-2 Coats Quality Builder Latex Paint',
          'Standard Washability & Sheen Consistency',
          '2-Year Peeling & Blistering Warranty',
        ],
      },
      better: {
        name: 'Premium 100% Acrylic Washable Matte / Satin',
        tierTitle: 'Better · Homeowner Long-Life Standard',
        description: 'Full surface sanding, hairline crack taping, high-adhesion primer, 2 coats Sherwin-Williams SuperPaint or Benjamin Moore Regal Select.',
        warrantyYears: 5,
        markupMultiplier: 1.50,
        materialCostPerUnit: 0.65,
        laborHoursPerUnit: 0.038,
        features: [
          'Complete Surface Sanding, Full Caulking & Primer Coat',
          '2 Coats 100% Acrylic Scuff-Resistant Washable Paint',
          'Mildewcide Additive for High-Humidity Resistance',
          'Ultra-Sharp Laser Line Tape on All Trim & Ceilings',
          '5-Year Full Workmanship & Paint Film Warranty',
        ],
      },
      best: {
        name: 'Ultra-Premium Ceramic / Mineral High-Performance Coating',
        tierTitle: 'Best · Lifetime Scrubbable & Luxury Finish',
        description: 'Level 5 skim prep, stain-blocking barrier, 2 coats Sherwin-Williams Emerald Urethane or Benjamin Moore Aura with ceramic bead durability.',
        warrantyYears: 10,
        markupMultiplier: 1.65,
        materialCostPerUnit: 1.10,
        laborHoursPerUnit: 0.055,
        features: [
          'Flawless Level 5 Surface Smoothing & Micro-Fill Prep',
          '2 Coats Advanced Ceramic-Infused Luxury Coating',
          'Zero VOC & Hypoallergenic Low-Odor Formulation',
          'Extreme Scrub Resistance (Stands Up to Kids & Pets)',
          '10-Year Transferable No-Fade & No-Peel Warranty',
          'Free 1-Year Touch-Up Kit & Annual Inspection',
        ],
      },
    },
  },
  flooring: {
    tradeId: 'flooring',
    name: 'Hard Surface Flooring System',
    description: 'Calculates Good, Better, Best flooring proposals based on room square footage.',
    tiers: {
      good: {
        name: 'Standard 12 mil Click LVP Flooring',
        tierTitle: 'Good · Budget Water-Resistant',
        description: 'Standard luxury vinyl plank with integrated foam pad and matching transition strips.',
        warrantyYears: 10,
        markupMultiplier: 1.40,
        materialCostPerUnit: 2.20, // per sq ft
        laborHoursPerUnit: 0.035,
        features: [
          '12 mil Commercial Wear Layer',
          '100% Waterproof Rigid Polymer Core',
          'Direct Click-Lock Float Installation',
          '10-Year Residential Wear Warranty',
        ],
      },
      better: {
        name: 'Premium 20 mil Embossed-In-Register SPC LVP',
        tierTitle: 'Better · High Traffic & Realistic Wood Texture',
        description: 'Heavy-duty 20 mil commercial wear layer with acoustic sound underlayment, realistic grain texture & bevel edges.',
        warrantyYears: 25,
        markupMultiplier: 1.50,
        materialCostPerUnit: 3.60,
        laborHoursPerUnit: 0.045,
        features: [
          '20 mil Heavy Commercial Scratch-Resistant Wear Layer',
          'Embossed-In-Register (EIR) Authentic Wood Grain Texture',
          'Premium High-Density Sound-Dampening Cork/EVA Backing',
          'Heavy Subfloor Leveling & Seam Seal Prep',
          '25-Year Residential Warranty + 5-Year Commercial',
        ],
      },
      best: {
        name: 'Engineered Hardwood / 3/4" Solid Hardwood',
        tierTitle: 'Best · Timeless Natural Hardwood Value',
        description: 'Real European white oak engineered or 3/4" solid hardwood nailed & glued with custom flush wood floor vents.',
        warrantyYears: 50,
        markupMultiplier: 1.65,
        materialCostPerUnit: 6.80,
        laborHoursPerUnit: 0.070,
        features: [
          'Authentic Natural European White Oak / Hickory Plank',
          'UV-Cured Multi-Layer Aluminum Oxide Finish',
          'Custom Flush-Mount Wood Cold Air Returns & Reducers',
          'Subfloor Screwing to Eliminate Squeaks Prior to Install',
          'Lifetime Structural & 50-Year Finish Warranty',
        ],
      },
    },
  },
  plumbing: {
    tradeId: 'plumbing',
    name: 'Water Heater Replacement Package',
    description: 'Calculates Good, Better, Best domestic water heating proposals.',
    tiers: {
      good: {
        name: 'Standard Atmospheric 50-Gal Tank Water Heater',
        tierTitle: 'Good · Reliable Direct Replacement',
        description: 'Standard 40k BTU natural gas or 4.5kW electric storage water heater with new supply lines & emergency pan.',
        warrantyYears: 6,
        markupMultiplier: 1.45,
        materialCostPerUnit: 720.00,
        laborHoursPerUnit: 3.5,
        features: [
          '50-Gallon Steel Tank with Sacrificial Magnesium Anode',
          'New Braided Stainless Supply Connectors & Ball Valve',
          'Aluminum Drain Pan & T&P Relief Line Discharge',
          '6-Year Tank & Parts Manufacturer Warranty',
          '1-Year Full Labor Guarantee',
        ],
      },
      better: {
        name: 'Hybrid Heat Pump High-Efficiency Electric Tank',
        tierTitle: 'Better · Ultra Low Energy Cost & Rebates',
        description: '50-80 gal hybrid heat pump water heater offering up to $400/year electrical savings and quiet operation.',
        warrantyYears: 10,
        markupMultiplier: 1.55,
        materialCostPerUnit: 1650.00,
        laborHoursPerUnit: 5.0,
        features: [
          '3.8 UEF Energy Factor (Up to 75% Energy Cost Reduction)',
          'Federal IRA Tax Credit Eligible ($2,000 Federal Credit)',
          'Built-In Leak Detection & Automatic Water Shut-Off Valve',
          'Smartphone App Controls & Vacation Mode Scheduling',
          '10-Year Complete Tank & Component Warranty',
        ],
      },
      best: {
        name: 'High-Efficiency Condensing Tankless System (Navien / Rinnai)',
        tierTitle: 'Best · Endless Hot Water on Demand',
        description: '199,000 BTU ultra-condensing tankless water heater with built-in recirculation pump and dual stainless heat exchangers.',
        warrantyYears: 15,
        markupMultiplier: 1.65,
        materialCostPerUnit: 2450.00,
        laborHoursPerUnit: 7.5,
        features: [
          'Continuous Endless Hot Water (Up to 11.2 GPM)',
          'Built-In Recirculation Pump for Instant Hot Water at Tap',
          'Dual Stainless Steel Heat Exchangers (High Mineral Resistance)',
          'Space-Saving Wall-Mount Footprint (Reclaims Floor Space)',
          '15-Year Heat Exchanger & 5-Year Labor Warranty',
          'Includes Annual Descaling Service Kit & Isolation Valves',
        ],
      },
    },
  },
};

// -----------------------------------------------------------------------------
// 4. Regional Pricing Multipliers & Inflation Indexes
// -----------------------------------------------------------------------------

export interface RegionalCostIndex {
  regionId: string;
  regionName: string;
  materialMultiplier: number;
  laborMultiplier: number;
  statesCovered: string[];
}

export const REGIONAL_COST_INDEXES: Record<string, RegionalCostIndex> = {
  northeast_metro: {
    regionId: 'northeast_metro',
    regionName: 'Northeast Metro (NY, NJ, MA, CT)',
    materialMultiplier: 1.14,
    laborMultiplier: 1.28,
    statesCovered: ['NY', 'NJ', 'MA', 'CT', 'RI', 'PA'],
  },
  west_coast: {
    regionId: 'west_coast',
    regionName: 'West Coast Metro (CA, WA, OR)',
    materialMultiplier: 1.16,
    laborMultiplier: 1.32,
    statesCovered: ['CA', 'WA', 'OR', 'HI', 'AK'],
  },
  midwest: {
    regionId: 'midwest',
    regionName: 'Midwest & Great Lakes (OH, MI, IN, IL, WI)',
    materialMultiplier: 0.98,
    laborMultiplier: 0.96,
    statesCovered: ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO'],
  },
  south_southeast: {
    regionId: 'south_southeast',
    regionName: 'Southeast & Sunbelt (TX, FL, GA, NC, SC, TN)',
    materialMultiplier: 0.97,
    laborMultiplier: 0.92,
    statesCovered: ['TX', 'FL', 'GA', 'NC', 'SC', 'TN', 'AL', 'LA'],
  },
  mountain_west: {
    regionId: 'mountain_west',
    regionName: 'Mountain West (CO, UT, AZ, NV)',
    materialMultiplier: 1.04,
    laborMultiplier: 1.05,
    statesCovered: ['CO', 'UT', 'AZ', 'NV', 'ID', 'MT', 'WY'],
  },
  national_baseline: {
    regionId: 'national_baseline',
    regionName: 'National Baseline (US Average)',
    materialMultiplier: 1.00,
    laborMultiplier: 1.00,
    statesCovered: [],
  },
};

export function resolveRegionalCostIndex(stateOrRegionId?: string): RegionalCostIndex {
  if (!stateOrRegionId) return REGIONAL_COST_INDEXES.national_baseline;

  const normalized = stateOrRegionId.trim().toUpperCase();

  // Check direct region key
  const direct = REGIONAL_COST_INDEXES[stateOrRegionId.toLowerCase()];
  if (direct) return direct;

  // Search by state code
  for (const region of Object.values(REGIONAL_COST_INDEXES)) {
    if (region.statesCovered.includes(normalized)) {
      return region;
    }
  }

  return REGIONAL_COST_INDEXES.national_baseline;
}

// -----------------------------------------------------------------------------
// 5. Multi-Tier Package Calculation Engine
// -----------------------------------------------------------------------------

export interface MultiTierProposalItem {
  tierKey: 'good' | 'better' | 'best';
  tierTitle: string;
  packageName: string;
  description: string;
  warrantyYears: number;
  features: string[];
  dimensionsSummary: string;
  quantities: {
    rawUnits: number;
    wasteFactorPct: number;
    billableUnits: number;
    laborHours: number;
  };
  financials: {
    rawMaterialCost: number;
    adjustedMaterialCost: number;
    laborCost: number;
    equipmentAndDisposalCost: number;
    totalJobCost: number;
    markupMultiplier: number;
    recommendedRetailPrice: number;
    grossProfit: number;
    grossMarginPct: number;
  };
}

export interface MultiTierProposalResult {
  tradeId: string;
  tradeName: string;
  region: RegionalCostIndex;
  calculatedAt: string;
  hourlyLaborRate: number;
  tiers: {
    good: MultiTierProposalItem;
    better: MultiTierProposalItem;
    best: MultiTierProposalItem;
  };
}

export function calculateMultiTierProposal(params: {
  tradeId: string;
  dimensionUnits: number; // e.g. sq ft, squares, or unit count
  hourlyLaborRate?: number; // default $75/hr
  stateOrRegion?: string;
  wasteFactorPct?: number; // default 10%
  pitchMultiplier?: number; // default 1.0 for flat/standard
  equipmentAndDisposalFlat?: number; // default $250
}): MultiTierProposalResult {
  const {
    tradeId,
    dimensionUnits,
    hourlyLaborRate = 75,
    stateOrRegion,
    wasteFactorPct = 10,
    pitchMultiplier = 1.0,
    equipmentAndDisposalFlat = 250,
  } = params;

  const assembly = GOOD_BETTER_BEST_ASSEMBLIES[tradeId] || GOOD_BETTER_BEST_ASSEMBLIES.roofing;
  const region = resolveRegionalCostIndex(stateOrRegion);

  // Scaled units considering waste & geometry
  const adjustedUnits = Math.max(1, dimensionUnits * pitchMultiplier * (1 + wasteFactorPct / 100));

  function buildTier(
    tierKey: 'good' | 'better' | 'best',
    def: MultiTierAssemblyDefinition['tiers']['good']
  ): MultiTierProposalItem {
    // If unit cost is scaled per square foot or flat equipment
    const baseMaterialCost = def.materialCostPerUnit * adjustedUnits;
    const totalLaborHours = Math.max(1, def.laborHoursPerUnit * adjustedUnits);

    const regionalMaterialCost = baseMaterialCost * region.materialMultiplier;
    const regionalLaborCost = totalLaborHours * hourlyLaborRate * region.laborMultiplier;
    const totalCost = regionalMaterialCost + regionalLaborCost + equipmentAndDisposalFlat;

    const retailPrice = Math.round(totalCost * def.markupMultiplier);
    const grossProfit = retailPrice - totalCost;
    const grossMarginPct = Math.round((grossProfit / retailPrice) * 100);

    return {
      tierKey,
      tierTitle: def.tierTitle,
      packageName: def.name,
      description: def.description,
      warrantyYears: def.warrantyYears,
      features: def.features,
      dimensionsSummary: `${dimensionUnits} base units with ${wasteFactorPct}% waste factor (${adjustedUnits.toFixed(1)} net)`,
      quantities: {
        rawUnits: dimensionUnits,
        wasteFactorPct,
        billableUnits: Math.round(adjustedUnits * 10) / 10,
        laborHours: Math.round(totalLaborHours * 10) / 10,
      },
      financials: {
        rawMaterialCost: Math.round(baseMaterialCost * 100) / 100,
        adjustedMaterialCost: Math.round(regionalMaterialCost * 100) / 100,
        laborCost: Math.round(regionalLaborCost * 100) / 100,
        equipmentAndDisposalCost: equipmentAndDisposalFlat,
        totalJobCost: Math.round(totalCost * 100) / 100,
        markupMultiplier: def.markupMultiplier,
        recommendedRetailPrice: retailPrice,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMarginPct,
      },
    };
  }

  return {
    tradeId,
    tradeName: assembly.name,
    region,
    calculatedAt: new Date().toISOString(),
    hourlyLaborRate,
    tiers: {
      good: buildTier('good', assembly.tiers.good),
      better: buildTier('better', assembly.tiers.better),
      best: buildTier('best', assembly.tiers.best),
    },
  };
}

// -----------------------------------------------------------------------------
// 6. Safety & Tool Load-Out Manifest Generator
// -----------------------------------------------------------------------------

export interface TradeSafetyAndToolManifest {
  tradeId: string;
  ppeRequirements: string[];
  powerTools: string[];
  handTools: string[];
  safetyEquipment: string[];
  hazmatDisposalNotes: string[];
}

export function generateTradeSafetyAndToolManifest(tradeId: string): TradeSafetyAndToolManifest {
  switch (tradeId) {
    case 'roofing':
      return {
        tradeId: 'roofing',
        ppeRequirements: ['ANSI Z87.1 Safety Glasses', 'Class 2 High-Vis Vest', 'Steel/Composite Toe Roofing Boots with Soft Grip', 'Work Gloves'],
        powerTools: ['Pneumatic Coil Roofing Nailers', 'Air Compressor & 100ft Hoses', 'Chalk Line Kit', 'Reciprocating Saw for Decking Repairs'],
        handTools: ['Roofing Shingle Tear-off Shovels', 'Hook Blade Utility Knives', 'Tin Snips & Seaming Pliers', 'Heavy-Duty Magnetic Sweeper Bar'],
        safetyEquipment: ['OSHA Compliant 50ft Fall Arrest Harness Kits', 'Reusable Roof Ridge Anchors', '28ft & 32ft Type 1A Extension Ladders', 'Ladder Stabilizer Standoffs'],
        hazmatDisposalNotes: ['Pre-1980 roofs must verify no transite asbestos shingles before high-speed mechanical tear-off.'],
      };
    case 'electrical':
      return {
        tradeId: 'electrical',
        ppeRequirements: ['NFPA 70E Arc Flash Safety Glasses', 'EH-Rated Dielectric Safety Boots', '1000V Insulated Leather Over-Gloves'],
        powerTools: ['Cordless Rotary Hammer Drill', 'Conduit Bender (1/2" and 3/4")', 'Battery Hydraulic Knockout Punch Kit', 'Wire Puller Fish Tape'],
        handTools: ['1000V Insulated Screwdriver Set', 'Linesman Pliers & Wire Strippers', 'Digital Multimeter & Clamp Amp Meter', 'Circuit Breaker Tracer'],
        safetyEquipment: ['Lockout/Tagout (LOTO) Padlock & Hasp Kit', 'Voltage Detector Pen (Non-Contact)', 'Type 1A Fiberglass Stepladders Only (No Aluminum)'],
        hazmatDisposalNotes: ['Recycle old PCB-bearing ballasts and mercury switches at approved hazardous waste facilities.'],
      };
    case 'hvac':
      return {
        tradeId: 'hvac',
        ppeRequirements: ['Safety Glasses with Side Shields', 'Cut-Resistant Nitrile Dipped Gloves', 'Slip-Resistant Boot Soles'],
        powerTools: ['EPA-Certified Refrigerant Recovery Machine', '2-Stage Deep Vacuum Pump & Micron Gauge', 'Oxy-Acetylene / Nitrogen Purge Brazing Rig', 'Cordless Sheet Metal Shear'],
        handTools: ['Digital Refrigerant Manifold Gauges', 'Flaring & Swaging Tool Kit', 'Duct Crimpers & Hand Seamers', 'Electronic Refrigerant Sniffer Leak Detector'],
        safetyEquipment: ['Carbon Monoxide (CO) Personal Ambient Detector', 'Combustible Gas Leak Detector', 'Recovery Cylinders with Overfill Sensors'],
        hazmatDisposalNotes: ['All recovered CFC, HCFC, and HFC refrigerants must be logged per EPA Section 608.'],
      };
    default:
      return {
        tradeId,
        ppeRequirements: ['ANSI Certified Eye Protection', 'Work Gloves', 'Steel-Toe Protective Footwear', 'Ear Protection'],
        powerTools: ['Cordless Impact Driver & Drill Combo', 'Circular Saw', 'Drop Lights & Extension Cords'],
        handTools: ['Level (2ft & 4ft)', 'Measuring Tape', 'Adjustable Wrenches', 'Utility Knife'],
        safetyEquipment: ['First Aid Kit', 'Class ABC Fire Extinguisher', 'Fiberglass Stepladder'],
        hazmatDisposalNotes: ['Dispose of chemical containers and scrap materials in compliance with local municipal codes.'],
      };
  }
}

// -----------------------------------------------------------------------------
// 7. Trade Scope Inclusions & Exclusions Boilerplate Builder
// -----------------------------------------------------------------------------

export interface TradeScopeContractClauses {
  tradeId: string;
  standardInclusions: string[];
  standardExclusions: string[];
  hiddenDamageProvisions: string;
  warrantyTerms: string;
}

export function generateTradeScopeContract(tradeId: string, tier: 'good' | 'better' | 'best' = 'better'): TradeScopeContractClauses {
  switch (tradeId) {
    case 'roofing':
      return {
        tradeId: 'roofing',
        standardInclusions: [
          'Complete tear-off and disposal of designated existing roof layers.',
          'Installation of specified underlayment, ice and water shield, and starter courses.',
          'Replacement of all plumbing vent boots and installation of new perimeter drip edge.',
          'Magnetic sweep of driveway, perimeter lawns, and paved access paths for loose fasteners.',
        ],
        standardExclusions: [
          'Replacement of deteriorated, rotted, or broken plywood/OSB decking beyond the first 2 complimentary sheets (billed at pre-agreed rate per sheet).',
          'Repair of damaged structural rafters, trusses, or decayed wall framing beneath roof deck.',
          'Painting or repair of interior drywall stains resulting from pre-existing leaks prior to work commencement.',
          'Reconnection of satellite dishes or recalibration of directional television antennae.',
        ],
        hiddenDamageProvisions:
          'Upon complete removal of existing roofing materials, the contractor shall inspect all substrate decking. If compromised decking, rotted rafters, or inadequate ventilation is discovered, work shall pause on that section and photo evidence will be provided immediately with an itemized change order.',
        warrantyTerms:
          tier === 'best'
            ? 'Lifetime (50-Year) Manufacturer System Warranty with 100% Non-Prorated Coverage plus a 10-Year Transferable Workmanship Guarantee.'
            : '50-Year Manufacturer Architectural Shingle Warranty accompanied by a 5-Year Contractor Workmanship Warranty against installation leaks.',
      };
    case 'plumbing':
      return {
        tradeId: 'plumbing',
        standardInclusions: [
          'Removal, disconnection, and EPA-compliant haul-away and disposal of existing water heater/fixture.',
          'Supply and installation of code-compliant water, gas, and relief valve connections.',
          'Installation of thermal expansion tank and emergency drain pan where mandated by local plumbing code.',
          'Pressurization, leak testing, and temperature verification before commissioning.',
        ],
        standardExclusions: [
          'Upgrades to home electrical service panel or dedicated circuit breaker if existing wiring is undersized.',
          'Replacement of corroded main building supply piping outside the immediate 3-foot connection zone.',
          'Remediation of pre-existing dry rot or mold within flooring or structural joists beneath equipment.',
        ],
        hiddenDamageProvisions:
          'If opening wall cavities or removing old fixtures reveals corroded galvanized piping or subfloor water damage, contractor will notify homeowner before making modifications.',
        warrantyTerms:
          'Full manufacturer equipment warranty (6 to 15 years per model) with 2-Year unconditional contractor installation guarantee.',
      };
    case 'hvac':
      return {
        tradeId: 'hvac',
        standardInclusions: [
          'Safe recovery and EPA-compliant reclamation of existing system refrigerant.',
          'Placement of new outdoor condenser on heavy-duty vibration-dampening composite pad.',
          'Deep nitrogen pressure testing and evacuation of refrigerant lines to sub-500 microns before charging.',
          'New digital programmable/smart thermostat setup and airflow static pressure balance testing.',
        ],
        standardExclusions: [
          'Replacement of inaccessible in-wall line sets unless explicit flush and pressure hold fails.',
          'Modification or enlargement of undersized supply/return branch ductwork behind finished drywall.',
          'High-voltage electrical service panel expansions if existing service is below equipment minimum ampacity.',
        ],
        hiddenDamageProvisions:
          'Existing refrigerant line sets will be pressure-tested with dry nitrogen. If hidden leaks within building cavities are identified, alternate line set routing will be quoted as a supplemental change order.',
        warrantyTerms:
          '10-Year Manufacturer Parts Limited Warranty plus a 2-Year Contractor Workmanship & Labor Guarantee.',
      };
    default:
      return {
        tradeId,
        standardInclusions: [
          'All labor, materials, and standard equipment necessary to complete the specified scope of work.',
          'Protection of adjacent surfaces with clean drop cloths and plastic sheeting.',
          'Daily broom clean of active job site and complete debris haul-off upon completion.',
        ],
        standardExclusions: [
          'Unforeseen hidden structural damage, hazardous materials (lead/asbestos), or concealed code violations.',
          'Permit fees and municipal engineering stamps unless explicitly itemized in the quote.',
        ],
        hiddenDamageProvisions:
          'Contractor shall promptly notify client upon discovery of any concealed structural, plumbing, or electrical defect prior to proceeding with affected work.',
        warrantyTerms: '1-Year Standard Contractor Workmanship Warranty on all installed assemblies and labor.',
      };
  }
}

// -----------------------------------------------------------------------------
// 8. Package Calculations by Dimensions (Dynamic Estimating)
// -----------------------------------------------------------------------------

export function calculateTradeDimensionPackage(params: {
  tradeId: string;
  squareFeet?: number;
  linearFeet?: number;
  unitCount?: number;
  pitchFactor?: number;
  tier?: 'good' | 'better' | 'best';
  stateCode?: string;
  hourlyRate?: number;
}) {
  const {
    tradeId,
    squareFeet = 0,
    linearFeet = 0,
    unitCount = 0,
    pitchFactor = 1.0,
    tier = 'better',
    stateCode,
    hourlyRate = 75,
  } = params;

  let baseUnits = 1;
  if (squareFeet > 0) {
    baseUnits = squareFeet;
  } else if (linearFeet > 0) {
    baseUnits = linearFeet;
  } else if (unitCount > 0) {
    baseUnits = unitCount;
  }

  const proposal = calculateMultiTierProposal({
    tradeId,
    dimensionUnits: baseUnits,
    hourlyLaborRate: hourlyRate,
    stateOrRegion: stateCode,
    pitchMultiplier: pitchFactor,
  });

  const selectedTier = proposal.tiers[tier];
  const safetyManifest = generateTradeSafetyAndToolManifest(tradeId);
  const scopeContract = generateTradeScopeContract(tradeId, tier);

  return {
    proposal,
    selectedTier,
    safetyManifest,
    scopeContract,
  };
}
