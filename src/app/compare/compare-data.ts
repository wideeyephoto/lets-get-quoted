export type ComparisonPoint = {
  feature: string;
  lgq: string;
  competitor: string;
  advantage: 'lgq' | 'equal' | 'competitor';
  detail: string;
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
  keyDifferences: readonly {
    title: string;
    description: string;
  }[];
  tableRows: readonly ComparisonPoint[];
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
      'Jobber charges $149–$349/month whether you book jobs or not. Let’s Get Quoted gives you a free marketing website, AI lead qualification, and a complete back office from $0/month.',
    summary:
      'While Jobber provides traditional scheduling and quoting, it requires ongoing fixed subscriptions, charges for additional seats, and does not build your contractor website. Let’s Get Quoted replaces subscription bloat with performance-aligned plans and built-in lead capture.',
    metaTitle: 'Jobber Alternative for Contractors · Let’s Get Quoted',
    metaDescription:
      'Compare Let’s Get Quoted vs Jobber. Get a free contractor website, 24/7 AI intake, and quotes-to-paid workflow starting at $0/mo without per-seat surprises.',
    basePricing: {
      lgq: 'From $0/mo (Flex) up to $299/mo (Scale with 0.10% fee)',
      competitor: '$49/mo (Core, 1 user) to $349/mo (Grow) + $29/mo extra user fees',
    },
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
        title: 'Route-Aware Quick Stops',
        description:
          'Fill gaps in your day by offering nearby homeowners priority arrival windows while you are already on the road, monetizing empty travel time.',
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
        competitor: 'Included on paid plans',
        advantage: 'equal',
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
    faqs: [
      {
        q: 'Can I migrate my clients and past jobs from Jobber to Let’s Get Quoted?',
        a: 'Yes. You can export your client CSV from Jobber and import it into Let’s Get Quoted in one click under Dashboard > Clients > Import.',
      },
      {
        q: 'How do payments work compared to Jobber Payments?',
        a: 'LGQ connects directly to your own Stripe account. You receive direct bank payouts with complete fee transparency and instant e-signatures on all quotes and invoices.',
      },
      {
        q: 'Is there a contract or cancellation fee?',
        a: 'No. There are no contracts, setup fees, or cancellation penalties. You can upgrade, downgrade, or cancel at any time from your account settings.',
      },
    ],
  },

  'housecall-pro-alternative': {
    slug: 'housecall-pro-alternative',
    name: 'Housecall Pro',
    badge: 'Housecall Pro Alternative',
    headline: 'Contractor Software Without Expensive Add-On Modules.',
    subhead:
      'Housecall Pro locks core tools behind expensive tiers and paid add-ons. Let’s Get Quoted bundles your public website, 2-way texting, and AI lead triage into a unified platform.',
    summary:
      'Housecall Pro is a popular tool for trade businesses, but its pricing escalates rapidly with extra team members and optional add-on fees for marketing and phone receptionists. Let’s Get Quoted provides an all-in-one alternative designed around honest pricing.',
    metaTitle: 'Housecall Pro Alternative for Contractors · Let’s Get Quoted',
    metaDescription:
      'Switch from Housecall Pro to Let’s Get Quoted. Get a free contractor website, AI smart intake, quick stops dispatch, and online payments starting at $0/mo.',
    basePricing: {
      lgq: 'From $0/mo (Flex) up to $299/mo (Scale)',
      competitor: '$65/mo (Basic, 1 user) to $299/mo (Max) + $35/mo extra seats',
    },
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
