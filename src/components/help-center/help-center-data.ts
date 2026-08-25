/**
 * Help Center Data Definitions & Contractor Knowledge Base
 * Single source of truth for categories, trade playbooks, legal templates, and common fixes.
 */

export interface Article {
  id: string;
  title: string;
  readTime: string;
  audience?: string;
  category: string;
  lastUpdated?: string;
  content: string;
}

export interface KnowledgeCategory {
  id: string;
  topic: string;
  title: string;
  desc: string;
  icon: string;
  articles: Article[];
}

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export interface TradePlaybook {
  id: string;
  name: string;
  icon: string;
  badge: string;
  headline: string;
  description: string;
  keyWorkflows: { title: string; desc: string }[];
}

export interface DownloadableTemplate {
  id: string;
  name: string;
  description: string;
  fileSize: string;
  fileName: string;
}

export interface SupportChannel {
  id: string;
  name: string;
  icon: string;
  bestUsedFor: string;
  availability: string;
  responseTarget: string;
  prepareInfo: string[];
}

export const LEGAL_TEMPLATES_DISCLAIMER =
  'These templates are starting points, not legal advice. Requirements vary by state and project. Have important agreements reviewed by a qualified local professional.';

// 6 Common-Fix Diagnostic Articles
export const COMMON_FIX_ARTICLES: Article[] = [
  {
    id: 'art-quote-send-troubleshooting',
    title: 'Why Customer Quotes Fail to Deliver (and How to Fix Them in 2 Minutes)',
    category: 'Quoting',
    readTime: '2 min read',
    audience: 'Contractors & Estimators',
    lastUpdated: 'August 2026',
    content: `
      <h3>Diagnosing Quote Delivery Issues</h3>
      <p>When an estimate or quote fails to reach your customer, it is almost always caused by one of three issues:</p>
      <ol>
        <li><strong>Invalid or Landline Phone Number:</strong> SMS delivery automatically detects landlines and stops sending to protect your carrier trust score. If a number fails, toggle the delivery method to Email in the Quote Actions drawer.</li>
        <li><strong>Expired Magic Token:</strong> If a customer reports the quote link is expired, click <em>Regenerate Link</em> on the quote summary screen to extend access by 30 days.</li>
        <li><strong>Pending 10DLC Verification:</strong> New accounts sending high-volume SMS must have their EIN name matching IRS records exactly.</li>
      </ol>
      <h4>Quick Fix Checklist:</h4>
      <ul>
        <li>Verify the recipient phone number includes 10 digits without international country codes.</li>
        <li>Check the live delivery log in <em>Settings &gt; SMS Logs</em>.</li>
        <li>Use <em>Copy Private Link</em> to paste the quote directly into WhatsApp or personal iMessage if urgency is critical.</li>
      </ul>
    `
  },
  {
    id: 'art-sms-delivery-troubleshooting',
    title: 'Troubleshooting 10DLC Carrier Verification & Pending Text Messages',
    category: 'SMS & Messaging',
    readTime: '3 min read',
    audience: 'Owners & Administrators',
    lastUpdated: 'August 2026',
    content: `
      <h3>10DLC Carrier Brand Approval Workflow</h3>
      <p>US telecom regulations require all business texting to be verified under 10DLC (10-Digit Long Code). Here is how to unblock pending status:</p>
      <ol>
        <li><strong>Legal Entity Name Mismatch:</strong> Your legal business name in <em>Settings &gt; SMS</em> must match word-for-word with your IRS CP-575 or Form 147C letter.</li>
        <li><strong>EIN Validation:</strong> Ensure your 9-digit Employer Identification Number contains no hyphens or spaces in the verification form.</li>
        <li><strong>Website Privacy Policy:</strong> Carriers require a visible SMS opt-in privacy clause. If you use our website builder, this is hosted automatically at <code>/privacy</code>.</li>
      </ol>
      <h4>Delivery Timelines:</h4>
      <p>Standard carrier verification completes in <strong>2 to 24 hours</strong>. While pending, all quote notifications automatically route via priority transactional email.</p>
    `
  },
  {
    id: 'art-stripe-payout-troubleshooting',
    title: 'Resolving Stripe Connect Deposit Schedules & Verification Holds',
    category: 'Payments & Banking',
    readTime: '2 min read',
    audience: 'Business Owners & Bookkeepers',
    lastUpdated: 'August 2026',
    content: `
      <h3>Understanding Payout Timing</h3>
      <p>Customer deposits and credit card payments clear through Stripe Connect directly into your linked checking account on a <strong>2-business-day rolling basis</strong>.</p>
      <h4>Common Reasons for Delayed Deposits:</h4>
      <ul>
        <li><strong>First Payout Delay:</strong> Stripe applies a one-time 5-7 business day holding period on your very first collected customer payment for fraud prevention.</li>
        <li><strong>Identity Verification Needed:</strong> Check <em>Settings &gt; Payments &gt; Stripe Express Dashboard</em> to see if a photo ID or bank statement upload is requested.</li>
        <li><strong>Weekend &amp; Bank Holiday Rollover:</strong> Payments processed after 5:00 PM EST on Fridays batch into Monday morning bank processing.</li>
      </ul>
    `
  },
  {
    id: 'art-domain-offline-troubleshooting',
    title: 'Fixing Custom Domain DNS Records & SSL Certificate Propagation',
    category: 'Custom Domains',
    readTime: '4 min read',
    audience: 'Administrators & Web Leads',
    lastUpdated: 'August 2026',
    content: `
      <h3>DNS Configuration Reference</h3>
      <p>To connect your own custom domain (e.g. <code>maplewoodplumbing.com</code>) to your contractor site:</p>
      <ol>
        <li>Log into your registrar (GoDaddy, Namecheap, Google Domains / Squarespace).</li>
        <li>Create an <strong>A Record</strong> with Host: <code>@</code> pointing to IP: <code>76.76.21.21</code>.</li>
        <li>Create a <strong>CNAME Record</strong> with Host: <code>www</code> pointing to <code>cname.letsgetquoted.com</code>.</li>
        <li>Remove any competing A records or domain parking redirects.</li>
      </ol>
      <h4>SSL Generation:</h4>
      <p>Our edge servers issue a free auto-renewing Let&apos;s Encrypt SSL certificate within <strong>15 minutes</strong> of DNS propagation.</p>
    `
  },
  {
    id: 'art-team-access-troubleshooting',
    title: 'Resolving Crew Sign-In Issues & Role Permission Settings',
    category: 'Team Management',
    readTime: '2 min read',
    audience: 'Owners & Field Managers',
    lastUpdated: 'August 2026',
    content: `
      <h3>Managing Team Invitations</h3>
      <p>If a technician or office manager cannot access their dashboard, follow these verification steps:</p>
      <ol>
        <li><strong>Resend Activation Invite:</strong> Navigate to <em>Settings &gt; Team</em>, locate the member, and click <em>Resend Invite Link</em>.</li>
        <li><strong>Check Seat Entitlements:</strong> Ensure your subscription plan has available active crew seats before adding new field workers.</li>
        <li><strong>Role Permissions:</strong> Technicians assigned the <em>Field Crew</em> role only see jobs dispatched directly to their schedule.</li>
      </ol>
    `
  },
  {
    id: 'art-schedule-sync-troubleshooting',
    title: 'Why a Dispatched Job is Missing from the Crew Calendar',
    category: 'Scheduling & Dispatch',
    readTime: '2 min read',
    audience: 'Dispatchers & Technicians',
    lastUpdated: 'August 2026',
    content: `
      <h3>Dispatch Synchronization Guide</h3>
      <p>When an approved quote or emergency service call is not showing on a technician&apos;s phone calendar:</p>
      <ul>
        <li><strong>Assigned Truck Filter:</strong> Verify the job has an assigned technician in the <em>Crew &amp; Equipment</em> dropdown. Unassigned jobs appear in the <em>Unscheduled Queue</em> on the left sidebar.</li>
        <li><strong>Confirmed Deposit Requirement:</strong> If your job setting requires a deposit before dispatch, the job remains in <em>Pending Approval</em> until Stripe confirms payment.</li>
        <li><strong>Timezone Alignment:</strong> Check that your company operating timezone in <em>Settings &gt; Profile</em> matches your local service territory.</li>
      </ul>
    `
  }
];

