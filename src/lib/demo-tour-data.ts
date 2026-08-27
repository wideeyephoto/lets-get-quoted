/**
 * Canonical 5-minute evaluation demo tour fixture.
 *
 * Provides a single, consistent customer and job lifecycle story across all 6 steps:
 * 1. Homeowner visits contractor website
 * 2. Homeowner requests estimate via AI intake
 * 3. Contractor receives pre-scored HOT lead (94/100)
 * 4. Contractor reviews & sends itemized quote with optional lighting upgrade
 * 5. Homeowner approves upgrade, e-signs, pays a simulated deposit & books arrival
 * 6. Tour completion with direct links to start free or explore dashboard
 *
 * Standardized on Evergreen Lawn & Landscape (Royal Oak, MI) to unify the
 * guided tour with the broader /demo/* exploratory fixture ecosystem.
 */

export type TourStepMetadata = {
  step: number;
  slug: string;
  href: string;
  phase: string;
  perspective: 'homeowner' | 'contractor' | 'summary';
  perspectiveLabel: string;
  title: string;
  shortTitle: string;
  description: string;
  outcomeHeadline: string;
  summary: string;
  nextPreview: string;
  nextActionLabel: string;
  flow: readonly string[];
  perspectiveShift?: string;
  nextHref: string | null;
  prevHref: string | null;
};

export const TOUR_STEPS: TourStepMetadata[] = [
  {
    step: 1,
    slug: 'site',
    href: '/demo/tour/site',
    phase: 'Attract',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Visit Contractor Website',
    shortTitle: 'Contractor Website',
    description: 'A prospective homeowner lands on your free, high-converting contractor website.',
    outcomeHeadline: 'A homeowner discovers your business and starts an estimate—without calling.',
    summary: 'See the first moment a polished contractor website turns local interest into a real project request.',
    nextPreview: 'AI gathers the project details, budget, timing, and photos while the homeowner is still engaged.',
    nextActionLabel: 'Start the estimate',
    flow: ['Discover', 'Request', 'Qualify'],
    nextHref: '/demo/tour/intake',
    prevHref: null,
  },
  {
    step: 2,
    slug: 'intake',
    href: '/demo/tour/intake',
    phase: 'Qualify',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Request an Instant Estimate',
    shortTitle: 'AI Intake Form',
    description: 'The homeowner submits a project request; AI qualifies fit and gathers job details 24/7.',
    outcomeHeadline: 'AI understands the project before you ever pick up the phone.',
    summary: 'The request becomes structured scope, urgency, route fit, and an estimated project range in seconds.',
    nextPreview: 'Switch to the contractor view and see exactly why this opportunity ranks as a hot lead.',
    nextActionLabel: 'See the qualified lead',
    flow: ['Scope', 'Budget', 'Timing', 'Route fit'],
    nextHref: '/demo/tour/lead',
    prevHref: '/demo/tour/site',
  },
  {
    step: 3,
    slug: 'lead',
    href: '/demo/tour/lead',
    phase: 'Prioritize',
    perspective: 'contractor',
    perspectiveLabel: 'Contractor Perspective',
    title: 'Receive Qualified Lead',
    shortTitle: 'Ranked Lead',
    description: 'Switch perspectives: See how the lead arrives pre-scored with scope, urgency, and route fit.',
    outcomeHeadline: 'Know which opportunities deserve attention before responding.',
    summary: 'Instead of a vague form submission, the contractor receives a scored lead with the context needed to act.',
    nextPreview: 'Turn the qualified scope into an itemized quote, add an upgrade, and preview delivery.',
    nextActionLabel: 'Build the quote',
    flow: ['94/100 score', 'Route matched', 'Ready to quote'],
    perspectiveShift: 'Perspective shift: you are now seeing the same job from the contractor dashboard.',
    nextHref: '/demo/tour/quote',
    prevHref: '/demo/tour/intake',
  },
  {
    step: 4,
    slug: 'quote',
    href: '/demo/tour/quote',
    phase: 'Quote',
    perspective: 'contractor',
    perspectiveLabel: 'Contractor Perspective',
    title: 'Prepare & Send Quote',
    shortTitle: 'Itemized Quote',
    description: 'Review itemized pricing, add optional upgrades, and send to the customer via SMS.',
    outcomeHeadline: 'Build, upgrade, and send an itemized quote in minutes.',
    summary: 'Pricing, optional work, deposit terms, and customer delivery stay connected to the original request.',
    nextPreview: 'Return to the homeowner view to approve the quote, sign, pay the deposit, and choose an arrival window.',
    nextActionLabel: 'Review as homeowner',
    flow: ['Price', 'Upgrade', 'Send'],
    nextHref: '/demo/tour/approve',
    prevHref: '/demo/tour/lead',
  },
  {
    step: 5,
    slug: 'approve',
    href: '/demo/tour/approve',
    phase: 'Close',
    perspective: 'homeowner',
    perspectiveLabel: 'Homeowner Perspective',
    title: 'Approve, Sign & Pay Deposit',
    shortTitle: 'Customer Approval',
    description: 'Switch perspectives: Customer approves upgrades, e-signs, pays deposit, and books window.',
    outcomeHeadline: 'The homeowner approves, signs, pays, and books without phone tag.',
    summary: 'A single mobile-friendly approval flow removes the usual gaps between “yes,” signature, payment, and scheduling.',
    nextPreview: 'See the booked revenue, deposit, crew assignment, and complete job record created by the connected flow.',
    nextActionLabel: 'See the business result',
    flow: ['Approve', 'Sign', 'Deposit', 'Book'],
    perspectiveShift: 'Perspective shift: you are back in the homeowner’s mobile approval experience.',
    nextHref: '/demo/tour/complete',
    prevHref: '/demo/tour/quote',
  },
  {
    step: 6,
    slug: 'complete',
    href: '/demo/tour/complete',
    phase: 'Result',
    perspective: 'summary',
    perspectiveLabel: 'Evaluation Complete',
    title: 'Tour Complete',
    shortTitle: 'Next Steps',
    description: 'You experienced the full 5-step lifecycle. Start your free website or explore the dashboard.',
    outcomeHeadline: 'One connected system moved a lead from first click to booked, paid work.',
    summary: 'Every step kept the same customer, scope, quote, payment, and schedule in context—without duplicate entry.',
    nextPreview: 'Explore the full demo dashboard or start building the same workflow for your business.',
    nextActionLabel: 'Explore the full demo',
    flow: ['Attracted', 'Qualified', 'Quoted', 'Booked'],
    nextHref: null,
    prevHref: '/demo/tour/approve',
  },
];

