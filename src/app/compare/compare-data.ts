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
    metaTitle: 'Jobber Alternative for Contractors',
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
          'Automatic sync to QuickBooks Online for invoices and payments',
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
        a: 'Yes. QuickBooks Online sync is available on Let’s Get Quoted so your customers, invoices, line items, and payment transactions stay reconciled without duplicate data entry.',
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
    headline: 'Contractor Software Without Expensive Add-On Modules & Seat Penalties.',
    subhead:
      'Housecall Pro locks core tools behind expensive tiers ($65–$299/mo) and paid add-on fees. Let’s Get Quoted bundles your public website, 2-way texting, AI smart intake, and payments into a unified platform starting at $0/month.',
    summary:
      'Housecall Pro is a popular tool for trade businesses, but its pricing escalates rapidly with extra team members and optional add-on fees for marketing and websites. Let’s Get Quoted provides an all-in-one alternative designed around honest pricing.',
    metaTitle: 'Housecall Pro Alternative for Contractors',
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
          'Scale up to 15 office users and 50 crew members on LGQ Scale without paying steep $35/user penalties every month.',
      },
      {
        title: 'Instant homeowner e-signatures and portal',
        description:
          'Homeowners receive a private, revocable link to review quotes, track project progress, and pay deposits with Apple Pay or Google Pay.',
      },
    ],
    visualPillars: [
      {
        title: 'Free Hosted Contractor Website Included',
        eyebrow: 'Everything Included',
        description:
          'Housecall Pro charges recurring fees for website add-ons. LGQ includes your custom domain, 20+ trade templates, and instant estimate calculators for free.',
        image: 'hosted-website',
        alt: 'Let’s Get Quoted website builder showcase',
        highlights: ['Trade-specific SEO templates', 'Instant booking widget', 'Google reviews showcase'],
      },
      {
        title: '24/7 AI Smart Intake & Lead Scorer',
        eyebrow: '24/7 Scoping',
        description:
          'Automatically analyzes project fit, urgency, and estimated ticket sizes so you never miss high-value jobs while in the field.',
        image: 'ai-smart-intake',
        alt: 'AI lead qualification dashboard',
        highlights: ['HOT/WARM/LOW lead scores', 'Instant SMS triage alerts', 'Phone number verification'],
      },
      {
        title: 'Mobile Quotes & Fast Stripe Payments',
        eyebrow: 'Direct Payouts',
        description:
          'Send clean multi-option quotes with e-signatures that settle directly into your bank via Stripe Connect with complete fee transparency.',
        image: 'client-esignature',
        alt: 'E-signature client portal',
        highlights: ['Good/Better/Best tiers', 'Apple Pay & Google Pay', 'QuickBooks Online sync'],
      },
      {
        title: 'Route-Aware Quick Stops',
        eyebrow: 'Smart Dispatch',
        description:
          'Fill schedule gaps between appointments by matching nearby homeowners with open arrival slots along your existing travel route.',
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
          {
            feature: 'Extra User / Seat Penalties',
            lgq: 'Included crew allowances',
            competitor: '+$35 / month per extra user',
            advantage: 'lgq',
            detail: 'Scale your team without per-seat penalty bills each month.',
          },
        ],
      },
      {
        category: 'Lead Capture & Automation',
        rows: [
          {
            feature: 'AI Lead Scorer & Smart Intake',
            lgq: 'Included (24/7 automated scoping)',
            competitor: 'Basic forms or paid AI add-on',
            advantage: 'lgq',
            detail: 'Automatically analyzes fit, urgency, and estimated project ticket size.',
          },
          {
            feature: 'QuickBooks Online Integration',
            lgq: 'Included on all plans',
            competitor: 'Included on select tiers',
            advantage: 'equal',
            detail: 'Automatic 2-way sync for invoices, customers, and payments.',
          },
          {
            feature: '2-Way Text Messaging',
            lgq: 'Included with dedicated business line options',
            competitor: 'Requires higher tier ($169+/mo)',
            advantage: 'lgq',
            detail: 'Customer texts sync directly to each job feed and customer portal.',
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
      {
        q: 'How does LGQ compare on extra user fees vs Housecall Pro?',
        a: 'Housecall Pro charges $35/month for each additional user. Let’s Get Quoted includes generous office and crew seat allowances without per-seat penalties on our plans.',
      },
      {
        q: 'Can I keep my existing business phone number when switching?',
        a: 'Yes. You can forward calls to your dedicated Let’s Get Quoted number or connect your existing business line for unified 2-way texting.',
      },
    ],
  },

  'servicetitan-alternative': {
    slug: 'servicetitan-alternative',
    name: 'ServiceTitan',
    badge: 'ServiceTitan Alternative',
    headline: 'Contractor Software Without $5,000 Setup Fees & Annual Lock-Ins.',
    subhead:
      'ServiceTitan charges $398–$1,000+/month with massive implementation setup fees and strict annual contracts. Let’s Get Quoted gives you a free SEO website, AI smart intake, and modern CRM starting at $0/month.',
    summary:
      'ServiceTitan is built for 50+ truck commercial enterprise franchises with dedicated IT staff. For independent trade businesses and residential contractors, its extreme cost, heavy complexity, and annual lock-ins drain profits. Let’s Get Quoted offers a modern, high-performance alternative designed for speed.',
    metaTitle: 'ServiceTitan Alternative for Independent Contractors',
    metaDescription:
      'Looking for a lightweight ServiceTitan alternative? Avoid $5k setup fees and locked contracts. Get a free contractor website, AI intake, and fast payments starting at $0/mo.',
    basePricing: {
      lgq: '$0/mo (Flex) · $35/mo (Solo) · $99/mo (Growth)',
      competitor: '$398 – $1,000+/mo per tech + $2,000–$5,000 setup fees + annual lock-in',
    },
    trustBadges: [
      'Zero Setup Fees',
      'No Annual Contracts',
      'Free SEO Contractor Website',
      '15-Minute Self-Serve Setup',
      'Stripe Direct Payouts',
    ],
    keyDifferences: [
      {
        title: 'Zero Setup Fees vs. $5,000 Implementation Costs',
        description:
          'ServiceTitan requires mandatory multi-week onboarding and thousands in upfront setup fees. LGQ is self-serve—you can launch your website and send quotes in 15 minutes.',
      },
      {
        title: 'Month-to-Month Freedom vs. Multi-Year Contracts',
        description:
          'Never sign an unbreakable 12-to-36-month enterprise contract. Upgrade, downgrade, or cancel anytime from your account settings.',
      },
      {
        title: 'Fast & Modern Mobile Experience',
        description:
          'Eliminate clunky enterprise legacy menus. LGQ gives you and your crew an ultra-fast mobile workflow for quotes, dispatch, and e-signatures.',
      },
    ],
    visualPillars: [
      {
        title: 'Free High-Converting Marketing Website Included',
        eyebrow: 'Direct Lead Generation',
        description:
          'ServiceTitan expects you to pay thousands for enterprise agency websites. LGQ gives you an SEO-tuned website with 20+ trade themes and live booking out of the box.',
        image: 'hosted-website',
        alt: 'Let’s Get Quoted contractor marketing website',
        highlights: ['Trade-specific SEO templates', 'Instant quote calculator widget', 'Custom domain included'],
      },
      {
        title: '24/7 AI Scoping & Lead Triage',
        eyebrow: 'Automated Intake',
        description:
          'Homeowners describe projects and upload photos on your site. AI scores project fit (HOT/WARM/LOW) and dispatches instant SMS alerts to your phone.',
        image: 'ai-smart-intake',
        alt: 'AI lead qualification interface',
        highlights: ['Instant project ticket estimation', 'Phone-verified inquiries', 'Zero manual phone tag'],
      },
      {
        title: 'Clean Multi-Option Quotes with E-Signatures',
        eyebrow: 'Fast Cash Flow',
        description:
          'Send professional good/better/best quotes that customers can e-sign and pay deposits for via Apple Pay or Google Pay on their phone.',
        image: 'client-esignature',
        alt: 'Mobile quote client portal with e-signature',
        highlights: ['Good/Better/Best option tiers', 'Instant Apple Pay & credit card deposits', 'QuickBooks Online sync'],
      },
      {
        title: 'Route-Aware Quick Stops Dispatch',
        eyebrow: 'Intelligent Operations',
        description:
          'Fill travel gaps by matching nearby homeowners along your active route with same-day priority arrival windows.',
        image: 'og-quick-stops',
        alt: 'Route-aware Quick Stops dispatch matching',
        highlights: ['Monetize empty truck travel', 'Zero detour fuel costs', '1-tap customer arrival acceptance'],
      },
    ],
    categories: [
      {
        category: 'Pricing & Commitment',
        rows: [
          {
            feature: 'Upfront Setup / Implementation Fee',
            lgq: '$0 (Self-serve in 15 minutes)',
            competitor: '$2,000 – $5,000 mandatory setup',
            advantage: 'lgq',
            detail: 'Zero upfront capital required to start running your business.',
          },
          {
            feature: 'Monthly Base Subscription',
            lgq: '$0 on Flex / $35 on Solo / $99 on Growth',
            competitor: '$398 – $1,000+ per month',
            advantage: 'lgq',
            detail: 'Performance-aligned pricing that protects your margins.',
          },
          {
            feature: 'Contract Terms',
            lgq: 'Month-to-month · Cancel anytime',
            competitor: '12 to 36 month locked contracts',
            advantage: 'lgq',
            detail: 'You are never trapped in long-term enterprise software contracts.',
          },
        ],
      },
      {
        category: 'Marketing, Intake & Website',
        rows: [
          {
            feature: 'Contractor Website Builder',
            lgq: 'Included (20+ trade themes + custom domain)',
            competitor: 'Not included (must build on 3rd party)',
            advantage: 'lgq',
            detail: 'LGQ provides your complete public marketing website.',
          },
          {
            feature: '24/7 AI Smart Intake Scorer',
            lgq: 'Included (Instant scoping & ticket estimate)',
            competitor: 'Basic forms or enterprise add-on',
            advantage: 'lgq',
            detail: 'Automatically qualifies project scope and hot leads 24/7.',
          },
        ],
      },
    ],
    tableRows: [
      {
        feature: 'Setup Fee',
        lgq: '$0',
        competitor: '$2,000 – $5,000',
        advantage: 'lgq',
        detail: 'Zero upfront capital required to start.',
      },
      {
        feature: 'Monthly Base Cost',
        lgq: '$0 on Flex / $35 on Solo / $99 on Growth',
        competitor: '$398 – $1,000+ per month',
        advantage: 'lgq',
        detail: 'Performance-aligned pricing.',
      },
      {
        feature: 'Contract Term',
        lgq: 'No contracts · Cancel anytime',
        competitor: '12–36 month lock-in',
        advantage: 'lgq',
        detail: 'Complete flexibility.',
      },
      {
        feature: 'Hosted Contractor Website',
        lgq: 'Included (20+ themes)',
        competitor: 'Not included',
        advantage: 'lgq',
        detail: 'Full SEO-optimized website with live booking.',
      },
    ],
    migrationSteps: [
      {
        step: 1,
        title: 'Export customer CSV',
        description: 'Download your customer directory and job history from ServiceTitan.',
        note: 'Takes under 2 minutes.',
      },
      {
        step: 2,
        title: '1-Click import into LGQ',
        description: 'Upload your file under Dashboard > Clients > Import to populate your records.',
        note: 'Zero data loss.',
      },
      {
        step: 3,
        title: 'Go live with your website',
        description: 'Connect your Stripe account, pick your trade theme, and start quoting.',
        note: 'Ready in 15 minutes.',
      },
    ],
    honestFit: {
      competitorTitle: 'When ServiceTitan is the right choice:',
      competitorPoints: [
        'You operate a massive 50+ truck enterprise with dedicated full-time dispatchers and IT personnel.',
        'You have a $10,000+ software budget and require complex inventory warehouse management.',
      ],
      lgqTitle: 'When Let’s Get Quoted is the clear choice:',
      lgqPoints: [
        'You are an independent contractor or 1–15 person crew looking for speed, simplicity, and high profits.',
        'You want an included marketing website, 24/7 AI lead qualification, and mobile quotes.',
        'You refuse to pay $5,000 setup fees or sign multi-year locked enterprise contracts.',
      ],
    },
    faqs: [
      {
        q: 'Why do contractors switch from ServiceTitan to Let’s Get Quoted?',
        a: 'Most contractors switch because of ServiceTitan’s extreme monthly costs ($400–$1,000+/mo), multi-year contract lock-ins, and complex enterprise bloat. Let’s Get Quoted delivers the essential quoting, scheduling, invoicing, and payments tools plus a free SEO website starting at $0/month.',
      },
      {
        q: 'How much can I save switching from ServiceTitan?',
        a: 'The average independent contractor saves between $4,500 and $12,000 every single year by switching to Let’s Get Quoted and eliminating software setup fees and per-technician monthly charges.',
      },
      {
        q: 'Is Let’s Get Quoted easy to use on mobile?',
        a: 'Yes. Let’s Get Quoted is designed mobile-first for speed in the truck. You and your crew can view daily routes, assign jobs, take before/after photos, and collect e-signatures in seconds.',
      },
    ],
  },

  'angi-leads-alternative': {
    slug: 'angi-leads-alternative',
    name: 'Angi Leads',
    badge: 'Angi Leads Alternative',
    headline: 'Own Your Leads. Stop Paying $80 for Shared Inquiries.',
    subhead:
      'Lead marketplaces charge you $50–$150 for shared leads that 5 other contractors also get. Let’s Get Quoted builds your own high-converting website so you generate exclusive leads you own forever.',
    summary:
      'Buying shared leads from brokers like Angi and HomeAdvisor drains contractor profits through price wars with competitors. Let’s Get Quoted gives you the marketing website, 24/7 AI intake, and SEO presence to capture direct homeowner leads.',
    metaTitle: 'Stop Buying Shared Leads · Angi Leads Alternative',
    metaDescription:
      'Tired of paying $75+ per shared lead on Angi? Build your own high-converting contractor website with AI intake and keep 100% of your customer relationships.',
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
          {
            feature: 'Monthly Retainer Minimums',
            lgq: '$0 (Flex plan)',
            competitor: '$300 – $1,500/mo spend commitments',
            advantage: 'lgq',
            detail: 'No monthly advertising minimums or auto-renewing lead budgets.',
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
        q: 'How does Let’s Get Quoted help me get direct leads without Angi?',
        a: 'LGQ generates a fast, mobile-friendly website tailored to your trade and city with rich local schema markup, Google review integration, and an instant AI quote widget that converts visitors into phone-verified leads.',
      },
      {
        q: 'Can I still use other marketing channels with LGQ?',
        a: 'Absolutely. You can link your LGQ website to your Google Business Profile, Facebook page, truck wraps, business cards, and local yard signs.',
      },
      {
        q: 'Why are exclusive leads better than shared leads?',
        a: 'Shared leads on Angi are sold to 3 to 6 contractors simultaneously, forcing a race-to-the-bottom bidding war. With Let’s Get Quoted, homeowners land on your website and contact only your business, yielding 3x higher close rates and better profit margins.',
      },
    ],
  },

  'thumbtack-alternative': {
    slug: 'thumbtack-alternative',
    name: 'Thumbtack',
    badge: 'Thumbtack Alternative',
    headline: 'Stop Paying for Every Customer Message. Own Your Direct Leads.',
    subhead:
      'Thumbtack charges you $30–$120 every time a homeowner clicks "Direct Lead" or sends a message—even if they never hire you. Let’s Get Quoted gives you your own high-converting website and 24/7 AI intake with $0 lead fees.',
    summary:
      'Thumbtack auto-charges your credit card for customer inquiries regardless of whether the job is legitimate or books. Let’s Get Quoted lets you build direct brand equity, verified reviews, and exclusive homeowner relationships without per-click broker taxes.',
    metaTitle: 'Thumbtack Alternative for Trade Contractors',
    metaDescription:
      'Tired of automatic Thumbtack lead charges? Build your own SEO contractor website with 24/7 AI intake. Start for $0/month and keep 100% of your earnings.',
    basePricing: {
      lgq: '$0/mo on Flex · $0 lead fees',
      competitor: '$300–$2,000/mo in auto-billed lead fees ($25–$120 per message)',
    },
    trustBadges: [
      'Zero Per-Lead Charges',
      'No Auto-Billing Surprises',
      'Free SEO Contractor Website',
      '100% Exclusive Inquiries',
      'Direct Stripe Payouts',
    ],
    keyDifferences: [
      {
        title: 'Zero Auto-Billed Inquiries',
        description:
          'Thumbtack charges your card automatically when a homeowner messages. On LGQ, every lead through your website is 100% free and exclusive to you.',
      },
      {
        title: 'Full Brand Ownership & Google Reviews',
        description:
          'On Thumbtack, reviews are locked in their app. LGQ routes reviews directly to your Google Business Profile to boost your local search ranking.',
      },
      {
        title: 'Built-In Quoting, Scheduling & Payments',
        description:
          'Thumbtack is just a lead directory. LGQ gives you the complete operating system: quotes with e-signatures, job feeds, crew dispatch, and Stripe payments.',
      },
    ],
    visualPillars: [
      {
        title: 'A High-Converting Website That Converts Direct Traffic',
        eyebrow: 'Own Your Presence',
        description:
          'Stop renting space on a marketplace grid. LGQ gives you a standalone contractor website optimized to rank on local Google search.',
        image: 'hosted-website',
        alt: 'Contractor website showcase',
        highlights: ['20+ trade themes', 'Custom domain support', 'Instant estimate widget'],
      },
      {
        title: 'AI Smart Intake That Validates Phone Numbers',
        eyebrow: 'Verified Leads',
        description:
          'Homeowners verify their phone via 1-tap SMS and specify project timeline, photos, and budget before you call them.',
        image: 'ai-smart-intake',
        alt: 'AI lead qualification and scoping screen',
        highlights: ['1-Tap SMS phone verification', 'HOT lead dispatch alerts', 'Zero fake leads'],
      },
      {
        title: 'Mobile Quotes & 1-Tap Deposit Collection',
        eyebrow: 'Fast Turnaround',
        description:
          'Send professional multi-option quotes that homeowners can approve and pay deposits for on their smartphone.',
        image: 'client-esignature',
        alt: 'Client portal e-signature view',
        highlights: ['Apple Pay & Google Pay', 'E-signature contracts', 'QuickBooks Online sync'],
      },
      {
        title: 'Route-Aware Quick Stops Dispatch',
        eyebrow: 'Maximize Revenue',
        description:
          'Fill open schedule slots by matching nearby homeowners with priority arrival windows while you are already on the road.',
        image: 'og-quick-stops',
        alt: 'Route-aware Quick Stops interface',
        highlights: ['Monetize route gaps', 'Zero detour costs', 'Same-day priority booking'],
      },
    ],
    categories: [
      {
        category: 'Cost & Billing Model',
        rows: [
          {
            feature: 'Cost Per Inquiry / Message',
            lgq: '$0 (You own your website)',
            competitor: '$25 – $120 auto-charged per message',
            advantage: 'lgq',
            detail: 'Never pay for tire-kickers or price-shoppers again.',
          },
          {
            feature: 'Monthly Overhead',
            lgq: '$0 / month (Flex plan)',
            competitor: 'Weekly auto-reload budgets ($200–$500/wk)',
            advantage: 'lgq',
            detail: 'Protect your profits without unpredictable marketplace credit card charges.',
          },
        ],
      },
      {
        category: 'Operating System & Tooling',
        rows: [
          {
            feature: 'Contractor Website Builder',
            lgq: 'Included (20+ themes + custom domain)',
            competitor: 'Not included (Directory profile only)',
            advantage: 'lgq',
            detail: 'Build long-term brand equity on your own web address.',
          },
          {
            feature: 'Quotes, Invoicing & Payments',
            lgq: 'Included mobile workflow with Stripe payouts',
            competitor: 'Basic marketplace messaging',
            advantage: 'lgq',
            detail: 'Complete quotes-to-paid workflow in one platform.',
          },
        ],
      },
    ],
    tableRows: [
      {
        feature: 'Cost Per Message / Lead',
        lgq: '$0 (Direct inquiries)',
        competitor: '$25 – $120 auto-charged per click',
        advantage: 'lgq',
        detail: 'Zero lead fees.',
      },
      {
        feature: 'Lead Exclusivity',
        lgq: '100% Exclusive to you',
        competitor: 'Shared marketplace',
        advantage: 'lgq',
        detail: 'Direct customer relationships.',
      },
      {
        feature: 'Custom Contractor Website',
        lgq: 'Included with 20+ themes',
        competitor: 'Directory listing only',
        advantage: 'lgq',
        detail: 'Your own branded web presence.',
      },
      {
        feature: 'Quotes & Invoices with E-Sign',
        lgq: 'Included',
        competitor: 'Basic messaging only',
        advantage: 'lgq',
        detail: 'Complete back office CRM.',
      },
    ],
    migrationSteps: [
      {
        step: 1,
        title: 'Turn off Thumbtack Direct Lead auto-targeting',
        description: 'Pause automatic reload budgets to stop unexpected credit card charges.',
        note: 'Immediate cost savings.',
      },
      {
        step: 2,
        title: 'Publish your free LGQ website',
        description: 'Select your trade theme, connect your custom domain, and enable the AI instant estimate widget.',
        note: 'Live in 15 minutes.',
      },
      {
        step: 3,
        title: 'Route all direct traffic to your site',
        description: 'Link your site to your Google Profile, Facebook, vehicle signage, and customer referrals.',
        note: 'Keep 100% of your earnings.',
      },
    ],
    honestFit: {
      competitorTitle: 'When Thumbtack might make sense:',
      competitorPoints: [
        'You are just starting day 1, have no website or referrals, and are willing to pay $50+ per message to test local demand.',
      ],
      lgqTitle: 'When Let’s Get Quoted is the clear choice:',
      lgqPoints: [
        'You want your own independent contractor brand with 5-star Google reviews and direct homeowner relationships.',
        'You want a complete all-in-one platform (Website + AI Intake + CRM + Invoicing + Payments) with $0/mo entry.',
        'You are tired of paying auto-billed fees for leads that never answer their phone.',
      ],
    },
    faqs: [
      {
        q: 'How does Let’s Get Quoted replace Thumbtack?',
        a: 'Let’s Get Quoted replaces paid lead directories by giving you a high-converting contractor website, 24/7 AI lead scoping, and a complete back office. Instead of paying Thumbtack $50 per message, homeowners book directly through your site for free.',
      },
      {
        q: 'Can I import my past clients into Let’s Get Quoted?',
        a: 'Yes. You can import your past customer list and phone numbers in one click under Dashboard > Clients > Import, allowing you to send quotes, rebook past clients, and set up recurring service agreements.',
      },
    ],
  },
};