export const KNOWLEDGE_BASE: KnowledgeCategory[] = [
  {
    id: 'cat-getting-started',
    topic: 'onboarding',
    title: 'Getting Started & Workspace Setup',
    desc: 'Company branding, default labor rates, material markups, and contractor profiles.',
    icon: 'Rocket',
    articles: [
      {
        id: 'art-quickstart-guide',
        title: 'Complete 10-Minute Onboarding Checklist for Contractors',
        category: 'Setup',
        readTime: '4 min read',
        audience: 'New Users',
        lastUpdated: 'August 2026',
        content: `
          <h3>Setup Overview</h3>
          <p>Get up and running with custom branded quotes, rate cards, and client communication channels.</p>
        `
      },
      {
        id: 'art-markup-pricing',
        title: 'Configuring Hourly Rates, Overhead Multipliers, and Material Markup',
        category: 'Setup',
        readTime: '3 min read',
        audience: 'Owners & Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>Rate Calculation Formulas</h3>
          <p>Ensure profitable bids across residential plumbing, electrical, and HVAC projects.</p>
        `
      },
      {
        id: 'art-domain-setup',
        title: 'Connecting Custom Domains & Free SSL Setup Guide',
        category: 'Setup',
        readTime: '5 min read',
        audience: 'Admins',
        lastUpdated: 'August 2026',
        content: `
          <h3>Domain Setup</h3>
          <p>DNS configuration steps for GoDaddy, Namecheap, Cloudflare, and Squarespace.</p>
        `
      }
    ]
  },
  {
    id: 'cat-instant-quoting',
    topic: 'quoting',
    title: 'Instant Multi-Tier Quoting',
    desc: '3-tier Good / Better / Best packages, change orders, and instant customer signature approval.',
    icon: 'FileSpreadsheet',
    articles: [
      COMMON_FIX_ARTICLES[0],
      {
        id: 'art-good-better-best',
        title: 'How to Build High-Converting 3-Option Proposals (Good / Better / Best)',
        category: 'Quoting',
        readTime: '4 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>Package Strategy</h3>
          <p>Increase your average project size by offering tiered options with transparent value add-ons.</p>
        `
      },
      {
        id: 'art-change-orders',
        title: 'Issuing On-Site Extra Work Orders & Instant Client Approvals',
        category: 'Quoting',
        readTime: '3 min read',
        audience: 'Field Techs',
        lastUpdated: 'August 2026',
        content: `
          <h3>Handling Unexpected Scope Changes</h3>
          <p>Generate supplementary work agreements on your mobile phone before buying additional materials.</p>
        `
      }
    ]
  },
  {
    id: 'cat-sms-messaging',
    topic: 'sms',
    title: 'Dedicated SMS & Two-Way Client Chat',
    desc: '10DLC carrier compliance, automated quote follow-ups, and review request automations.',
    icon: 'Smartphone',
    articles: [
      COMMON_FIX_ARTICLES[1],
      {
        id: 'art-automated-followups',
        title: 'Setting Up 24-Hour & 72-Hour Quote Follow-Up Sequences',
        category: 'SMS & Messaging',
        readTime: '3 min read',
        audience: 'Sales & Dispatch',
        lastUpdated: 'August 2026',
        content: `
          <h3>Automated Reminders</h3>
          <p>Follow up with residential homeowners automatically without sounding pushy or robotic.</p>
        `
      },
      {
        id: 'art-review-requests',
        title: 'Automated 5-Star Google Review Requests Upon Job Completion',
        category: 'SMS & Messaging',
        readTime: '2 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        content: `
          <h3>Review Ingest</h3>
          <p>Send review requests via SMS the moment your technician marks a work order complete.</p>
        `
      }
    ]
  },
  {
    id: 'cat-payments-invoicing',
    topic: 'invoicing',
    title: 'Stripe Connect, Deposits & Invoicing',
    desc: 'Deposit milestones, credit card processing fees, next-day bank transfers, and receipts.',
    icon: 'CreditCard',
    articles: [
      COMMON_FIX_ARTICLES[2],
      {
        id: 'art-deposit-schedules',
        title: 'Enforcing 30% / 50% Milestone Deposits Prior to Job Dispatch',
        category: 'Payments',
        readTime: '3 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>Milestone Billing</h3>
          <p>Collect non-refundable material deposits securely before scheduling crew trucks.</p>
        `
      },
      {
        id: 'art-convenience-fees',
        title: 'Passing Credit Card Processing Fees Compliantly by State Law',
        category: 'Payments',
        readTime: '4 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        content: `
          <h3>Card Processing Rules</h3>
          <p>Understand state-by-state guidelines for credit card surcharging and zero-fee bank transfers.</p>
        `
      }
    ]
  },
  {
    id: 'cat-crew-scheduling',
    topic: 'team',
    title: 'Crew Management & Route Dispatch',
    desc: 'GPS technician dispatching, time tracking, crew seat permissions, and calendar sync.',
    icon: 'Users',
    articles: [
      COMMON_FIX_ARTICLES[4],
      COMMON_FIX_ARTICLES[5],
      {
        id: 'art-route-density',
        title: 'Optimizing Route Density & Grouping Jobs by Neighborhood',
        category: 'Team Management',
        readTime: '3 min read',
        audience: 'Dispatchers',
        lastUpdated: 'August 2026',
        content: `
          <h3>Route Optimization</h3>
          <p>Cut fuel costs and travel time by scheduling adjacent zip codes on recurring calendar blocks.</p>
        `
      }
    ]
  },
  {
    id: 'cat-contractor-website',
    topic: 'website',
    title: 'Contractor Website Builder & SEO',
    desc: 'Service area landing pages, instant intake forms, logo branding, and local search SEO.',
    icon: 'Globe',
    articles: [
      COMMON_FIX_ARTICLES[3],
      {
        id: 'art-local-seo-ranking',
        title: 'How Local Service Landing Pages Rank on Google Search',
        category: 'Website & SEO',
        readTime: '4 min read',
        audience: 'Marketing Leads',
        lastUpdated: 'August 2026',
        content: `
          <h3>Local Search Optimization</h3>
          <p>Target specific towns and suburbs with automated SEO landing pages that generate direct calls.</p>
        `
      }
    ]
  }
];

export const TRADE_PLAYBOOKS: TradePlaybook[] = [
  {
    id: 'plumbing',
    name: 'Plumbing',
    icon: 'Wrench',
    badge: 'Master Plumber Playbook',
    headline: 'Emergency Diagnostic Fees & Water Heater Replacements',
    description:
      'Standardized pricing for sewer camera inspections, emergency after-hours dispatches, and Good/Better/Best water heater packages.',
    keyWorkflows: [
      { title: 'Emergency Dispatch Fee', desc: 'Pre-authorize $149 diagnostic fee before rolling the truck.' },
      { title: '3-Tier Water Heater Quote', desc: 'Standard tank, hybrid high-efficiency, or tankless instant-hot packages.' },
      { title: 'Camera Inspection Add-On', desc: 'Attach video inspection clips directly to customer proposal links.' }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical',
    icon: 'Zap',
    badge: 'Master Electrician Playbook',
    headline: 'Panel Upgrades, EV Chargers & Whole-Home Rewiring',
    description:
      'Milestone deposit structures for 200A service panel upgrades, Level 2 EV charging circuits, and generator hookups.',
    keyWorkflows: [
      { title: 'Panel Upgrade Scope', desc: 'Break down utility disconnect, main panel, and permit pass-through fees.' },
      { title: 'EV Charger Installation', desc: 'Standardize 40A vs 50A breaker runs by distance from main panel.' },
      { title: 'Safety Inspection Checklist', desc: 'Deliver printable home electrical compliance report cards.' }
    ]
  },
  {
    id: 'roofing',
    name: 'Roofing',
    icon: 'Home',
    badge: 'Roofing Contractor Playbook',
    headline: 'Insurance Claim Supplements & Architectural Shingle Tiers',
    description:
      'Capture square footage estimates, aerial roof pitch measurements, and 3-option shingle replacement warranties.',
    keyWorkflows: [
      { title: '3-Tier Shingle Package', desc: '3-Tab Economy, Architectural Lifetime, and Premium Designer Shingles.' },
      { title: 'Decking Replacement Clause', desc: 'Standard per-sheet plywood replacement rates for rotted sub-roofing.' },
      { title: 'Lien Waiver Generation', desc: 'Issue unconditional partial and final lien waivers on progress draws.' }
    ]
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    icon: 'Trees',
    badge: 'Landscape Specialist Playbook',
    headline: 'Recurring Maintenance Agreements & Hardscape Proposals',
    description:
      'Automate monthly seasonal maintenance contracts, spring cleanups, and multi-stage patio hardscaping bids.',
    keyWorkflows: [
      { title: 'Recurring Monthly Billing', desc: 'Auto-charge credit cards on the 1st of every month for weekly lawn care.' },
      { title: 'Hardscape Progress Draw', desc: 'Collect 40% material deposit, 40% base prep draw, and 20% on completion.' },
      { title: 'Mulch & Bed Calculation', desc: 'Instant yards-of-mulch calculator embedded in client proposals.' }
    ]
  },
  {
    id: 'hvac',
    name: 'HVAC',
    icon: 'Hammer',
    badge: 'HVAC Contractor Playbook',
    headline: 'Seasonal Maintenance Clubs & Heat Pump Conversions',
    description:
      'Offer biannual system tune-up subscriptions, SEER2 efficiency tiers, and multi-zone mini-split packages.',
    keyWorkflows: [
      { title: 'Annual Maintenance Plan', desc: 'Subscription model for spring AC and fall heating tune-ups.' },
      { title: 'SEER2 Comparison Matrix', desc: 'Compare annual energy savings side-by-side on client approval screens.' },
      { title: 'Ductwork Inspection Add-On', desc: 'Upsell air quality filtration and duct sealing on equipment changeouts.' }
    ]
  }
];

export const DOWNLOADABLE_TEMPLATES: DownloadableTemplate[] = [
  {
    id: 'tpl-progress-deposit',
    name: 'Contractor Milestone Deposit Agreement',
    description: 'Printable 3-stage progress payment terms with mobilization and material release clauses.',
    fileSize: '48 KB',
    fileName: 'contractor-milestone-deposit-agreement.pdf'
  },
  {
    id: 'tpl-extra-work-order',
    name: 'On-Site Extra Work Order & Scope Change Form',
    description: 'Instant change order template with customer signature acknowledgment and material markup line items.',
    fileSize: '42 KB',
    fileName: 'extra-work-order-form.pdf'
  },
  {
    id: 'tpl-unconditional-lien-waiver',
    name: 'Progress & Final Unconditional Lien Waiver',
    description: 'Standard statutory lien release form for residential general contractors and trade subcontractors.',
    fileSize: '36 KB',
    fileName: 'lien-waiver-progress-final.pdf'
  }
];

export const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'quotes',
    question: 'How does instant quote approval work for homeowners?',
    answer:
      'Homeowners receive a private secure link via SMS and email. They can compare Good, Better, and Best options, select package upgrades, accept legal agreement terms, and pay their deposit via credit card or Apple Pay in under 60 seconds.'
  },
  {
    id: 'faq-2',
    category: 'messaging',
    question: 'What is 10DLC registration and why is it mandatory for SMS?',
    answer:
      '10DLC (10-Digit Long Code) is a telecommunications standard required by US carriers (AT&T, Verizon, T-Mobile) to eliminate spam. We guide you through automated brand verification using your legal EIN in Settings > SMS.'
  },
  {
    id: 'faq-3',
    category: 'payments',
    question: 'How fast do customer payments reach my bank account?',
    answer:
      'Credit card and debit card payments clear directly into your business checking account on a 2-business-day rolling schedule via Stripe Connect. First-time payouts have a one-time verification period of 5-7 business days.'
  },
  {
    id: 'faq-4',
    category: 'website',
    question: 'Can I use my existing domain name like maplewoodpros.com?',
    answer:
      'Yes. You can point your existing root domain or www subdomain to our cloud edge servers by adding an A record (76.76.21.21) and CNAME in your DNS registrar. SSL certificates are provisioned automatically.'
  },
  {
    id: 'faq-5',
    category: 'team',
    question: 'How do technician and crew permissions work?',
    answer:
      'Crew members with the Field Tech role only see the jobs and addresses dispatched directly to their schedule. Financial revenue reports, bank payouts, and client payment details remain restricted to Owners and Office Managers.'
  },
  {
    id: 'faq-6',
    category: 'billing',
    question: 'Is there a contract or can I cancel anytime?',
    answer:
      'All plans are month-to-month with no long-term lock-in. You can upgrade, downgrade, or cancel your subscription at any time directly in Settings > Billing.'
  }
];

export const SUPPORT_CHANNELS: SupportChannel[] = [
  {
    id: 'chan-ticket',
    name: 'Help Desk Ticket',
    icon: 'LifeBuoy',
    bestUsedFor: 'DNS setup, 10DLC carrier approvals, and custom account troubleshooting.',
    availability: 'Monday – Saturday (8:00 AM – 8:00 PM EST)',
    responseTarget: 'Target response in under 2 hours',
    prepareInfo: ['Company registered name', 'Account login email', 'Relevant quote or job number']
  },
  {
    id: 'chan-email',
    name: 'Priority Email Desk',
    icon: 'Send',
    bestUsedFor: 'Billing inquiries, seat management, and API integrations.',
    availability: '24/7 Monitored Queue',
    responseTarget: 'Same business day response',
    prepareInfo: ['Invoice receipt number', 'Detailed error screenshot or logs']
  },
  {
    id: 'chan-community',
    name: 'Knowledge Base & Guides',
    icon: 'BookCheck',
    bestUsedFor: 'Self-service setup, rate card formulas, and trade playbooks.',
    availability: 'Available 24/7/365',
    responseTarget: 'Instant step-by-step guides',
    prepareInfo: ['Search keywords above in the AI Troubleshooter']
  }
];
