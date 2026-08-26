import type { ServiceUnit } from './services';

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
  holiday_lighting: {
    id: 'holiday_lighting',
    name: 'Holiday Lighting & Displays',
    icon: '✨',
    description: 'Roofline lighting, commercial displays, wreaths, takedown, and storage.',
    items: [
      {
        name: 'Residential Front Roofline Package (Up to 150 LF)',
        description: 'Custom cut commercial grade C9 LED lights, gutter clips, power timer, installation, takedown, and off-season storage.',
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
        name: 'Off-Season Display Storage & Labeling',
        description: 'Careful takedown, dry packing, climate-controlled container storage, and inventory tagging.',
        unitPrice: 195,
        unitCost: 35,
        unit: 'job',
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
        description: 'Double-pass hollow tine core aeration followed by 5 lbs/1000 sqft premium Kentucky bluegrass/fescue seed blend.',
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
        description: 'Botanical essential oil blend (peppermint/cedar/garlic) safe for pollinators, pets, and ponds.',
        unitPrice: 115,
        unitCost: 28,
        unit: 'visit',
      },
      {
        name: 'Standing Water Larvicide Treatment',
        description: 'Bti microbial dunks and granules placed in birdbaths, gutters, and low-lying drainage zones.',
        unitPrice: 65,
        unitCost: 12,
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
