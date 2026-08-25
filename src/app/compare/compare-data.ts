export type ComparisonPoint = {
  feature: string;
  lgq: string;
  competitor: string;
  advantage: 'lgq' | 'equal' | 'competitor';
  detail: string;
};

export type ComparisonCategory = {
  category: string;
  rows: readonly ComparisonPoint[];
};

export type VisualPillar = {
  title: string;
  eyebrow: string;
  description: string;
  image: string;
  alt: string;
  highlights: readonly string[];
};

export type MigrationStep = {
  step: number;
  title: string;
  description: string;
  note: string;
};

export type HonestFit = {
  competitorTitle: string;
  competitorPoints: readonly string[];
  lgqTitle: string;
  lgqPoints: readonly string[];
};

export type CompetitorDetail = {
  slug: string;
  name: string;
  badge: string;
  headline: string;
  subhead: string;
  summary: string;
  metaTitle: string;
  metaDescription: string;
  basePricing: {
    lgq: string;
    competitor: string;
  };
  trustBadges: readonly string[];
  keyDifferences: readonly {
    title: string;
    description: string;
  }[];
  visualPillars: readonly VisualPillar[];
  categories: readonly ComparisonCategory[];
  tableRows: readonly ComparisonPoint[];
  migrationSteps: readonly MigrationStep[];
  honestFit: HonestFit;
  faqs: readonly {
    q: string;
    a: string;
  }[];
};

