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

export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export interface DiagnosticStep {
  text: string;
  status: 'pass' | 'warn';
  delay: number;
}

export interface DiagnosticScenario {
  title: string;
  steps: DiagnosticStep[];
  action: {
    title: string;
    desc: string;
    btnText: string;
    type: string;
  };
}

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
            <li>Set your primary business phone number (this will sync with your SignalWire 10DLC automated SMS number).</li>
            <li>Upload your company logo (recommended dimensions: 800x400px).</li>
            <li>Click <strong>Save &amp; Verify Profile</strong>.</li>
          </ol>
        `
      },
      {
        id: 'art-signalwire-onboarding',
        title: '10DLC Carrier Brand & Campaign Verification Checklist',
        readTime: '4 min read',
        category: 'Fast-Track Setup',
        content: `
          <h3>Understanding 10DLC Compliance</h3>
          <p>Major US mobile carriers (AT&T, Verizon, T-Mobile) require all automated and two-way business texting systems to be registered with The Campaign Registry (TCR). We manage this through SignalWire to ensure 99.9% SMS deliverability.</p>
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
    title: 'Two-Way SMS & SignalWire Voice',
    desc: 'Automated 24/7 quote follow-up sequences, missed-call text back, and two-way client chat.',
    icon: 'Smartphone',
    color: '#a855f7',
    count: '11 Guides',
    articles: [
      {
        id: 'art-automated-followups',
        title: 'Configuring Intelligent Multi-Step SMS Follow-Up Sequences',
        readTime: '3 min read',
        category: 'SMS & SignalWire',
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
    question: 'How long does it take for SignalWire 10DLC carrier registration to be approved?',
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

export const DIAGNOSTIC_SCENARIOS: Record<string, DiagnosticScenario> = {
  'sms-verification': {
    title: 'SMS / 10DLC Carrier Verification Diagnostic',
    steps: [
      { text: 'Connecting to SignalWire Campaign Registry...', status: 'pass', delay: 200 },
      { text: 'Checking EIN & Legal Brand Match (Maplewood Pro)...', status: 'pass', delay: 400 },
      { text: 'Verifying 10DLC Messaging Campaign: "LGQ Alerts & Quoting"...', status: 'pass', delay: 700 },
      { text: 'Checking Carrier Status (AT&T: Active, Verizon: Active, T-Mobile: Active)...', status: 'pass', delay: 1000 },
      { text: 'All 3 SMS Outbound Gateways Healthy. 0 Failed Delivery Webhooks.', status: 'pass', delay: 1200 }
    ],
    action: {
      title: 'SMS Pipeline is 100% Operational',
      desc: 'If a specific homeowner did not receive an SMS, check if they replied "STOP" previously to opt out.',
      btnText: 'Send Test SMS to My Mobile',
      type: 'test-sms'
    }
  },
  'stripe-deposits': {
    title: 'Stripe Connect & Payout Health Check',
    steps: [
      { text: 'Pinging Stripe API Endpoint (v2.stripe.com)...', status: 'pass', delay: 200 },
      { text: 'Checking Express Account Authorization: "acct_1NZ..."', status: 'pass', delay: 500 },
      { text: 'Verifying Payout Bank Account Status: Direct Deposit Active...', status: 'pass', delay: 800 },
      { text: 'Checkout Webhook Listener: 200 OK (Latency: 28ms)...', status: 'pass', delay: 1100 }
    ],
    action: {
      title: 'Payments & Instant Deposits Ready',
      desc: 'Homeowner credit card transactions will automatically transfer next business day.',
      btnText: 'Generate Test $1.00 Checkout Link',
      type: 'test-payment'
    }
  },
  'custom-domain': {
    title: 'Custom Domain & Edge DNS Diagnostic',
    steps: [
      { text: 'Querying Global DNS Anycast (Cloudflare / Fastly)...', status: 'pass', delay: 200 },
      { text: 'Resolving A Record: 76.76.21.21 (Matches LGQ Edge)...', status: 'pass', delay: 500 },
      { text: 'Resolving CNAME Record: cname.letsgetquoted.com...', status: 'pass', delay: 800 },
      { text: 'Checking Let\'s Encrypt SSL / TLS Certificate: Valid...', status: 'pass', delay: 1100 }
    ],
    action: {
      title: 'DNS Configured Correctly & Secure',
      desc: 'Your AI landing page is live worldwide with sub-second page load times.',
      btnText: 'Test Live Website Preview',
      type: 'test-domain'
    }
  },
  'quote-templates': {
    title: 'Estimate Calculator & Margin Math Diagnostic',
    steps: [
      { text: 'Scanning Active Quote Tier Formulas...', status: 'pass', delay: 200 },
      { text: 'Verifying Minimum Profit Margin Floor (40% Target)...', status: 'pass', delay: 450 },
      { text: 'Checking Regional Sales Tax Table (NJ: 6.625%)...', status: 'pass', delay: 750 },
      { text: 'PDF Rendering Engine: Latency 84ms (OK)...', status: 'pass', delay: 1050 }
    ],
    action: {
      title: 'Estimate Generator Optimized',
      desc: 'All formula tiers and material calculations are operating with verified accuracy.',
      btnText: 'Preview Sample 3-Tier PDF',
      type: 'test-quote'
    }
  }
};
