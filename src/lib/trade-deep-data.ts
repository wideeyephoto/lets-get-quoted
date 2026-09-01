// Deep definitive trade data for top 20 high-value contractor verticals (/for/[trade]).
// Contains interactive 3-tier quoting examples, 4-step field workflows, and
// trade-specific FAQs with schema markup support.

export type QuoteTier = {
  tierName: 'Good' | 'Better' | 'Best';
  label: string;
  total: number;
  deposit: number;
  depositLabel: string;
  badge?: string;
  items: { description: string; amount: number }[];
  highlight: string;
};

export type TradeQuotingExample = {
  projectTitle: string;
  scopeSummary: string;
  timeline: string;
  tiers: [QuoteTier, QuoteTier, QuoteTier];
  proTip: string;
};

export type WorkflowStep = {
  step: number;
  title: string;
  description: string;
  badge: string;
};

export type TradeFaqItem = {
  question: string;
  answer: string;
};

export type DefinitiveTradeData = {
  slug: string;
  heroKicker: string;
  sampleSubdomain: string;
  quoteExample: TradeQuotingExample;
  workflow: [WorkflowStep, WorkflowStep, WorkflowStep, WorkflowStep];
  faqs: TradeFaqItem[];
  industryBenchmark: {
    avgTicket: string;
    closeRateLift: string;
    hoursSavedWeekly: string;
  };
};

