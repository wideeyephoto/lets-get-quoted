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
    name: 'Broke Pipes Plumbing',
    ownerName: 'Brett Miller',
    trade: 'Licensed Master Plumber & Emergency Repair',
    tradeKey: 'plumber',
    tradeCta: 'Build my plumbing site →',
    phone: '(248) 555-0199',
    email: 'service@brokepipes.letsgetquoted.com',
    city: 'Royal Oak',
    state: 'MI',
    zip: '48067',
    serviceArea: 'Royal Oak, Ferndale, Berkley, Birmingham, Clawson & Troy',
    rating: '4.9 ★ (142 Google Reviews)',
    license: 'MI Master Plumber Lic #8104921',
    badge: 'Licensed Master Plumber · Insured · 24/7 Emergency Dispatch',
  },
  customer: {
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '(248) 555-0199',
    address: '421 Elmhurst Ave',
    city: 'Royal Oak',
    state: 'MI',
    zip: '48067',
    propertyType: 'Single Family Residential · 2-Story Colonial',
    projectArea: 'Basement ceiling joist bay & supply line',
  },
  job: {
    id: 'J-1048',
    leadId: 'LEAD-1048',
    quoteId: 'Q-1048',
    title: 'Emergency Copper Supply Line Leak Repair & Pressure Certification',
    category: 'Emergency Plumbing Repair',
    homeownerInquiry:
      'Water is leaking through our kitchen ceiling from an upstairs pipe. Main shutoff is off. Attached photo of copper line dripping in basement joist bay.',
    leadScore: 98,
    leadScoreLabel: 'EMERGENCY · Immediate Action',
    leadFitReason: 'Active emergency water leak ($1.4k), homeowner owns property, 1.2 miles on active Royal Oak route.',
    distanceMiles: 1.2,
    timeline: 'Emergency arrival within 2 hours',
    urgency: 'Immediate (Active water leak)',
    quoteCreatedDate: 'Today',
    scheduledDate: 'Today (Immediate Dispatch)',
    scheduledArrivalWindow: '8:00 AM – 10:00 AM',
    estimatedDuration: '2–3 hours on site',
    crewAssigned: 'Brett Miller (Master Plumber) & Sam R.',

    lineItems: [
      {
        id: 'item-1',
        title: 'Emergency Copper Pipe Cut-Out & Solder Coupling Repair',
        description: 'Precision pipe section removal, dual wrought-copper couplings, lead-free solder, and Type L copper replacement.',
        amount: 850,
      },
      {
        id: 'item-2',
        title: 'Main Supply Line High-Pressure Hydrostatic Test',
        description: 'Pressure gauge certification to 80 PSI with zero leak drop confirmation across entire domestic supply.',
        amount: 350,
      },
      {
        id: 'item-3',
        title: 'Closed-Cell Foam Pipe Thermal Insulation & Wrap',
        description: 'Acoustic isolation mounts and thermal anti-condensation protection along joist run.',
        amount: 250,
      },
    ],

    optionalUpgrades: [
      {
        id: 'upgrade-shutoff',
        title: 'Main Quarter-Turn Ball Valve Replacement Upgrade',
        description: 'Commercial brass full-port quarter-turn master valve replacing seized gate valve.',
        amount: 320,
        recommended: true,
      },
    ],

    baseTotal: 1450,
    upgradeTotal: 320,
    totalWithUpgrade: 1770,
    requiredDeposit: 725,
    depositPaidStatus: 'PAID ($725.00 via Card •••• 4242)',
  },
} as const;

export const DEMO_TOUR_CONTRACTOR = DEMO_SHOWCASE_WORKFLOW.company;
export const DEMO_TOUR_CUSTOMER = DEMO_SHOWCASE_WORKFLOW.customer;
export const DEMO_TOUR_JOB = DEMO_SHOWCASE_WORKFLOW.job;