export type PlatformKey = 'lgq' | 'jobber' | 'housecall' | 'servicetitan' | 'angi' | 'thumbtack';

export type PlatformInfo = {
  key: PlatformKey;
  name: string;
  badge: string;
  summaryPrice: string;
  isFlagship?: boolean;
  slug?: string;
};

export type MatrixCellStatus = 'positive' | 'neutral' | 'negative';

export type MatrixCell = {
  value: string;
  subtext?: string;
  status: MatrixCellStatus;
  highlight?: boolean;
};

export type MatrixRow = {
  id: string;
  feature: string;
  category: string;
  description?: string;
  cells: Record<PlatformKey, MatrixCell>;
};

export type MatrixCategory = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

export const COMPARE_PLATFORMS: readonly PlatformInfo[] = [
  {
    key: 'lgq',
    name: "Let's Get Quoted",
    badge: 'Built for Profit',
    summaryPrice: 'From $0/mo',
    isFlagship: true,
  },
  {
    key: 'jobber',
    name: 'Jobber',
    badge: 'Legacy SaaS',
    summaryPrice: '$49–$349/mo',
    slug: 'jobber-alternative',
  },
  {
    key: 'housecall',
    name: 'Housecall Pro',
    badge: 'SaaS + Add-Ons',
    summaryPrice: '$65–$299/mo',
    slug: 'housecall-pro-alternative',
  },
  {
    key: 'servicetitan',
    name: 'ServiceTitan',
    badge: 'Enterprise Lock-In',
    summaryPrice: '$398–$1k+/mo/tech',
    slug: 'servicetitan-alternative',
  },
  {
    key: 'angi',
    name: 'Angi Leads',
    badge: 'Shared Lead Broker',
    summaryPrice: '$500–$2.5k/mo',
    slug: 'angi-leads-alternative',
  },
  {
    key: 'thumbtack',
    name: 'Thumbtack',
    badge: 'Auto-Billed Directory',
    summaryPrice: '$300–$2k/mo',
    slug: 'thumbtack-alternative',
  },
];

