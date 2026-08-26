/**
 * Canonical 5-minute evaluation demo tour fixture.
 *
 * Provides a single, consistent customer and job lifecycle story across all 6 steps:
 * 1. Homeowner visits contractor website
 * 2. Homeowner requests estimate via AI intake
 * 3. Contractor receives pre-scored HOT lead (94/100)
 * 4. Contractor reviews & sends itemized quote with optional lighting upgrade
 * 5. Homeowner approves upgrade, e-signs, pays $500 simulated deposit & books arrival
 * 6. Tour completion with direct links to start free or explore dashboard
 *
 * Standardized on Evergreen Lawn & Landscape (Royal Oak, MI) to unify the
 * guided tour with the broader /demo/* exploratory fixture ecosystem.
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

export const DEMO_SHOWCASE_WORKFLOW = {
  company: {
    name: 'Evergreen Lawn & Landscape',
    ownerName: 'Dana Whitfield',
    trade: 'Lawn Care & Landscape Construction',
    phone: '(248) 555-0142',
    email: 'service@evergreenlawn.letsgetquoted.com',
    city: 'Royal Oak',
    state: 'MI',
    zip: '48067',
    serviceArea: 'Royal Oak, Ferndale, Berkley, Clawson & Troy',
    rating: '4.9 ★ (128 Google Reviews)',
    license: 'MI Lic #24VH09842100',
    badge: 'Licensed · Insured · 24/7 Response',
  },
  customer: {
    name: 'Taylor Brooks',
    email: 'taylor.brooks@example.com',
    phone: '(248) 555-0212',
    address: '14 Pinehurst Dr',
    city: 'Royal Oak',
    state: 'MI',
    zip: '48067',
    propertyType: 'Single Family Residential · 3,200 sq ft lot',
    projectArea: 'Rear patio & backyard living space',
  },
  job: {
    id: 'JOB-2084',
    leadId: 'LEAD-9042',
    quoteId: 'Q-7721',
    title: 'Paver Patio (380 sq ft) with Fire Pit & Seat Wall',
    category: 'Hardscaping & Landscape Construction',
    homeownerInquiry:
      'Would love a custom paver patio with a built-in fire pit and seat wall for outdoor entertaining this summer. We have roughly 400 sq ft of space behind our kitchen slider. Can we get an itemized estimate with timeline?',
    leadScore: 94,
    leadScoreLabel: 'HOT · Immediate Action',
    leadFitReason: 'High project value ($5k+), homeowner owns property, 2.1 miles from Thursday route.',
    distanceMiles: 2.1,
    timeline: 'Needs completion within 2 weeks',
    urgency: 'High (Summer entertaining / upcoming event)',
    quoteCreatedDate: 'Today',
    scheduledDate: 'Thursday, Aug 28',
    scheduledArrivalWindow: '8:00 AM – 10:00 AM',
    estimatedDuration: '6 hours on site',
    crewAssigned: 'Mike Torres (Crew Lead) & Jamal Reed',

    lineItems: [
      {
        id: 'item-1',
        title: '380 sq ft Unilock Paver Patio Installation',
        description: 'Excavation, 6" compacted crushed aggregate base, 1" coarse bedding sand, precision paver lay, and polymeric sand jointing.',
        amount: 2850,
      },
      {
        id: 'item-2',
        title: 'Integrated Curved Seat Wall (24 linear ft)',
        description: 'Commercial retaining block core with smooth capstone, structural outdoor adhesive, and finished end pillars.',
        amount: 650,
      },
      {
        id: 'item-3',
        title: 'Built-in Natural Stone Fire Pit Unit',
        description: 'Heavy-gauge steel insert, fire-rated block enclosure, coping stone border, and integrated draft vents.',
        amount: 850,
      },
      {
        id: 'item-4',
        title: 'Sub-base Drainage & Heavy Edge Restraint System',
        description: 'Commercial snap edging with 10" steel spikes, geotextile separation fabric, and tie-in to downspout run.',
        amount: 300,
      },
    ],

    optionalUpgrades: [
      {
        id: 'upgrade-lighting',
        title: 'Low-Voltage Hardscape & Step LED Lighting Package',
        description: '6 flush-mount under-cap LED lights, waterproof wiring, and commercial transformer with smart dusk-to-dawn timer.',
        amount: 350,
        recommended: true,
      },
    ],

    baseTotal: 4650,
    upgradeTotal: 350,
    totalWithUpgrade: 5000,
    requiredDeposit: 500,
    depositPaidStatus: 'PAID ($500 via Apple Pay)',
  },
} as const;

export const DEMO_TOUR_CONTRACTOR = DEMO_SHOWCASE_WORKFLOW.company;
export const DEMO_TOUR_CUSTOMER = DEMO_SHOWCASE_WORKFLOW.customer;
export const DEMO_TOUR_JOB = DEMO_SHOWCASE_WORKFLOW.job;
