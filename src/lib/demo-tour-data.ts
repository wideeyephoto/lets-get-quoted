/** Canonical fictional plumbing story shared by public product previews. */
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
