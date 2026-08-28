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
    eyebrow: 'THE INTELLIGENT BACK OFFICE FOR CONTRACTORS',
    headline: 'Know your next best move. Every step of the way.',
    headlinePart1: 'Know your next best move.',
    headlinePart2: 'Every step of the way.',
    supportingCopy:
      'LGQ is the intelligent back office that guides contractors from first lead to final payment—helping you operate smarter, protect profit, and grow with confidence.',
    primaryCta: 'Build my free site',
    secondaryCta: 'Watch one job move',
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
      kicker: 'AI PHOTO INTAKE + LEAD QUALIFICATION',
      title: 'Let AI qualify the lead. You win the right work.',
      description:
        'Turn photos and homeowner answers into a clear project summary—with scope, urgency, location, value, and potential risks organized before you call.',
      href: '/features/ai-intake',
      produces: ['Photo-grounded project summaries', 'Leads prioritized by fit and urgency', 'Quote drafts with profit guardrails'],
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