export const TOP_20_DEFINITIVE_TRADES: Record<string, DefinitiveTradeData> = {
  roofers: {
    slug: 'roofers',
    heroKicker: 'Complete Roofing Contractor Operating System',
    sampleSubdomain: 'summit-roofing.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Architectural Shingle Roof Replacement (28 Squares)',
      scopeSummary: 'Complete tear-off of 1 layer, synthetic underlayment, ice & water shield in valleys, replacement of rotten plywood decking, and lifetime architectural shingles.',
      timeline: '2-Day Complete Tear-off & Installation',
      tiers: [
        {
          tierName: 'Good',
          label: 'Standard Architectural',
          total: 10800,
          deposit: 3600,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Dependable GAF 30-Yr Architectural Shingles with standard manufacturer warranty.',
          items: [
            { description: 'Full tear-off of 28 squares existing shingles & haul away', amount: 2800 },
            { description: 'Ice & water barrier in all valleys, eaves, and pipe flashings', amount: 1400 },
            { description: 'GAF Timberline Natural Shadow architectural shingles + drip edge', amount: 5600 },
            { description: 'Ridge vent ventilation system & standard pipe boots', amount: 1000 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Storm Defense Plus',
          badge: 'Most Popular',
          total: 13200,
          deposit: 4400,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Upgraded GAF Timberline HDZ Class 3 Impact shingles, synthetic underlayment & 50-yr warranty.',
          items: [
            { description: 'Full tear-off, 3 sheets CDX plywood decking replacement included', amount: 3200 },
            { description: 'Double-layer ice & water shield in valleys and low-pitch transitions', amount: 1800 },
            { description: 'GAF Timberline HDZ Class 3 High-Definition shingles + copper drip edge', amount: 6800 },
            { description: 'High-flow Cobra ridge vent & bullet pipe flashings with lifetime seal', amount: 1400 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Executive Lifetime Armour',
          total: 16800,
          deposit: 5600,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Class 4 Impact Resistant Designer shingles, custom copper flashing, and transferable warranty.',
          items: [
            { description: 'Full tear-off, decking re-nailing, and 5 sheets 5/8" plywood replacement', amount: 3800 },
            { description: 'Full-deck premium breathable synthetic underlayment + self-adhering membrane', amount: 2400 },
            { description: 'GAF Grand Canyon Class 4 Impact Designer shingles (insurance discount eligible)', amount: 8800 },
            { description: 'Custom soldered copper valley pans, chimney step flashing & lifetime ridge cap', amount: 1800 },
          ],
        },
      ],
      proTip: 'Presenting Good/Better/Best roofing tiers lifts average ticket sizes by $2,400+ because 65% of homeowners upgrade from baseline 3-tab to architectural impact shingles.',
    },
    workflow: [
      {
        step: 1,
        title: 'Property Intel & 24/7 AI Scoping',
        description: 'Homeowners input their address. Property Intelligence automatically pulls roof square footage, pitch, and facet geometry while AI classifies storm damage urgency.',
        badge: 'Lead Intake',
      },
      {
        step: 2,
        title: 'Good / Better / Best Mobile Proposal',
        description: 'Assemble 3-tier proposals with pre-built shingle assemblies on your phone in under 2 minutes and text the interactive link to the homeowner.',
        badge: 'Tiered Quoting',
      },
      {
        step: 3,
        title: 'E-Sign & 33% Upfront Stripe Deposit',
        description: 'Homeowner chooses their shingle package, signs the digital contract, and pays the material deposit via Apple Pay before materials are ordered.',
        badge: 'Secure Payment',
      },
      {
        step: 4,
        title: 'Crew Job Feed & Automated Review',
        description: 'Crew uploads before/after tear-off photos. Final balance auto-charges to the card on file upon completion and triggers a 5-star Google review prompt.',
        badge: 'Completion',
      },
    ],
    faqs: [
      {
        question: 'How does Let’s Get Quoted help roofing contractors price for real profit?',
        answer: 'Let’s Get Quoted includes itemized cost catalog assemblies where you set your true square cost, waste factor (typically 10–15%), labor rates, and target gross margin. Rather than guessing a lump sum, every quote calculates exact material bundles and labor hours with real margin protections.',
      },
      {
        question: 'Can I collect staged progress payments for large roof replacements?',
        answer: 'Yes. You can structure payments into milestone draws (e.g. 33% upon signing to order shingles, 33% when materials drop on site, and 34% upon final completion walk-through). Payments are processed securely via Stripe Connect with direct bank payouts.',
      },
      {
        question: 'How does Property Intelligence calculate roof geometry?',
        answer: 'When a homeowner enters their address on your Let’s Get Quoted website, Property Intelligence instantly analyzes parcel satellite geometry, estimating total roof square footage, pitch steepness, and story count to help you scope the job before driving out.',
      },
      {
        question: 'Can I offer 0%-interest payment plans to homeowners on roof replacements?',
        answer: 'Yes. Let’s Get Quoted supports splitting approved quote balances into fixed, scheduled 0%-interest installment plans charged automatically to a tokenized credit card on file, helping homeowners approve $10,000+ replacements without hesitation.',
      },
      {
        question: 'How do I migrate my existing customer list from Jobber or AccuLynx?',
        answer: 'You can export your customer CSV from your current software and import it directly into Let’s Get Quoted under Dashboard > Clients > Import in less than 60 seconds with zero data loss.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$11,500',
      closeRateLift: '+38%',
      hoursSavedWeekly: '5.5 hrs',
    },
  },

  plumbers: {
    slug: 'plumbers',
    heroKicker: '24/7 Smart Intake & Emergency Plumbing Operating System',
    sampleSubdomain: 'apex-plumbing.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Tankless Water Heater Conversion & Gas Line Extension',
      scopeSummary: 'Removal and disposal of old 50-gal atmospheric tank, installation of high-efficiency Navien tankless unit, concentric direct venting, and expansion tank.',
      timeline: '1-Day Complete Conversion',
      tiers: [
        {
          tierName: 'Good',
          label: 'Standard 50-Gal Replacement',
          total: 2400,
          deposit: 600,
          depositLabel: '25% Booking Deposit',
          highlight: 'Standard 50-Gallon Atmospheric Gas Water Heater with 6-year tank warranty.',
          items: [
            { description: 'Removal and eco-friendly disposal of existing water heater', amount: 350 },
            { description: 'Bradford White 50-Gal atmospheric natural gas heater', amount: 1450 },
            { description: 'New brass ball valve, gas flex connector, and thermal expansion tank', amount: 600 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Navien High-Efficiency Tankless',
          badge: 'Most Popular',
          total: 4200,
          deposit: 1200,
          depositLabel: '30% Deposit Upon Signing',
          highlight: 'Navien NPE-240A2 condensing tankless unit (199k BTU) with endless hot water.',
          items: [
            { description: 'Tear-out of tank, 2" PVC concentric dual-pipe sidewall direct venting', amount: 950 },
            { description: 'Navien NPE-240A2 ultra high-efficiency condensing unit + lead-free isolation valves', amount: 2450 },
            { description: 'Gas supply line upgrade to 3/4" black iron and electrical outlet rough-in', amount: 800 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Whole-Home Tankless + Filtration',
          total: 5900,
          deposit: 1800,
          depositLabel: '30% Deposit Upon Signing',
          highlight: 'Navien tankless + commercial scale prevention filter, recirc pump, and Wi-Fi smart control.',
          items: [
            { description: 'Navien NPE-240A2 condensing tankless with built-in ComfortFlow recirc pump', amount: 2750 },
            { description: 'Whole-home anti-scale filtration system & dedicated condensate neutralizer', amount: 1550 },
            { description: 'Dedicated hot water recirc loop tie-in for instant hot water at every fixture', amount: 1600 },
          ],
        },
      ],
      proTip: 'Offering tankless conversions alongside standard tank replacements lifts plumbing revenue by 75% per water heater lead.',
    },
    workflow: [
      {
        step: 1,
        title: '24/7 AI Leak & Fixture Scoping',
        description: 'Homeowner submits photos of pipe leaks, water heater data plates, or drain clogs. AI decodes brand, fuel type, and urgency in under 3 seconds.',
        badge: 'Instant Triage',
      },
      {
        step: 2,
        title: 'Upfront Flat-Rate Proposal',
        description: 'Send mobile Good/Better/Best options from your saved price book directly to the homeowner’s phone with transparent diagnostic and repair pricing.',
        badge: 'Mobile Quoting',
      },
      {
        step: 3,
        title: 'Card-on-File Authorization',
        description: 'Homeowner approves the quote and pre-authorizes payment via Apple Pay or credit card, locking in their arrival window.',
        badge: 'Authorization',
      },
      {
        step: 4,
        title: 'Quick Stops Route Dispatch',
        description: 'Technician completes repair, takes completion photo, and taps "Charge Card on File". Quick Stops fills open afternoon gaps with nearby drain calls.',
        badge: 'Instant Payout',
      },
    ],
    faqs: [
      {
        question: 'How does Let’s Get Quoted handle emergency after-hours plumbing calls?',
        answer: 'Your website includes 24/7 AI Smart Intake that prompts homeowners for photos, asks if water is actively leaking or shut off, verifies their phone number via 1-tap SMS, and texts you instant HOT lead dispatch alerts with estimated job value.',
      },
      {
        question: 'Can I use flat-rate upfront pricing instead of hourly billing?',
        answer: 'Yes. Let’s Get Quoted includes a saved line-item catalog where you can build flat-rate assemblies (e.g. toilet rebuild, PRV replacement, water heater changeout, hydro-jetting) so technicians quote consistent numbers in seconds on site.',
      },
      {
        question: 'How does Route-Aware Quick Stops help plumbing businesses?',
        answer: 'When a technician finishes a repair 45 minutes early, Quick Stops automatically matches nearby homeowners along their driving route with same-day priority arrival windows, turning dead travel time into booked diagnostic revenue.',
      },
      {
        question: 'Does Let’s Get Quoted integrate with QuickBooks Online?',
        answer: 'Yes. Let’s Get Quoted syncs customers, itemized invoices, sales tax, and Stripe payments seamlessly into QuickBooks Online without manual double entry.',
      },
      {
        question: 'Can technicians take photos and collect signatures on mobile phones?',
        answer: 'Yes. The mobile interface allows technicians to photograph water heater serial plates, log model numbers, present tiered options, and collect digital customer signatures on any smartphone or tablet without clunky apps.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$1,850',
      closeRateLift: '+42%',
      hoursSavedWeekly: '6.0 hrs',
    },
  },

  hvac: {
    slug: 'hvac',
    heroKicker: 'Complete HVAC Quoting & Dispatch Operating System',
    sampleSubdomain: 'element-hvac.letsgetquoted.com',
    quoteExample: {
      projectTitle: '3-Ton High-Efficiency Heat Pump & Air Handler Changeout',
      scopeSummary: 'Tear-out of existing 10-SEER R-22 system, new 16+ SEER2 variable-speed heat pump, matching air handler, smart thermostat, and electrical disconnect.',
      timeline: '1-Day Complete Installation',
      tiers: [
        {
          tierName: 'Good',
          label: '14.3 SEER2 Standard Heat Pump',
          total: 7800,
          deposit: 2600,
          depositLabel: '33% Booking Deposit',
          highlight: 'Single-stage 14.3 SEER2 system with 10-year parts warranty. Reliable baseline cooling.',
          items: [
            { description: 'Refrigerant recovery, eco-disposal of old R-22 system, pad leveling', amount: 1200 },
            { description: '14.3 SEER2 Single-Stage Heat Pump Condenser & Multi-Speed Air Handler', amount: 5200 },
            { description: 'New digital programmable thermostat, disconnect box, and whip', amount: 1400 },
          ],
        },
        {
          tierName: 'Better',
          label: '16.5 SEER2 Two-Stage Inverter',
          badge: 'Most Popular',
          total: 10400,
          deposit: 3500,
          depositLabel: '33% Booking Deposit',
          highlight: 'Two-stage inverter compressor for quiet operation, humidity control, and energy rebate eligibility.',
          items: [
            { description: 'Full system removal, custom sheet metal plenum transitions & flush lineset', amount: 1800 },
            { description: '16.5 SEER2 Two-Stage High-Efficiency Inverter Heat Pump & Variable Air Handler', amount: 6800 },
            { description: 'Ecobee Smart Thermostat with remote room sensor & 10kW electric heat strip', amount: 1800 },
          ],
        },
        {
          tierName: 'Best',
          label: '20+ SEER2 Variable Ultra Quiet',
          total: 14200,
          deposit: 4700,
          depositLabel: '33% Booking Deposit',
          highlight: 'Variable-capacity communicating heat pump with whole-home air purification and 10-yr labor warranty.',
          items: [
            { description: 'Complete system tear-out, acoustic vibration isolation pads, new line set', amount: 2200 },
            { description: '20+ SEER2 Modulating Variable-Speed Inverter System with whisper-quiet fan', amount: 8900 },
            { description: 'MERV-13 Whole-Home Filtration, UV germicidal lamp & communicating smart control', amount: 3100 },
          ],
        },
      ],
      proTip: 'High-ticket HVAC changeouts close 40% faster when pairing Good/Better/Best options with 0%-interest monthly installment options.',
    },
    workflow: [
      {
        step: 1,
        title: 'Visual AI Nameplate Decoding',
        description: 'Homeowner submits outdoor condenser and indoor air handler photos. AI extracts tonnage (e.g. 36 = 3 Ton), refrigerant type, and system age automatically.',
        badge: 'Visual Diagnostics',
      },
      {
        step: 2,
        title: 'Multi-Option SEER2 Proposal',
        description: 'Select system packages from your price book (14 SEER2 vs 16 SEER2 vs 20 SEER2) and text a clean interactive proposal in seconds.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'E-Signature & Staged Deposit',
        description: 'Customer reviews energy savings, selects their preferred efficiency tier, and e-signs with a 33% equipment deposit via Stripe.',
        badge: 'E-Sign & Deposit',
      },
      {
        step: 4,
        title: 'Seasonal Tune-Up Rebooking',
        description: 'System automatically schedules pre-season spring AC and fall furnace tune-ups on recurring service agreements with stored card-on-file billing.',
        badge: 'Recurring Revenue',
      },
    ],
    faqs: [
      {
        question: 'How does Visual AI decode HVAC nameplates and tonnage?',
        answer: 'When a customer uploads a photo of their outdoor unit label, our AI reads the model number string to decode nominal tonnage (e.g. 24 = 2-Ton, 36 = 3-Ton, 48 = 4-Ton), refrigerant classification (R-410A vs R-22), and estimated manufacture year, giving you instant diagnostic intelligence.',
      },
      {
        question: 'Can I set up recurring seasonal maintenance agreements (Spring/Fall)?',
        answer: 'Yes. Let’s Get Quoted lets you offer recurring maintenance agreements that auto-bill monthly or semi-annually on Stripe, keeping your schedule full during shoulder seasons.',
      },
      {
        question: 'Can I present Good, Better, and Best efficiency packages side-by-side?',
        answer: 'Yes. You can build multi-tier quotes (e.g., Standard 14 SEER2, Premium 16 SEER2 Inverter, and Ultimate 20 SEER2 Variable Speed with whole-home air purification) allowing homeowners to select their preferred package and sign online.',
      },
      {
        question: 'How much does Let’s Get Quoted cost compared to ServiceTitan?',
        answer: 'ServiceTitan charges $398 to $1,000+ per technician per month plus mandatory $5,000 onboarding fees. Let’s Get Quoted Flex plan costs $0/month base with a transparent 1.25% fee paid only when you get paid, saving independent shops $6,000+ annually.',
      },
      {
        question: 'How does Let’s Get Quoted handle equipment warranty and serial number tracking?',
        answer: 'Technicians can snap photos of installed condenser and air handler data plates upon commissioning. Photos and serial numbers attach directly to the digital job record for future warranty verification.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$9,200',
      closeRateLift: '+36%',
      hoursSavedWeekly: '7.0 hrs',
    },
  },

  electricians: {
    slug: 'electricians',
    heroKicker: 'Modern Electrical Contractor CRM, Quoting & EV Scoping',
    sampleSubdomain: 'volt-electric.letsgetquoted.com',
    quoteExample: {
      projectTitle: '200A Main Service Panel Upgrade & Level 2 EV Charger',
      scopeSummary: 'Replacement of obsolete 100A panel with 200A 40-space Square D QO panel, utility meter base coordination, whole-home surge, and 50A EV circuit.',
      timeline: '1-Day Complete Service Heavy-Up',
      tiers: [
        {
          tierName: 'Good',
          label: '200A Service Panel Heavy-Up',
          total: 2850,
          deposit: 950,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Square D 200A Main Breaker Panel, utility meter base, and city electrical permit inspection.',
          items: [
            { description: 'Utility service disconnect coordination, city permit & inspection filing', amount: 450 },
            { description: 'Square D QO 200A 40-Space main breaker panel & whole-home grounding electrodes', amount: 1950 },
            { description: 'Breaker consolidation, circuit labeling, and arc-fault breaker testing', amount: 450 },
          ],
        },
        {
          tierName: 'Better',
          label: '200A Panel + Level 2 EV Charger',
          badge: 'Most Popular',
          total: 3950,
          deposit: 1300,
          depositLabel: '33% Deposit Upon Signing',
          highlight: '200A Panel upgrade + dedicated 50A NEMA 14-50 EV charger outlet in garage & whole-home surge.',
          items: [
            { description: 'Square D 200A panel heavy-up, meter base upgrade & dual ground rods', amount: 2350 },
            { description: 'Type 2 Whole-Home Surge Protective Device (SPD) with warranty', amount: 450 },
            { description: 'Dedicated 50A 240V EV circuit run (up to 35ft conduit) + industrial NEMA 14-50 receptacle', amount: 1150 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Smart Panel + Hardwired EV + Generator Interlock',
          total: 5800,
          deposit: 1900,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Leviton Smart Breaker Panel with circuit energy monitoring, 48A hardwired EV charger & generator interlock.',
          items: [
            { description: 'Leviton Smart 200A Panel with Wi-Fi smart circuit monitoring module', amount: 3200 },
            { description: 'Hardwired 48A EV Charger installation (60A breaker, fastest Level 2 charging)', amount: 1400 },
            { description: 'Generator mechanical interlock kit + exterior 30A power inlet box for backup power', amount: 1200 },
          ],
        },
      ],
      proTip: 'Bundling whole-home surge protection and EV charging with panel upgrade quotes increases average electrical invoice totals by $1,100.',
    },
    workflow: [
      {
        step: 1,
        title: 'Electrical Panel Photo Scoping',
        description: 'Homeowners photograph their breaker panel with door open. AI decodes brand (Square D, Eaton, Siemens) and flags obsolete hazards (Stab-Lok, Zinsco).',
        badge: 'Photo Triage',
      },
      {
        step: 2,
        title: 'Instant Panel & EV Proposal',
        description: 'Send itemized 3-tier proposals including permit fees, surge protection, and EV circuit options from your phone in under 2 minutes.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'E-Sign & Permitting Deposit',
        description: 'Customer accepts quote on their phone, signs digital contract, and pays deposit to fund city permit fees and materials.',
        badge: 'Digital E-Sign',
      },
      {
        step: 4,
        title: 'Quick Stops Diagnostic Dispatch',
        description: 'Electricians complete service call and use Quick Stops to take same-day outlet and breaker troubleshooting calls nearby.',
        badge: 'Route Fill',
      },
    ],
    faqs: [
      {
        question: 'How does AI intake identify obsolete electrical panels (Federal Pacific / Zinsco)?',
        answer: 'Our Visual AI model inspects uploaded panel photos for known dangerous brands (Federal Pacific Stab-Lok, Zinsco, Challenger, Sylvania) and flags them automatically as high-urgency replacement recommendations for safety and insurance compliance.',
      },
      {
        question: 'Can I include city permit fees and utility coordination in my quote?',
        answer: 'Yes. Let’s Get Quoted’s saved cost catalog allows you to add permit administration, utility disconnect coordination, and inspection line items directly into your quote math.',
      },
      {
        question: 'How do customers approve quotes and pay deposits on their phones?',
        answer: 'Homeowners receive a private, mobile-optimized link via SMS. They can select their preferred quote package, review line items, sign with their finger, and pay via Apple Pay, Google Pay, or credit card in 30 seconds.',
      },
      {
        question: 'Does Let’s Get Quoted support EV charger and generator interlock scoping?',
        answer: 'Yes. Our intake questionnaires ask customers where their panel is located relative to their garage, their main panel amperage, and their EV make/model to ensure accurate conduit run calculations.',
      },
      {
        question: 'Can I track subcontractor electrician labor against my jobs?',
        answer: 'Yes. You can assign 1099 subcontractors or W-2 helpers, track hourly labor against the quote, and view live gross margin on every project.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$2,800',
      closeRateLift: '+44%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  remodelers: {
    slug: 'remodelers',
    heroKicker: 'High-Ticket Remodeling CRM, Staged Deposits & Client Portals',
    sampleSubdomain: 'craftsman-remodel.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Master Bathroom Luxury Remodel (120 Sq Ft)',
      scopeSummary: 'Full gut demo, custom curbless walk-in shower with Schluter waterproofing, double vanity installation, quartz tops, and freestanding soaking tub.',
      timeline: '3-Week Complete Renovation',
      tiers: [
        {
          tierName: 'Good',
          label: 'Classic Tile & Vanity Refresh',
          total: 18500,
          deposit: 5550,
          depositLabel: '30% Milestone Deposit',
          highlight: 'Porcelain tile shower with acrylic pan, 60" double vanity, brushed nickel fixtures.',
          items: [
            { description: 'Complete demo, disposal, subfloor inspection & plumbing rough-in', amount: 3800 },
            { description: 'Acrylic shower pan, porcelain wall tile surround to ceiling & glass sliding door', amount: 6200 },
            { description: '60" Prefab double vanity with quartz top, undermount sinks, and plumbing trim', amount: 5500 },
            { description: 'Waterproof luxury vinyl plank flooring & moisture-resistant paint', amount: 3000 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Custom Walk-In Schluter Shower',
          badge: 'Most Popular',
          total: 26500,
          deposit: 7950,
          depositLabel: '30% Milestone Deposit',
          highlight: 'Full Schluter curbless shower system, frameless heavy glass, custom quartz double vanity.',
          items: [
            { description: 'Full gut demo, structural floor leveling & complete Schluter-KERDI waterproofing', amount: 5200 },
            { description: 'Custom curbless walk-in shower with bench, shampoo niche & frameless 3/8" glass', amount: 9800 },
            { description: 'Custom 72" solid wood double vanity with Calacatta quartz countertops', amount: 7200 },
            { description: 'Heated electric radiant floor warming system & large-format porcelain tile', amount: 4300 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Architectural Spa Sanctuary',
          total: 36000,
          deposit: 10800,
          depositLabel: '30% Milestone Deposit',
          highlight: 'Thermostatic dual rain shower heads, freestanding soaking tub, marble tile & custom millwork.',
          items: [
            { description: 'Complete structural reconfiguration, plumbing relocation for tub & Schluter system', amount: 7500 },
            { description: 'Dual thermostatic rain shower + handheld wand, body jets & steam generator prep', amount: 13500 },
            { description: 'Freestanding acrylic soaking tub with floor-mounted Roman tub filler faucet', amount: 6200 },
            { description: 'Imported marble tile floor-to-ceiling, heated floors, and custom LED backlit mirrors', amount: 8800 },
          ],
        },
      ],
      proTip: 'Staging remodeling payments into 30% Deposit / 40% Rough-in / 30% Final Draw ensures positive cash flow throughout multi-week builds.',
    },
    workflow: [
      {
        step: 1,
        title: 'Project Dimensions & Design Intake',
        description: 'Homeowner submits room dimensions, inspiration photos, and timeline. AI qualifies project scope and budgets automatically.',
        badge: 'Scope Qualification',
      },
      {
        step: 2,
        title: 'Interactive 3-Tier Proposal',
        description: 'Present Good, Better, and Best finish packages with itemized fixture allowances and clear distinction between builder-grade and luxury specs.',
        badge: 'Proposals',
      },
      {
        step: 3,
        title: 'Staged Milestone Billing',
        description: 'Stripe automatically triggers milestone payment draws (Deposit / Rough-In / Trim-Out) with cards stored securely on file.',
        badge: 'Milestone Draws',
      },
      {
        step: 4,
        title: 'Client Portal & Daily Progress Log',
        description: 'Homeowners log into their private portal to view daily jobsite photos, approve change orders with 1 tap, and track project completion.',
        badge: 'Client Portal',
      },
    ],
    faqs: [
      {
        question: 'How do staged milestone payments work on $20,000+ remodeling projects?',
        answer: 'You can define custom milestone payment schedules (e.g. 30% upon contract signing, 40% upon rough-in framing/plumbing inspection, and 30% upon final punch-list completion). Stripe tokenizes the client’s card to trigger payments as milestones are completed.',
      },
      {
        question: 'How does Let’s Get Quoted handle change orders during a remodel?',
        answer: 'When a customer requests an addition (e.g. adding heated floors or upgrading tile), you can draft a digital Change Order in 60 seconds. The homeowner receives a text link, e-signs the adjustment, and the project balance updates automatically.',
      },
      {
        question: 'Can I upload and showcase before-and-after remodeling portfolios?',
        answer: 'Yes. Your Let’s Get Quoted website includes high-resolution before-and-after photo galleries and project transformation showcases pre-built into all 20+ contractor themes.',
      },
      {
        question: 'Can clients approve fixture selections online?',
        answer: 'Yes. You can present Good/Better/Best finish packages allowing clients to pick vanity styles, tile patterns, and plumbing trim finishes directly from their interactive proposal on their smartphone.',
      },
      {
        question: 'How does Let’s Get Quoted track job profitability and labor costs?',
        answer: 'You can log subcontractor bills, material receipts, and crew hours against the active project to monitor live gross margin percentages before final invoicing.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$28,000',
      closeRateLift: '+35%',
      hoursSavedWeekly: '8.5 hrs',
    },
  },

  landscapers: {
    slug: 'landscapers',
    heroKicker: 'Design/Build Landscaping & Recurring Maintenance Operating System',
    sampleSubdomain: 'greenstone-landscaping.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Paver Patio & Outdoor Living Space (450 Sq Ft)',
      scopeSummary: 'Excavation of 6" base, compacted aggregate, polymeric sand, Belgard pavers, retaining wall seating, and low-voltage lighting.',
      timeline: '4-Day Design/Build Installation',
      tiers: [
        {
          tierName: 'Good',
          label: 'Standard Concrete Paver Patio',
          total: 6800,
          deposit: 2200,
          depositLabel: '33% Material Deposit',
          highlight: '400 sq ft Belgard concrete paver patio with standard snap-edge border.',
          items: [
            { description: 'Excavation to 6" depth, soil removal, and woven geotextile fabric installation', amount: 1800 },
            { description: 'Compacted gravel base & leveling sand with Belgard Holland stone pavers', amount: 3800 },
            { description: 'Polymeric joint sand activation and perimeter edge restraint spikes', amount: 1200 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Architectural Paver + Seating Wall',
          badge: 'Most Popular',
          total: 10800,
          deposit: 3600,
          depositLabel: '33% Material Deposit',
          highlight: '450 sq ft textured pavers, contrasting soldier course border & 20ft integrated sitting wall.',
          items: [
            { description: 'Excavation, gravel sub-base compaction, laser leveling, and French drain tie-in', amount: 2400 },
            { description: 'Belgard Dimensions multi-piece textured pavers with charcoal soldier course', amount: 5200 },
            { description: '20 linear ft double-sided segmental retaining sitting wall with smooth capstones', amount: 3200 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Outdoor Living Oasis + Fire Pit & LED',
          total: 16500,
          deposit: 5500,
          depositLabel: '33% Material Deposit',
          highlight: 'Premium porcelain pavers, built-in gas/wood fire pit, sitting wall, and brass LED hardscape lights.',
          items: [
            { description: 'Deep excavation, concrete foundation pad for fire pit, and drainage swale', amount: 3200 },
            { description: 'Belgard Mirage exterior porcelain pavers with polymeric joint seal', amount: 7400 },
            { description: 'Custom circular stone fire pit with steel insert + sitting wall', amount: 3900 },
            { description: '6 Under-cap brass LED hardscape lights & low-voltage astronomical transformer', amount: 2000 },
          ],
        },
      ],
      proTip: 'Upselling hardscape lighting and sitting walls into landscape proposals increases average design/build contract sizes by $4,000+.',
    },
    workflow: [
      {
        step: 1,
        title: 'Lot Size & Aerial Measurement',
        description: 'Property Intelligence extracts lot square footage, ground footprint, and slope contours when the customer inputs their address.',
        badge: 'Parcel Intelligence',
      },
      {
        step: 2,
        title: 'Instant Design/Build Proposal',
        description: 'Assemble Good/Better/Best packages with pre-calculated square foot costs, plant counts, and retaining wall assemblies on mobile.',
        badge: 'Mobile Quoting',
      },
      {
        step: 3,
        title: 'Staged Material Deposit',
        description: 'Collect 33% to 50% deposit upfront via Stripe before reserving nursery stock, aggregate, and pavers from suppliers.',
        badge: 'Material Deposit',
      },
      {
        step: 4,
        title: 'Recurring Maintenance Auto-Billing',
        description: 'Convert installation clients into recurring monthly lawn maintenance contracts with automated card-on-file billing on Stripe.',
        badge: 'Recurring Plans',
      },
    ],
    faqs: [
      {
        question: 'How do I quote both design/build hardscaping and recurring lawn maintenance?',
        answer: 'Let’s Get Quoted supports both large milestone-based construction quotes (e.g. $12,000 paver patios) and recurring monthly subscription billing (e.g. $220/mo weekly lawn mowing & bed maintenance) in one platform.',
      },
      {
        question: 'How does Property Intelligence help landscaping estimators?',
        answer: 'When a homeowner inputs their property address, Property Intelligence instantly calculates total lot size, building footprint, and remaining outdoor lawn/yard square footage to help you estimate sod and mulch requirements accurately.',
      },
      {
        question: 'Can I require deposits before ordering bulk nursery stock and pavers?',
        answer: 'Yes. You can require upfront deposits (33% to 50%) before jobs are confirmed onto your crew schedule, protecting your working capital.',
      },
      {
        question: 'How does Let’s Get Quoted compare on pricing vs Jobber for landscapers?',
        answer: 'Jobber charges $49 to $349/month all year long—even during quiet winter months. Let’s Get Quoted’s Flex plan costs $0/month base with a 1.25% fee paid only when you collect money, keeping off-season software costs at $0.',
      },
      {
        question: 'Can I send before-and-after photo updates to clients?',
        answer: 'Yes. Crew members can take jobsite progress photos from their phones, which attach directly to the digital customer portal and quote history.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$6,500',
      closeRateLift: '+40%',
      hoursSavedWeekly: '6.5 hrs',
    },
  },

  painters: {
    slug: 'painters',
    heroKicker: 'Interior & Exterior Painting Quoting & Color Approval Operating System',
    sampleSubdomain: 'precision-coatings.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Interior Whole-Home Repaint (4 Bed / 2.5 Bath / 2,400 Sq Ft)',
      scopeSummary: 'Full wall preparation, drywall patching, caulking trim, 2 coats Sherwin-Williams SuperPaint on walls, doors, baseboards, and ceilings.',
      timeline: '4-Day Interior Transformation',
      tiers: [
        {
          tierName: 'Good',
          label: 'Walls Only Refresh',
          total: 3800,
          deposit: 1250,
          depositLabel: '33% Deposit Upon Signing',
          highlight: '2 Coats Sherwin-Williams Promar 200 on all living room and bedroom walls.',
          items: [
            { description: 'Floor protection, masking furniture, and minor nail hole patching', amount: 800 },
            { description: '2 Coats Sherwin-Williams Promar 200 Low-VOC latex on all walls', amount: 3000 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Walls, Trim & Doors Package',
          badge: 'Most Popular',
          total: 5800,
          deposit: 1900,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Sherwin-Williams SuperPaint on walls + semi-gloss enamel on all baseboards, trim, and doors.',
          items: [
            { description: 'Comprehensive prep: caulking baseboards, drywall crack repair & masking', amount: 1200 },
            { description: '2 Coats Sherwin-Williams SuperPaint Satin on all interior walls', amount: 3100 },
            { description: '2 Coats Emerald Urethane Semi-Gloss enamel on all interior doors and trim', amount: 1500 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Total Interior Restoration + Ceilings & Cabinets',
          total: 9400,
          deposit: 3100,
          depositLabel: '33% Deposit Upon Signing',
          highlight: 'Sherwin-Williams Emerald on walls, flat ceiling repaint, and factory-finish kitchen cabinet spraying.',
          items: [
            { description: 'Full whole-home prep, priming water stains, baseboard & crown caulking', amount: 1600 },
            { description: 'Sherwin-Williams Emerald interior paint on walls + flat ceiling paint throughout', amount: 4600 },
            { description: 'Kitchen cabinet door removal, degreasing, spray priming & 2 coats factory enamel', amount: 3200 },
          ],
        },
      ],
      proTip: 'Including trim, doors, and ceilings as tiered options increases painting contract values by 50% compared to basic wall-only estimates.',
    },
    workflow: [
      {
        step: 1,
        title: 'Room Count & Square Footage Intake',
        description: 'Homeowner selects room count, ceiling height, and uploads wall condition photos. AI calculates square footage and prep requirements.',
        badge: 'Photo Scoping',
      },
      {
        step: 2,
        title: 'Tiered Paint Specification Proposal',
        description: 'Present Good/Better/Best options specifying exact paint grades (Promar vs SuperPaint vs Emerald) and finish sheens on mobile.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'E-Sign & Paint Supply Deposit',
        description: 'Customer selects color codes, signs contract online, and pays 33% deposit via Apple Pay to fund paint and sundries.',
        badge: 'Deposit Collection',
      },
      {
        step: 4,
        title: 'Card-on-File Completion Walk-Through',
        description: 'Walk the jobsite with homeowner, collect digital completion sign-off, and charge final balance automatically to card on file.',
        badge: 'Final Settlement',
      },
    ],
    faqs: [
      {
        question: 'How do I build accurate painting estimates by square footage and room count?',
        answer: 'Let’s Get Quoted includes pre-built painting cost assemblies (per wall sq ft, per linear ft of trim, per door, or per room) with built-in labor production rates and paint coverage calculations.',
      },
      {
        question: 'Can customers sign off on paint brand and color selections online?',
        answer: 'Yes. Color names, sheen selections (Flat, Satin, Semi-Gloss), and brand specifications (Sherwin-Williams, Benjamin Moore) are documented in the interactive proposal before contract signing.',
      },
      {
        question: 'How does Let’s Get Quoted help painters get paid on time?',
        answer: 'Stripe tokenizes the customer’s payment method during the initial deposit. Once the final walk-through is complete and signed, the remaining balance can be charged immediately without waiting for checks.',
      },
      {
        question: 'Can I quote exterior pressure washing and cabinet painting as add-ons?',
        answer: 'Yes. You can add optional line items and upgraded tiers (e.g. cabinet spray finishing, exterior pressure washing, deck staining) that customers can toggle with one tap.',
      },
      {
        question: 'How does Let’s Get Quoted rank on Google Maps for local painting searches?',
        answer: 'Every website includes Schema.org LocalBusiness structured data, localized city service pages, and automated Google review routing after every completed job.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$4,800',
      closeRateLift: '+39%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  flooring: {
    slug: 'flooring',
    heroKicker: 'Flooring & Tile Contractor Quoting, Subfloor Scoping & CRM',
    sampleSubdomain: 'oak-stone-flooring.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Hardwood & Luxury Vinyl Plank Installation (1,200 Sq Ft)',
      scopeSummary: 'Tear-out of existing carpet, subfloor leveling, moisture barrier, installation of 7" wide-plank European white oak, and shoe moulding.',
      timeline: '3-Day Installation',
      tiers: [
        {
          tierName: 'Good',
          label: 'Luxury Vinyl Plank (LVP 20mil)',
          total: 5400,
          deposit: 1800,
          depositLabel: '33% Material Deposit',
          highlight: 'Waterproof 20mil commercial wear-layer LVP with integrated acoustic pad.',
          items: [
            { description: 'Carpet tear-out, tack strip removal, haul-away, and subfloor prep', amount: 1200 },
            { description: '1,200 sq ft 20mil Waterproof Luxury Vinyl Plank & transition mouldings', amount: 3400 },
            { description: 'Primed quarter-round shoe moulding installation and caulking', amount: 800 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Engineered European White Oak',
          badge: 'Most Popular',
          total: 9800,
          deposit: 3250,
          depositLabel: '33% Material Deposit',
          highlight: '1/2" x 7.5" Wirebrushed Engineered White Oak with UV-cured matte urethane finish.',
          items: [
            { description: 'Carpet demo, subfloor screw-down to eliminate squeaks & leveling', amount: 1600 },
            { description: '1,200 sq ft Engineered European White Oak with premium vapor underlayment', amount: 6800 },
            { description: 'Custom flush-mount oak heat registers & matching wood reducer transitions', amount: 1400 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Solid 3/4" White Oak + Site Finish',
          total: 14400,
          deposit: 4800,
          depositLabel: '33% Material Deposit',
          highlight: 'Solid 3/4" select white oak, custom stained on-site with 3 coats Bona Traffic HD finish.',
          items: [
            { description: 'Tear-out, 1/2" plywood subfloor replacement where needed & prep', amount: 2200 },
            { description: '1,200 sq ft Solid 3/4" Select White Oak blind-nailed installation', amount: 7800 },
            { description: 'On-site dustless sanding, custom color stain sampling & 3 coats Bona Traffic HD', amount: 4400 },
          ],
        },
      ],
      proTip: 'Presenting LVP alongside engineered and solid site-finished hardwood lets customers choose their budget while anchoring higher margin wood bids.',
    },
    workflow: [
      {
        step: 1,
        title: 'Square Footage & Subfloor Scoping',
        description: 'Homeowner inputs room dimensions and current floor type. AI calculates waste factor (10–15%) and checks for subfloor leveling triggers.',
        badge: 'Dimension Scoping',
      },
      {
        step: 2,
        title: 'Tiered Material Proposal',
        description: 'Send itemized Good/Better/Best options comparing LVP vs Engineered vs Solid Hardwood with pre-set labor and trim allowances.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'Material Order Deposit',
        description: 'Collect 33% to 50% deposit on Stripe before purchasing hardwood pallets and underlayment from your flooring distributor.',
        badge: 'Material Deposit',
      },
      {
        step: 4,
        title: 'Completion Walk & Final Charge',
        description: 'Inspect transitions and baseboards with customer, collect digital signature, and auto-settle final draw to card on file.',
        badge: 'Instant Settlement',
      },
    ],
    faqs: [
      {
        question: 'How do I account for flooring waste factors in quote calculations?',
        answer: 'Let’s Get Quoted allows you to specify standard waste percentages (e.g. 10% for straight-lay LVP, 15% for diagonal or herringbone hardwood) in your cost catalog so material calculations never come up short.',
      },
      {
        question: 'Can I quote subfloor repairs and leveling as separate line items?',
        answer: 'Yes. You can itemize subfloor leveling (per bag of self-leveler or per sheet of plywood replacement) as separate line items or optional change orders.',
      },
      {
        question: 'How does Let’s Get Quoted protect flooring contractors from slow-paying clients?',
        answer: 'By collecting upfront material deposits via Stripe and tokenizing cards on file, final payment is authorized automatically upon job walk-through and signature.',
      },
      {
        question: 'Can I include transition strips, shoe moulding, and demolition in my estimate?',
        answer: 'Yes. Cost assemblies bundle tear-out, haul-away, transition reducers, t-mouldings, and baseboards into modular units.',
      },
      {
        question: 'Can I offer 0%-interest payment plans on $10,000+ hardwood projects?',
        answer: 'Yes. Let’s Get Quoted supports splitting approved quote balances into fixed, scheduled monthly installments charged automatically to a saved card.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$6,800',
      closeRateLift: '+37%',
      hoursSavedWeekly: '5.5 hrs',
    },
  },

  concrete: {
    slug: 'concrete',
    heroKicker: 'Concrete, Flatwork & Masonry Quoting and Dispatch Platform',
    sampleSubdomain: 'ironclad-concrete.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Stamped Concrete Patio & Driveway Extension (750 Sq Ft)',
      scopeSummary: 'Excavation to 4" depth, crushed rock base compaction, #4 rebar reinforcement, 4,000 PSI concrete pour, ashlar slate stamp, and acrylic sealer.',
      timeline: '2-Day Pour & Stamp + 1-Day Sealing',
      tiers: [
        {
          tierName: 'Good',
          label: 'Broom-Finished Flatwork',
          total: 6200,
          deposit: 2050,
          depositLabel: '33% Ready-Mix Deposit',
          highlight: '4" 4,000 PSI concrete with fiber mesh and traditional non-slip broom finish.',
          items: [
            { description: 'Excavation, grading, 4" gravel base compaction, and wood formwork', amount: 1800 },
            { description: '4,000 PSI ready-mix pour (10 cubic yards) with fiber reinforcement', amount: 3200 },
            { description: 'Hand-troweled edges, tooled control joints, and light broom finish', amount: 1200 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Colored & Stamped Ashlar Slate',
          badge: 'Most Popular',
          total: 9800,
          deposit: 3250,
          depositLabel: '33% Ready-Mix Deposit',
          highlight: 'Integral color, release agent, Ashlar slate stamp pattern, and clear solvent-based seal.',
          items: [
            { description: 'Excavation, compacted sub-base, and #4 steel rebar grid on 16" centers', amount: 2400 },
            { description: '4,000 PSI pour with integral charcoal color + secondary antique release powder', amount: 4800 },
            { description: 'Ashlar slate texture stamping, saw-cut expansion joints & 2 coats wet-look sealer', amount: 2600 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Multi-Tone Stamped Patio + Seating Wall',
          total: 14500,
          deposit: 4800,
          depositLabel: '33% Ready-Mix Deposit',
          highlight: 'Stamped patio with contrasting stained border, integrated step, and curved sitting wall.',
          items: [
            { description: 'Deep excavation, structural footing for step & rebar tie-ins', amount: 3100 },
            { description: 'Stamped patio pour with hand-stained contrasting border & bullnose step', amount: 6900 },
            { description: '25 linear ft matching cast-in-place concrete sitting wall with stone texture', amount: 4500 },
          ],
        },
      ],
      proTip: 'Upselling decorative stamp patterns and colored borders over basic broom finish increases gross profit per cubic yard by 60%+.',
    },
    workflow: [
      {
        step: 1,
        title: 'Yard Area & Truck Access Scoping',
        description: 'Homeowner inputs dimensions and uploads yard photos. AI analyzes gate width for skid steer access and concrete pump requirements.',
        badge: 'Site Scoping',
      },
      {
        step: 2,
        title: 'Instant Yardage & Finish Proposal',
        description: 'Proposal calculates required ready-mix cubic yardage automatically based on thickness (4" vs 6") and presents broom vs stamped tiers.',
        badge: 'Cubic Yard Math',
      },
      {
        step: 3,
        title: '33% Ready-Mix Batch Deposit',
        description: 'Collect deposit on Stripe before ordering concrete ready-mix trucks and scheduling pumper equipment.',
        badge: 'Batch Deposit',
      },
      {
        step: 4,
        title: 'Washout & Sealing Draw',
        description: 'Apply high-gloss sealer, take completion photos, and collect final balance with instant digital sign-off.',
        badge: 'Final Draw',
      },
    ],
    faqs: [
      {
        question: 'How does Let’s Get Quoted calculate concrete cubic yardage in quotes?',
        answer: 'You input the length, width, and thickness (e.g. 4" for sidewalks/patios, 6" for driveways), and the calculator automatically computes required cubic yards with built-in spillage factors.',
      },
      {
        question: 'Can I charge extra for pump truck rentals and difficult wheelbarrow access?',
        answer: 'Yes. You can add pump truck fees or manual buggie haul allowances as distinct line items or site condition modifiers.',
      },
      {
        question: 'How do upfront deposits protect concrete contractors from ready-mix batch fees?',
        answer: 'Ready-mix batch plants charge non-refundable fees. Requiring a 33% upfront Stripe deposit before scheduling ensures your material outlay is 100% funded before the truck leaves the batch plant.',
      },
      {
        question: 'Can I include stamped patterns, color hardeners, and sealers in my tiers?',
        answer: 'Yes. You can create tiered Good/Better/Best packages comparing standard broom finish vs single-color stamp vs multi-tone decorative concrete.',
      },
      {
        question: 'Does Let’s Get Quoted work well on mobile for field estimators?',
        answer: 'Yes. Estimators can measure dimensions on site, generate itemized proposals, and e-mail or text them to homeowners for immediate signature before leaving the driveway.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$8,500',
      closeRateLift: '+36%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  fencing: {
    slug: 'fencing',
    heroKicker: 'Fence Contractor Quoting, Linear Foot Calculators & CRM',
    sampleSubdomain: 'perimeter-fence.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Residential Privacy Fencing (200 Linear Ft)',
      scopeSummary: 'Tear-out of old chain-link, post hole digging to 36" frost depth, concrete post setting, 6ft cedar/vinyl pickets, and one 4ft walk gate.',
      timeline: '2-Day Complete Build',
      tiers: [
        {
          tierName: 'Good',
          label: 'Pressure-Treated Pine Privacy',
          total: 5800,
          deposit: 1900,
          depositLabel: '33% Material Deposit',
          highlight: '6ft Pressure-Treated Pine Dog-Ear pickets on 4x4 treated posts set in concrete.',
          items: [
            { description: 'Old fence tear-out, post pulling, and site clearing (200 linear ft)', amount: 1200 },
            { description: '200 ft 6ft Pressure-Treated Pine privacy fence with 3 horizontal 2x4 rails', amount: 3800 },
            { description: 'One 4ft walk gate with heavy-duty black self-closing hardware and latch', amount: 800 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Western Red Cedar on Steel Posts',
          badge: 'Most Popular',
          total: 8900,
          deposit: 2950,
          depositLabel: '33% Material Deposit',
          highlight: '6ft Premium Western Red Cedar on PostMaster galvanized steel posts (wind resistant).',
          items: [
            { description: 'Tear-out, laser layout & augering post holes to 36" depth', amount: 1500 },
            { description: '200 ft Western Red Cedar pickets on concealed PostMaster steel posts (no rot)', amount: 6200 },
            { description: 'One 4ft framed cedar gate with anti-sag cable kit and keyed security latch', amount: 1200 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Commercial Vinyl Privacy + 10ft Double Gate',
          total: 12400,
          deposit: 4100,
          depositLabel: '33% Material Deposit',
          highlight: 'Lifetime transferable warranty white vinyl privacy fence with aluminum reinforced bottom rail.',
          items: [
            { description: 'Demo, disposal, and precision post augering with high-strength concrete', amount: 1800 },
            { description: '200 ft Premium Tongue-and-Groove Vinyl Privacy fence (lifetime warranty)', amount: 8400 },
            { description: 'One 4ft walk gate + one 10ft double drive gate with aluminum internal frame', amount: 2200 },
          ],
        },
      ],
      proTip: 'Presenting PostMaster steel posts or vinyl alongside treated pine lifts fencing contract revenue by 45% per job.',
    },
    workflow: [
      {
        step: 1,
        title: 'Linear Footage & Property Line Intake',
        description: 'Homeowner enters estimated linear footage and gate count. AI cross-references parcel boundary dimensions from Property Intelligence.',
        badge: 'Parcel Footprint',
      },
      {
        step: 2,
        title: 'Linear Foot Pricing Proposal',
        description: 'Generate multi-tier options (Pine vs Cedar vs Vinyl vs Ornamental Aluminum) with pre-calculated post and picket counts in seconds.',
        badge: 'Linear Foot Math',
      },
      {
        step: 3,
        title: 'Material Order Deposit',
        description: 'Collect 33% to 50% deposit on Stripe before ordering lumber packs, steel posts, and concrete bags from suppliers.',
        badge: 'Lumber Deposit',
      },
      {
        step: 4,
        title: 'Gate Hardware Sign-Off',
        description: 'Demonstrate gate latch operation, take perimeter completion photos, and collect final balance on card on file.',
        badge: 'Completion',
      },
    ],
    faqs: [
      {
        question: 'How do linear foot pricing calculators work for fence contractors?',
        answer: 'You define your unit cost per linear foot for various materials (Treated Pine, Cedar, Vinyl, Chain Link, Aluminum) including posts, rails, fasteners, and concrete. The quote calculates total linear footage and adds separate line items for gate hardware.',
      },
      {
        question: 'Can I include gate options (4ft walk gate vs 10ft double drive gate) in proposals?',
        answer: 'Yes. Gate packages with heavy-duty hinges, anti-sag hardware, and keyed latches can be added as standard line items or interactive client add-ons.',
      },
      {
        question: 'How does Let’s Get Quoted help fence contractors manage cash flow?',
        answer: 'Lumber and posts represent high upfront material expenses. Collecting a 33% to 50% Stripe deposit upon quote signing ensures materials are paid for before work begins.',
      },
      {
        question: 'Can Property Intelligence help verify fence boundary lengths?',
        answer: 'Yes. Property Intelligence displays parcel lot boundary dimensions so you can verify customer-reported linear footage before scheduling on-site post layout.',
      },
      {
        question: 'How do Google reviews help local fence builders win more jobs?',
        answer: 'Let’s Get Quoted automatically texts clients a direct 5-star Google review link upon final payment collection, building high local Google Maps visibility.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$6,200',
      closeRateLift: '+41%',
      hoursSavedWeekly: '5.5 hrs',
    },
  },

  'tree-services': {
    slug: 'tree-services',
    heroKicker: 'Tree Service, Removal & Trimming Quoting & Dispatch System',
    sampleSubdomain: 'timber-tree-care.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Hazardous Tree Removal & Stump Grinding (65ft Oak)',
      scopeSummary: 'Sectional crane/rigging dismantling of 65ft decaying red oak near power lines, wood chipping, stump grinding 8" below grade, and yard cleanup.',
      timeline: '1-Day Complete Tree Removal',
      tiers: [
        {
          tierName: 'Good',
          label: 'Removal to Stump Only',
          total: 2400,
          deposit: 600,
          depositLabel: '25% Booking Deposit',
          highlight: 'Complete tree removal down to ground level with brush chipping. Log wood left on-site.',
          items: [
            { description: 'Rigging dismantling of 65ft oak, chipper brush disposal, and safety drop', amount: 1900 },
            { description: 'Ground trunk cut flush to grade (stump and large firewood rounds left)', amount: 500 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Full Removal + Haul Away + Stump Grinding',
          badge: 'Most Popular',
          total: 3400,
          deposit: 850,
          depositLabel: '25% Booking Deposit',
          highlight: 'Complete removal, log haul-away, stump grinding 8" below grade, and raked cleanup.',
          items: [
            { description: 'Precision sectional dismantling with aerial bucket truck and safety rigging', amount: 2100 },
            { description: 'Complete log wood hauling and industrial chipper branch disposal', amount: 650 },
            { description: 'Stump grinding 8" below grade, surface root grinding & mulch backfill', amount: 650 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Hazard Removal + Canopy Pruning + Topsoil/Seed',
          total: 4800,
          deposit: 1200,
          depositLabel: '25% Booking Deposit',
          highlight: 'Complete oak removal, stump grinding, topsoil/seed repair + crown thinning on 2 adjacent shade trees.',
          items: [
            { description: 'Full 65ft oak removal, log hauling, stump grinding & topsoil/grass seed repair', amount: 3600 },
            { description: 'Crown cleaning, deadwood removal & structural thinning on 2 adjacent maple trees', amount: 1200 },
          ],
        },
      ],
      proTip: 'Offering canopy pruning on adjacent trees and stump grinding alongside tree removal quotes boosts average job revenue by $1,000+.',
    },
    workflow: [
      {
        step: 1,
        title: 'Tree Height & Hazard Photo Intake',
        description: 'Homeowner submits tree photos showing proximity to structures and utility lines. AI analyzes height and equipment access.',
        badge: 'Photo Triage',
      },
      {
        step: 2,
        title: 'Equipment & Hazard Tier Proposal',
        description: 'Generate multi-tier options comparing drop-only vs full haul-away vs stump grinding with pre-set crane/bucket allowances.',
        badge: 'Mobile Quoting',
      },
      {
        step: 3,
        title: 'E-Sign & Certificate of Insurance Access',
        description: 'Homeowner reviews your attached COI and workers’ comp credentials, e-signs the safety waiver, and pays deposit online.',
        badge: 'COI & Deposit',
      },
      {
        step: 4,
        title: 'Route-Aware Quick Stops Stump Dispatch',
        description: 'Tree crew completes removal and dispatches mobile stump grinder technician to nearby neighborhood requests via Quick Stops.',
        badge: 'Route Dispatch',
      },
    ],
    faqs: [
      {
        question: 'Can I attach my Certificate of Insurance (COI) and arborist license to quotes?',
        answer: 'Yes. You can attach insurance certificates, ISA arborist credentials, and liability disclosures directly to the digital proposal for homeowner peace of mind.',
      },
      {
        question: 'How does Quick Stops help tree care and stump grinding crews?',
        answer: 'When a tree removal finishes early, Quick Stops matches nearby homeowners seeking stump grinding or brush clearing along your travel route for same-day add-on revenue.',
      },
      {
        question: 'Can I include hazardous tree emergency response fees?',
        answer: 'Yes. You can add emergency crane dispatch fees and storm damage surcharges into your saved price catalog for 24/7 storm calls.',
      },
      {
        question: 'How do tiered tree quotes increase average ticket size?',
        answer: 'Presenting basic removal alongside stump grinding, root removal, and adjacent canopy pruning encourages homeowners to bundle maintenance into one visit.',
      },
      {
        question: 'How does Let’s Get Quoted compare to TreePlotter or Jobber?',
        answer: 'Jobber charges high fixed monthly fees year-round. Let’s Get Quoted includes a free SEO website, 24/7 photo intake, quotes with e-sign, and $0/mo entry on Flex.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$2,850',
      closeRateLift: '+43%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  'deck-builders': {
    slug: 'deck-builders',
    heroKicker: 'Custom Deck Builder Quoting, Composite Specs & CRM Platform',
    sampleSubdomain: 'timbercraft-decks.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Custom Composite Deck & Cocktail Railing (16ft x 20ft / 320 Sq Ft)',
      scopeSummary: 'Helical pile footings, pressure-treated structural framing, Trex/TimberTech composite decking, picture-frame border, and black aluminum railing.',
      timeline: '5-Day Custom Build',
      tiers: [
        {
          tierName: 'Good',
          label: 'Pressure-Treated Wood Deck',
          total: 10500,
          deposit: 3500,
          depositLabel: '33% Material Deposit',
          highlight: 'Premium #1 Pressure-Treated Southern Pine decking, wood railings, and concrete footings.',
          items: [
            { description: 'Old deck tear-out, building permit filing, and concrete pier footings', amount: 2600 },
            { description: '2x10 Pressure-treated structural framing on 16" centers + joist tape', amount: 3200 },
            { description: 'Premium 5/4x6 treated pine decking boards & matching wood 2x2 baluster railing', amount: 4700 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Trex Composite + Aluminum Railing',
          badge: 'Most Popular',
          total: 18800,
          deposit: 6200,
          depositLabel: '33% Material Deposit',
          highlight: 'Trex Transcend composite decking (25-yr warranty), hidden fasteners, and black aluminum railing.',
          items: [
            { description: 'Full demo, footing inspection, 2x10 PT framing with butyl joist flashing tape', amount: 4200 },
            { description: '320 sq ft Trex Transcend composite decking with hidden clip system & picture border', amount: 9800 },
            { description: 'Westbury black powder-coated aluminum railing with composite cocktail drink cap', amount: 4800 },
          ],
        },
        {
          tierName: 'Best',
          label: 'TimberTech Capped Polymer + LED Lighting',
          total: 26500,
          deposit: 8800,
          depositLabel: '33% Material Deposit',
          highlight: 'TimberTech AZEK Vintage polymer (50-yr warranty), low-voltage stair/post riser LED lighting.',
          items: [
            { description: 'Demo, helical pier foundations, framing with joist tape, and structural ledger tie-ins', amount: 5500 },
            { description: 'TimberTech AZEK Vintage capped polymer decking (heat & scratch resistant)', amount: 13500 },
            { description: 'Westbury black railing + 8 under-rail LED lights, 6 stair riser lights & transformer', amount: 7500 },
          ],
        },
      ],
      proTip: 'Offering composite and low-voltage lighting alongside wood deck estimates lifts average contract value by $8,000+ per client.',
    },
    workflow: [
      {
        step: 1,
        title: 'Square Footage & Elevation Scoping',
        description: 'Homeowner submits deck dimensions, height off grade, and design preferences. AI calculates framing spans and permit triggers.',
        badge: 'Design Intake',
      },
      {
        step: 2,
        title: 'Composite vs Wood Tier Proposal',
        description: 'Send Good/Better/Best options comparing Pressure-Treated vs Trex vs TimberTech AZEK with exact railing specifications.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: '33% Material Order Deposit',
        description: 'Homeowner signs digital contract and pays material deposit to lock in lumber package and composite board delivery.',
        badge: 'Staged Deposit',
      },
      {
        step: 4,
        title: 'Progress Milestone Billing',
        description: 'Stripe automatically bills 33% framing milestone and 34% final completion draw with stored cards on file.',
        badge: 'Milestone Draws',
      },
    ],
    faqs: [
      {
        question: 'How do deck builders quote composite decking vs pressure-treated wood?',
        answer: 'You can create multi-tier proposals that contrast entry-level pressure-treated pine against composite (Trex, TimberTech, Fiberon) and capped polymer, showing customers warranty differences and long-term maintenance savings.',
      },
      {
        question: 'Can I collect milestone progress payments on multi-week deck builds?',
        answer: 'Yes. You can structure draws (e.g. 33% deposit at signing, 33% when framing and footings pass inspection, and 34% upon final completion walk-through).',
      },
      {
        question: 'How does Let’s Get Quoted handle change orders for deck upgrades?',
        answer: 'If a customer decides to add low-voltage stair riser lights, a cocktail rail, or an under-deck drainage system, you can issue an itemized digital change order that updates the balance and e-signs in 60 seconds.',
      },
      {
        question: 'Can I include building permits and structural engineering in my proposal?',
        answer: 'Yes. Permit fees, footing inspections, and structural engineering fees can be itemized directly in your proposal cost catalog.',
      },
      {
        question: 'How does Let’s Get Quoted help custom deck builders stand out online?',
        answer: 'Your website includes high-resolution project galleries, video showcases, 5-star Google review embeds, and interactive estimate widgets that convert high-income homeowners.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$18,500',
      closeRateLift: '+38%',
      hoursSavedWeekly: '7.5 hrs',
    },
  },

  solar: {
    slug: 'solar',
    heroKicker: 'Solar PV, Battery Storage & Clean Energy Quoting Platform',
    sampleSubdomain: 'solis-energy.letsgetquoted.com',
    quoteExample: {
      projectTitle: '8.4 kW Rooftop Solar Array & Enphase Battery Storage',
      scopeSummary: '21 Tier-1 400W all-black solar panels, Enphase IQ8 microinverters, roof penetration flashing, utility net-metering, and 10 kWh battery backup.',
      timeline: '2-Day Complete Solar Installation',
      tiers: [
        {
          tierName: 'Good',
          label: '8.4 kW Grid-Tied Rooftop Array',
          total: 19800,
          deposit: 3960,
          depositLabel: '20% Engineering & Permit Deposit',
          highlight: '21 400W Monocrystalline panels, Enphase IQ8+ microinverters & 25-yr production warranty.',
          items: [
            { description: 'Structural engineering stamps, utility interconnection application & city permit', amount: 2200 },
            { description: '21 400W Tier-1 All-Black Solar Modules + IronRidge XR100 rail mounting system', amount: 11800 },
            { description: 'Enphase IQ8+ Microinverters, IQ Gateway monitoring & electrical tie-in', amount: 5800 },
          ],
        },
        {
          tierName: 'Better',
          label: '8.4 kW Solar + 10 kWh Battery Backup',
          badge: 'Most Popular',
          total: 29500,
          deposit: 5900,
          depositLabel: '20% Engineering & Permit Deposit',
          highlight: '8.4 kW Solar array + Enphase IQ 5P (10 kWh) lithium iron phosphate battery backup.',
          items: [
            { description: 'Engineering, utility interconnection, and critical loads subpanel installation', amount: 3500 },
            { description: '21 400W Solar panels with Enphase IQ8+ microinverters and roof flashings', amount: 14200 },
            { description: 'Enphase IQ Battery 5P (10 kWh capacity) for whole-home nighttime power & storm backup', amount: 11800 },
          ],
        },
        {
          tierName: 'Best',
          label: '10.8 kW Solar + 20 kWh Whole-Home Storage + EV',
          total: 42000,
          deposit: 8400,
          depositLabel: '20% Engineering & Permit Deposit',
          highlight: '27 High-efficiency panels, 20 kWh dual-battery storage, smart electrical panel & Level 2 EV charger.',
          items: [
            { description: 'Full architectural/electrical engineering, 200A service upgrade & utility interconnect', amount: 4800 },
            { description: '27 400W Solar panels (10.8 kW) + IQ8M microinverters with 30-yr complete warranty', amount: 18400 },
            { description: '20 kWh Enphase IQ Battery backup system + Enphase Level 2 Smart EV charger', amount: 18800 },
          ],
        },
      ],
      proTip: 'Highlighting the 30% Federal Clean Energy Tax Credit alongside Good/Better/Best solar tiers makes $20,000+ quotes easier for homeowners to approve.',
    },
    workflow: [
      {
        step: 1,
        title: 'Roof Sun Hours & Electric Bill Scoping',
        description: 'Property Intelligence analyzes roof sunlight hours and panel capacity while the intake questionnaire collects average monthly electric bills.',
        badge: 'Solar Potential',
      },
      {
        step: 2,
        title: 'Multi-Tier System Proposal',
        description: 'Present Good/Better/Best packages comparing standard grid-tied PV vs battery storage vs whole-home backup with tax credit breakdowns.',
        badge: 'System Proposals',
      },
      {
        step: 3,
        title: 'Engineering & Interconnection Deposit',
        description: 'Collect 20% deposit upon contract signing to fund electrical engineering drawings and utility net-metering applications.',
        badge: 'Permit Deposit',
      },
      {
        step: 4,
        title: 'PTO & Final Commissioning Draw',
        description: 'System commissions with utility permission to operate (PTO), customer monitors power in app, and final balance auto-settles.',
        badge: 'PTO Commissioning',
      },
    ],
    faqs: [
      {
        question: 'How does Property Intelligence calculate solar panel capacity and sunlight hours?',
        answer: 'Property Intelligence analyzes satellite roof pitch, orientation (south/west faces), and unshaded square footage to estimate annual sunshine hours and maximum solar panel capacity.',
      },
      {
        question: 'Can I show the 30% Federal Clean Energy Tax Credit on quotes?',
        answer: 'Yes. You can itemize the gross system price alongside the 30% Residential Clean Energy Credit (Section 25D) and local utility rebates to show net cost.',
      },
      {
        question: 'How do staged milestone payments work for solar installations?',
        answer: 'You can structure draws (e.g. 20% upon signing for engineering/permits, 50% on installation day, and 30% upon utility Permission to Operate).',
      },
      {
        question: 'Can I include battery storage and EV chargers in solar quotes?',
        answer: 'Yes. Battery storage options (Enphase, Tesla Powerwall, SolarEdge) and Level 2 EV charging circuits can be bundled into your Good/Better/Best tiers.',
      },
      {
        question: 'Does Let’s Get Quoted support customer financing options?',
        answer: 'Yes. Let’s Get Quoted supports splitting approved quote balances into fixed, scheduled monthly installments charged automatically to a saved card.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$24,000',
      closeRateLift: '+34%',
      hoursSavedWeekly: '8.0 hrs',
    },
  },

  'cleaning-services': {
    slug: 'cleaning-services',
    heroKicker: 'Residential & Commercial Cleaning Quoting and Auto-Billing CRM',
    sampleSubdomain: 'sparkle-pro-clean.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Whole-Home Deep Clean & Move-In Preparation (2,800 Sq Ft)',
      scopeSummary: 'Deep sanitization of 4 bedrooms, 3.5 bathrooms, inside oven, inside refrigerator, interior windows, baseboards, and hard floor scrubbing.',
      timeline: '1-Day 6-Hour Deep Cleaning',
      tiers: [
        {
          tierName: 'Good',
          label: 'Standard Maintenance Clean',
          total: 240,
          deposit: 60,
          depositLabel: '25% Booking Deposit',
          highlight: 'Dusting, vacuuming, mopping, bathroom sanitization, and kitchen exterior wipe-down.',
          items: [
            { description: 'Kitchen: wipe exterior counters, sink, microwave & stovetop', amount: 60 },
            { description: 'Bathrooms: scrub toilets, tubs, showers, vanities, and mirrors', amount: 90 },
            { description: 'Bedrooms & living areas: dust surfaces, vacuum carpets & mop hard floors', amount: 90 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Deep Clean & Disinfection',
          badge: 'Most Popular',
          total: 480,
          deposit: 120,
          depositLabel: '25% Booking Deposit',
          highlight: 'Detailed hand-wiping of baseboards, doors, cabinet fronts, inside microwave & bathroom grout scrub.',
          items: [
            { description: 'Deep kitchen clean: degrease hood, sanitize backsplash & wipe cabinet faces', amount: 140 },
            { description: 'Deep bathroom sanitization: tile grout scrub, lime scale removal & fixture polish', amount: 160 },
            { description: 'Hand-wiping all baseboards, door frames, light switches, and ceiling fans', amount: 180 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Move-In/Move-Out Executive Deep Clean',
          total: 750,
          deposit: 200,
          depositLabel: '25% Booking Deposit',
          highlight: 'Full deep clean + inside oven, inside refrigerator, inside kitchen cabinets & interior windows.',
          items: [
            { description: 'Complete deep clean package (walls, baseboards, vents, bathrooms, kitchen)', amount: 450 },
            { description: 'Deep interior appliance cleaning: inside oven, inside refrigerator & inside dishwasher', amount: 180 },
            { description: 'Inside all empty kitchen/bathroom cabinets, drawers & interior window glass', amount: 120 },
          ],
        },
      ],
      proTip: 'Turning deep cleaning customers into recurring bi-weekly maintenance clients creates predictable recurring monthly revenue.',
    },
    workflow: [
      {
        step: 1,
        title: 'Square Footage & Room Intake',
        description: 'Client selects bedrooms, bathrooms, and square footage. AI calculates estimated cleaning hours and baseline price.',
        badge: 'Instant Scoping',
      },
      {
        step: 2,
        title: 'Tiered Package Selection',
        description: 'Send interactive Good/Better/Best proposals comparing standard maintenance vs deep clean vs appliance add-ons on mobile.',
        badge: 'Package Options',
      },
      {
        step: 3,
        title: 'Card-on-File Booking Authorization',
        description: 'Client reserves their cleaning date with an upfront deposit and tokenized card on file through Stripe.',
        badge: 'Card Tokenization',
      },
      {
        step: 4,
        title: 'Recurring Bi-Weekly Auto-Billing',
        description: 'Cleaner completes visit, uploads checklist, and charges card on file. System sets up recurring bi-weekly billing automatically.',
        badge: 'Recurring Billing',
      },
    ],
    faqs: [
      {
        question: 'How does card-on-file auto-billing work for recurring cleaning services?',
        answer: 'When a customer books their first cleaning, Stripe tokenizes their payment method. You can schedule recurring weekly, bi-weekly, or monthly cleans that bill the saved card automatically after each visit.',
      },
      {
        question: 'Can customers book cleaning visits directly on my website?',
        answer: 'Yes. Your website includes self-scheduling and instant estimate widgets where homeowners select their home size, choose open arrival windows, and book online.',
      },
      {
        question: 'How does Let’s Get Quoted help cleaning companies manage cancellations?',
        answer: 'You can enforce cancellation policies with pre-authorized booking deposits, preventing revenue loss from last-minute customer cancellations.',
      },
      {
        question: 'Can I offer deep clean add-ons (inside oven, inside fridge, interior windows)?',
        answer: 'Yes. You can configure add-on checkboxes that customers can toggle during quote review, increasing average cleaning ticket sizes.',
      },
      {
        question: 'How does Let’s Get Quoted compare to ZenMaid or Jobber for cleaners?',
        answer: 'Let’s Get Quoted includes your marketing website, Google review automation, 2-way texting, and quoting from $0/month on Flex with zero monthly software bills.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$320',
      closeRateLift: '+48%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  'pressure-washing': {
    slug: 'pressure-washing',
    heroKicker: 'Pressure Washing & Soft Washing Quoting and Route Dispatch System',
    sampleSubdomain: 'hydro-clean-pro.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Whole-House Soft Wash & Surface Driveway Cleaning',
      scopeSummary: 'Low-pressure soft wash of 2-story vinyl siding, surface cleaning of 1,200 sq ft concrete driveway, and front walkway algae treatment.',
      timeline: 'Half-Day Service',
      tiers: [
        {
          tierName: 'Good',
          label: 'Driveway Surface Cleaning',
          total: 280,
          deposit: 70,
          depositLabel: '25% Booking Deposit',
          highlight: 'High-pressure rotary surface cleaning of driveway and front walkway.',
          items: [
            { description: 'Rotary surface cleaner pressure wash of 1,200 sq ft driveway', amount: 220 },
            { description: 'Post-treatment algaecide wash to inhibit future moss and mildew growth', amount: 60 },
          ],
        },
        {
          tierName: 'Better',
          label: 'House Soft Wash + Driveway Package',
          badge: 'Most Popular',
          total: 580,
          deposit: 150,
          depositLabel: '25% Booking Deposit',
          highlight: 'Low-pressure chemical soft wash of siding, soffits, and gutters + driveway surface cleaning.',
          items: [
            { description: 'Gentle chemical soft wash of 2-story exterior siding, fascia, and gutters', amount: 360 },
            { description: 'Concrete driveway and walkway surface wash with post-treatment brightener', amount: 220 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Ultimate Exterior Restoration + Roof Wash',
          total: 1150,
          deposit: 300,
          depositLabel: '25% Booking Deposit',
          highlight: 'House soft wash, driveway, patio, and non-pressure roof shingle gloeocapsa magma treatment.',
          items: [
            { description: 'Whole-house soft wash + 1,200 sq ft driveway and rear paver patio cleaning', amount: 550 },
            { description: 'Non-pressure roof soft wash to eliminate black algae streaks (protects shingles)', amount: 600 },
          ],
        },
      ],
      proTip: 'Bundling roof washing and surface concrete cleaning with house wash quotes doubles average ticket values.',
    },
    workflow: [
      {
        step: 1,
        title: 'Surface Area & Story Count Intake',
        description: 'Homeowner inputs stories, siding material, and square footage. AI analyzes algae severity from uploaded photos.',
        badge: 'Photo Triage',
      },
      {
        step: 2,
        title: 'Instant Exterior Package Proposal',
        description: 'Send multi-tier proposals comparing driveway wash vs house soft wash vs roof wash with 1 tap from mobile.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'Card-on-File Booking',
        description: 'Customer accepts quote and enters card on file to confirm their arrival window with zero phone tag.',
        badge: '1-Tap Booking',
      },
      {
        step: 4,
        title: 'Quick Stops Neighborhood Fill',
        description: 'Technician completes wash, photographs clean concrete, and uses Quick Stops to offer same-day service to neighbors on the street.',
        badge: 'Quick Stops',
      },
    ],
    faqs: [
      {
        question: 'How does Route-Aware Quick Stops help pressure washing businesses?',
        answer: 'When you are washing a driveway in a neighborhood, neighbors frequently notice. Quick Stops alerts nearby homeowners with available same-day afternoon slots, filling travel gaps with zero extra drive time.',
      },
      {
        question: 'Can I separate delicate soft washing from high-pressure flatwork in quotes?',
        answer: 'Yes. You can itemize delicate low-pressure soft washing for vinyl and stucco alongside high-pressure rotary surface cleaning for concrete flatwork.',
      },
      {
        question: 'How do customers approve quotes on their phones?',
        answer: 'Homeowners receive a mobile link via SMS, pick their package tier, sign with their finger, and store their card on file in 30 seconds.',
      },
      {
        question: 'Can I require deposits before scheduling pressure washing jobs?',
        answer: 'Yes. You can require a 25% booking deposit to confirm dates onto your calendar.',
      },
      {
        question: 'How does Let’s Get Quoted collect 5-star Google reviews after washing?',
        answer: 'Once you mark the job complete and charge the card on file, the system automatically texts the customer a direct link to leave a 5-star Google review.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$580',
      closeRateLift: '+46%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  handyman: {
    slug: 'handyman',
    heroKicker: 'Handyman Quoting, Task Bundling & Dispatch Operating System',
    sampleSubdomain: 'craftsman-handyman.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Home Punch List & Fixture Installation (4 Tasks)',
      scopeSummary: 'Drywall hole patching and texture match, replacement of 2 bathroom faucets, installation of storm door, and ceiling fan replacement.',
      timeline: '1-Day Complete Punch List',
      tiers: [
        {
          tierName: 'Good',
          label: 'Primary Repair (2-Hour Block)',
          total: 240,
          deposit: 80,
          depositLabel: 'Service Call Deposit',
          highlight: 'Drywall patching, texture blending, and interior door adjustment.',
          items: [
            { description: 'Patch two 6" drywall holes, apply mesh, feather mud, and match texture', amount: 160 },
            { description: 'Re-align sticking interior bedroom door and replace hinge screws', amount: 80 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Half-Day Punch List (4-Hour Block)',
          badge: 'Most Popular',
          total: 480,
          deposit: 150,
          depositLabel: 'Booking Deposit',
          highlight: 'Drywall repairs + 2 bathroom faucet replacements + storm door installation.',
          items: [
            { description: 'Drywall repairs and door alignment package', amount: 240 },
            { description: 'Remove and replace 2 bathroom sink faucets & hook up supply lines', amount: 140 },
            { description: 'Hang new exterior aluminum storm door with closer and handle', amount: 100 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Full-Day Home Transformation (8-Hour Block)',
          total: 880,
          deposit: 250,
          depositLabel: 'Booking Deposit',
          highlight: 'Complete punch list + ceiling fan install, garbage disposal replacement & gutter clean.',
          items: [
            { description: 'Half-day punch list package (drywall, door, faucets, storm door)', amount: 480 },
            { description: 'Assemble and install ceiling fan in master bedroom with remote control', amount: 150 },
            { description: 'Replace kitchen garbage disposal and clear 40ft front gutters', amount: 250 },
          ],
        },
      ],
      proTip: 'Offering 2-hour, 4-hour, and full-day punch list packages eliminates tedious individual task negotiations and doubles average invoice totals.',
    },
    workflow: [
      {
        step: 1,
        title: 'Multi-Task Photo Scoping',
        description: 'Homeowner photographs their punch list items. AI groups tasks into estimated time blocks (2-hr vs 4-hr vs full-day).',
        badge: 'Task Scoping',
      },
      {
        step: 2,
        title: 'Time-Block & Flat-Rate Proposal',
        description: 'Send itemized proposals with clear task descriptions, material allowances, and time block guarantees in seconds.',
        badge: 'Mobile Proposals',
      },
      {
        step: 3,
        title: 'Card-on-File Reservation',
        description: 'Customer approves punch list and enters payment method to reserve technician arrival window.',
        badge: 'Card Tokenization',
      },
      {
        step: 4,
        title: 'Completion Walk & Tap-to-Pay',
        description: 'Technician reviews completed items with homeowner, collects digital signature, and auto-charges final invoice.',
        badge: 'Instant Settlement',
      },
    ],
    faqs: [
      {
        question: 'How do handymen quote multi-item punch lists efficiently?',
        answer: 'You can bundle individual tasks into standardized time blocks (e.g. 2-Hour Small Repairs, 4-Hour Half-Day, 8-Hour Full-Day) or line-item each fixture, letting clients choose their priority items.',
      },
      {
        question: 'Can I add material reimbursement charges to the final invoice?',
        answer: 'Yes. Technicians can add material receipts (fasteners, plumbing supplies, drywall mud) directly to the active job record on mobile.',
      },
      {
        question: 'How does Quick Stops help handyman businesses fill schedule gaps?',
        answer: 'When a job finishes early, Quick Stops matches nearby homeowners seeking quick repairs (e.g. garbage disposal swaps, door adjustments) along your driving route.',
      },
      {
        question: 'Can I require dispatch deposits for small repairs?',
        answer: 'Yes. You can set minimum job thresholds and require $50–$100 booking deposits that apply toward the final invoice.',
      },
      {
        question: 'How does Let’s Get Quoted compare to Thumbtack for handymen?',
        answer: 'Thumbtack auto-charges $30–$80 every time a homeowner sends a message. Let’s Get Quoted builds your own direct website with $0 lead fees.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$540',
      closeRateLift: '+45%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  'garage-doors': {
    slug: 'garage-doors',
    heroKicker: 'Garage Door Repair, Spring Replacement & Opener Installation CRM',
    sampleSubdomain: 'precision-garage-doors.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Dual Torsion Spring Replacement & Wi-Fi Opener Installation',
      scopeSummary: 'Replacement of broken torsion springs with 25,000-cycle high-life springs, nylon ball-bearing rollers, and LiftMaster belt-drive opener.',
      timeline: '2-Hour Same-Day Service',
      tiers: [
        {
          tierName: 'Good',
          label: 'Standard Spring Replacement',
          total: 360,
          deposit: 100,
          depositLabel: 'Service Call Deposit',
          highlight: 'Dual 10,000-cycle oil-tempered torsion springs and 25-point safety tune-up.',
          items: [
            { description: 'Remove broken spring, install two 10,000-cycle torsion springs', amount: 280 },
            { description: 'Lubricate hinges, tighten track hardware & balance door tension', amount: 80 },
          ],
        },
        {
          tierName: 'Better',
          label: 'High-Cycle Springs + Ultra Quiet Rollers',
          badge: 'Most Popular',
          total: 580,
          deposit: 150,
          depositLabel: 'Booking Deposit',
          highlight: 'Dual 25,000-cycle high-life springs, 13-ball nylon quiet rollers & heavy-duty cables.',
          items: [
            { description: 'Dual 25,000-cycle high-life torsion springs + replacement aircraft cables', amount: 380 },
            { description: '10 Sealed 13-ball-bearing nylon quiet rollers (reduces operating noise by 75%)', amount: 200 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Complete Rebuild + LiftMaster Smart Opener',
          total: 1150,
          deposit: 300,
          depositLabel: 'Booking Deposit',
          highlight: '25k springs, nylon rollers + LiftMaster 87504 Secure View Belt-Drive Opener with Camera & Battery Backup.',
          items: [
            { description: 'Complete spring and quiet roller rebuild package with lifetime parts warranty', amount: 550 },
            { description: 'LiftMaster 87504 Belt-Drive Opener with built-in Wi-Fi camera, battery backup & keypad', amount: 600 },
          ],
        },
      ],
      proTip: 'Upselling high-cycle springs and ultra-quiet nylon rollers during emergency broken-spring calls increases average repair tickets by $220.',
    },
    workflow: [
      {
        step: 1,
        title: 'Spring & Opener Visual Intake',
        description: 'Homeowner photographs broken spring or opener model. AI identifies door size (single vs double car), track clearance, and spring type.',
        badge: 'Photo Triage',
      },
      {
        step: 2,
        title: 'Good / Better / Best Package Proposal',
        description: 'Present tiered proposals comparing standard 10k springs vs 25k high-life rebuilds vs smart opener installations in seconds on mobile.',
        badge: 'Tiered Proposals',
      },
      {
        step: 3,
        title: 'Card-on-File Emergency Dispatch',
        description: 'Homeowner selects package and confirms same-day dispatch arrival window with pre-authorized card on file.',
        badge: 'Same-Day Booking',
      },
      {
        step: 4,
        title: 'Safety Inspection & Instant Settlement',
        description: 'Technician completes 25-point safety inspection, tests balance, takes completion photo, and charges card on file.',
        badge: 'Instant Settlement',
      },
    ],
    faqs: [
      {
        question: 'How do garage door technicians quote on-site repair packages?',
        answer: 'Technicians can present Good/Better/Best repair packages (Standard 10k Springs vs High-Cycle 25k Springs with Nylon Rollers vs Full Opener Overhaul) on any phone or tablet in under 60 seconds.',
      },
      {
        question: 'Can I include safety inspection checklists in the digital quote?',
        answer: 'Yes. Technicians can attach a 25-point safety inspection checklist (spring tension, sensor alignment, roller wear, cable condition) directly to the customer’s invoice.',
      },
      {
        question: 'How does Quick Stops help garage door dispatchers?',
        answer: 'When a technician finishes a spring repair early, Quick Stops alerts nearby homeowners seeking opener diagnostics along the active driving route.',
      },
      {
        question: 'Can I collect payments immediately upon job completion?',
        answer: 'Yes. With tokenized cards on file through Stripe, the final invoice can be settled with one tap upon customer signature.',
      },
      {
        question: 'How does Let’s Get Quoted help garage door companies rank on Google?',
        answer: 'Your website includes localized emergency garage door schema markup, automated review requests, and fast mobile landing pages.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$620',
      closeRateLift: '+44%',
      hoursSavedWeekly: '5.0 hrs',
    },
  },

  'pool-builders': {
    slug: 'pool-builders',
    heroKicker: 'Custom Inground Swimming Pool Construction & 3D Design CRM',
    sampleSubdomain: 'oasis-custom-pools.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Custom Inground Gunite Pool & Spa (16ft x 36ft)',
      scopeSummary: 'Excavation, steel rebar cage, shotcrete/gunite shell, travertine coping, waterline tile, Hayward variable-speed pump, and saltwater chlorination.',
      timeline: '6-Week Construction Build',
      tiers: [
        {
          tierName: 'Good',
          label: 'Classic 16x32 Gunite Pool',
          total: 58000,
          deposit: 11600,
          depositLabel: '20% Excavation Deposit',
          highlight: '16x32 Gunite pool, plaster finish, concrete deck collar, and variable-speed pump.',
          items: [
            { description: 'Excavation, soil hauling, steel rebar cage & 4,000 PSI shotcrete shell', amount: 24000 },
            { description: 'Plumbing rough-in, dual main drains, 2 skimmers & Hayward variable-speed pump', amount: 12000 },
            { description: 'Standard waterline tile, coping, and white plaster quartz interior finish', amount: 22000 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Pool + Raised Spillover Spa + Travertine Deck',
          badge: 'Most Popular',
          total: 82000,
          deposit: 16400,
          depositLabel: '20% Excavation Deposit',
          highlight: '16x36 Pool + 7x7 raised spillover spa, PebbleTec finish, and 600 sq ft travertine deck.',
          items: [
            { description: 'Excavation, shotcrete pool shell, raised spa structure & plumbing manifold', amount: 34000 },
            { description: 'Hayward Omnilogic automation, Hayward gas heater, and saltwater chlorinator', amount: 18000 },
            { description: '600 sq ft Premium French pattern travertine paver decking & PebbleTec interior', amount: 30000 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Resort Oasis + Sun Shelf + Fire Bowls & LED',
          total: 115000,
          deposit: 23000,
          depositLabel: '20% Excavation Deposit',
          highlight: 'Large tanning ledge with bubblers, 3 sheer descent waterfalls, LED color lights & copper fire bowls.',
          items: [
            { description: 'Custom architectural excavation, steel framing, gunite shell, sun shelf & spa', amount: 48000 },
            { description: 'Commercial-grade filtration, dual heaters, OmniLogic smart phone control', amount: 24000 },
            { description: 'Glass tile waterline, PebbleSheen interior, 3 water shears & 2 automated fire bowls', amount: 43000 },
          ],
        },
      ],
      proTip: 'Staging pool construction draws into 5 milestone phases (20% Excavation / 20% Gunite / 20% Plumbing / 20% Decking / 20% Plaster) guarantees positive cash flow.',
    },
    workflow: [
      {
        step: 1,
        title: 'Lot Dimensions & Setback Scoping',
        description: 'Homeowner inputs lot address. Property Intelligence inspects parcel dimensions, ground footprint, and utility setbacks.',
        badge: 'Parcel Intelligence',
      },
      {
        step: 2,
        title: '3D Design & 3-Tier Proposal',
        description: 'Present Good/Better/Best pool packages comparing standard plaster vs PebbleTec vs raised spillover spas with equipment specs.',
        badge: 'Luxury Proposals',
      },
      {
        step: 3,
        title: '5-Phase Milestone Contract',
        description: 'Contractor and client e-sign digital agreement with 5 automated milestone payment draws on Stripe.',
        badge: 'Milestone Draws',
      },
      {
        step: 4,
        title: 'Client Portal Construction Log',
        description: 'Homeowner tracks excavation, steel, gunite, tile, and plaster progress photos in their private client portal.',
        badge: 'Client Portal',
      },
    ],
    faqs: [
      {
        question: 'How do pool builders manage 5-phase milestone progress payments?',
        answer: 'You can configure multi-stage draws (e.g. 20% deposit at contract signing, 20% at excavation/steel, 20% at gunite pour, 20% at decking/tile, and 20% at interior plaster/filling) billed securely through Stripe.',
      },
      {
        question: 'Can I attach 3D architectural renders and engineering plans to quotes?',
        answer: 'Yes. High-resolution 3D pool renderings, site plan PDFs, and equipment spec sheets attach directly to the digital proposal.',
      },
      {
        question: 'How does Let’s Get Quoted handle change orders during pool construction?',
        answer: 'When a homeowner decides to add bubblers, upgrade to glass tile, or extend travertine decking, you can generate a digital change order with instant e-signatures and payment adjustments.',
      },
      {
        question: 'Does Let’s Get Quoted support swimming pool service and maintenance contracts?',
        answer: 'Yes. Once a pool build is complete, you can transition the homeowner into a recurring monthly chemical and cleaning service agreement billed automatically on Stripe.',
      },
      {
        question: 'How much does Let’s Get Quoted cost for pool builders?',
        answer: 'You can start on the Flex plan at $0/month base with a transparent 1.25% fee paid only when you collect money from clients, with zero setup fees.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$75,000',
      closeRateLift: '+32%',
      hoursSavedWeekly: '9.0 hrs',
    },
  },

  'water-damage-restoration': {
    slug: 'water-damage-restoration',
    heroKicker: '24/7 Emergency Water Damage & Mold Remediation Operating System',
    sampleSubdomain: 'rapid-dry-restoration.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Emergency Category 2 Water Extraction & Structural Drying',
      scopeSummary: 'Immediate water extraction from 3 rooms, containment barrier setup, antimicrobial spray, 6 commercial LGR dehumidifiers, and 12 air movers for 3-day dryout.',
      timeline: '3-Day Structural Drying & Monitoring',
      tiers: [
        {
          tierName: 'Good',
          label: 'Water Extraction & Surface Dry',
          total: 1850,
          deposit: 500,
          depositLabel: 'Emergency Dispatch Deposit',
          highlight: 'Immediate water extraction, moisture mapping, and 24-hour equipment deployment.',
          items: [
            { description: 'Emergency after-hours dispatch, moisture inspection & thermal imaging map', amount: 450 },
            { description: 'Standing water extraction from hard surface flooring and subfloor', amount: 650 },
            { description: 'Deployment of 2 commercial LGR dehumidifiers & 4 centrifugal air movers (24 hrs)', amount: 750 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Complete 3-Day IICRC Dryout Package',
          badge: 'Most Popular',
          total: 3850,
          deposit: 1000,
          depositLabel: 'Insurance Deductible Deposit',
          highlight: 'Full IICRC S500 structural dryout, containment barrier, daily psychrometric monitoring & antimicrobial spray.',
          items: [
            { description: 'Emergency extraction, baseboard removal, and wall cavity drying injections', amount: 950 },
            { description: '3-Day equipment rental: 4 LGR dehumidifiers, 10 air movers & HEPA air scrubber', amount: 2100 },
            { description: 'Antimicrobial treatment, daily digital moisture psychrometric logging & report', amount: 800 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Total Remediation + Controlled Tear-Out + Reconstruction Prep',
          total: 6500,
          deposit: 1500,
          depositLabel: 'Insurance Deductible Deposit',
          highlight: 'Full structural dryout + controlled flood cut drywall removal, carpet disposal, and clearance cert.',
          items: [
            { description: 'Complete water extraction, 3-day commercial drying & HEPA air filtration', amount: 3200 },
            { description: 'Controlled drywall flood cuts (2ft up), wet insulation removal & bagged disposal', amount: 2100 },
            { description: 'Negative air containment, mold inhibitor application & reconstruction scope packet', amount: 1200 },
          ],
        },
      ],
      proTip: 'Capturing thermal imaging photos and psychrometric moisture logs inside digital quotes speeds up insurance claim approvals by 10 days.',
    },
    workflow: [
      {
        step: 1,
        title: '24/7 Flood & Leak Emergency Triage',
        description: 'Homeowner submits water leak photos. AI classifies water category (Clean Cat 1 vs Gray Cat 2 vs Black Cat 3) and dispatches instant SMS alerts.',
        badge: 'Emergency Triage',
      },
      {
        step: 2,
        title: 'Work Authorization & Direct E-Sign',
        description: 'Technician arrives on site, presents emergency mitigation work authorization, and collects homeowner signature on mobile in 30 seconds.',
        badge: 'Work Authorization',
      },
      {
        step: 3,
        title: 'Insurance Deductible Deposit',
        description: 'Homeowner pays insurance deductible deposit via Apple Pay while restoration contractor compiles Xactimate-compatible scope logs.',
        badge: 'Deductible Payment',
      },
      {
        step: 4,
        title: 'Daily Psychrometric Moisture Log',
        description: 'Technicians log daily humidity and wood moisture readings with photos, attaching drying certs directly to the customer portal.',
        badge: 'Clearance Report',
      },
    ],
    faqs: [
      {
        question: 'How does Let’s Get Quoted handle emergency 24/7 water damage dispatches?',
        answer: 'Your website includes 24/7 AI Smart Intake that prompts callers for flood source, standing water depth, and photo attachments, sending high-priority SMS alerts directly to your on-call technicians.',
      },
      {
        question: 'Can technicians collect digital Emergency Work Authorizations on site?',
        answer: 'Yes. Technicians can have homeowners review and e-sign digital Work Authorizations, Assignment of Benefits (AOB), and Direction to Pay agreements on any mobile device immediately upon arrival.',
      },
      {
        question: 'How do moisture readings and thermal photos attach to the job record?',
        answer: 'Technicians can upload daily moisture probe readings, relative humidity measurements, and infrared thermal photos directly to the digital job record for insurance adjuster review.',
      },
      {
        question: 'Can I collect insurance deductibles directly through the platform?',
        answer: 'Yes. You can collect homeowner insurance deductibles (e.g. $500–$2,500) via Stripe on site, and bill the remaining balance to the insurance carrier.',
      },
      {
        question: 'How does Let’s Get Quoted compare to Encircle or Dash for restoration contractors?',
        answer: 'Let’s Get Quoted gives independent restoration contractors a complete public marketing website, 24/7 AI intake, digital authorizations, and payments starting at $0/month on Flex.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$4,200',
      closeRateLift: '+46%',
      hoursSavedWeekly: '6.0 hrs',
    },
  },

  insulation: {
    slug: 'insulation',
    heroKicker: 'Insulation, Spray Foam & Crawlspace Encapsulation CRM',
    sampleSubdomain: 'thermal-seal-insulation.letsgetquoted.com',
    quoteExample: {
      projectTitle: 'Attic Air Sealing & Blown-In Cellulose (R-49 / 1,500 Sq Ft)',
      scopeSummary: 'Rodent waste sanitization, removal of old fiberglass batts, expanding foam air sealing of top plates and wire penetrations, and R-49 blown cellulose.',
      timeline: '1-Day Complete Attic Retrofit',
      tiers: [
        {
          tierName: 'Good',
          label: 'Blown-In Top-Off (R-38)',
          total: 2200,
          deposit: 700,
          depositLabel: '33% Booking Deposit',
          highlight: 'Blown-in cellulose over existing insulation to reach R-38 code compliance.',
          items: [
            { description: 'Attic hatch weatherstripping, bath fan vent ducting check & baffles', amount: 400 },
            { description: 'Blown-in virgin cellulose insulation (approx 8" added depth to reach R-38)', amount: 1800 },
          ],
        },
        {
          tierName: 'Better',
          label: 'Full Extraction + Air Seal + R-49',
          badge: 'Most Popular',
          total: 4600,
          deposit: 1500,
          depositLabel: '33% Material Deposit',
          highlight: 'Old insulation vacuum removal, comprehensive air sealing & R-49 blown cellulose.',
          items: [
            { description: 'Complete vacuum extraction of contaminated old insulation and bagged disposal', amount: 1600 },
            { description: 'Expanding foam air-sealing of all ceiling electrical penetrations and top plates', amount: 1200 },
            { description: 'Blown-in borate-treated cellulose insulation to R-49 depth + rafter ventilation baffles', amount: 1800 },
          ],
        },
        {
          tierName: 'Best',
          label: 'Closed-Cell Spray Foam Hot-Roof Caps',
          total: 7800,
          deposit: 2600,
          depositLabel: '33% Material Deposit',
          highlight: 'Old insulation removal + 3.5" closed-cell spray foam applied directly to roof underside deck.',
          items: [
            { description: 'Complete vacuum removal of attic floor insulation and microbial fogging', amount: 1800 },
            { description: '3.5" Closed-Cell 2.0 lb spray foam insulation applied directly to roof rafters (R-24 vapor barrier)', amount: 5200 },
            { description: 'Thermal barrier ignition coating application to meet local building code', amount: 800 },
          ],
        },
      ],
      proTip: 'Highlighting local utility energy rebates alongside air-sealing and spray foam tiers increases proposal close rates by 35%.',
    },
    workflow: [
      {
        step: 1,
        title: 'Attic Square Footage & R-Value Scoping',
        description: 'Property Intelligence calculates attic floor area from parcel footprint while intake questionnaire checks current R-value and drafts.',
        badge: 'Building Specs',
      },
      {
        step: 2,
        title: 'Multi-Tier R-Value Proposal',
        description: 'Send itemized Good/Better/Best options comparing blown-in top-off vs full air-seal vs closed-cell spray foam on mobile.',
        badge: 'R-Value Math',
      },
      {
        step: 3,
        title: 'Rebate & Material Deposit',
        description: 'Homeowner signs contract with utility rebate deduction and pays material deposit online via Stripe.',
        badge: 'Rebate Deposit',
      },
      {
        step: 4,
        title: 'Thermal Camera Sign-Off',
        description: 'Technician takes thermal imaging photos showing eliminated drafts, collects digital sign-off, and settles card on file.',
        badge: 'Thermal Proof',
      },
    ],
    faqs: [
      {
        question: 'How does Let’s Get Quoted calculate attic square footage and R-values?',
        answer: 'Property Intelligence analyzes the building’s ground footprint and story count to estimate total attic floor square footage, allowing you to quote accurate cellulose bag counts and spray foam drum sets.',
      },
      {
        question: 'Can I include utility energy efficiency rebates in my quotes?',
        answer: 'Yes. You can itemize utility rebate discounts and federal energy tax credits (Inflation Reduction Act Section 25C) directly in your Good/Better/Best tiers.',
      },
      {
        question: 'How do upfront deposits protect insulation contractors?',
        answer: 'Spray foam chemical sets and cellulose insulation represent significant upfront material costs. Collecting a 33% Stripe deposit upon quote acceptance funds materials before the truck rolls.',
      },
      {
        question: 'Can I quote crawlspace encapsulation alongside attic insulation?',
        answer: 'Yes. You can bundle crawlspace vapor barrier encapsulation, sump pump installations, and dehumidifier setups into your tiered proposals.',
      },
      {
        question: 'How does Let’s Get Quoted compare to Jobber for insulation contractors?',
        answer: 'Let’s Get Quoted gives you a free SEO marketing website, instant thermal quote widgets, and $0/mo entry on Flex, saving thousands annually compared to expensive fixed software subscriptions.',
      },
    ],
    industryBenchmark: {
      avgTicket: '$4,600',
      closeRateLift: '+38%',
      hoursSavedWeekly: '5.5 hrs',
    },
  },
};

export function getDefinitiveTradeData(slug: string): DefinitiveTradeData | null {
  return TOP_20_DEFINITIVE_TRADES[slug] ?? null;
}
