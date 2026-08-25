/**
 * Canonical 5-minute evaluation demo tour fixture.
 *
 * Provides a single, consistent customer and job lifecycle story across all 6 steps:
 * 1. Homeowner visits contractor website
 * 2. Homeowner requests estimate via AI intake
 * 3. Contractor receives pre-scored HOT lead (94/100)
 * 4. Contractor reviews & sends itemized quote with optional surge protection upgrade
 * 5. Homeowner approves upgrade, e-signs, pays $500 simulated deposit & books arrival
 * 6. Tour completion with direct links to start free or explore dashboard
 */

export type TourStepMetadata = {
  step: number;
  slug: string;
  href: string;
  perspective: 'homeowner' | 'contractor' | 'summary';
  perspectiveLabel: string;
  title: string;
  shortTitle: string;
  description: string;
  nextHref: string | null;
  prevHref: string | null;
};

export const TOUR_STEPS: TourStepMetadata[] = [
  {
    step: 1,
    slug: 'site',
    href: '/demo/tour/site',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Visit Contractor Website',
    shortTitle: 'Contractor Website',
    description: 'A prospective homeowner lands on your free, high-converting contractor website.',
    nextHref: '/demo/tour/intake',
    prevHref: null,
  },
  {
    step: 2,
    slug: 'intake',
    href: '/demo/tour/intake',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Request an Instant Estimate',
    shortTitle: 'AI Intake Form',
    description: 'The homeowner submits a project request; AI qualifies fit and gathers job details 24/7.',
    nextHref: '/demo/tour/lead',
    prevHref: '/demo/tour/site',
  },
  {
    step: 3,
    slug: 'lead',
    href: '/demo/tour/lead',
    perspective: 'contractor',
    perspectiveLabel: 'Contractor Perspective',
    title: 'Receive Qualified Lead',
    shortTitle: 'Ranked Lead',
    description: 'Switch perspectives: See how the lead arrives pre-scored with scope, urgency, and route fit.',
    nextHref: '/demo/tour/quote',
    prevHref: '/demo/tour/intake',
  },
  {
    step: 4,
    slug: 'quote',
    href: '/demo/tour/quote',
    perspective: 'contractor',
    perspectiveLabel: 'Contractor Perspective',
    title: 'Prepare & Send Quote',
    shortTitle: 'Itemized Quote',
    description: 'Review itemized pricing, add optional upgrades, and send to the customer via SMS.',
    nextHref: '/demo/tour/approve',
    prevHref: '/demo/tour/lead',
  },
  {
    step: 5,
    slug: 'approve',
    href: '/demo/tour/approve',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Approve, Sign & Pay Deposit',
    shortTitle: 'Customer Approval',
    description: 'Switch perspectives: Customer approves upgrades, e-signs, pays deposit, and books window.',
    nextHref: '/demo/tour/complete',
    prevHref: '/demo/tour/quote',
  },
  {
    step: 6,
    slug: 'complete',
    href: '/demo/tour/complete',
    perspective: 'summary',
    perspectiveLabel: 'Evaluation Complete',
    title: 'Tour Complete',
    shortTitle: 'Next Steps',
    description: 'You experienced the full 5-step lifecycle. Start your free website or explore the dashboard.',
    nextHref: null,
    prevHref: '/demo/tour/approve',
  },
];

export const DEMO_TOUR_CONTRACTOR = {
  name: 'Timberline Electrical & Modernization',
  trade: 'Licensed Electrical Contractor',
  phone: '(973) 555-0199',
  email: 'service@timberline-electric.com',
  city: 'Maplewood',
  state: 'NJ',
  zip: '07040',
  serviceArea: 'Maplewood, Millburn, South Orange & Summit',
  rating: '4.9 ★ (128 Google Reviews)',
  license: 'NJ Lic #13VH09842100',
  badge: 'Licensed · Insured · 24/7 Response',
};

export const DEMO_TOUR_CUSTOMER = {
  name: 'Sarah Jenkins',
  email: 'sarah.jenkins@example.com',
  phone: '(973) 555-0142',
  address: '742 Evergreen Terrace',
  city: 'Maplewood',
  state: 'NJ',
  zip: '07040',
  propertyType: 'Single Family Residential · 2,400 sq ft',
  panelLocation: 'Basement utility wall',
  garageLocation: 'Attached 2-car garage (45 ft run)',
};

export const DEMO_TOUR_JOB = {
  id: 'JOB-2084',
  leadId: 'LEAD-9042',
  quoteId: 'Q-7721',
  title: '200A Main Service Panel Upgrade & Level 2 EV Charger',
  category: 'Electrical Modernization',
  homeownerInquiry:
    'Hi! We just purchased a Tesla Model Y and need a Level 2 charger installed in our attached garage. Our current main electric panel is an older 100A Federal Pacific box, so our electrician friend said we need a 200A heavy-up upgrade first. Can we get an itemized estimate?',
  leadScore: 94,
  leadScoreLabel: 'HOT · Immediate Action',
  leadFitReason: 'High project value ($4k+), homeowner owns property, 2.1 miles from Thursday route.',
  distanceMiles: 2.1,
  timeline: 'Needs completion within 2 weeks',
  urgency: 'High (Vehicle arrives next week)',
  quoteCreatedDate: 'Today',
  scheduledDate: 'Thursday, Aug 28',
  scheduledArrivalWindow: '8:00 AM – 10:00 AM',
  estimatedDuration: '6 hours on site',
  crewAssigned: 'Marcus Rivera (Lead Master Electrician) & Tyler Hayes',

  lineItems: [
    {
      id: 'item-1',
      title: '200-Amp Main Service Panel Upgrade',
      description: 'Remove existing 100A panel, install Square D QO 40-space 200A main breaker panel, arc-fault/ground-fault dual function breakers.',
      amount: 2850,
    },
    {
      id: 'item-2',
      title: 'Grounding Electrode & Bonding System (NEC 2023 Compliant)',
      description: 'Drive dual copper grounding rods, install #4 bare copper grounding conductor to incoming water main with inter-system bonding bridge.',
      amount: 650,
    },
    {
      id: 'item-3',
      title: 'Dedicated 50A Level 2 EV Charger Circuit',
      description: 'Run 6/3 NM-B copper cable from panel to garage wall, install industrial-grade NEMA 14-50 receptacle in weatherproof enclosure.',
      amount: 850,
    },
    {
      id: 'item-4',
      title: 'Municipal Permit Filing & Inspection Coordination',
      description: 'Prepare electrical schematics, submit Maplewood Township permit application, and meet town inspector on site.',
      amount: 300,
    },
  ],

  optionalUpgrades: [
    {
      id: 'upgrade-surge',
      title: 'Whole-Home Type 2 Surge Protection Device',
      description: 'Square D HEPD80 whole-house surge protector (80kA surge current rating) protecting EV charger, HVAC, and smart appliances.',
      amount: 350,
      recommended: true,
    },
  ],

  baseTotal: 4650,
  upgradeTotal: 350,
  totalWithUpgrade: 5000,
  requiredDeposit: 500,
  depositPaidStatus: 'PAID ($500 via Apple Pay)',
};