export const COMPARISONS: Record<string, CompetitorDetail> = {
  'jobber-alternative': {
    slug: 'jobber-alternative',
    name: 'Jobber',
    badge: 'Jobber Alternative',
    headline: 'A Modern Contractor Platform with $0/Mo Entry and Built-In AI Intake.',
    subhead:
      'Jobber charges $49–$349/month whether you book jobs or not and still expects you to build a website. Let’s Get Quoted gives you a free SEO contractor website, 24/7 AI lead qualification, and a complete back office from $0/month.',
    summary:
      'While Jobber provides traditional scheduling and quoting, it requires ongoing fixed subscriptions, charges for additional seats, and does not build your contractor website. Let’s Get Quoted replaces subscription bloat with performance-aligned plans and built-in lead capture.',
    metaTitle: 'Jobber Alternative for Contractors · Let’s Get Quoted',
    metaDescription:
      'Compare Let’s Get Quoted vs Jobber. Get a free contractor website, 24/7 AI intake, and quotes-to-paid workflow starting at $0/mo without per-seat surprises.',
    basePricing: {
      lgq: 'From $0/mo (Flex) up to $299/mo (Scale with 0.10% fee)',
      competitor: '$49/mo (Core, 1 user) to $349/mo (Grow) + $29/mo extra user fees',
    },
    trustBadges: [
      'No Credit Card Required',
      'Free SEO Contractor Website',
      '1-Click Jobber CSV Migration',
      'QuickBooks Online Sync',
      'Direct Stripe Bank Payouts',
    ],
    keyDifferences: [
      {
        title: 'Start at $0/month instead of fixed overhead',
        description:
          'During slow winter months or when starting out, Jobber still bills your card every 30 days. LGQ’s Flex plan costs $0/mo with a 1.25% platform fee paid only when you get paid.',
      },
      {
        title: 'AI Smart Intake & Lead Scoring Included',
        description:
          'Your website asks project-specific scoping questions, collects photos and arrival preferences, and texts you hot leads—eliminating hours of phone tag.',
      },
      {
        title: 'Route-Aware Quick Stops Dispatch',
        description:
          'Fill gaps in your day by offering nearby homeowners priority arrival windows while you are already on the road, turning dead travel time into booked revenue.',
      },
    ],
    visualPillars: [
      {
        title: 'Your High-Converting Marketing Website Included for Free',
        eyebrow: 'No Agency or Wix Fees',
        description:
          'Jobber forces you to pay Squarespace, Wix, or WordPress $30–$60/mo (plus thousands to build it). LGQ gives you an SEO-tuned, mobile-first website with 20+ trade themes, custom domain support, and live estimate calculators out of the box.',
        image: 'hosted-website',
        alt: 'Let’s Get Quoted hosted contractor website showing modern mobile and desktop layout',
        highlights: [
          '20+ Trade-specific templates (HVAC, Plumbing, Electrical, Roofing, Remodeling)',
          'Built-in instant estimate calculators and verified Google review showcase',
          'Free custom domain connection with automated SSL security',
        ],
      },
      {
        title: '24/7 AI Scoping & Lead Triage That Replaces Phone Tag',
        eyebrow: 'Instant Lead Qualification',
        description:
          'Jobber gives you basic static forms. LGQ’s AI intake asks the exact scoping questions an experienced contractor would, analyzes urgency, calculates ticket value, and texts you high-priority alerts.',
        image: 'ai-smart-intake',
        alt: 'AI Smart Intake lead triage interface displaying HOT and WARM lead scores',
        highlights: [
          'Automatic HOT, WARM, and LOW project fit scoring',
          'Instant homeowner phone verification via 1-tap SMS',
          'Dispatches project details and photo attachments directly to your phone',
        ],
      },
      {
        title: 'Route-Aware Quick Stops That Monetize Dead Travel Time',
        eyebrow: 'Same-Day Dispatch',
        description:
          'When you finish a job early or have a 45-minute calendar gap, Quick Stops matches nearby homeowners along your existing driving route with same-day priority arrival windows.',
        image: 'og-quick-stops',
        alt: 'Route-aware Quick Stops dispatch matching nearby customer inquiries with calendar gaps',
        highlights: [
          'Calculates driving distance from your active crew jobs',
          'Fills afternoon travel gaps without adding detour fuel costs',
          'Homeowners accept same-day arrival windows in 1 tap',
        ],
      },
      {
        title: 'Mobile Quotes, Instant E-Signatures & Direct Stripe Payouts',
        eyebrow: 'Get Paid Faster',
        description:
          'Send clean, multi-option quotes that homeowners can sign and pay on their phone in seconds. Deposits flow directly to your bank account via your own connected Stripe account with full fee transparency.',
        image: 'client-esignature',
        alt: 'Client portal showing e-signature and Apple Pay deposit checkout',
        highlights: [
          'Multi-option good/better/best quote tiers with itemized e-signatures',
          'Apple Pay, Google Pay, credit cards, and ACH bank transfers supported',
          'Automatic 2-way sync with QuickBooks Online for invoices and payments',
        ],
      },
    ],
    categories: [
      {
        category: 'Pricing & Overhead Flexibility',
        rows: [
          {
            feature: 'Entry Price',
            lgq: '$0 / month (Flex)',
            competitor: '$49 – $349 / month',
            advantage: 'lgq',
            detail: 'Flex lets you run your business without recurring fixed software overhead.',
          },
          {
            feature: 'Off-Season / Slow Months',
            lgq: '$0 (Pay only when getting paid)',
            competitor: 'Full monthly fee billed every 30 days',
            advantage: 'lgq',
            detail: 'Never pay software bills during winter slowdowns or weather delays.',
          },
          {
            feature: 'Extra User / Seat Penalties',
            lgq: 'Included team allowances & crew feeds',
            competitor: '+$29 / month per additional user',
            advantage: 'lgq',
            detail: 'Scale your team without per-seat penalty bills each month.',
          },
          {
            feature: 'Contracts & Cancellation Fees',
            lgq: 'No contracts · Cancel or switch anytime',
            competitor: 'Monthly or annual lock-ins',
            advantage: 'lgq',
            detail: 'Complete flexibility with zero cancellation fees or setup charges.',
          },
        ],
      },
      {
        category: 'Website, Marketing & Lead Engine',
        rows: [
          {
            feature: 'Custom Contractor Website',
            lgq: 'Included (20+ trade themes + custom domain)',
            competitor: 'Not included (must build on WordPress/Squarespace)',
            advantage: 'lgq',
            detail: 'LGQ provides a full, SEO-optimized contractor website with live booking.',
          },
          {
            feature: '24/7 AI Lead Qualification & Scorer',
            lgq: 'Included (Instant scoping & ticket estimate)',
            competitor: 'Basic static web form only',
            advantage: 'lgq',
            detail: 'Inquiries are automatically scored HOT, WARM, or LOW with estimated tickets.',
          },
          {
            feature: 'Interactive Estimate Calculator',
            lgq: 'Included on your website',
            competitor: 'Not available',
            advantage: 'lgq',
            detail: 'Converts curious website visitors into qualified, phone-verified inquiries.',
          },
          {
            feature: 'Google Reviews & Reputation Hub',
            lgq: 'Included review collection & showcase',
            competitor: 'Requires add-on or third-party tool',
            advantage: 'lgq',
            detail: 'Automated post-job review routing to boost your Google Business ranking.',
          },
        ],
      },
      {
        category: 'Field Operations & Dispatch',
        rows: [
          {
            feature: 'Same-Day Quick Stops Dispatch',
            lgq: 'Included route-aware matching',
            competitor: 'None',
            advantage: 'lgq',
            detail: 'Monetize route gaps by matching nearby homeowners with open calendar slots.',
          },
          {
            feature: '2-Way Text Messaging',
            lgq: 'Included with dedicated business line options',
            competitor: 'Requires higher tier ($149+/mo)',
            advantage: 'lgq',
            detail: 'Customer texts sync directly to each job feed and customer portal.',
          },
          {
            feature: 'Crew Dispatch & Job Feeds',
            lgq: 'Included mobile assignment & photos',
            competitor: 'Included on paid tiers',
            advantage: 'equal',
            detail: 'Assign crew members, track labor costs, and record jobsite progress.',
          },
        ],
      },
      {
        category: 'Quotes, Invoices & Payments',
        rows: [
          {
            feature: 'Client Portal & Mobile E-Signatures',
            lgq: 'Included with 1-tap deposit payments',
            competitor: 'Included Client Hub',
            advantage: 'equal',
            detail: 'Homeowners can review options, sign contracts, and pay deposits online.',
          },
          {
            feature: 'Payment Processing & Payouts',
            lgq: 'Direct Stripe Connect bank payouts',
            competitor: 'Jobber Payments proprietary rail',
            advantage: 'lgq',
            detail: 'Direct merchant account with complete fee transparency and fast payouts.',
          },
          {
            feature: 'QuickBooks Online Sync',
            lgq: 'Included on all plans',
            competitor: 'Requires Connect ($169/mo) or higher',
            advantage: 'lgq',
            detail: 'Both systems sync invoices and payments seamlessly into QuickBooks.',
          },
        ],
      },
    ],
    tableRows: [
      {
        feature: 'Entry Price',
        lgq: '$0 / month (Flex)',
        competitor: '$49 – $349 / month',
        advantage: 'lgq',
        detail: 'Flex lets you run your business without recurring fixed software overhead.',
      },
      {
        feature: 'Custom Website Builder',
        lgq: 'Included (20+ trade themes + custom domain)',
        competitor: 'Not included (must build on WordPress/Squarespace)',
        advantage: 'lgq',
        detail: 'LGQ provides a full, SEO-optimized contractor website with live booking.',
      },
      {
        feature: 'AI Lead Qualification',
        lgq: 'Included (24/7 instant scoping & lead score)',
        competitor: 'Basic web form only',
        advantage: 'lgq',
        detail: 'Inquiries are automatically scored HOT, WARM, or LOW with estimated tickets.',
      },
      {
        feature: 'Same-Day Quick Stops Dispatch',
        lgq: 'Included route-aware matching',
        competitor: 'None',
        advantage: 'lgq',
        detail: 'Monetize route gaps by matching nearby homeowners with open calendar slots.',
      },
      {
        feature: 'QuickBooks Online Sync',
        lgq: 'Included on all plans',
        competitor: 'Included on paid plans ($169+/mo)',
        advantage: 'lgq',
        detail: 'Both systems sync invoices and payments seamlessly into QuickBooks.',
      },
      {
        feature: '2-Way Text Messaging',
        lgq: 'Included with dedicated business line options',
        competitor: 'Requires higher tier ($149+/mo)',
        advantage: 'lgq',
        detail: 'Customer texts sync directly to each job feed and customer portal.',
      },
    ],
    migrationSteps: [
      {
        step: 1,
        title: 'Export your Jobber data',
        description: 'Download your clients, addresses, and phone numbers in CSV format from Jobber settings.',
        note: 'Takes less than 60 seconds.',
      },
      {
        step: 2,
        title: '1-Click import into LGQ',
        description:
          'Upload your CSV under Dashboard > Clients > Import. Contacts and historical job records map automatically.',
        note: 'Zero customer records lost.',
      },
      {
        step: 3,
        title: 'Select theme & launch in 15 mins',
        description:
          'Pick your website template, connect your Stripe account, and start sending professional quotes with e-signatures.',
        note: 'Full onboarding support included.',
      },
    ],
    honestFit: {
      competitorTitle: 'When Jobber might be the right fit:',
      competitorPoints: [
        'You manage large commercial cleaning or maintenance franchises with 50+ hourly employees needing advanced geofenced timesheets.',
        'You already pay a digital marketing agency $3,000+ for a custom WordPress site and only need dispatch scheduling.',
      ],
      lgqTitle: 'When Let’s Get Quoted is the clear choice:',
      lgqPoints: [
        'You want zero monthly software bills when business is quiet ($0/mo Flex plan with 1.25% fee only when paid).',
        'You want a modern, high-converting marketing website included without paying Wix or Squarespace fees.',
        'You want 24/7 AI scoping to qualify hot leads and route-aware Quick Stops to monetize travel time.',
        'You want instant quotes, mobile e-signatures, and fast Stripe payouts without per-seat penalty fees.',
      ],
    },
    faqs: [
      {
        q: 'Can I migrate my clients and past jobs from Jobber to Let’s Get Quoted?',
        a: 'Yes. You can export your client CSV from Jobber and import it into Let’s Get Quoted in one click under Dashboard > Clients > Import. All customer names, phone numbers, addresses, and notes are mapped seamlessly.',
      },
      {
        q: 'How does Let’s Get Quoted compare on pricing vs. Jobber?',
        a: 'Jobber charges $49/mo (Core, 1 user), $169/mo (Connect, up to 5 users), or $349/mo (Grow, up to 15 users), plus $29/mo per extra seat and separate fees for a website. Let’s Get Quoted’s Flex plan costs $0/month base with a transparent 1.25% fee paid only when you collect money from clients. You also get a complete contractor website builder for free.',
      },
      {
        q: 'Does Let’s Get Quoted include a website builder?',
        a: 'Yes. Unlike Jobber (which only offers a basic client hub and requires you to build your website on WordPress or Squarespace), LGQ includes a full SEO-optimized marketing website with 20+ trade themes, custom domain support, and interactive quote calculators.',
      },
      {
        q: 'How do payments work compared to Jobber Payments?',
        a: 'LGQ connects directly to your own Stripe account. You receive direct bank payouts with complete fee transparency and instant e-signatures on all quotes and invoices. Homeowners can pay via Apple Pay, Google Pay, credit cards, or bank ACH.',
      },
      {
        q: 'Does Let’s Get Quoted sync with QuickBooks Online?',
        a: 'Yes. QuickBooks Online 2-way sync is available on Let’s Get Quoted so your customers, invoices, line items, and payment transactions stay reconciled without duplicate data entry.',
      },
      {
        q: 'Is there a contract or cancellation fee?',
        a: 'No. There are no contracts, setup fees, or cancellation penalties. You can upgrade, downgrade, or cancel at any time from your account settings.',
      },
      {
        q: 'What is Route-Aware Quick Stops?',
        a: 'Quick Stops is an intelligent dispatch feature that fills gaps in your schedule. When you have downtime between jobs, it alerts nearby homeowners with available same-day arrival windows, turning dead travel time into profit without extra detour mileage.',
      },
    ],
  },

  'housecall-pro-alternative': {
    slug: 'housecall-pro-alternative',
    name: 'Housecall Pro',
    badge: 'Housecall Pro Alternative',
    headline: 'Contractor Software Without Expensive Add-On Modules.',
    subhead:
      'Housecall Pro locks core tools behind expensive tiers and paid add-ons. Let’s Get Quoted bundles your public website, 2-way texting, and AI lead triage into a unified platform starting at $0/month.',
    summary:
      'Housecall Pro is a popular tool for trade businesses, but its pricing escalates rapidly with extra team members and optional add-on fees for marketing and phone receptionists. Let’s Get Quoted provides an all-in-one alternative designed around honest pricing.',
    metaTitle: 'Housecall Pro Alternative for Contractors · Let’s Get Quoted',
    metaDescription:
      'Switch from Housecall Pro to Let’s Get Quoted. Get a free contractor website, AI smart intake, quick stops dispatch, and online payments starting at $0/mo.',
    basePricing: {
      lgq: 'From $0/mo (Flex) up to $299/mo (Scale)',
      competitor: '$65/mo (Basic, 1 user) to $299/mo (Max) + $35/mo extra seats',
    },
    trustBadges: [
      'No Surprise Add-On Bills',
      'Free SEO Contractor Website',
      '1-Click CSV Migration',
      'QuickBooks Online Sync',
      'Zero Seat Penalties',
    ],
    keyDifferences: [
      {
        title: 'No surprise add-on pricing',
        description:
          'Housecall Pro charges extra for features like automated marketing and custom websites. LGQ includes your hosted site, lead scoring, and customer portals out of the box.',
      },
      {
        title: 'Team-friendly seat allowances',
        description:
          'Scale up to 15 office users and 50 crew members on LGQ Scale without paying steep per-user penalties every month.',
      },
      {
        title: 'Instant homeowner e-signatures and portal',
        description:
          'Homeowners receive a private, revocable link to review quotes, track project progress, and pay deposits with Apple Pay or Google Pay.',
      },
    ],
    visualPillars: [
      {
        title: 'Free Hosted Contractor Website',
        eyebrow: 'Everything Included',
        description:
          'Housecall Pro charges recurring fees for website add-ons. LGQ includes your custom domain, 20+ trade templates, and instant estimate calculators for free.',
        image: 'hosted-website',
        alt: 'Let’s Get Quoted website builder showcase',
        highlights: ['Trade-specific SEO templates', 'Instant booking widget', 'Google reviews showcase'],
      },
      {
        title: 'AI Smart Intake & Lead Scorer',
        eyebrow: '24/7 Scoping',
        description:
          'Automatically analyzes project fit, urgency, and estimated ticket sizes so you never miss high-value jobs.',
        image: 'ai-smart-intake',
        alt: 'AI lead qualification dashboard',
        highlights: ['HOT/WARM/LOW lead scores', 'Instant SMS triage alerts', 'Phone number verification'],
      },
      {
        title: 'Mobile Quotes & Fast Stripe Payments',
        eyebrow: 'Direct Payouts',
        description:
          'Send clean multi-option quotes with e-signatures that settle directly into your bank via Stripe Connect.',
        image: 'client-esignature',
        alt: 'E-signature client portal',
        highlights: ['Good/Better/Best tiers', 'Apple Pay & Google Pay', 'QuickBooks Online 2-way sync'],
      },
      {
        title: 'Route-Aware Quick Stops',
        eyebrow: 'Smart Dispatch',
        description:
          'Fill schedule gaps between appointments by matching nearby homeowners with open arrival slots.',
        image: 'og-quick-stops',
        alt: 'Quick stops dispatch view',
        highlights: ['Monetize route downtime', 'Zero extra detour costs', 'Same-day priority booking'],
      },
    ],
    categories: [
      {
        category: 'Pricing & Add-On Structure',
        rows: [
          {
            feature: 'Monthly Base Cost',
            lgq: '$0 on Flex / $35 on Solo / $99 on Growth',
            competitor: '$65 / $169 / $299 per month',
            advantage: 'lgq',
            detail: 'Flex keeps software bills at $0 when you have a quiet month.',
          },
          {
            feature: 'Website Hosting & Builder',
            lgq: 'Included (20+ themes + custom domain)',
            competitor: 'Separate recurring add-on fee',
            advantage: 'lgq',
            detail: 'Your own branded site with instant estimate calculator.',
          },
        ],
      },
      {
        category: 'Lead Capture & Automation',
        rows: [
          {
            feature: 'AI Lead Scorer & Smart Intake',
            lgq: 'Included',
            competitor: 'Basic forms or paid AI add-on',
            advantage: 'lgq',
            detail: 'Automatically analyzes fit, urgency, and estimated project ticket size.',
          },
          {
            feature: 'QuickBooks Online Integration',
            lgq: 'Included',
            competitor: 'Included on select tiers',
            advantage: 'equal',
            detail: 'Automatic 2-way sync for invoices, customers, and payments.',
          },
        ],
      },
    ],
    tableRows: [
      {
        feature: 'Monthly Base Cost',
        lgq: '$0 on Flex / $35 on Solo / $99 on Growth',
        competitor: '$65 / $169 / $299 per month',
        advantage: 'lgq',
        detail: 'Flex keeps software bills at $0 when you have a quiet month.',
      },
      {
        feature: 'Hosted Contractor Website',
        lgq: 'Included (20+ themes + custom domain)',
        competitor: 'Separate recurring add-on fee',
        advantage: 'lgq',
        detail: 'Your own branded site with instant estimate calculator.',
      },
      {
        feature: 'AI Lead Scorer & Smart Intake',
        lgq: 'Included',
        competitor: 'Basic forms or paid AI add-on',
        advantage: 'lgq',
        detail: 'Automatically analyzes fit, urgency, and estimated project ticket size.',
      },
      {
        feature: 'QuickBooks Online Integration',
        lgq: 'Included',
        competitor: 'Included on select tiers',
        advantage: 'equal',
        detail: 'Automatic 2-way sync for invoices, customers, and payments.',
      },
    ],
    migrationSteps: [
      {
        step: 1,
        title: 'Export Housecall Pro list',
        description: 'Export your customer CSV and address book from Housecall Pro settings.',
        note: 'Takes under 2 minutes.',
      },
      {
        step: 2,
        title: '1-Click import into LGQ',
        description: 'Upload your CSV to populate your clients, addresses, and past records.',
        note: 'Seamless data mapping.',
      },
      {
        step: 3,
        title: 'Choose website & go live',
        description: 'Pick your trade theme, connect Stripe, and start sending quotes with e-signatures.',
        note: 'Ready in 15 minutes.',
      },
    ],
    honestFit: {
      competitorTitle: 'When Housecall Pro might be the right fit:',
      competitorPoints: [
        'You are already heavily integrated into their proprietary phone system and do not mind paying extra monthly fees.',
        'You have a dedicated webmaster and already pay for marketing tools elsewhere.',
      ],
      lgqTitle: 'When Let’s Get Quoted is the clear choice:',
      lgqPoints: [
        'You want an all-in-one platform without surprise add-on charges or high per-seat fees.',
        'You want a free, SEO-optimized contractor website and 24/7 AI smart intake.',
        'You want performance-aligned $0/mo pricing on Flex to protect your profit margins.',
      ],
    },
    faqs: [
      {
        q: 'How long does it take to switch from Housecall Pro?',
        a: 'Most contractors switch in under 15 minutes. Export your customer list, choose your website theme, connect Stripe, and you are ready to send quotes and collect payments.',
      },
      {
        q: 'Does LGQ support crew dispatch and job feeds?',
        a: 'Yes. You can assign crew members, track labor costs, record before-and-after photos, and manage your full project schedule from desktop or mobile.',
      },
    ],
  },

  'angi-leads-alternative': {
    slug: 'angi-leads-alternative',
    name: 'Angi & Thumbtack Lead Brokers',
    badge: 'Angi / Thumbtack Alternative',
    headline: 'Own Your Leads. Stop Paying $80 for Shared Inquiries.',
    subhead:
      'Lead marketplaces charge you $50–$150 for shared leads that 5 other contractors also get. Let’s Get Quoted builds your own high-converting website so you generate exclusive leads you own forever.',
    summary:
      'Buying shared leads from brokers like Angi, HomeAdvisor, and Thumbtack drains contractor profits through price wars with competitors. Let’s Get Quoted gives you the marketing website, 24/7 AI intake, and SEO presence to capture direct homeowner leads.',
    metaTitle: 'Stop Buying Shared Leads · Angi & Thumbtack Alternative',
    metaDescription:
      'Tired of paying $75+ per shared lead on Angi and Thumbtack? Build your own high-converting contractor website with AI intake and keep 100% of your customer relationships.',
    basePricing: {
      lgq: '$0/mo on Flex · $0 per lead fee',
      competitor: '$500–$2,500/mo in shared lead bills ($50–$120/lead)',
    },
    trustBadges: [
      '100% Exclusive Leads',
      'Zero Lead Broker Fees',
      'Free SEO Contractor Website',
      'Direct Homeowner Contacts',
      'No Bidding Races',
    ],
    keyDifferences: [
      {
        title: '100% Exclusive Leads You Own',
        description:
          'When a homeowner lands on your website, they are reaching out only to you—no 5-way bidding races or race-to-the-bottom pricing.',
      },
      {
        title: 'Zero Lead Broker Markups',
        description:
          'Save thousands every year by turning word-of-mouth, yard signs, and local search traffic into booked jobs without broker commissions.',
      },
      {
        title: 'Build Long-Term Business Equity',
        description:
          'Grow your own brand, collect verified 5-star Google reviews, and build a recurring client list with cards on file.',
      },
    ],
    visualPillars: [
      {
        title: 'Own Your Brand with a Custom SEO Website',
        eyebrow: 'Direct Inquiries',
        description:
          'Stop paying lead brokers for temporary directory listings. LGQ builds you a fast, trade-specific website optimized for local Google search.',
        image: 'hosted-website',
        alt: 'High-converting contractor website template',
        highlights: ['Local SEO schema markup', 'Custom domain included', 'Direct customer booking'],
      },
      {
        title: '24/7 AI Lead Qualifier Filters Tire-Kickers',
        eyebrow: 'Smart Intake',
        description:
          'Your website asks scoping questions, verifies phone numbers, and flags high-ticket leads automatically.',
        image: 'ai-smart-intake',
        alt: 'AI lead qualification dashboard',
        highlights: ['SMS-verified homeowner leads', 'Instant project budget estimation', 'HOT lead SMS alerts'],
      },
      {
        title: 'Instant Mobile Quotes with E-Signatures',
        eyebrow: 'Close Faster',
        description:
          'Close direct homeowner leads in minutes with professional mobile quotes and 1-tap deposit payments.',
        image: 'client-esignature',
        alt: 'Mobile quote with e-signature and deposit payment',
        highlights: ['Multi-option tier quotes', 'Direct Stripe payouts', 'Automated quote follow-ups'],
      },
      {
        title: 'Recurring Maintenance & Client Cards on File',
        eyebrow: 'Long-Term Equity',
        description:
          'Turn one-time jobs into profitable recurring service contracts with auto-billing and stored cards on file.',
        image: 'recurring-plans',
        alt: 'Recurring service agreements management',
        highlights: ['Automated recurring billing', 'Card on file with Stripe', 'Customer portal self-service'],
      },
    ],
    categories: [
      {
        category: 'Lead Ownership & Unit Economics',
        rows: [
          {
            feature: 'Lead Exclusivity',
            lgq: '100% Exclusive to your business',
            competitor: 'Shared with 3–6 other contractors',
            advantage: 'lgq',
            detail: 'You never compete against 5 other contractors for the same homeowner inquiry.',
          },
          {
            feature: 'Cost Per Lead',
            lgq: '$0 (You own your site & inquiries)',
            competitor: '$40 – $150 per shared lead',
            advantage: 'lgq',
            detail: 'Stop paying lead brokers every time a homeowner clicks a form.',
          },
        ],
      },
      {
        category: 'Client Relationship & Equity',
        rows: [
          {
            feature: 'Client Relationship & Rebooking',
            lgq: 'You own client card on file & contact info',
            competitor: 'Marketplace intermediary',
            advantage: 'lgq',
            detail: 'Set up recurring auto-billing and maintenance plans that run automatically.',
          },
          {
            feature: '24/7 Smart Intake Scorer',
            lgq: 'Included AI Estimator',
            competitor: 'Generic directory profile',
            advantage: 'lgq',
            detail: 'Qualifies projects and flags high-ticket leads the second they arrive.',
          },
        ],
      },
    ],
    tableRows: [
      {
        feature: 'Lead Exclusivity',
        lgq: '100% Exclusive to your business',
        competitor: 'Shared with 3–6 other contractors',
        advantage: 'lgq',
        detail: 'You never compete against 5 other contractors for the same homeowner inquiry.',
      },
      {
        feature: 'Cost Per Lead',
        lgq: '$0 (You own your site & inquiries)',
        competitor: '$40 – $150 per shared lead',
        advantage: 'lgq',
        detail: 'Stop paying lead brokers every time a homeowner clicks a form.',
      },
      {
        feature: 'Client Relationship & Rebooking',
        lgq: 'You own client card on file & contact info',
        competitor: 'Marketplace intermediary',
        advantage: 'lgq',
        detail: 'Set up recurring auto-billing and maintenance plans that run automatically.',
      },
      {
        feature: '24/7 Smart Intake Scorer',
        lgq: 'Included AI Estimator',
        competitor: 'Generic directory profile',
        advantage: 'lgq',
        detail: 'Qualifies projects and flags high-ticket leads the second they arrive.',
      },
    ],
    migrationSteps: [
      {
        step: 1,
        title: 'Cancel shared lead subscriptions',
        description: 'Stop paying monthly recurring retainers for shared directory clicks.',
        note: 'Immediate cost savings.',
      },
      {
        step: 2,
        title: 'Deploy your custom SEO website',
        description: 'Publish your trade website in 15 minutes with our instant quote widget and Google review hub.',
        note: '100% exclusive homeowner inquiries.',
      },
      {
        step: 3,
        title: 'Capture direct leads forever',
        description: 'Link your site to your Google Profile, trucks, yard signs, and local word-of-mouth.',
        note: 'Keep 100% of your customer equity.',
      },
    ],
    honestFit: {
      competitorTitle: 'When lead marketplaces might make sense:',
      competitorPoints: [
        'You have zero existing contacts, zero network, and don’t mind bidding in a 5-way race to the bottom on price.',
      ],
      lgqTitle: 'When Let’s Get Quoted is the clear choice:',
      lgqPoints: [
        'You want to own your business reputation, website, customer relationships, and customer phone numbers.',
        'You want exclusive leads that reach out only to you.',
        'You want to save $5,000–$25,000/year on lead broker bills and invest in your own brand equity.',
      ],
    },
    faqs: [
      {
        q: 'How does Let’s Get Quoted help me get direct leads?',
        a: 'LGQ generates a fast, mobile-friendly website tailored to your trade and city with rich local schema markup, Google review integration, and an instant AI quote widget that converts visitors into phone-verified leads.',
      },
      {
        q: 'Can I still use other marketing channels with LGQ?',
        a: 'Absolutely. You can link your LGQ website to your Google Business Profile, Facebook page, truck wraps, business cards, and local yard signs.',
      },
    ],
  },
};