export const DEMO_SHOWCASE_WORKFLOW = {
  company: {
    name: 'Evergreen Lawn & Landscape',
    ownerName: 'Dana Whitfield',
    trade: 'Lawn Care & Landscape Construction',
    tradeKey: 'landscaping',
    tradeCta: 'Build my landscaping site →',
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
    leadFitReason: 'High project value ($12k+), homeowner owns property, 2.1 miles from Thursday route.',
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
        amount: 10850,
      },
      {
        id: 'item-2',
        title: 'Integrated Curved Seat Wall (24 linear ft)',
        description: 'Commercial retaining block core with smooth capstone, structural outdoor adhesive, and finished end pillars.',
        amount: 1800,
      },
      {
        id: 'item-3',
        title: 'Built-in Natural Stone Fire Pit Unit',
        description: 'Heavy-gauge steel insert, fire-rated block enclosure, coping stone border, and integrated draft vents.',
        amount: 1500,
      },
      {
        id: 'item-4',
        title: 'Sub-base Drainage & Heavy Edge Restraint System',
        description: 'Commercial snap edging with 10" steel spikes, geotextile separation fabric, and tie-in to downspout run.',
        amount: 1100,
      },
    ],

    optionalUpgrades: [
      {
        id: 'upgrade-lighting',
        title: 'Low-Voltage Hardscape & Step LED Lighting Package',
        description: '6 flush-mount under-cap LED lights, waterproof wiring, and commercial transformer with smart dusk-to-dawn timer.',
        amount: 750,
        recommended: true,
      },
    ],

    baseTotal: 15250,
    upgradeTotal: 750,
    totalWithUpgrade: 16000,
    requiredDeposit: 1600,
    depositPaidStatus: 'PAID ($1,600 via Apple Pay)',
  },
} as const;

export const DEMO_TOUR_CONTRACTOR = DEMO_SHOWCASE_WORKFLOW.company;
export const DEMO_TOUR_CUSTOMER = DEMO_SHOWCASE_WORKFLOW.customer;
export const DEMO_TOUR_JOB = DEMO_SHOWCASE_WORKFLOW.job;
