/**
 * Canonical product messaging and positioning source of truth for Let's Get Quoted.
 *
 * Message hierarchy:
 * 1. Category: Contractor business software.
 * 2. Entry point: A free, lead-generating website.
 * 3. Workflow: Intake → quote → schedule → crew → payment.
 * 4. Outcome: More paid work with less administrative overhead.
 */

export const BRAND_POSITIONING = {
  category: 'Contractor business software—starting with a free website',
  tagline: 'From first click to final payment. Run it all in one place.',
  valueProposition:
    'Let’s Get Quoted is one connected system for winning the job, running it, and getting paid—starting with a free contractor website.',
  hero: {
    eyebrow: 'CONTRACTOR SOFTWARE—STARTING WITH A FREE WEBSITE',
    headline: 'From first click to final payment. Run it all in one place.',
    headlinePart1: 'From first click to final payment.',
    headlinePart2: 'Run it all in one place.',
    supportingCopy:
      'Build your website, qualify leads, send quotes, schedule work, manage your crew, and collect payment without switching tools.',
    primaryCta: 'Build my free site',
    secondaryCta: 'See the full workflow',
  },
  workflowSteps: [
    {
      step: 1,
      id: 'website',
      name: 'Website visit',
      kicker: 'BUILD THE FRONT DOOR',
      title: 'Free contractor website',
      description:
        'Launch a free, lead-generating contractor website with instant estimates wired in from day one.',
      href: '/features/website-builder',
      produces: ['Trade-matched pages', 'Instant estimate form', 'Your own domain'],
    },
    {
      step: 2,
      id: 'intake',
      name: 'Qualified lead',
      kicker: 'QUALIFY THE OPPORTUNITY',
      title: 'AI intake and lead ranking',
      description:
        'Ask the right trade questions, estimate job value, and surface promising jobs worth answering first.',
      href: '/features/ai-intake',
      produces: ['A written job summary', 'Budget and urgency read', 'Leads ranked by value'],
    },
    {
      step: 3,
      id: 'quote',
      name: 'Quote',
      kicker: 'PRICE IT AND GET IT SIGNED',
      title: 'Itemized quotes and e-signatures',
      description:
        'Send professional quotes with add-ons, get signatures on a phone, and collect deposits upfront.',
      href: '/features/quotes',
      produces: ['Itemized quote with add-ons', 'E-signature on a phone', 'Deposit before scheduling'],
    },
    {
      step: 4,
      id: 'schedule',
      name: 'Scheduled work',
      kicker: 'PUT IT ON THE CALENDAR',
      title: 'Scheduling and crew dispatch',
      description:
        'Turn approved quotes into booked jobs, assign crew members, and route the day without retyping anything.',
      href: '/features/scheduling',
      produces: ['Approved quote → booked day', 'Crew assigned and tracked', 'Today’s route, planned'],
    },
    {
      step: 5,
      id: 'payment',
      name: 'Payment',
      kicker: 'KEEP THEM INFORMED AND GET PAID',
      title: 'Customer texts, portal, and Stripe payments',
      description:
        'Two-way texting, on-my-way alerts, client portal, and Stripe payments that settle straight to your bank.',
      href: '/features/client-portal',
      produces: ['Two-way texting', 'On-my-way alerts', 'Deposits, balances and plans'],
    },
  ] as const,
  outcomes: {
    winMore: 'Win more paid jobs with instant 24/7 capture and qualification.',
    saveTime: 'Cut hours of administrative overhead by connecting the whole job lifecycle in one tool.',
    getPaid: 'Collect deposits and final balances directly through Stripe into your bank.',
  },
} as const;