export const MATRIX_CATEGORIES: readonly MatrixCategory[] = [
  {
    id: 'all',
    label: 'All Features',
    icon: '✦',
    description: 'Complete side-by-side breakdown across all 22 criteria',
  },
  {
    id: 'pricing',
    label: 'Pricing & Overhead',
    icon: '💳',
    description: 'Subscriptions, slow season safety, setup fees, and user penalties',
  },
  {
    id: 'marketing',
    label: 'Website & Lead Engine',
    icon: '🌐',
    description: 'Custom websites, lead exclusivity, cost per lead, and reviews',
  },
  {
    id: 'ai_dispatch',
    label: 'AI Intake & Dispatch',
    icon: '🤖',
    description: '24/7 AI scoping, HOT lead triage, and route-aware Quick Stops',
  },
  {
    id: 'operations',
    label: 'Quotes & Field Crew',
    icon: '📋',
    description: 'Good/Better/Best tiers, e-signatures, texting, and mobile job feeds',
  },
  {
    id: 'payments',
    label: 'Payments & QuickBooks',
    icon: '💰',
    description: 'Stripe payouts, Apple/Google Pay, ACH, and accounting 2-way sync',
  },
];

export const ALL_SERVICES_MATRIX: readonly MatrixRow[] = [
  // ----------------------------------------------------
  // Category 1: Pricing & Overhead Economics
  // ----------------------------------------------------
  {
    id: 'starting-price',
    category: 'pricing',
    feature: 'Entry / Base Monthly Subscription',
    description: 'Fixed monthly fee required just to keep your software running',
    cells: {
      lgq: {
        value: '$0 / month (Flex)',
        subtext: 'Pay only 1.25% fee when you get paid',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: '$49 – $349 / mo',
        subtext: 'Recurring bill regardless of volume',
        status: 'negative',
      },
      housecall: {
        value: '$65 – $299 / mo',
        subtext: 'Base tier before add-on modules',
        status: 'negative',
      },
      servicetitan: {
        value: '$398 – $1,000+ / mo',
        subtext: 'Billed per technician license',
        status: 'negative',
      },
      angi: {
        value: '$500 – $2,500 / mo',
        subtext: 'Required monthly lead retainers',
        status: 'negative',
      },
      thumbtack: {
        value: '$300 – $2,000 / mo',
        subtext: 'Auto-reloaded monthly lead spend',
        status: 'negative',
      },
    },
  },
  {
    id: 'slow-season',
    category: 'pricing',
    feature: 'Slow Season / Weather Down-Time',
    description: 'Software cost when work slows down during winter or rain delays',
    cells: {
      lgq: {
        value: '$0 Software Bill',
        subtext: 'Zero fees on Flex when zero jobs run',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Full Monthly Bill',
        subtext: 'Paid every 30 days regardless',
        status: 'negative',
      },
      housecall: {
        value: 'Full Monthly Bill',
        subtext: 'Paid every 30 days regardless',
        status: 'negative',
      },
      servicetitan: {
        value: 'Full Contract Bill',
        subtext: 'Locked in throughout slow months',
        status: 'negative',
      },
      angi: {
        value: 'Full Retainer Bill',
        subtext: 'Pause penalties or lost credits',
        status: 'negative',
      },
      thumbtack: {
        value: 'Auto-Reload Charged',
        subtext: 'Credit card auto-billed',
        status: 'negative',
      },
    },
  },
  {
    id: 'setup-fees',
    category: 'pricing',
    feature: 'Setup & Implementation Fees',
    description: 'Upfront onboarding, data migration, or system training costs',
    cells: {
      lgq: {
        value: '$0 Setup Fee',
        subtext: 'Self-serve live in 15 minutes',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: '$0 Setup Fee',
        subtext: 'Self-serve onboarding',
        status: 'neutral',
      },
      housecall: {
        value: '$0 – $299',
        subtext: 'Optional onboarding packages',
        status: 'neutral',
      },
      servicetitan: {
        value: '$2,000 – $5,000+',
        subtext: 'Mandatory implementation fee',
        status: 'negative',
      },
      angi: {
        value: '$0 – $300',
        subtext: 'Annual business membership fee',
        status: 'negative',
      },
      thumbtack: {
        value: '$0 Setup',
        subtext: 'Self-serve profile creation',
        status: 'neutral',
      },
    },
  },
  {
    id: 'contracts',
    category: 'pricing',
    feature: 'Contracts & Cancellation Lock-In',
    description: 'Commitment terms and cancellation penalty policies',
    cells: {
      lgq: {
        value: 'No Contracts',
        subtext: 'Month-to-month · Cancel anytime',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Month or Annual',
        subtext: 'Discounts tied to 12mo lock-in',
        status: 'neutral',
      },
      housecall: {
        value: 'Month or Annual',
        subtext: 'Discounts tied to 12mo lock-in',
        status: 'neutral',
      },
      servicetitan: {
        value: '12 – 36 Months',
        subtext: 'Strict locked enterprise contract',
        status: 'negative',
      },
      angi: {
        value: 'Annual Lock-In',
        subtext: 'Auto-renewing lead contracts',
        status: 'negative',
      },
      thumbtack: {
        value: 'Ongoing Auto-Bill',
        subtext: 'Direct Lead auto-reload',
        status: 'negative',
      },
    },
  },
  {
    id: 'extra-seats',
    category: 'pricing',
    feature: 'Extra User / Seat Penalties',
    description: 'Fees charged when adding office staff or field crew members',
    cells: {
      lgq: {
        value: 'Generous Included Seats',
        subtext: 'Crew mobile feeds with zero user penalties',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: '+$29 / mo / user',
        subtext: 'Extra monthly fee per team member',
        status: 'negative',
      },
      housecall: {
        value: '+$35 / mo / user',
        subtext: 'Extra monthly fee per team member',
        status: 'negative',
      },
      servicetitan: {
        value: '+$398–$1,000 / tech',
        subtext: 'Billed per technician license',
        status: 'negative',
      },
      angi: {
        value: 'N/A',
        subtext: 'Directory broker only',
        status: 'neutral',
      },
      thumbtack: {
        value: 'N/A',
        subtext: 'Directory broker only',
        status: 'neutral',
      },
    },
  },

  // ----------------------------------------------------
  // Category 2: Website, Marketing & Lead Engine
  // ----------------------------------------------------
  {
    id: 'custom-website',
    category: 'marketing',
    feature: 'Custom Contractor Website',
    description: 'High-converting standalone website with custom domain and SSL',
    cells: {
      lgq: {
        value: 'Included Free',
        subtext: '20+ trade themes, custom domain & SSL',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Not Included',
        subtext: 'Must build on WordPress/Squarespace ($30–$60/mo)',
        status: 'negative',
      },
      housecall: {
        value: 'Paid Add-On ($99–$199/mo)',
        subtext: 'Recurring monthly website fee',
        status: 'negative',
      },
      servicetitan: {
        value: 'Paid Agency Build',
        subtext: 'High-cost enterprise web packages',
        status: 'negative',
      },
      angi: {
        value: 'Directory Profile Only',
        subtext: 'No standalone brand website',
        status: 'negative',
      },
      thumbtack: {
        value: 'Directory Profile Only',
        subtext: 'No standalone brand website',
        status: 'negative',
      },
    },
  },
  {
    id: 'lead-exclusivity',
    category: 'marketing',
    feature: 'Lead Exclusivity & Ownership',
    description: 'Whether homeowner inquiries are direct to you or shared with competitors',
    cells: {
      lgq: {
        value: '100% Exclusive',
        subtext: 'Direct inquiries you own forever',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Direct (Your Site)',
        subtext: 'If you build an external website',
        status: 'neutral',
      },
      housecall: {
        value: 'Direct (Your Site)',
        subtext: 'If you pay for website add-on',
        status: 'neutral',
      },
      servicetitan: {
        value: 'Direct (Your Site)',
        subtext: 'On enterprise marketing tier',
        status: 'neutral',
      },
      angi: {
        value: 'Shared (3–6 Pros)',
        subtext: 'Sold simultaneously to competitors',
        status: 'negative',
      },
      thumbtack: {
        value: 'Marketplace Shared',
        subtext: 'Homeowners compare 5+ pros in app',
        status: 'negative',
      },
    },
  },
  {
    id: 'cost-per-lead',
    category: 'marketing',
    feature: 'Cost Per Inbound Lead',
    description: 'Price paid to software or directory each time a customer reaches out',
    cells: {
      lgq: {
        value: '$0 per lead',
        subtext: 'Unlimited direct inquiries through your site',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: '$0 (Software only)',
        subtext: 'Requires separate ad spend',
        status: 'neutral',
      },
      housecall: {
        value: '$0 (Software only)',
        subtext: 'Requires separate ad spend',
        status: 'neutral',
      },
      servicetitan: {
        value: '$0 (Software only)',
        subtext: 'Requires separate ad spend',
        status: 'neutral',
      },
      angi: {
        value: '$40 – $150 / lead',
        subtext: 'Billed per shared inquiry click',
        status: 'negative',
      },
      thumbtack: {
        value: '$25 – $120 / message',
        subtext: 'Auto-charged per message received',
        status: 'negative',
      },
    },
  },
  {
    id: 'estimate-calculator',
    category: 'marketing',
    feature: 'Interactive Estimate Calculator',
    description: 'Instant pricing widget on your site that converts curious visitors',
    cells: {
      lgq: {
        value: 'Included Live Widget',
        subtext: 'Converts visitors into phone-verified leads',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Basic Form Only',
        subtext: 'Standard static contact fields',
        status: 'negative',
      },
      housecall: {
        value: 'Basic Booking Form',
        subtext: 'Standard booking widget',
        status: 'negative',
      },
      servicetitan: {
        value: 'Enterprise Widget',
        subtext: 'Requires complex custom setup',
        status: 'neutral',
      },
      angi: {
        value: 'Directory Form',
        subtext: 'Routes homeowner into Angi broker queue',
        status: 'negative',
      },
      thumbtack: {
        value: 'App Chat Box',
        subtext: 'Locked inside Thumbtack inbox',
        status: 'negative',
      },
    },
  },
  {
    id: 'google-reviews',
    category: 'marketing',
    feature: 'Google Reviews & Reputation Hub',
    description: 'Post-job review routing directly to your Google Business Profile',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Routes reviews directly to Google to boost SEO',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Grow Tier Only ($349/mo)',
        subtext: 'Locked behind highest pricing tier',
        status: 'negative',
      },
      housecall: {
        value: 'Paid Add-On',
        subtext: 'Extra monthly marketing module fee',
        status: 'negative',
      },
      servicetitan: {
        value: 'Marketing Pro ($250+/mo)',
        subtext: 'High-cost enterprise module',
        status: 'negative',
      },
      angi: {
        value: 'Trapped on Angi',
        subtext: 'Reviews boost Angi ranking, not your Google Profile',
        status: 'negative',
      },
      thumbtack: {
        value: 'Trapped on Thumbtack',
        subtext: 'Reviews stay inside Thumbtack directory',
        status: 'negative',
      },
    },
  },

  // ----------------------------------------------------
  // Category 3: AI Intake & Dispatch Intelligence
  // ----------------------------------------------------
  {
    id: 'ai-smart-intake',
    category: 'ai_dispatch',
    feature: '24/7 AI Smart Scoping & Intake',
    description: 'Automated scoping questions, photo intake, and timeline analysis',
    cells: {
      lgq: {
        value: 'Included 24/7',
        subtext: 'Asks trade scoping questions & collects photos',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Static Forms Only',
        subtext: 'No interactive scoping logic',
        status: 'negative',
      },
      housecall: {
        value: 'Static Forms Only',
        subtext: 'Standard request forms',
        status: 'negative',
      },
      servicetitan: {
        value: 'Titan Intelligence ($$$)',
        subtext: 'Enterprise AI add-on pricing',
        status: 'neutral',
      },
      angi: {
        value: 'Generic Broker Form',
        subtext: 'Standard marketplace dropdowns',
        status: 'negative',
      },
      thumbtack: {
        value: 'Generic Chat Form',
        subtext: 'Basic questionnaire',
        status: 'negative',
      },
    },
  },
  {
    id: 'lead-triage',
    category: 'ai_dispatch',
    feature: 'HOT / WARM / LOW Lead Triage',
    description: 'Automated project fit calculation, ticket estimation, and SMS alert',
    cells: {
      lgq: {
        value: 'Automated Scoring',
        subtext: 'Scores fit & ticket value + sends instant SMS alert',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Manual Sorting',
        subtext: 'Contractor manually reviews all inquiries',
        status: 'negative',
      },
      housecall: {
        value: 'Manual Sorting',
        subtext: 'No automated urgency scoring',
        status: 'negative',
      },
      servicetitan: {
        value: 'Enterprise Rules',
        subtext: 'Call center routing rules configuration',
        status: 'neutral',
      },
      angi: {
        value: 'No Qualification',
        subtext: 'You pay regardless of lead quality',
        status: 'negative',
      },
      thumbtack: {
        value: 'No Qualification',
        subtext: 'Charged for wrong numbers and tire-kickers',
        status: 'negative',
      },
    },
  },
  {
    id: 'quick-stops',
    category: 'ai_dispatch',
    feature: 'Route-Aware Quick Stops Dispatch',
    description: 'Monetizes driving downtime by matching nearby homeowners with calendar gaps',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Fills afternoon route gaps with same-day booking',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Not Available',
        subtext: 'Traditional calendar scheduling only',
        status: 'negative',
      },
      housecall: {
        value: 'Not Available',
        subtext: 'Standard calendar views',
        status: 'negative',
      },
      servicetitan: {
        value: 'Basic GPS Routing',
        subtext: 'Fleet tracking, no proactive gap filler',
        status: 'neutral',
      },
      angi: {
        value: 'Not Available',
        subtext: 'Lead broker only',
        status: 'negative',
      },
      thumbtack: {
        value: 'Not Available',
        subtext: 'Directory only',
        status: 'negative',
      },
    },
  },
  {
    id: 'phone-verification',
    category: 'ai_dispatch',
    feature: '1-Tap SMS Phone Verification',
    description: 'Verifies homeowner phone numbers to stop fake inquiries and spam',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Eliminates fake numbers and phone tag',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'No Verification',
        subtext: 'Unchecked phone numbers',
        status: 'negative',
      },
      housecall: {
        value: 'No Verification',
        subtext: 'Unchecked phone numbers',
        status: 'negative',
      },
      servicetitan: {
        value: 'Manual Call Check',
        subtext: 'Requires CSR manual verification',
        status: 'neutral',
      },
      angi: {
        value: 'Frequent Bad Numbers',
        subtext: 'High dispute rate for fake phone leads',
        status: 'negative',
      },
      thumbtack: {
        value: 'Auto-Charged Regardless',
        subtext: 'No phone verification before billing',
        status: 'negative',
      },
    },
  },

  // ----------------------------------------------------
  // Category 4: Quotes, Field Operations & Crew
  // ----------------------------------------------------
  {
    id: 'tier-quotes',
    category: 'operations',
    feature: 'Multi-Option Quotes (Good / Better / Best)',
    description: 'Interactive option tiers that allow homeowners to choose upgrades',
    cells: {
      lgq: {
        value: 'Included on All Plans',
        subtext: 'Interactive tiers with itemized add-on options',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Grow Tier Only ($349/mo)',
        subtext: 'Locked behind highest tier',
        status: 'negative',
      },
      housecall: {
        value: 'Max Tier Only ($299/mo)',
        subtext: 'Locked behind highest tier',
        status: 'negative',
      },
      servicetitan: {
        value: 'Included',
        subtext: 'Tiered enterprise sales presentation',
        status: 'positive',
      },
      angi: {
        value: 'Not Available',
        subtext: 'Lead broker only',
        status: 'negative',
      },
      thumbtack: {
        value: 'Basic Text Quote',
        subtext: 'Chat messages only',
        status: 'negative',
      },
    },
  },
  {
    id: 'esignatures',
    category: 'operations',
    feature: 'Mobile E-Signatures & Customer Hub',
    description: 'Instant mobile approval and signed contract generation',
    cells: {
      lgq: {
        value: 'Included',
        subtext: '1-tap sign & deposit payment portal',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Included',
        subtext: 'Client Hub portal',
        status: 'positive',
      },
      housecall: {
        value: 'Included',
        subtext: 'Customer Portal',
        status: 'positive',
      },
      servicetitan: {
        value: 'Included',
        subtext: 'Enterprise customer portal',
        status: 'positive',
      },
      angi: {
        value: 'Not Available',
        subtext: 'No contract portal',
        status: 'negative',
      },
      thumbtack: {
        value: 'Not Available',
        subtext: 'No contract e-signature system',
        status: 'negative',
      },
    },
  },
  {
    id: 'two-way-texting',
    category: 'operations',
    feature: '2-Way Customer Text Messaging',
    description: 'Dedicated business texting synced directly to jobs and customer records',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Syncs to customer record & job feed',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Connect Tier ($169+/mo)',
        subtext: 'Paid upgrade required',
        status: 'negative',
      },
      housecall: {
        value: 'Higher Tier ($169+/mo)',
        subtext: 'Paid upgrade required',
        status: 'negative',
      },
      servicetitan: {
        value: 'Phones Pro Add-On',
        subtext: 'Enterprise telephony add-on',
        status: 'neutral',
      },
      angi: {
        value: 'In-App Chat Only',
        subtext: 'No dedicated SMS business number',
        status: 'negative',
      },
      thumbtack: {
        value: 'In-App Chat Only',
        subtext: 'No dedicated SMS business number',
        status: 'negative',
      },
    },
  },
  {
    id: 'crew-dispatch',
    category: 'operations',
    feature: 'Crew Dispatch & Mobile Job Feeds',
    description: 'Photo logs, labor tracking, mobile assignments, and job feeds',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Photo logs, labor tracking & mobile routes',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Included',
        subtext: 'Mobile app for team',
        status: 'positive',
      },
      housecall: {
        value: 'Included',
        subtext: 'Field technician mobile app',
        status: 'positive',
      },
      servicetitan: {
        value: 'Included',
        subtext: 'Comprehensive mobile tech suite',
        status: 'positive',
      },
      angi: {
        value: 'Not Available',
        subtext: 'No field management tools',
        status: 'negative',
      },
      thumbtack: {
        value: 'Not Available',
        subtext: 'No field management tools',
        status: 'negative',
      },
    },
  },
  {
    id: 'recurring-plans',
    category: 'operations',
    feature: 'Recurring Service Agreements & Cards on File',
    description: 'Automated recurring maintenance billing with stored payment methods',
    cells: {
      lgq: {
        value: 'Included',
        subtext: 'Automated recurring billing + stored cards',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Included on Paid Tiers',
        subtext: 'Recurring job schedules',
        status: 'positive',
      },
      housecall: {
        value: 'Included on Paid Tiers',
        subtext: 'Service agreements module',
        status: 'positive',
      },
      servicetitan: {
        value: 'Included',
        subtext: 'Enterprise membership tracking',
        status: 'positive',
      },
      angi: {
        value: 'Not Available',
        subtext: 'No recurring billing support',
        status: 'negative',
      },
      thumbtack: {
        value: 'Not Available',
        subtext: 'No recurring billing support',
        status: 'negative',
      },
    },
  },

  // ----------------------------------------------------
  // Category 5: Payments, Payouts & Accounting
  // ----------------------------------------------------
  {
    id: 'stripe-payouts',
    category: 'payments',
    feature: 'Direct Stripe Connect Payouts',
    description: 'Direct merchant account ownership with transparent rates and fast payouts',
    cells: {
      lgq: {
        value: 'Direct Stripe Connect',
        subtext: 'Direct merchant account ownership',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Jobber Payments',
        subtext: 'Proprietary payment rail',
        status: 'neutral',
      },
      housecall: {
        value: 'Housecall Payments',
        subtext: 'Proprietary payment rail',
        status: 'neutral',
      },
      servicetitan: {
        value: 'ServiceTitan Payments',
        subtext: 'Proprietary payment processing',
        status: 'neutral',
      },
      angi: {
        value: 'Angi Pay Escrow',
        subtext: 'Broker payment intermediary',
        status: 'negative',
      },
      thumbtack: {
        value: 'Thumbtack Pay',
        subtext: 'Platform payout holds',
        status: 'negative',
      },
    },
  },
  {
    id: 'payment-methods',
    category: 'payments',
    feature: 'Payment Methods Supported',
    description: 'Accepted homeowner payment options on mobile and desktop',
    cells: {
      lgq: {
        value: 'All Major Methods',
        subtext: 'Apple Pay, Google Pay, Cards & Bank ACH',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Cards & ACH',
        subtext: 'Apple Pay on select workflows',
        status: 'positive',
      },
      housecall: {
        value: 'Cards & ACH',
        subtext: 'Standard card & bank checkout',
        status: 'positive',
      },
      servicetitan: {
        value: 'Cards, ACH & Financing',
        subtext: 'Includes consumer financing options',
        status: 'positive',
      },
      angi: {
        value: 'Card Only',
        subtext: 'Through Angi app interface',
        status: 'neutral',
      },
      thumbtack: {
        value: 'Card Only',
        subtext: 'Through Thumbtack app interface',
        status: 'neutral',
      },
    },
  },
  {
    id: 'quickbooks-sync',
    category: 'payments',
    feature: 'QuickBooks Online 2-Way Sync',
    description: 'Automatic reconciliation for invoices, customers, and payments',
    cells: {
      lgq: {
        value: 'Included on All Plans',
        subtext: 'Zero extra fee · Invoices & payments sync auto',
        status: 'positive',
        highlight: true,
      },
      jobber: {
        value: 'Connect Tier ($169+/mo)',
        subtext: 'Not included on Core tier',
        status: 'negative',
      },
      housecall: {
        value: 'Included on Paid Plans',
        subtext: 'Standard QuickBooks integration',
        status: 'positive',
      },
      servicetitan: {
        value: 'Included Enterprise Sync',
        subtext: 'QBO and QuickBooks Desktop',
        status: 'positive',
      },
      angi: {
        value: 'Not Available',
        subtext: 'No accounting sync',
        status: 'negative',
      },
      thumbtack: {
        value: 'Not Available',
        subtext: 'No accounting sync',
        status: 'negative',
      },
    },
  },
];

