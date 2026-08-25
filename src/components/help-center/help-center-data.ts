export interface Article {
  id: string;
  title: string;
  readTime: string;
  category: string;
  content: string;
}

export interface KnowledgeCategory {
  id: string;
  topic: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  count: string;
  articles: Article[];
}

export interface TradePlaybook {
  id: string;
  name: string;
  icon: string;
  badge: string;
  headline: string;
  description: string;
  keyWorkflows: {
    title: string;
    desc: string;
  }[];
}

export interface VideoPlaybook {
  id: string;
  title: string;
  duration: string;
  category: string;
  thumbnailGradient: string;
  summary: string;
}

export interface DownloadableTemplate {
  id: string;
  name: string;
  fileFormat: string;
  fileSize: string;
  description: string;
  downloadsCount: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export const TRADE_PLAYBOOKS: TradePlaybook[] = [
  {
    id: 'plumbing',
    name: 'Plumbing & HVAC',
    icon: 'Wrench',
    badge: 'Popular for Service & Repair',
    headline: 'Emergency Dispatch & Tiered Fixture Replacements',
    description: 'Master fast on-truck dispatch, after-hours emergency call multipliers, and multi-tier water heater replacement proposals.',
    keyWorkflows: [
      { title: 'Emergency After-Hours Multiplier', desc: 'Auto-adjust dispatch fees by 1.5x on weekends or after 6 PM.' },
      { title: 'Water Heater Good/Better/Best', desc: 'Standard Tank (Good) vs Hybrid Heat Pump (Better) vs Tankless Lifetime (Best).' },
      { title: 'Camera Inspection Video Attachments', desc: 'Attach drain camera MP4 clips directly to homeowner estimate links.' }
    ]
  },
  {
    id: 'roofing',
    name: 'Roofing & Siding',
    icon: 'Home',
    badge: 'High-Ticket Remodeling',
    headline: 'Multi-Square Estimation & Drone Photo Proposals',
    description: 'Calculate pitch multipliers, waste factors (10–15%), architectural shingle upgrade packages, and insurance deductible workflows.',
    keyWorkflows: [
      { title: 'Square & Pitch Calculator', desc: 'Enter total square footage and pitch slope to instantly calculate bundles & underlayment.' },
      { title: '30-Year vs 50-Year Shingle Tiers', desc: 'Present Architectural (Good), Lifetime Designer (Better), and Standing Seam Metal (Best).' },
      { title: 'Drone Inspection Photo Carousels', desc: 'Embed before/after roof leak photos in the client-facing digital quote.' }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical & Solar',
    icon: 'Zap',
    badge: 'Precision Permitting & Panels',
    headline: 'Panel Upgrades, EV Chargers & Permit Line Items',
    description: 'Quote 200A service panel upgrades, Level 2 EV charger installations, and pass-through municipality permit fees cleanly.',
    keyWorkflows: [
      { title: '200A Service Upgrade Tiers', desc: 'Main breaker panel swap vs whole-home surge protection vs battery backup.' },
      { title: 'Municipality Permit Line Items', desc: 'Add non-taxable town permit pass-through line items that calculate automatically.' },
      { title: 'EV Charger Load Calculation', desc: 'Include wire run distance brackets (up to 25ft, 50ft, 100ft) with upfront materials.' }
    ]
  },
  {
    id: 'landscaping',
    name: 'Landscaping & Tree Care',
    icon: 'Trees',
    badge: 'Recurring Maintenance & Hardscaping',
    headline: 'Recurring Service Agreements & Hardscape Deposits',
    description: 'Automate weekly/bi-weekly lawn maintenance billing, seasonal spring/fall cleanups, and 50% upfront patio material deposits.',
    keyWorkflows: [
      { title: 'Seasonal Recurring Contracts', desc: 'Set monthly auto-invoicing from April to November with card-on-file billing.' },
      { title: 'Hardscape Paver Square Footage', desc: 'Calculate base gravel, sand bedding, and paver stone quantities with built-in labor rates.' },
      { title: 'Tree Removal Hazard Multiplier', desc: 'Quote crane access, stump grinding, and limb clearance as modular optional add-ons.' }
    ]
  },
  {
    id: 'general',
    name: 'General Contracting',
    icon: 'Hammer',
    badge: 'Milestone & Remodeling Billing',
    headline: 'Milestone Invoicing (50/40/10) & Change Orders',
    description: 'Structure large-scale bathroom and kitchen remodels with compliant milestone deposit schedules and 1-click change order sign-offs.',
    keyWorkflows: [
      { title: '50/40/10 Milestone Billing', desc: 'Collect 50% deposit on contract signing, 40% upon rough-in completion, 10% final punch list.' },
      { title: 'Mobile Change Order Signatures', desc: 'Generate a 1-page extra work authorization with instant homeowner e-signature on site.' },
      { title: 'Subcontractor Lien Waiver Receipts', desc: 'Generate unconditional progress lien waivers upon payment receipt for banks and lenders.' }
    ]
  }
];

export const VIDEO_PLAYBOOKS: VideoPlaybook[] = [
  {
    id: 'vid-tiered-quoting',
    title: 'Building a 3-Tier "Good / Better / Best" Quote on Mobile',
    duration: '1:15',
    category: 'Instant Quoting',
    thumbnailGradient: 'linear-gradient(135deg, #0e1622 0%, #1e293b 100%)',
    summary: 'Watch how to create an interactive 3-option estimate on your phone in under 60 seconds from the jobsite truck.'
  },
  {
    id: 'vid-stripe-deposits',
    title: 'Collecting 50% Material Deposits with Apple Pay',
    duration: '0:48',
    category: 'Payments & Stripe',
    thumbnailGradient: 'linear-gradient(135deg, #101c2c 0%, #172a3a 100%)',
    summary: 'See how homeowners receive an SMS link, select their package, sign digitally, and pay instant deposits via 1-click Apple Pay.'
  },
  {
    id: 'vid-custom-domain',
    title: 'Connecting Your GoDaddy / Namecheap Domain in 2 Mins',
    duration: '1:32',
    category: 'AI Website Builder',
    thumbnailGradient: 'linear-gradient(135deg, #181c24 0%, #202b36 100%)',
    summary: 'Step-by-step walkthrough of adding an A record (76.76.21.21) and CNAME to deploy your contractor AI website live.'
  },
  {
    id: 'vid-sms-followups',
    title: 'Configuring 24/7 Automated SMS Quote Follow-Ups',
    duration: '1:05',
    category: 'Two-Way SMS',
    thumbnailGradient: 'linear-gradient(135deg, #1c1424 0%, #2a1f3a 100%)',
    summary: 'How to automate polite text follow-ups at 24h and 72h that automatically stop the second a homeowner replies or signs.'
  }
];

export const DOWNLOADABLE_TEMPLATES: DownloadableTemplate[] = [
  {
    id: 'tpl-lien-waiver',
    name: 'Residential Contractor Progress Lien Waiver Template',
    fileFormat: 'PDF & Word',
    fileSize: '142 KB',
    description: 'Standard conditional and unconditional lien waiver form for banks, homeowners, and general contractors.',
    downloadsCount: '4,280+'
  },
  {
    id: 'tpl-change-order',
    name: 'Extra Work Authorization & Change Order Agreement',
    fileFormat: 'PDF & Fillable',
    fileSize: '98 KB',
    description: 'Legally compliant 1-page form to document unforeseen scope changes, material additions, and updated totals.',
    downloadsCount: '3,650+'
  },
  {
    id: 'tpl-deposit-terms',
    name: '50% Upfront Material Deposit & Payment Schedule Addendum',
    fileFormat: 'PDF & DOCX',
    fileSize: '116 KB',
    description: 'Standard clause defining upfront non-refundable material orders, payment milestones, and late fee terms.',
    downloadsCount: '5,120+'
  }
];

export const KNOWLEDGE_BASE: KnowledgeCategory[] = [
  {
    id: 'cat-onboarding',
    topic: 'onboarding',
    title: 'Fast-Track Contractor Setup',
    desc: 'Get your company profile, tax rules, trade license, and branding configured in under 5 minutes.',
    icon: 'Rocket',
    color: '#6366f1',
    count: '8 Guides',
    articles: [
      {
        id: 'art-profile-setup',
        title: 'Configuring Company Info, Trade License & Logos',
        readTime: '3 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>Overview</h3>
          <p>Your company profile is used across all outgoing client estimates, PDF agreements, and AI landing pages. Ensuring accurate contact and licensing data boosts homeowner confidence and approval rates.</p>
          <div class="callout">
            <strong>Pro Tip:</strong> Upload a high-resolution PNG logo with a transparent background for the sharpest results on invoices and mobile quote views.
          </div>
          <h3>Step-by-Step Configuration</h3>
          <ol>
            <li>Navigate to <strong>Dashboard &gt; Settings &gt; Company Profile</strong>.</li>
            <li>Enter your registered Legal Business Name, Trade / Contractor License Number, and Insurance details.</li>
            <li>Set your primary business phone number (this will sync with your dedicated 10DLC automated business SMS number).</li>
            <li>Upload your company logo (recommended dimensions: 800x400px).</li>
            <li>Click <strong>Save &amp; Verify Profile</strong>.</li>
          </ol>
        `
      },
      {
        id: 'art-carrier-onboarding',
        title: '10DLC Carrier Brand & Campaign Verification Checklist',
        readTime: '4 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>Understanding 10DLC Compliance</h3>
          <p>Major US mobile carriers (AT&T, Verizon, T-Mobile) require all automated and two-way business texting systems to be registered with The Campaign Registry (TCR). We manage carrier compliance directly to ensure 99.9% SMS deliverability.</p>
          <div class="callout">
            <strong>Carrier Approval Timeline:</strong> Most contractor brands are verified within <strong>2 to 24 hours</strong> once EIN and business legal address are submitted.
          </div>
          <h3>Required Registration Details</h3>
          <ul>
            <li><strong>Exact Legal Name:</strong> Must match your IRS EIN document letter exactly.</li>
            <li><strong>Company EIN / Tax ID:</strong> 9-digit tax ID.</li>
            <li><strong>Physical Business Address:</strong> PO Boxes are rejected by telecom carriers.</li>
          </ul>
        `
      },
      {
        id: 'art-mobile-app-sync',
        title: 'Installing the Progressive Mobile Web App on iOS & Android',
        readTime: '2 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>One-Tap Field Access</h3>
          <p>Access jobs, dispatch notes, instant quote calculators, and customer calling from your truck without downloading a bloated app store binary.</p>
          <p><strong>On iPhone / iPad (Safari):</strong> Tap the <em>Share</em> icon and select <strong>Add to Home Screen</strong>.</p>
          <p><strong>On Android (Chrome):</strong> Tap the menu and select <strong>Install App</strong>.</p>
        `
      }
    ]
  },
  {
    id: 'cat-quoting',
    topic: 'quoting',
    title: 'Instant Quoting & Good/Better/Best Tiers',
    desc: 'Build multi-option proposals, interactive material selectors, and collect homeowner e-signatures on mobile.',
    icon: 'FileSpreadsheet',
    color: '#06b6d4',
    count: '14 Guides',
    articles: [
      {
        id: 'art-tier-builder',
        title: 'Creating 3-Tier "Good / Better / Best" Proposals',
        readTime: '4 min read',
        category: 'Instant Quoting',
        content: `
          <h3>Why Tiered Quoting Wins 38% Higher Revenue</h3>
          <p>Homeowners love having choices. By presenting three clear options, you eliminate price shopping against competitors.</p>
          <ol>
            <li>In your Quote Editor, toggle on <strong>Multi-Option Proposal</strong>.</li>
            <li>Set Option 1 as <em>Essential Fix</em>.</li>
            <li>Set Option 2 as <em>Recommended Pro Upgrade</em>.</li>
            <li>Set Option 3 as <em>Platinum Lifetime</em>.</li>
          </ol>
        `
      },
      {
        id: 'art-esignatures',
        title: 'Legally Binding Mobile E-Signatures & PDF Receipts',
        readTime: '3 min read',
        category: 'Instant Quoting',
        content: `
          <p>Every estimate accepted records a timestamp, IP address, signature image, and geolocation proof, generating a tamper-proof PDF audit trail.</p>
        `
      }
    ]
  },
  {
    id: 'cat-website',
    topic: 'website',
    title: 'AI Website Builder & Local SEO',
    desc: 'Deploy ultra-fast, high-converting contractor landing pages with built-in instant quote estimation widgets.',
    icon: 'Globe',
    color: '#10b981',
    count: '9 Guides',
    articles: [
      {
        id: 'art-custom-domain-dns',
        title: 'Connecting Your Custom Domain (GoDaddy, Namecheap, Cloudflare)',
        readTime: '3 min read',
        category: 'AI Website Builder',
        content: `
          <h3>Connecting Your Custom Domain</h3>
          <p>Add these DNS records in your domain registrar:</p>
          <ul>
            <li><strong>Type:</strong> <code>A</code> | <strong>Host:</strong> <code>@</code> | <strong>Value:</strong> <code>76.76.21.21</code></li>
            <li><strong>Type:</strong> <code>CNAME</code> | <strong>Host:</strong> <code>www</code> | <strong>Value:</strong> <code>cname.letsgetquoted.com</code></li>
          </ul>
        `
      }
    ]
  },
  {
    id: 'cat-sms',
    topic: 'sms',
    title: 'Two-Way SMS & Dedicated Phone',
    desc: 'Automated 24/7 quote follow-up sequences, missed-call text back, and two-way client chat.',
    icon: 'Smartphone',
    color: '#a855f7',
    count: '11 Guides',
    articles: [
      {
        id: 'art-automated-followups',
        title: 'Configuring Intelligent Multi-Step SMS Follow-Up Sequences',
        readTime: '3 min read',
        category: 'SMS & Business Phone',
        content: `
          <p>Automate polite text check-ins at 24 hours, 72 hours, and 5 days. When the customer replies or signs the quote, the sequence instantly halts.</p>
        `
      }
    ]
  },
  {
    id: 'cat-invoicing',
    topic: 'invoicing',
    title: 'Invoicing, Deposits & Stripe Payments',
    desc: 'Collect upfront material deposits, enable 1-click Apple Pay / Google Pay, and automate payouts.',
    icon: 'CreditCard',
    color: '#f59e0b',
    count: '10 Guides',
    articles: [
      {
        id: 'art-stripe-connect',
        title: 'Setting Up Stripe Connect for Next-Day Bank Payouts',
        readTime: '3 min read',
        category: 'Invoicing & Payments',
        content: `
          <p>Connect your business bank account through our secure Stripe integration. Funds clear directly to your account with zero holding periods.</p>
        `
      }
    ]
  },
  {
    id: 'cat-team',
    topic: 'team',
    title: 'Team Roles, Dispatch & Crew Routing',
    desc: 'Manage technician permissions, assign job tickets, track GPS dispatch, and share jobsite notes.',
    icon: 'Users',
    color: '#f43f5e',
    count: '7 Guides',
    articles: [
      {
        id: 'art-roles-permissions',
        title: 'Technician vs Sales Rep vs Admin Permission Tiers',
        readTime: '4 min read',
        category: 'Team & Dispatch',
        content: `
          <p>Technicians see assigned customer addresses and job notes, while overall company profit margins and monthly revenues remain restricted to Admins.</p>
        `
      }
    ]
  }
];

export const FAQS: FAQItem[] = [
  {
    question: 'How long does it take for 10DLC carrier brand registration to be approved?',
    answer: 'Most contractor brand registrations are approved within 2 to 24 hours once your EIN and legal business address are submitted.',
    category: 'sms'
  },
  {
    question: 'Can homeowners approve quotes and pay deposits directly from their phones?',
    answer: 'Yes! Homeowners receive a private link via SMS and email where they can choose tiers, sign digitally, and pay upfront deposits with Apple Pay or Credit Card.',
    category: 'quoting'
  },
  {
    question: 'Can I connect my own custom domain to my AI website?',
    answer: 'Absolutely. We provide free CDN hosting and automated SSL. Just point an A record to 76.76.21.21 and CNAME to cname.letsgetquoted.com.',
    category: 'website'
  },
  {
    question: 'How do automated SMS follow-ups know when to stop?',
    answer: 'The moment a customer replies with a text or digitally signs any quote tier, our real-time webhook immediately cancels all remaining scheduled follow-ups.',
    category: 'sms'
  },
  {
    question: 'Are credit card processing fees passed through or deductible?',
    answer: 'You can choose whether to absorb standard 2.9% + 30¢ credit card fees or automatically include a compliant cash discount / card surcharge at checkout.',
    category: 'invoicing'
  }
];
