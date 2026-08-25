export interface Article {
  id: string;
  title: string;
  readTime: string;
  category: string;
  content: string;
}

export interface KnowledgeCategory {
  id: string;
  topic: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  count: string;
  articles: Article[];
}

export interface TradeQuoteTier {
  name: string;
  price: string;
  badge?: string;
  features: string[];
}

export interface TradeLineItem {
  name: string;
  qty: string;
  rate: string;
  total: string;
  category: 'Labor' | 'Materials' | 'Permit' | 'Equipment';
}

export interface TradeWorkflowDetail {
  title: string;
  desc: string;
  formulaOrClause: string;
  actionLabel: string;
  actionUrl: string;
}

export interface TradePlaybook {
  id: string;
  name: string;
  tradeSlug: string;
  icon: string;
  badge: string;
  headline: string;
  description: string;
  depositTerms: string;
  multiplierNotes: string;
  tiers: TradeQuoteTier[];
  sampleLineItems: TradeLineItem[];
  keyWorkflows: TradeWorkflowDetail[];
}

export interface VideoPlaybook {
  id: string;
  title: string;
  duration: string;
  category: string;
  thumbnailGradient: string;
  summary: string;
  keySteps: string[];
  relatedGuideUrl: string;
}

export interface DownloadableTemplate {
  id: string;
  name: string;
  fileFormat: string;
  fileSize: string;
  description: string;
  downloadsCount: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export const TRADE_PLAYBOOKS: TradePlaybook[] = [
  {
    id: 'plumbing',
    name: 'Plumbing & HVAC',
    tradeSlug: 'plumbers',
    icon: 'Wrench',
    badge: 'Popular for Service & Repair',
    headline: 'Emergency Dispatch & Tiered Fixture Replacements',
    description: 'Master fast on-truck dispatch, after-hours emergency call multipliers, and multi-tier water heater replacement proposals.',
    depositTerms: '50% deposit on equipment orders > $1,000; balance due upon installation.',
    multiplierNotes: '1.5x dispatch multiplier for weekends & calls after 6:00 PM.',
    tiers: [
      {
        name: 'Standard Tank (Good)',
        price: '$1,850',
        features: [
          '50-Gallon Atmospheric Gas Water Heater',
          'Standard 6-Year Tank & Parts Warranty',
          'Thermal Expansion Tank & Ball Valve Replacement',
          'Complete Haul-Away of Old Unit'
        ]
      },
      {
        name: 'Hybrid Heat Pump (Better)',
        price: '$2,850',
        badge: 'Most Popular',
        features: [
          '50-Gallon Hybrid Electric Heat Pump (4.0 UEF)',
          '10-Year Comprehensive Warranty',
          'Qualifies for $900+ Utility & Inflation Reduction Act Rebates',
          'Up to $330/Year in Electrical Energy Savings'
        ]
      },
      {
        name: 'Tankless Continuous (Best)',
        price: '$4,400',
        badge: 'Platinum Lifetime',
        features: [
          'Condensing Tankless Unit (199k BTU / 9.8 GPM)',
          '15-Year Heat Exchanger Warranty',
          'Continuous Endless Hot Water with Built-In Recirculation',
          'Space-Saving Wall-Mounted Footprint'
        ]
      }
    ],
    sampleLineItems: [
      { name: '50-Gal Hybrid Heat Pump Water Heater', qty: '1 unit', rate: '$1,650.00', total: '$1,650.00', category: 'Materials' },
      { name: 'Master Plumber Installation & Retrofit Labor', qty: '4.5 hrs', rate: '$210.00/hr', total: '$945.00', category: 'Labor' },
      { name: 'Thermal Expansion Tank & Brass Full-Port Ball Valves', qty: '1 kit', rate: '$185.00', total: '$185.00', category: 'Materials' },
      { name: 'Municipality Plumbing Inspection Permit Pass-Through', qty: '1 permit', rate: '$70.00', total: '$70.00', category: 'Permit' }
    ],
    keyWorkflows: [
      {
        title: 'Emergency After-Hours Multiplier',
        desc: 'Auto-adjust dispatch fees by 1.5x on weekends or after 6 PM.',
        formulaOrClause: 'Emergency Rate = Standard Dispatch Fee ($149) × 1.50 = $223.50. Applied automatically for calls received between 6:00 PM and 7:00 AM or on weekends.',
        actionLabel: 'View Pricing Guide',
        actionUrl: '/resources/markup-vs-margin-calculator-guide'
      },
      {
        title: 'Water Heater Good/Better/Best',
        desc: 'Standard Tank (Good) vs Hybrid Heat Pump (Better) vs Tankless Lifetime (Best).',
        formulaOrClause: '3-Tier presentation lifts average replacement revenue by +38%. Position Option 2 as the Recommended energy-saving tier.',
        actionLabel: 'View Quoting Playbook',
        actionUrl: '/resources/good-better-best-quoting-guide'
      },
      {
        title: 'Camera Inspection Video Attachments',
        desc: 'Attach drain camera MP4 clips directly to homeowner estimate links.',
        formulaOrClause: 'Direct cloud video upload links to client estimate URL. Homeowners approve root-intrusion line items with visual evidence.',
        actionLabel: 'Explore Plumbing Trade',
        actionUrl: '/for/plumbers'
      }
    ]
  },
  {
    id: 'roofing',
    name: 'Roofing & Siding',
    tradeSlug: 'roofers',
    icon: 'Home',
    badge: 'High-Ticket Remodeling',
    headline: 'Multi-Square Estimation & Drone Photo Proposals',
    description: 'Calculate pitch multipliers, waste factors (10–15%), architectural shingle upgrade packages, and insurance deductible workflows.',
    depositTerms: '50% material deposit upon contract signing; 50% upon completion.',
    multiplierNotes: '10% waste factor for gable roofs; 15% waste factor for hip & valley designs.',
    tiers: [
      {
        name: 'Architectural 30-Yr (Good)',
        price: '$9,800',
        features: [
          '30-Year Laminated Architectural Shingles',
          'Synthetic Breathable Underlayment',
          'Aluminum Drip Edge & Starter Shingle Strip',
          'Full Magnetic Nail Sweep & Ground Cleanup'
        ]
      },
      {
        name: 'Lifetime HD System (Better)',
        price: '$13,500',
        badge: 'Recommended',
        features: [
          '50-Year High-Definition Lifetime Shingles',
          'Ice & Water Leak Barrier (3 courses on all eaves & valleys)',
          'Continuous Ridge Vent Ventilation System',
          'Transferable 50-Year Manufacturer System Warranty'
        ]
      },
      {
        name: 'Standing Seam Metal (Best)',
        price: '$19,200',
        badge: 'Maximum Protection',
        features: [
          '24-Gauge Concealed Fastener Standing Seam Metal Panels',
          'Class 4 Impact Resistance (Lowers insurance premiums)',
          '50-Year Kynar 500 Fade & Corrosion Warranty',
          '140 MPH Extreme Wind Uplift Certification'
        ]
      }
    ],
    sampleLineItems: [
      { name: 'Tear-Off Existing 1-Layer Shingles & Disposal', qty: '28 squares', rate: '$105.00/sq', total: '$2,940.00', category: 'Labor' },
      { name: 'Lifetime HD Architectural Shingle Bundles (12% waste included)', qty: '95 bundles', rate: '$58.00/bdl', total: '$5,510.00', category: 'Materials' },
      { name: 'Self-Adhering Ice & Water Protection Barrier (Valleys & Eaves)', qty: '3 rolls', rate: '$145.00/roll', total: '$435.00', category: 'Materials' },
      { name: 'Continuous Ridge Venting System & Lead Pipe Boots', qty: '1 set', rate: '$615.00', total: '$615.00', category: 'Materials' }
    ],
    keyWorkflows: [
      {
        title: 'Square & Pitch Calculator',
        desc: 'Enter total square footage and pitch slope to instantly calculate bundles & underlayment.',
        formulaOrClause: 'Total Squares = (Footprint Sq Ft × Pitch Factor [e.g. 1.15 for 6/12]) ÷ 100 × (1 + Waste Factor [0.12]). Each square requires 3 shingle bundles.',
        actionLabel: 'Calculate Roof Margin',
        actionUrl: '/resources/markup-vs-margin-calculator-guide'
      },
      {
        title: '30-Year vs 50-Year Shingle Tiers',
        desc: 'Present Architectural (Good), Lifetime Designer (Better), and Standing Seam Metal (Best).',
        formulaOrClause: 'Give homeowners confidence in material longevity while unlocking higher-margin premium underlayment and ridge cap upgrades.',
        actionLabel: 'Quoting Strategy Guide',
        actionUrl: '/resources/good-better-best-quoting-guide'
      },
      {
        title: 'Drone Inspection Photo Carousels',
        desc: 'Embed before/after roof leak photos in the client-facing digital quote.',
        formulaOrClause: 'Attach high-res aerial roof photos into digital estimates to document storm damage and missing flashing for homeowners and insurance adjusters.',
        actionLabel: 'Explore Roofing Trade',
        actionUrl: '/for/roofers'
      }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical & Solar',
    tradeSlug: 'electricians',
    icon: 'Zap',
    badge: 'Precision Permitting & Panels',
    headline: 'Panel Upgrades, EV Chargers & Permit Line Items',
    description: 'Quote 200A service panel upgrades, Level 2 EV charger installations, and pass-through municipality permit fees cleanly.',
    depositTerms: '50% upfront deposit on panel gear & charging units; 50% upon final municipal inspection.',
    multiplierNotes: 'Wire run distance brackets: Base up to 25ft; +$14/ft for runs exceeding 25ft.',
    tiers: [
      {
        name: '200A Panel Swap (Good)',
        price: '$2,400',
        features: [
          '200-Amp Main Breaker Panel with Copper Bus Bar',
          'New Dual Grounding Electrode System (8ft Ground Rods)',
          'Whole-House Electrical Code Circuit Labeling',
          'Township Electrical Permit & Inspection Coordination'
        ]
      },
      {
        name: 'Panel + Level 2 EV (Better)',
        price: '$3,800',
        badge: 'Recommended',
        features: [
          '200A Main Panel Upgrade + Whole-Home Surge Protector (Type 2)',
          'Dedicated 50A / 240V Level 2 EV Charger Circuit in Garage',
          'NEMA 14-50 Industrial Receptacle or Hardwired Station',
          '10-Year Workmanship & Breaker Warranty'
        ]
      },
      {
        name: 'Smart Energy + Backup (Best)',
        price: '$6,900',
        badge: 'Platinum Resilience',
        features: [
          'Smart Controllable Load Center with App Circuit Monitoring',
          '50A Generator Inlet Interlock Kit with Outdoor Power Inlet Box',
          'Dual Level 2 Fast Charger Capacity',
          'Zero-Downtime Whole-Home Power Monitoring'
        ]
      }
    ],
    sampleLineItems: [
      { name: '200-Amp 40-Space Outdoor Meter/Load Center Combo', qty: '1 unit', rate: '$1,250.00', total: '$1,250.00', category: 'Materials' },
      { name: 'Master Licensed Electrician Panel Wiring & Service Re-attachment', qty: '6.0 hrs', rate: '$225.00/hr', total: '$1,350.00', category: 'Labor' },
      { name: 'Level 2 EV 50A Circuit (6/3 NM-B Wire + Industrial Receptacle)', qty: '35 ft', rate: '$18.00/ft', total: '$630.00', category: 'Labor' },
      { name: 'Township Electrical Plan Review & Permit Pass-Through', qty: '1 permit', rate: '$140.00', total: '$140.00', category: 'Permit' }
    ],
    keyWorkflows: [
      {
        title: '200A Service Upgrade Tiers',
        desc: 'Main breaker panel swap vs whole-home surge protection vs battery backup.',
        formulaOrClause: 'Bundle surge protection and EV pre-wiring into Option 2 to increase average electrician project size from $2,400 to $3,800+.',
        actionLabel: 'View Quoting Playbook',
        actionUrl: '/resources/good-better-best-quoting-guide'
      },
      {
        title: 'Municipality Permit Line Items',
        desc: 'Add non-taxable town permit pass-through line items that calculate automatically.',
        formulaOrClause: 'Mark municipality permit fees as non-taxable direct pass-through line items so material/labor tax calculations stay clean.',
        actionLabel: 'Explore Electrician Features',
        actionUrl: '/for/electricians'
      },
      {
        title: 'EV Charger Load Calculation',
        desc: 'Include wire run distance brackets (up to 25ft, 50ft, 100ft) with upfront materials.',
        formulaOrClause: 'Load Capacity Formula: Continuous load must not exceed 80% of circuit rating (40A continuous charging on a 50A dedicated breaker).',
        actionLabel: 'View Estimator Tool',
        actionUrl: '/tools/estimate-generator'
      }
    ]
  },
  {
    id: 'landscaping',
    name: 'Landscaping & Tree Care',
    tradeSlug: 'landscapers',
    icon: 'Trees',
    badge: 'Recurring Maintenance & Hardscaping',
    headline: 'Recurring Service Agreements & Hardscape Deposits',
    description: 'Automate weekly/bi-weekly lawn maintenance billing, seasonal spring/fall cleanups, and 50% upfront patio material deposits.',
    depositTerms: 'Recurring contracts: Auto-charged 1st of month. Hardscapes: 50% upfront stone deposit.',
    multiplierNotes: 'Tree hazard multiplier: 1.3x for proximity to overhead utility lines or roofs.',
    tiers: [
      {
        name: 'Weekly Lawn Care (Good)',
        price: '$260/mo',
        features: [
          'Weekly Precision Mowing, String Trimming & Edging',
          'Hard Surface Debris Blow-Off (Driveways & Walkways)',
          'Bi-Weekly Weed Control in Mulch Beds',
          'Card-on-File Automated Monthly Invoicing'
        ]
      },
      {
        name: 'Full-Season Elite (Better)',
        price: '$480/mo',
        badge: 'Best Value Plan',
        features: [
          'Weekly Mowing + Spring & Fall Property Cleanups',
          'Double-Shredded Hardwood Mulch Delivery & Install (Up to 5 yds)',
          '5-Step Fertilizer & Pre-Emergent Weed Program',
          'Fall Core Aeration & Premium Sun/Shade Overseeding'
        ]
      },
      {
        name: 'Paver Patio & Outdoor Living (Best)',
        price: '$14,500',
        badge: 'Hardscape Build',
        features: [
          '450 sq ft Interlocking Paver Patio with Polymeric Sand',
          '6-Inch Compacted Crushed Aggregate Base (Zero Settling)',
          'Built-In Fire Pit Kit with Matching Coping Stones',
          '5-Year Hardscape Craftsmanship Guarantee'
        ]
      }
    ],
    sampleLineItems: [
      { name: 'Commercial Paver Stones & Wall Blocks (450 sq ft)', qty: '6 pallets', rate: '$680.00/plt', total: '$4,080.00', category: 'Materials' },
      { name: 'Excavation, Soil Disposal & Base Compaction', qty: '18 hrs', rate: '$140.00/hr', total: '$2,520.00', category: 'Labor' },
      { name: 'Crushed Dense Aggregate Base & Washed Sand Bedding', qty: '12 tons', rate: '$65.00/ton', total: '$780.00', category: 'Materials' },
      { name: 'Polymeric Joint Sanding, Edge Restraints & Final Seal', qty: '1 package', rate: '$850.00', total: '$850.00', category: 'Labor' }
    ],
    keyWorkflows: [
      {
        title: 'Seasonal Recurring Contracts',
        desc: 'Set monthly auto-invoicing from April to November with card-on-file billing.',
        formulaOrClause: 'Monthly Subscription Amount = (Total Season Visits [28] × Per-Visit Rate [$65] + Cleanups [$800]) ÷ 8 Equal Monthly Payments = $327.50/mo.',
        actionLabel: 'Payment Plan Playbook',
        actionUrl: '/resources/deposits-and-payment-plans'
      },
      {
        title: 'Hardscape Paver Square Footage',
        desc: 'Calculate base gravel, sand bedding, and paver stone quantities with built-in labor rates.',
        formulaOrClause: 'Base Volume: Area (sq ft) × Depth (0.5 ft) ÷ 27 = Cubic Yards of Dense Grade Aggregate required for frost-resistant base.',
        actionLabel: 'Explore Landscaper Features',
        actionUrl: '/for/landscapers'
      },
      {
        title: 'Tree Removal Hazard Multiplier',
        desc: 'Quote crane access, stump grinding, and limb clearance as modular optional add-ons.',
        formulaOrClause: 'Modular add-on selections empower customers to add stump grinding (+$250) or wood chipping (+$180) during digital quote sign-off.',
        actionLabel: 'View Estimator Tool',
        actionUrl: '/tools/estimate-generator'
      }
    ]
  },
  {
    id: 'general',
    name: 'General Contracting',
    tradeSlug: 'remodelers',
    icon: 'Hammer',
    badge: 'Milestone & Remodeling Billing',
    headline: 'Milestone Invoicing (50/40/10) & Change Orders',
    description: 'Structure large-scale bathroom and kitchen remodels with compliant milestone deposit schedules and 1-click change order sign-offs.',
    depositTerms: '50% upon signing (materials); 40% rough-in completion; 10% final punch list sign-off.',
    multiplierNotes: '1-click electronic change order addendums with customer e-signature.',
    tiers: [
      {
        name: 'Essential Bathroom Refresh (Good)',
        price: '$14,500',
        features: [
          'Prefab Acrylic Tub/Shower Surround & Single Vanity',
          'Waterproof Luxury Vinyl Plank (LVP) Flooring',
          'New Moen Fixtures, GFCI Outlets & LED Recessed Lighting',
          'Fresh Moisture-Resistant Paint & Moldings'
        ]
      },
      {
        name: 'Custom Tile Walk-In Suite (Better)',
        price: '$26,500',
        badge: 'Recommended',
        features: [
          'Custom Tiled Walk-In Shower with Built-In Bench & Recessed Niche',
          'Schluter-Kerdi 100% Waterproof Membrane System',
          'Double Quartz Vanity with Undermount Sinks & Brushed Nickel Trim',
          'Heated Electric Floor System with Programmable Thermostat'
        ]
      },
      {
        name: 'Luxury Spa Master Retreat (Best)',
        price: '$44,000',
        badge: 'Platinum Renovation',
        features: [
          'Zero-Entry Curbless Shower with Frameless Glass Enclosure',
          'Freestanding Soaking Tub with Floor-Mounted Filler',
          'Large-Format Calacatta Porcelain Tile (Floor to Ceiling)',
          'Smart LED Mirror, Custom Cabinetry & Dual Showerheads'
        ]
      }
    ],
    sampleLineItems: [
      { name: 'Complete Demolition, Haul-Off & Subfloor Preparation', qty: '1 job', rate: '$2,200.00', total: '$2,200.00', category: 'Labor' },
      { name: 'Schluter Waterproofing & Floor-to-Ceiling Tile Installation', qty: '220 sq ft', rate: '$42.00/sq ft', total: '$9,240.00', category: 'Labor' },
      { name: '60-Inch Double Quartz Top Vanity & Faucet Trim Kits', qty: '1 set', rate: '$3,400.00', total: '$3,400.00', category: 'Materials' },
      { name: 'Rough-In Plumbing & Electrical Alterations with Town Inspection', qty: '1 package', rate: '$2,850.00', total: '$2,850.00', category: 'Labor' }
    ],
    keyWorkflows: [
      {
        title: '50/40/10 Milestone Billing',
        desc: 'Collect 50% deposit on contract signing, 40% upon rough-in completion, 10% final punch list.',
        formulaOrClause: 'Payment 1: 50% upfront to order cabinetry & custom stone ($13,250). Payment 2: 40% upon passing plumbing/electrical rough-in ($10,600). Payment 3: 10% upon final punch list sign-off ($2,650).',
        actionLabel: 'Deposit Structure Guide',
        actionUrl: '/resources/deposits-and-payment-plans'
      },
      {
        title: 'Mobile Change Order Signatures',
        desc: 'Generate a 1-page extra work authorization with instant homeowner e-signature on site.',
        formulaOrClause: 'Homeowners digitally sign unforeseen scope additions (e.g. subfloor rot repair +$1,200) from their mobile phone before extra work starts.',
        actionLabel: 'Download Change Order Form',
        actionUrl: '#contractor-templates'
      },
      {
        title: 'Subcontractor Lien Waiver Receipts',
        desc: 'Generate unconditional progress lien waivers upon payment receipt for banks and lenders.',
        formulaOrClause: 'Automated lien waiver PDFs generate with legal property descriptions and clearance timestamps upon invoice payment.',
        actionLabel: 'Explore Remodeler Trade',
        actionUrl: '/for/remodelers'
      }
    ]
  }
];

export const VIDEO_PLAYBOOKS: VideoPlaybook[] = [
  {
    id: 'vid-tiered-quoting',
    title: 'Building a 3-Tier "Good / Better / Best" Quote on Mobile',
    duration: '1:15',
    category: 'Instant Quoting',
    thumbnailGradient: 'linear-gradient(135deg, #0e1622 0%, #1e293b 100%)',
    summary: 'Watch how to create an interactive 3-option estimate on your phone in under 60 seconds from the jobsite truck.',
    keySteps: [
      '1. Open Quote Builder on phone and enable Multi-Tier mode',
      '2. Select Essential, Recommended Pro, and Platinum Lifetime options',
      '3. Enter material costs and watch profit margin compute automatically',
      '4. Send via 1-click SMS for instant client e-signature'
    ],
    relatedGuideUrl: '/resources/good-better-best-quoting-guide'
  },
  {
    id: 'vid-stripe-deposits',
    title: 'Collecting 50% Material Deposits with Apple Pay',
    duration: '0:48',
    category: 'Payments & Stripe',
    thumbnailGradient: 'linear-gradient(135deg, #101c2c 0%, #172a3a 100%)',
    summary: 'See how homeowners receive an SMS link, select their package, sign digitally, and pay instant deposits via 1-click Apple Pay.',
    keySteps: [
      '1. Client taps SMS quote link on iPhone or Android',
      '2. Selects package tier and optional add-ons',
      '3. E-signs with finger on screen',
      '4. Taps Apple Pay to submit 50% upfront deposit directly to your bank'
    ],
    relatedGuideUrl: '/resources/deposits-and-payment-plans'
  },
  {
    id: 'vid-custom-domain',
    title: 'Connecting Your GoDaddy / Squarespace Domain in 2 Mins',
    duration: '1:32',
    category: 'AI Website Builder',
    thumbnailGradient: 'linear-gradient(135deg, #181c24 0%, #202b36 100%)',
    summary: 'Step-by-step walkthrough of adding an A record (76.76.21.21) and CNAME to deploy your contractor AI website live.',
    keySteps: [
      '1. Open GoDaddy, Namecheap, or Squarespace DNS management',
      '2. Add A Record pointing @ to 76.76.21.21',
      '3. Add CNAME Record pointing www to cname.letsgetquoted.com',
      '4. Automatic SSL certificates provision in under 60 seconds'
    ],
    relatedGuideUrl: '/resources'
  },
  {
    id: 'vid-sms-followups',
    title: 'Configuring 24/7 Automated SMS Quote Follow-Ups',
    duration: '1:05',
    category: 'Two-Way SMS',
    thumbnailGradient: 'linear-gradient(135deg, #1c1424 0%, #2a1f3a 100%)',
    summary: 'How to automate polite text follow-ups at 24h and 72h that automatically stop the second a homeowner replies or signs.',
    keySteps: [
      '1. Navigate to Settings > Automated SMS Sequences',
      '2. Toggle on 24-Hour and 72-Hour Quote Follow-Up Triggers',
      '3. Customize wording or use verified contractor templates',
      '4. Sequence automatically cancels the moment homeowner approves or replies'
    ],
    relatedGuideUrl: '/resources/speed-to-lead-contractor-playbook'
  }
];

export const DOWNLOADABLE_TEMPLATES: DownloadableTemplate[] = [
  {
    id: 'tpl-lien-waiver',
    name: 'Residential Contractor Progress Lien Waiver Template',
    fileFormat: 'PDF & Word',
    fileSize: '142 KB',
    description: 'Standard conditional and unconditional lien waiver form for banks, homeowners, and general contractors.',
    downloadsCount: '4,280+'
  },
  {
    id: 'tpl-change-order',
    name: 'Extra Work Authorization & Change Order Agreement',
    fileFormat: 'PDF & Fillable',
    fileSize: '98 KB',
    description: 'Legally compliant 1-page form to document unforeseen scope changes, material additions, and updated totals.',
    downloadsCount: '3,650+'
  },
  {
    id: 'tpl-deposit-terms',
    name: '50% Upfront Material Deposit & Payment Schedule Addendum',
    fileFormat: 'PDF & DOCX',
    fileSize: '116 KB',
    description: 'Standard clause defining upfront non-refundable material orders, payment milestones, and late fee terms.',
    downloadsCount: '5,120+'
  }
];

export const KNOWLEDGE_BASE: KnowledgeCategory[] = [
  {
    id: 'cat-onboarding',
    topic: 'onboarding',
    title: 'Fast-Track Contractor Setup',
    desc: 'Get your company profile, tax rules, trade license, and branding configured in under 5 minutes.',
    icon: 'Rocket',
    color: '#6366f1',
    count: '8 Guides',
    articles: [
      {
        id: 'art-profile-setup',
        title: 'Configuring Company Info, Trade License & Logos',
        readTime: '3 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>Overview</h3>
          <p>Your company profile is used across all outgoing client estimates, PDF agreements, and AI landing pages. Ensuring accurate contact and licensing data boosts homeowner confidence and approval rates.</p>
          <div class="callout">
            <strong>Pro Tip:</strong> Upload a high-resolution PNG logo with a transparent background for the sharpest results on invoices and mobile quote views.
          </div>
          <h3>Step-by-Step Configuration</h3>
          <ol>
            <li>Navigate to <strong>Dashboard &gt; Settings &gt; Company Profile</strong>.</li>
            <li>Enter your registered Legal Business Name, Trade / Contractor License Number, and Insurance details.</li>
            <li>Set your primary business phone number (this will sync with your dedicated 10DLC automated business SMS number).</li>
            <li>Upload your company logo (recommended dimensions: 800x400px).</li>
            <li>Click <strong>Save &amp; Verify Profile</strong>.</li>
          </ol>
        `
      },
      {
        id: 'art-carrier-onboarding',
        title: '10DLC Carrier Brand & Campaign Verification Checklist',
        readTime: '4 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>Understanding 10DLC Compliance</h3>
          <p>Major US mobile carriers (AT&T, Verizon, T-Mobile) require all automated and two-way business texting systems to be registered with The Campaign Registry (TCR). We manage carrier compliance directly to ensure 99.9% SMS deliverability.</p>
          <div class="callout">
            <strong>Carrier Approval Timeline:</strong> Most contractor brands are verified within <strong>2 to 24 hours</strong> once EIN and business legal address are submitted.
          </div>
          <h3>Required Registration Details</h3>
          <ul>
            <li><strong>Exact Legal Name:</strong> Must match your IRS EIN document letter exactly.</li>
            <li><strong>Company EIN / Tax ID:</strong> 9-digit tax ID.</li>
            <li><strong>Physical Business Address:</strong> PO Boxes are rejected by telecom carriers.</li>
          </ul>
        `
      },
      {
        id: 'art-mobile-app-sync',
        title: 'Installing the Progressive Mobile Web App on iOS & Android',
        readTime: '2 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>One-Tap Field Access</h3>
          <p>Access jobs, dispatch notes, instant quote calculators, and customer calling from your truck without downloading a bloated app store binary.</p>
          <p><strong>On iPhone / iPad (Safari):</strong> Tap the <em>Share</em> icon and select <strong>Add to Home Screen</strong>.</p>
          <p><strong>On Android (Chrome):</strong> Tap the menu and select <strong>Install App</strong>.</p>
        `
      }
    ]
  },
  {
    id: 'cat-quoting',
    topic: 'quoting',
    title: 'Instant Quoting & Good/Better/Best Tiers',
    desc: 'Build multi-option proposals, interactive material selectors, and collect homeowner e-signatures on mobile.',
    icon: 'FileSpreadsheet',
    color: '#06b6d4',
    count: '14 Guides',
    articles: [
      {
        id: 'art-tier-builder',
        title: 'Creating 3-Tier "Good / Better / Best" Proposals',
        readTime: '4 min read',
        category: 'Instant Quoting',
        content: `
          <h3>Why Tiered Quoting Wins 38% Higher Revenue</h3>
          <p>Homeowners love having choices. By presenting three clear options, you eliminate price shopping against competitors.</p>
          <ol>
            <li>In your Quote Editor, toggle on <strong>Multi-Option Proposal</strong>.</li>
            <li>Set Option 1 as <em>Essential Fix</em>.</li>
            <li>Set Option 2 as <em>Recommended Pro Upgrade</em>.</li>
            <li>Set Option 3 as <em>Platinum Lifetime</em>.</li>
          </ol>
        `
      },
      {
        id: 'art-esignatures',
        title: 'Legally Binding Mobile E-Signatures & Quote Receipts',
        readTime: '3 min read',
        category: 'Instant Quoting',
        content: `
          <h3>How Quote E-Signatures Work</h3>
          <p>When a homeowner receives your digital quote link, they can review the itemized scope, select optional upgrades, and legally approve the proposal right from their phone — with no app download or account creation required.</p>
          <div class="callout">
            <strong>ESIGN &amp; UETA Compliant:</strong> Electronic signatures captured with clear intent, timestamping, and signer attribution are legally binding under the US federal ESIGN Act and state UETA laws.
          </div>
          <h3>What Is Recorded on Quote Acceptance</h3>
          <ul>
            <li><strong>Signer Legal Name:</strong> The full name provided by the client upon approval.</li>
            <li><strong>Signature Mark or Typed Name:</strong> Homeowners can draw their mark using a finger or stylus (stored as vector SVG paths) or type their legal name.</li>
            <li><strong>ISO Timestamp:</strong> The exact date and time of acceptance is permanently recorded on the job record and audit feed.</li>
            <li><strong>Snapshot of Agreed Pricing &amp; Add-ons:</strong> The accepted line items and upgrade selections are locked to the record so subsequent edits never quietly alter what was approved.</li>
          </ul>
          <h3>Print &amp; PDF Receipts</h3>
          <p>Both you and the homeowner can use <strong>Print or save as PDF</strong> at any time to generate a clean, formatted receipt containing the full scope of work, company header, and executed signature block.</p>
        `
      }
    ]
  },
  {
    id: 'cat-website',
    topic: 'website',
    title: 'AI Website Builder & Local SEO',
    desc: 'Deploy ultra-fast, high-converting contractor landing pages with built-in instant quote estimation widgets.',
    icon: 'Globe',
    color: '#10b981',
    count: '9 Guides',
    articles: [
      {
        id: 'art-custom-domain-dns',
        title: 'Connecting Your Custom Domain (GoDaddy, Squarespace, Cloudflare)',
        readTime: '3 min read',
        category: 'AI Website Builder',
        content: `
          <h3>Connecting Your Custom Domain</h3>
          <p>Add these DNS records in your domain registrar (GoDaddy, Squarespace, Cloudflare):</p>
          <ul>
            <li><strong>Type:</strong> <code>A</code> | <strong>Host:</strong> <code>@</code> | <strong>Value:</strong> <code>76.76.21.21</code></li>
            <li><strong>Type:</strong> <code>CNAME</code> | <strong>Host:</strong> <code>www</code> | <strong>Value:</strong> <code>cname.letsgetquoted.com</code></li>
          </ul>
        `
      }
    ]
  },
  {
    id: 'cat-sms',
    topic: 'sms',
    title: 'Two-Way SMS & Dedicated Phone',
    desc: 'Automated 24/7 quote follow-up sequences, missed-call text back, and two-way client chat.',
    icon: 'Smartphone',
    color: '#a855f7',
    count: '11 Guides',
    articles: [
      {
        id: 'art-automated-followups',
        title: 'Configuring Intelligent Multi-Step SMS Follow-Up Sequences',
        readTime: '3 min read',
        category: 'SMS & Business Phone',
        content: `
          <p>Automate polite text check-ins at 24 hours, 72 hours, and 5 days. When the customer replies or signs the quote, the sequence instantly halts.</p>
        `
      }
    ]
  },
  {
    id: 'cat-invoicing',
    topic: 'invoicing',
    title: 'Invoicing, Deposits & Stripe Payments',
    desc: 'Collect upfront material deposits, enable 1-click Apple Pay / Google Pay, and automate payouts.',
    icon: 'CreditCard',
    color: '#f59e0b',
    count: '10 Guides',
    articles: [
      {
        id: 'art-stripe-connect',
        title: 'Setting Up Stripe Connect for Next-Day Bank Payouts',
        readTime: '3 min read',
        category: 'Invoicing & Payments',
        content: `
          <p>Connect your business bank account through our secure Stripe integration. Funds clear directly to your account with zero holding periods.</p>
        `
      }
    ]
  },
  {
    id: 'cat-team',
    topic: 'team',
    title: 'Team Roles, Dispatch & Crew Routing',
    desc: 'Manage technician permissions, assign job tickets, track GPS dispatch, and share jobsite notes.',
    icon: 'Users',
    color: '#f43f5e',
    count: '7 Guides',
    articles: [
      {
        id: 'art-roles-permissions',
        title: 'Technician vs Sales Rep vs Admin Permission Tiers',
        readTime: '4 min read',
        category: 'Team & Dispatch',
        content: `
          <p>Technicians see assigned customer addresses and job notes, while overall company profit margins and monthly revenues remain restricted to Admins.</p>
        `
      }
    ]
  }
];

export const FAQS: FAQItem[] = [
  {
    question: 'How long does it take for 10DLC carrier brand registration to be approved?',
    answer: 'Most contractor brand registrations are approved within 2 to 24 hours once your EIN and legal business address are submitted.',
    category: 'sms'
  },
  {
    question: 'Can homeowners approve quotes and pay deposits directly from their phones?',
    answer: 'Yes! Homeowners receive a private link via SMS and email where they can choose tiers, sign digitally, and pay upfront deposits with Apple Pay or Credit Card.',
    category: 'quoting'
  },
  {
    question: 'Can I connect my own custom domain to my AI website?',
    answer: 'Absolutely. We provide free CDN hosting and automated SSL. Just point an A record to 76.76.21.21 and CNAME to cname.letsgetquoted.com.',
    category: 'website'
  },
  {
    question: 'How do automated SMS follow-ups know when to stop?',
    answer: 'The moment a customer replies with a text or digitally signs any quote tier, our real-time webhook immediately cancels all remaining scheduled follow-ups.',
    category: 'sms'
  },
  {
    question: 'Are credit card processing fees passed through or deductible?',
    answer: 'You can choose whether to absorb standard 2.9% + 30¢ credit card fees or automatically include a compliant cash discount / card surcharge at checkout.',
    category: 'invoicing'
  }
];
